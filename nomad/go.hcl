# Services directory. Caddy listens on thinkcentre loopback only.
# Tailscale Serve publishes svc:go as http://go.finch-barb.ts.net/.
# Do not run `tailscale serve reset` from here.
#   nomad job run nomad/go.hcl
#   curl http://go.finch-barb.ts.net/

job "go" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "service"

  group "web" {
    count = 1

    task "caddy" {
      driver = "docker"

      template {
        destination = "local/Caddyfile"
        data        = <<-EOH
          {
            auto_https off
            admin off
          }

          # Port only, so any Host matches. Tailscale Serve sends Host go.finch-barb.ts.net.
          http://:8091 {
            bind 127.0.0.1
            root * /srv
            file_server
          }
        EOH
      }

      template {
        destination = "local/index.html"
        data        = <<-EOH
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>go</title>
            <style>
              :root { color-scheme: light dark; }
              * { box-sizing: border-box; }
              body {
                margin: 0;
                background: #fff;
                color: #111;
                font: 17px/1.45 ui-sans-serif, system-ui, sans-serif;
              }
              @media (prefers-color-scheme: dark) {
                body { background: #111; color: #f3f3f3; }
              }
              main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
              h2 {
                margin: 2rem 0 0;
                padding-top: 0.45rem;
                border-top: 2px solid currentColor;
                font-size: 0.72rem;
                font-weight: 700;
                letter-spacing: 0.12em;
                text-transform: uppercase;
              }
              h2:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
              table { width: 100%; border-collapse: collapse; margin: 0.35rem 0 0; }
              td {
                padding: 0.55rem 0;
                border-bottom: 1px solid color-mix(in srgb, currentColor 22%, transparent);
              }
              a { color: inherit; }
            </style>
          </head>
          <body>
          <main>
            <h2>House</h2>
            <table>
              <tr><td><a href="http://homeassistant.finch-barb.ts.net/">Home Assistant</a></td></tr>
              <tr><td><a href="http://brother-printer.finch-barb.ts.net/">Printer</a></td></tr>
              <tr><td><a href="http://zot.finch-barb.ts.net:80/">Registry</a></td></tr>
              <tr><td><a href="https://nomad-ui.finch-barb.ts.net/">Nomad</a></td></tr>
            </table>

            <h2>Kleidijk</h2>
            <table>
              <tr><td><a href="http://kleidijk-ha.finch-barb.ts.net/">Home Assistant</a></td></tr>
              <tr><td><a href="http://routeros.finch-barb.ts.net/">RouterOS</a></td></tr>
              <tr><td><a href="http://kleipower.finch-barb.ts.net/">Power Meter</a></td></tr>
            </table>

            <h2>se-01</h2>
            <table>
              <tr><td><a href="http://se-01.finch-barb.ts.net/">Web</a></td></tr>
            </table>

            <h2>Outside</h2>
            <table>
              <tr><td><a href="https://tlwr.grafana.net/">Grafana</a></td></tr>
            </table>
          </main>
          </body>
          </html>
        EOH
      }

      config {
        image        = "caddy:2.8"
        network_mode = "host"

        volumes = [
          "local/Caddyfile:/etc/caddy/Caddyfile",
          "local/index.html:/srv/index.html:ro",
        ]

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 50
        memory = 64
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
          serve() {
            tailscale serve --service=svc:go --https=443 off || true
            tailscale serve --yes --service=svc:go --tcp=80 tcp://127.0.0.1:8091
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
