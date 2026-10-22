# Tailscale Service for Home Assistant at 192.168.1.53:8123.
# thinkcentre is on that LAN and already subnet-routes the host.
# raw_exec is disabled on thinkcentre, so this uses the host tailscaled
# socket from a container. socat is not installed there.
#   nomad job run nomad/homeassistant.hcl
#   curl http://homeassistant.finch-barb.ts.net/
# The iOS and iPad apps use that URL. Add svc:homeassistant tcp:80
# to the tlwr@github service grant before removing the user wildcard.

job "homeassistant" {
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
  tailscale serve --yes --service=svc:homeassistant --tcp=80 tcp://192.168.1.53:8123
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
