# Ships the ssh journal and sudo from the systemd journal to Grafana Cloud Loki.
# A system job, so each Nomad client in the listed datacenters runs one.
# Add a datacenter to cover its clients. The host label is the Nomad node name.
# kd stays out: kleipower is arm64 and has no Docker. jvg is thinkcentre only.
#   nomad job run nomad/grafana-agent-logs.hcl
#
# Host, user, and password come from nomad/jobs/grafana-agent. Loki has its own
# host and user. The password is the same access-policy token as the metrics agent.
# The metrics block scrapes this process on 127.0.0.1:12347 and remote-writes
# the promtail send/drop counters to the same Prometheus endpoint as grafana-agent.

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
        destination = "local/agent.yaml"
        env         = false
        data        = <<-EOH
          server:
            log_level: info

          metrics:
            wal_directory: /var/lib/agent/wal

            global:
              scrape_interval: 60s
              {{ with nomadVar "nomad/jobs/grafana-agent" }}
              remote_write:
                - url: https://{{ .grafana_cloud_hostname }}/api/prom/push
                  basic_auth:
                    username: '{{ .grafana_cloud_remote_username }}'
                    password: '{{ .grafana_cloud_remote_password }}'
              {{ end }}

            configs:
              - name: self
                scrape_configs:
                  - job_name: grafana-agent-logs
                    scrape_interval: 60s
                    scrape_timeout: 10s
                    static_configs:
                      - targets: ['127.0.0.1:12347']
                        labels:
                          server: {{ env "NODE_NAME" }}
                          datacenter: {{ env "NOMAD_DC" }}
                    metric_relabel_configs:
                      - source_labels: [__name__]
                        regex: 'promtail_(journal_target_lines_total|sent_entries_total|sent_bytes_total|dropped_entries_total|dropped_bytes_total)'
                        action: keep

          logs:
            configs:
              - name: auth
                positions:
                  filename: /var/lib/agent/positions.yaml
                clients:
                  {{ with nomadVar "nomad/jobs/grafana-agent" }}
                  - url: https://{{ .grafana_cloud_loki_hostname }}/loki/api/v1/push
                    basic_auth:
                      username: '{{ .grafana_cloud_loki_username }}'
                      password: '{{ .grafana_cloud_remote_password }}'
                  {{ end }}
                scrape_configs:
                  - job_name: ssh
                    journal:
                      max_age: 12h
                      path: /var/log/journal
                      labels:
                        job: ssh
                        host: {{ env "NODE_NAME" }}
                        datacenter: {{ env "NOMAD_DC" }}
                      matches: _SYSTEMD_UNIT=ssh.service

                  - job_name: sudo
                    journal:
                      max_age: 12h
                      path: /var/log/journal
                      labels:
                        job: sudo
                        host: {{ env "NODE_NAME" }}
                        datacenter: {{ env "NOMAD_DC" }}
                      matches: SYSLOG_IDENTIFIER=sudo
        EOH
      }

      config {
        image = "grafana/agent:v0.37.0-rc.1"
        # Host network: the Docker bridge on se-01 could not reach Loki.
        # Listen ports are 12347/12348 so this can sit beside the metrics agent.
        network_mode = "host"

        args = [
          "-config.file=/etc/agent/agent.yaml",
          "-disable-reporting",
          "-server.http.address=127.0.0.1:12347",
          "-server.grpc.address=127.0.0.1:12348",
        ]

        volumes = [
          "local/agent.yaml:/etc/agent/agent.yaml",
          "/var/log/journal:/var/log/journal:ro",
          "/run/log/journal:/run/log/journal:ro",
          "/etc/machine-id:/etc/machine-id:ro",
          "/opt/nomad/docker-volumes/grafana-agent-logs:/var/lib/agent",
        ]
      }

      resources {
        cpu    = 50
        memory = 192
      }
    }
  }
}
