# Tiny public HTTP on se-01 for BGP anycast checks.
# DNS: se-01.tobys.cloud AAAA → 2a0e:97c0:450:: (HTTP-01 Let's Encrypt).
#
# Host must have that address locally, and 80/443 open.
#   nomad job run nomad/se-01-web.hcl
#   curl -6 https://se-01.tobys.cloud/

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
  email toby@toby.codes
  default_bind [::]
  default_sni se-01.tobys.cloud
}

se-01.tobys.cloud {
  bind [::]
  encode gzip
  header X-Backend {$NODE_NAME}
  respond <<BODY
ok se-01.tobys.cloud {$NODE_NAME}
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
