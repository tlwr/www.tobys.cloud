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

      template {
        destination = "local/agent.yaml"
        env         = false
        data        = <<-EOH
          ---
          server:
            log_level: info

          metrics:
            wal_directory: /var/lib/agent/wal

            global:
              scrape_interval: 60s

              remote_write:
                - url: https://grafana-cloud-remote.tlwr.workers.dev/api/prom/push
                  basic_auth:
                    {{ with nomadVar "nomad/jobs/grafana-agent" }}
                    username: '{{ .grafana_cloud_remote_username }}'
                    password: '{{ .grafana_cloud_remote_password }}'
                    {{ end }}

            configs:
              - name: smartmeter
                scrape_configs:
                  - job_name: 63a
                    scrape_interval: 30s
                    scrape_timeout: 20s
                    dns_sd_configs:
                      - names: [pipower]
                        type: A
                        port: 9220

                  - job_name: kleidijk
                    scrape_interval: 30s
                    scrape_timeout: 20s
                    dns_sd_configs:
                      - names: [kleipower]
                        type: A
                        port: 9220

              - name: enphase-gateway
                scrape_configs:
                  - job_name: 63a-solar
                    scrape_interval: 30s
                    scrape_timeout: 20s
                    dns_sd_configs:
                      - names: [pipower]
                        type: A
                        port: 9365

              - name: unpoller
                scrape_configs:
                  - job_name: 63-unifi
                    scrape_interval: 60s
                    scrape_timeout: 60s
                    dns_sd_configs:
                      - names: [pipower]
                        type: A
                        port: 9130
        EOH
      }

      config {
        image        = "grafana/agent:v0.37.0-rc.1"
        network_mode = "host"

        args = [
          "-config.expand-env=true",
          "-config.file=/etc/agent/agent.yaml",
          "-enable-features=integrations-next",
          "-disable-reporting",
        ]

        volumes = [
          "local/agent.yaml:/etc/agent/agent.yaml",
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
