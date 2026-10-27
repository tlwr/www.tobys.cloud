job "grafana-agent" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "service"

  group "servers" {
    task "agent" {
      driver = "docker"

      env {
        NODE_NAME = "${node.unique.name}"
      }

      template {
        destination = "local/config.alloy"
        env         = false
        data        = <<-EOH
          // One remote_write for every scrape. The password is a raw string so
          // River does not interpret the token.
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

          discovery.dns "unifi" {
            names = ["thinkcentre.finch-barb.ts.net"]
            type  = "A"
            port  = 9130
          }

          prometheus.scrape "unifi" {
            targets         = discovery.dns.unifi.targets
            forward_to      = [prometheus.remote_write.metrics.receiver]
            job_name        = "63-unifi"
            scrape_interval = "60s"
            scrape_timeout  = "60s"
          }

          discovery.dns "ecoflow" {
            names = ["thinkcentre.finch-barb.ts.net"]
            type  = "A"
            port  = 2112
          }

          prometheus.scrape "ecoflow" {
            targets         = discovery.dns.ecoflow.targets
            forward_to      = [prometheus.remote_write.metrics.receiver]
            job_name        = "63-ecoflow"
            scrape_interval = "60s"
            scrape_timeout  = "60s"
          }

          discovery.dns "nomad" {
            names = ["thinkcentre.finch-barb.ts.net"]
            type  = "A"
            port  = 4646
          }

          discovery.relabel "nomad" {
            targets = discovery.dns.nomad.targets

            rule {
              source_labels = ["__meta_dns_name"]
              regex         = "(.*)[.]finch-barb[.]ts[.]net"
              target_label  = "server"
            }
          }

          prometheus.scrape "nomad" {
            targets         = discovery.relabel.nomad.output
            forward_to      = [prometheus.remote_write.metrics.receiver]
            job_name        = "nomad"
            scrape_interval = "30s"
            scrape_timeout  = "10s"
            metrics_path    = "/v1/metrics"
            params          = {
              format = ["prometheus"],
            }
          }

          discovery.dns "tailscale" {
            names = ["thinkcentre.finch-barb.ts.net"]
            type  = "A"
            port  = 9250
          }

          discovery.relabel "tailscale" {
            targets = discovery.dns.tailscale.targets

            rule {
              source_labels = ["__meta_dns_name"]
              regex         = "(.*)[.]finch-barb[.]ts[.]net"
              target_label  = "server"
            }
          }

          prometheus.scrape "tailscale" {
            targets         = discovery.relabel.tailscale.output
            forward_to      = [prometheus.remote_write.metrics.receiver]
            job_name        = "tailscale"
            scrape_interval = "60s"
            scrape_timeout  = "60s"
          }

          // v1 uses GETNEXT. This Brother drops GETBULK, so public_v2 times out.
          discovery.relabel "snmp" {
            targets = [{
              __address__ = "192.168.1.49",
              module      = "printer_mib",
              name        = "brother-printer",
            }]

            rule {
              source_labels = ["__address__"]
              target_label  = "__param_target"
            }

            rule {
              source_labels = ["module"]
              target_label  = "__param_module"
            }

            rule {
              source_labels = ["__param_target"]
              target_label  = "instance"
            }

            rule {
              target_label = "__address__"
              replacement  = "127.0.0.1:9116"
            }
          }

          prometheus.scrape "snmp" {
            targets         = discovery.relabel.snmp.output
            forward_to      = [prometheus.remote_write.metrics.receiver]
            job_name        = "snmp"
            scrape_interval = "60s"
            scrape_timeout  = "30s"
            metrics_path    = "/snmp"
            params          = {
              auth = ["public_v1"],
            }
          }

          prometheus.scrape "brother_toner" {
            targets = [{
              __address__ = "127.0.0.1:9117",
              name        = "brother-printer",
            }]
            forward_to      = [prometheus.remote_write.metrics.receiver]
            job_name        = "brother-toner"
            scrape_interval = "60s"
            scrape_timeout  = "10s"
          }

          discovery.dns "node_exporter" {
            names = [
              "kleipower.finch-barb.ts.net",
              "thinkcentre.finch-barb.ts.net",
              "se-01.finch-barb.ts.net",
            ]
            type = "A"
            port = 9100
          }

          discovery.relabel "node_exporter" {
            targets = discovery.dns.node_exporter.targets

            rule {
              source_labels = ["__meta_dns_name"]
              regex         = "(.*)[.]finch-barb[.]ts[.]net"
              target_label  = "server"
            }
          }

          prometheus.scrape "node_exporter" {
            targets         = discovery.relabel.node_exporter.output
            forward_to      = [prometheus.remote_write.metrics.receiver]
            job_name        = "node-exporter-baremetal"
            scrape_interval = "60s"
            scrape_timeout  = "60s"
          }

          // Remote-write counters for this process, plus up. Alloy's relabel
          // drops up unless it is in the keep list. The Grafana Agent metric
          // relabel left up in place.
          prometheus.scrape "self" {
            targets = [{
              __address__ = "127.0.0.1:12345",
              server      = sys.env("NODE_NAME"),
              datacenter  = sys.env("NOMAD_DC"),
            }]
            forward_to      = [prometheus.relabel.self.receiver]
            job_name        = "grafana-agent"
            scrape_interval = "60s"
            scrape_timeout  = "10s"
          }

          prometheus.relabel "self" {
            forward_to = [prometheus.remote_write.metrics.receiver]

            rule {
              source_labels = ["__name__"]
              regex         = "up|prometheus_remote_storage_(samples_total|samples_failed_total|samples_dropped_total|bytes_total|samples_pending|queue_highest_sent_timestamp_seconds)"
              action        = "keep"
            }
          }
        EOH
      }

      config {
        image        = "grafana/alloy:v1.21.2"
        network_mode = "host"

        args = [
          "run",
          "--disable-reporting",
          "--server.http.listen-addr=127.0.0.1:12345",
          "--storage.path=/var/lib/agent/wal/alloy",
          "/etc/alloy/config.alloy",
        ]

        volumes = [
          "local/config.alloy:/etc/alloy/config.alloy",
          "/opt/nomad/docker-volumes/grafana-agent-wal:/var/lib/agent/wal",
        ]

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 200
        memory = 256
      }
    }
  }
}
