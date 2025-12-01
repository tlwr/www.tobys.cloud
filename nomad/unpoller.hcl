job "unpoller" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    operator  = "set_contains_any"
    value     = "thinkcentre"
  }

  type = "service"

  group "servers" {
    count = 1

    task "exporter" {
      driver = "docker"

      template {
        data = <<-EOH
          {{ with nomadVar "nomad/jobs/unpoller" }}
          [poller]
            debug = false
            quiet = false
            plugins = []

          [prometheus]
            disable = false
            http_listen = "0.0.0.0:9130"
            ssl_cert_path = ""
            ssl_key_path  = ""
            report_errors = false
            dead_ports = false

          [influxdb]
            disable = true

          [loki]
            disable = true

          [datadog]
            enable = false

          [webserver]
            enable = false

          [unifi]
            dynamic = false

          [unifi.defaults]
            url = "https://{{ .host }}"

            user = "{{ .user }}"
            pass = "{{ .pass }}"

            sites = ["all"]
            save_sites = true
            hash_pii = false
            save_ids = false
            save_events = false
            save_alarms = false
            save_anomalies = false
            save_dpi = false
            save_rogue = false
            verify_ssl = false
            ssl_cert_paths = []
          {{ end }}
        EOH

        destination = "local/up.conf"
        env         = false
      }

      config {
        image        = "ghcr.io/unpoller/unpoller:v2.15.4"
        network_mode = "host"

        volumes = [
          "local/up.conf:/etc/unpoller/up.conf",
        ]
      }

      resources {
        cpu    = 200
        memory = 256
      }
    }
  }
}
