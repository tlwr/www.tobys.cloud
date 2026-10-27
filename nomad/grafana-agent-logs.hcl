# Ships the ssh journal and sudo from the systemd journal to Grafana Cloud Loki.
# A system job, so each Nomad client in the listed datacenters runs one.
# Add a datacenter to cover its clients. The host label is the Nomad node name.
# kd stays out: kleipower is arm64 and has no Docker. jvg is thinkcentre only.
#   nomad job run nomad/grafana-agent-logs.hcl
#
# Host, user, and password come from nomad/jobs/grafana-agent. Loki has its own
# host and user. The password is the same access-policy token as the metrics agent.
#
# Alloy static mode cannot be used here. Its converter drops journal matches,
# so both sources would forward the whole journal. This River file keeps
# matches = "_SYSTEMD_UNIT=ssh.service" and matches = "SYSLOG_IDENTIFIER=sudo".
# Setting labels.job stops Alloy from replacing it with the component id.
#
# Cursors are copied into Alloy's positions.yml before the first start.
# legacy_position writes labels "{}" and the reader looks up "", so it is not
# used. A missing cursor reads at most max_age (12h) for that one match.

job "grafana-agent-logs" {
  datacenters = ["se", "jvg"]

  type = "system"

  group "logs" {
    task "agent" {
      driver = "docker"

      env {
        NODE_NAME = "${node.unique.name}"
      }

      template {
        destination = "local/config.alloy"
        env         = false
        data        = <<-EOH
          prometheus.remote_write "metrics" {
            endpoint {
              {{ with nomadVar "nomad/jobs/grafana-agent" }}
              url = "https://{{ .grafana_cloud_hostname }}/api/prom/push"

              basic_auth {
                username = "{{ .grafana_cloud_remote_username }}"
                password = `{{ .grafana_cloud_remote_password }}`
              }
              {{ end }}
            }
          }

          prometheus.scrape "self" {
            targets = [{
              __address__ = "127.0.0.1:12347",
              server      = sys.env("NODE_NAME"),
              datacenter  = sys.env("NOMAD_DC"),
            }]
            forward_to      = [prometheus.relabel.self.receiver]
            job_name        = "grafana-agent-logs"
            scrape_interval = "60s"
            scrape_timeout  = "10s"
          }

          prometheus.relabel "self" {
            forward_to = [prometheus.remote_write.metrics.receiver]

            rule {
              source_labels = ["__name__"]
              regex         = "up|loki_source_journal_target_lines_total|loki_write_(sent_entries_total|sent_bytes_total|dropped_entries_total|dropped_bytes_total)"
              action        = "keep"
            }
          }

          loki.write "auth" {
            endpoint {
              {{ with nomadVar "nomad/jobs/grafana-agent" }}
              url = "https://{{ .grafana_cloud_loki_hostname }}/loki/api/v1/push"

              basic_auth {
                username = "{{ .grafana_cloud_loki_username }}"
                password = `{{ .grafana_cloud_remote_password }}`
              }
              {{ end }}
            }
          }

          loki.source.journal "ssh" {
            path       = "/var/log/journal"
            max_age    = "12h"
            matches    = "_SYSTEMD_UNIT=ssh.service"
            forward_to = [loki.write.auth.receiver]
            labels     = {
              job        = "ssh",
              host       = sys.env("NODE_NAME"),
              datacenter = sys.env("NOMAD_DC"),
            }
          }

          loki.source.journal "sudo" {
            path       = "/var/log/journal"
            max_age    = "12h"
            matches    = "SYSLOG_IDENTIFIER=sudo"
            forward_to = [loki.write.auth.receiver]
            labels     = {
              job        = "sudo",
              host       = sys.env("NODE_NAME"),
              datacenter = sys.env("NOMAD_DC"),
            }
          }
        EOH
      }

      config {
        image = "grafana/alloy:v1.21.2"
        # Host network: the Docker bridge on se-01 could not reach Loki.
        # Listen port is 12347 so this can sit beside the metrics agent.
        network_mode = "host"

        args = [
          "run",
          "--disable-reporting",
          "--server.http.listen-addr=127.0.0.1:12347",
          "--storage.path=/var/lib/agent/alloy",
          "/etc/alloy/config.alloy",
        ]

        volumes = [
          "local/config.alloy:/etc/alloy/config.alloy",
          "/var/log/journal:/var/log/journal:ro",
          "/run/log/journal:/run/log/journal:ro",
          "/etc/machine-id:/etc/machine-id:ro",
          "/opt/nomad/docker-volumes/grafana-agent-logs:/var/lib/agent",
        ]
      }

      resources {
        cpu    = 50
        memory = 256
      }
    }
  }
}
