# Tailnet metrics for Grafana. Listens on :9250.
# OAuth client scopes, all read:
#   devices:core devices:posture_attributes devices:routes
#   services users dns auth_keys feature_settings policy_file
#   nomad var put nomad/jobs/tailscale-exporter \
#     oauth_client_id=<id> oauth_client_secret=<secret> tailnet=finch-barb.ts.net
#   nomad job run nomad/tailscale-exporter.hcl

job "tailscale-exporter" {
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
        image        = "adinhodovic/tailscale-exporter:0.7.1"
        network_mode = "host"

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      template {
        data = <<EOH
        {{ with nomadVar "nomad/jobs/tailscale-exporter" }}
        TAILSCALE_OAUTH_CLIENT_ID="{{ .oauth_client_id }}"
        TAILSCALE_OAUTH_CLIENT_SECRET="{{ .oauth_client_secret }}"
        TAILSCALE_TAILNET="{{ .tailnet }}"
        {{ end }}
        EOH

        destination = "secrets/file.env"
        env         = true
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
