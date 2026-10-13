# Tailscale Service for Home Assistant at 192.168.2.49:8123.
# 192.168.2.0/24 is the house LAN. kleipower is on the shed Wi-Fi
# (192.168.88.0/24) and reaches the house through the MikroTik at 192.168.88.1.
# socat binds port 8123 on the tailscale0 address only.
#   nomad job run nomad/kleidijk-ha.hcl
#   curl http://kleidijk-ha.finch-barb.ts.net/
#   curl http://kleipower.finch-barb.ts.net:8123/

job "kleidijk-ha" {
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
/usr/bin/tailscale serve --yes --service=svc:kleidijk-ha --tcp=80 "tcp://$ip:8123"
exec /usr/bin/socat "TCP-LISTEN:8123,bind=$ip,fork,reuseaddr" TCP:192.168.2.49:8123
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
