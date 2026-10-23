# HTTP on se-01's Tailscale address, for any Host on that listener.
# MagicDNS and the IP both get this response. Public addresses are not bound.
#   nomad job run nomad/se-01-web.hcl
#   curl http://se-01.finch-barb.ts.net/

job "se-01-web" {
  datacenters = ["se"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "se-01"
  }

  type = "service"

  group "web" {
    task "caddy" {
      driver = "docker"

      env {
        NODE_NAME = "${node.unique.name}"
      }

      template {
        destination = "local/Caddyfile"
        data        = <<-EOH
{
  auto_https off
}

http:// {
  bind {{ sockaddr "GetInterfaceIP \"tailscale0\"" }}
  header X-Backend {$NODE_NAME}
  respond <<BODY
ok se-01 {$NODE_NAME}
BODY
}
EOH
      }

      config {
        image        = "caddy:2.8"
        network_mode = "host"

        volumes = [
          "local/Caddyfile:/etc/caddy/Caddyfile",
          "/opt/nomad/docker-volumes/caddy-data:/data",
          "/opt/nomad/docker-volumes/caddy-config:/config",
        ]

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
