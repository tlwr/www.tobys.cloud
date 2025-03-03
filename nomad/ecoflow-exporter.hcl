job "ecoflow-exporter" {
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
        image        = "tess1o/go-ecoflow-exporter:1.4.0"
        network_mode = "host"

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      template {
        data = <<EOH
        {{ with nomadVar "nomad/jobs/ecoflow-exporter" }}
        PROMETHEUS_ENABLED="true"
        EXPORTER_TYPE=rest
        ECOFLOW_ACCESS_KEY="{{ .access_key }}"
        ECOFLOW_SECRET_KEY="{{ .secret_key }}"
        {{ end }}
        EOH

        destination = "secrets/file.env"
        env         = true
      }

      resources {
        cpu    = 200
        memory = 256
      }
    }
  }
}
