# Tailscale Service for the Kleidijk RouterOS web UI at 192.168.88.1:80.
# socat binds port 8080 on the tailscale0 address only.
#   nomad job run nomad/kleidijk-routeros.hcl
#   curl http://routeros.finch-barb.ts.net/
#   curl http://kleipower.finch-barb.ts.net:8080/

job "kleidijk-routeros" {
  datacenters = ["kd"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "kleipower"
  }

  type = "service"

  group "servers" {
    count = 1

    task "socat" {
      driver = "raw_exec"

      template {
        destination = "local/run.sh"
        perms       = "755"
        data        = <<-EOH
#!/bin/sh
ip="{{ sockaddr "GetInterfaceIP \"tailscale0\"" }}"
test -n "$ip" || exit 1
/usr/bin/tailscale serve --yes --service=svc:routeros --tcp=80 "tcp://$ip:8080"
exec /usr/bin/socat "TCP-LISTEN:8080,bind=$ip,fork,reuseaddr" TCP:192.168.88.1:80
EOH
      }

      config {
        command = "/bin/sh"
        args    = ["${NOMAD_TASK_DIR}/run.sh"]
      }

      resources {
        cpu    = 50
        memory = 64
      }
    }
  }
}
