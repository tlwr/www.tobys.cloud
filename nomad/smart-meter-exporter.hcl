job "smart-meter-exporter" {
  datacenters = ["jvg", "kd"]

  constraint {
    attribute = "${attr.unique.hostname}"
    operator  = "set_contains_any"
    value     = "kleipower"
  }

  type = "service"

  group "servers" {
    count = 1

    task "exporter" {
      driver = "raw_exec"

      config {
        command = "smart-meter-exporter"
        args    = [
          "-serial-path=/dev/ttyUSB0",
          "-interval=${meta.tty_refresh}",
        ]
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
