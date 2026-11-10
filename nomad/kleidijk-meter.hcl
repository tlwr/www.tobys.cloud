# P1 meter on kleipower. ser2net listens on TCP 2001 and Home Assistant
# (192.168.2.49) is the client. Thinkcentre cannot open 2001, but it can
# open port 80. This task reads one telegram locally and reports a single
# status line on the tailscale address. Blackbox on thinkcentre probes it.
#
# ser2net allows one extra client (max-connections: 2 in /etc/ser2net.yaml)
# so this read does not take Home Assistant's connection.
#
#   nomad job run nomad/kleidijk-meter.hcl
#   curl http://kleipower.finch-barb.ts.net/

job "kleidijk-meter" {
  datacenters = ["kd"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "kleipower"
  }

  type = "service"

  group "servers" {
    count = 1

    task "meter" {
      driver = "raw_exec"

      template {
        destination = "local/run.sh"
        perms       = "755"
        data        = <<-EOH
#!/bin/sh
ip="{{ sockaddr "GetInterfaceIP \"tailscale0\"" }}"
test -n "$ip" || exit 1
exec /usr/bin/python3 "${NOMAD_TASK_DIR}/meter.py" "$ip"
EOH
      }

      template {
        destination = "local/meter.py"
        perms       = "755"
        data        = <<-EOH
#!/usr/bin/env python3
import re
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

METER_HOST = "127.0.0.1"
METER_PORT = 2001
HA_PEER = "192.168.2.49"
METER_ID = "/KFM5KAIFA-METER"
READ_SECONDS = 8
MAX_AGE = timedelta(seconds=120)
PROBE_LOCK = threading.Lock()

FRAME = re.compile(r"/[^!]*![0-9A-Fa-f]{4}")
CLOCK = re.compile(r"0-0:1\.0\.0\((\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([WS])\)")


def crc16(data):
    crc = 0
    for ch in data:
        crc ^= ord(ch)
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return f"{crc:04X}"


def ha_connected():
    out = subprocess.check_output(
        ["/usr/bin/ss", "-Htn", "sport", "=", ":2001"],
        text=True,
    )
    return any(
        line.startswith("ESTAB") and HA_PEER in line for line in out.splitlines()
    )


def read_frame():
    sock = socket.create_connection((METER_HOST, METER_PORT), timeout=5)
    try:
        sock.settimeout(1)
        buf = ""
        deadline = time.monotonic() + READ_SECONDS
        while time.monotonic() < deadline:
            try:
                chunk = sock.recv(2048)
            except socket.timeout:
                continue
            if not chunk:
                break
            buf += chunk.decode("latin1")
            frames = FRAME.findall(buf)
            if frames:
                return frames[-1]
        raise TimeoutError("telegram-timeout")
    finally:
        sock.close()


def probe():
    if not ha_connected():
        return 503, "stuck kleipower meter ha-down\n"
    try:
        frame = read_frame()
    except ConnectionRefusedError:
        return 503, "stuck kleipower meter ser2net-refused\n"
    except (TimeoutError, socket.timeout, OSError):
        return 503, "stuck kleipower meter telegram-timeout\n"

    if not frame.startswith(METER_ID):
        return 503, "stuck kleipower meter telegram-garbled\n"
    if crc16(frame[:-4]) != frame[-4:].upper():
        return 503, "stuck kleipower meter crc-mismatch\n"

    match = CLOCK.search(frame)
    if not match:
        return 503, "stuck kleipower meter clock-missing\n"
    yy, mo, dd, hh, mm, ss, flag = match.groups()
    local = datetime(2000 + int(yy), int(mo), int(dd), int(hh), int(mm), int(ss))
    offset = timedelta(hours=1 if flag == "W" else 2)
    stamp = (local - offset).replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - stamp
    if age < timedelta(seconds=-30) or age > MAX_AGE:
        return 503, f"stuck kleipower meter clock-stale age={int(age.total_seconds())}s\n"
    if not ha_connected():
        return 503, "stuck kleipower meter ha-dropped\n"

    token = "".join(match.groups())
    return 200, f"ok kleipower meter {METER_ID} {token} ha={HA_PEER}\n"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] != "/":
            self._send(404, "not found\n")
            return
        with PROBE_LOCK:
            status, body = probe()
        self._send(status, body)

    def _send(self, status, body):
        data = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: meter.py BIND_IP")
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer((sys.argv[1], 80), Handler)
    sys.stderr.write("listening %s:80\n" % sys.argv[1])
    httpd.serve_forever()


if __name__ == "__main__":
    main()
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
