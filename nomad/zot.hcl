# OCI registry on thinkcentre. zot listens on every interface, port 5000.
# Tailscale Serve publishes svc:zot tcp:80 to the tailnet only, as plain HTTP. The tunnel
# is the encryption. Docker image refs are zot.finch-barb.ts.net:80/<repo>.
# thinkcentre's daemon needs insecure-registries for that host:port.
#   nomad job run nomad/zot.hcl
#   podman push zot.finch-barb.ts.net:80/www-tobys-cloud-acceptance:latest

job "zot" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "service"

  group "servers" {
    count = 1

    task "zot" {
      driver = "docker"

      template {
        destination = "local/config.json"
        data        = <<-EOH
{
  "distSpecVersion": "1.1.1",
  "storage": {
    "rootDirectory": "/var/lib/registry",
    "dedupe": true,
    "gc": true
  },
  "http": {
    "address": "0.0.0.0",
    "port": "5000",
    "compat": ["docker2s2"]
  },
  "log": {
    "level": "info"
  },
  "extensions": {
    "search": {
      "enable": true
    },
    "ui": {
      "enable": true
    },
    "metrics": {
      "enable": true,
      "prometheus": {
        "path": "/metrics"
      }
    }
  }
}
EOH
      }

      config {
        image        = "ghcr.io/project-zot/zot:v2.1.23"
        network_mode = "host"

        volumes = [
          "local/config.json:/etc/zot/config.json:ro",
          "/opt/nomad/docker-volumes/zot:/var/lib/registry",
        ]

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 200
        memory = 512
      }
    }

    task "serve" {
      driver = "docker"

      template {
        destination = "local/run.sh"
        perms       = "755"
        data        = <<-EOH
#!/bin/sh
set -eu
# Service serve. Leaves svc:homeassistant and svc:brother-printer alone.
# Do not run `tailscale serve reset` from here.
serve() {
  tailscale serve --service=svc:zot --https=443 off || true
  tailscale serve --yes --service=svc:zot --tcp=80 tcp://127.0.0.1:5000
}
serve
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
