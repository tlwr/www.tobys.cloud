job "enphase-gateway-exporter" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "pipower"
  }

  type = "service"

  group "servers" {
    task "exporter" {
      driver = "exec"

      template {
        data = <<EOH
        {{ with nomadVar "nomad/jobs/enphase-gateway-exporter" }}
        ENPHASE_GATEWAY_EXPORTER_USERNAME="{{ .username }}"
        ENPHASE_GATEWAY_EXPORTER_PASSWORD="{{ .password }}"
        ENPHASE_GATEWAY_EXPORTER_SERIAL="{{ .serial }}"
        ENPHASE_GATEWAY_EXPORTER_GATEWAY_IP="{{ .gateway }}"
        ENPHASE_GATEWAY_EXPORTER_RRDTOOL_DAEMON="{{ .rrdtool }}"
        {{ end }}
        EOH

        destination = "secrets/file.env"
        env         = true
      }

      config {
        command = "enphase-gateway-exporter"
        args    = [
          "-rrdtool-prefix=63a"
        ]
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
