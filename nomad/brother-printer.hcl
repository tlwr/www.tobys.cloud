# Tailscale Service for the Brother HL-L2400DWE at 192.168.1.49.
# Open TCP ports used here: 80 (status page), 631 (IPP), 9100 (raw print).
# 515 LPD and 443 HTTPS are also open and are not published.
# AirPrint discovery is mDNS and cannot be a Tailscale TCP service.
# Define svc:brother-printer in the admin console with tcp:80, tcp:631,
# and tcp:9100 before the host approval appears.
#   nomad job run nomad/brother-printer.hcl
#   curl http://brother-printer.finch-barb.ts.net/

job "brother-printer" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "service"

  group "servers" {
    count = 1

    task "serve" {
      driver = "docker"

      template {
        destination = "local/run.sh"
        perms       = "755"
        data        = <<-EOH
#!/bin/sh
set -eu
serve() {
  tailscale serve --yes --service=svc:brother-printer --tcp=80 tcp://192.168.1.49:80
  tailscale serve --yes --service=svc:brother-printer --tcp=631 tcp://192.168.1.49:631
  tailscale serve --yes --service=svc:brother-printer --tcp=9100 tcp://192.168.1.49:9100
}
serve
# serve returns after installing the config. Re-apply in case tailscaled restarts.
while true; do
  sleep 3600
  serve
done
EOH
      }

      config {
        image        = "tailscale/tailscale:v1.104.2"
        network_mode = "host"
        entrypoint   = ["/bin/sh", "/local/run.sh"]

        volumes = [
          "local/run.sh:/local/run.sh:ro",
          "/var/run/tailscale/tailscaled.sock:/var/run/tailscale/tailscaled.sock",
        ]

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 50
        memory = 64
      }
    }
  }
}
