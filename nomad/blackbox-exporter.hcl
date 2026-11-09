# Blackbox exporter on thinkcentre. Grafana Agent passes each target.
# Probes stay on the host network and the agent scrapes 127.0.0.1:9115.
# Another probe is another static target in nomad/grafana-agent.hcl.
#   nomad job run nomad/blackbox-exporter.hcl

job "blackbox-exporter" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "service"

  group "servers" {
    task "exporter" {
      driver = "docker"

      template {
        destination = "local/blackbox.yml"
        data        = <<-EOH
modules:
  http_kleipower_meter:
    prober: http
    timeout: 15s
    http:
      method: GET
      preferred_ip_protocol: ip4
      ip_protocol_fallback: false
      valid_status_codes: [200]
      fail_if_body_not_matches_regexp:
        - '^ok kleipower meter /KFM5KAIFA-METER [0-9]{12}[WS] ha=192\.168\.2\.49'
EOH
      }

      config {
        image        = "prom/blackbox-exporter:v0.29.1"
        network_mode = "host"

        args = [
          "--config.file=/etc/blackbox/blackbox.yml",
          "--web.listen-address=127.0.0.1:9115",
        ]

        volumes = [
          "local/blackbox.yml:/etc/blackbox/blackbox.yml",
        ]

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 100
        memory = 64
      }
    }
  }
}
