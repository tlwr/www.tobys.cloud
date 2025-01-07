job "prometheus-node-exporter" {
  datacenters = ["jvg", "kd"]

  type = "system"

  group "servers" {
    task "exporter" {
      driver = "exec"

      config {
        command = "prometheus-node-exporter"
        args    = [
          "--collector.disable-defaults",
          "--collector.loadavg",
          "--collector.meminfo",
          "--collector.netdev",
          "--web.disable-exporter-metrics",
        ]
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
