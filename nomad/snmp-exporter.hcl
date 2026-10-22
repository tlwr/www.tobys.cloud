# SNMP exporter for LAN devices. Grafana Agent passes each target.
# The image ships modules including printer_mib, if_mib, and system.
# Another device is another static target in nomad/grafana-agent.hcl,
# with a module label. SNMP stays on the LAN; the agent scrapes
# 127.0.0.1:9116 because both tasks use the host network.
#   nomad job run nomad/snmp-exporter.hcl

job "snmp-exporter" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "service"

  group "servers" {
    task "exporter" {
      driver = "docker"

      config {
        image        = "prom/snmp-exporter:v0.29.0"
        network_mode = "host"

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
