# Toner percent for the Brother HL-L2400DWE at 192.168.1.49.
# Printer-MIB prtMarkerSuppliesLevel is the sentinel -3 (some remaining),
# and the max capacity is unknown. The percent is record 0x81 in
# brInfoMaintenance (1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.8.0), a whole
# number from 0 to 100. Grafana Agent scrapes 127.0.0.1:9117.
#   nomad job run nomad/brother-toner.hcl

job "brother-toner" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "service"

  group "servers" {
    task "exporter" {
      driver = "docker"

      template {
        destination = "local/exporter.py"
        perms       = "755"
        data        = <<-EOH
#!/usr/bin/env python3
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PRINTER = "192.168.1.49"
COMMUNITY = "public"
OID = "1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.8.0"
LISTEN = ("127.0.0.1", 9117)
TONER_ID = 0x81


def enc_len(n):
    if n < 0x80:
        return bytes([n])
    if n < 0x100:
        return bytes([0x81, n])
    return bytes([0x82, (n >> 8) & 0xFF, n & 0xFF])


def tlv(tag, payload):
    return bytes([tag]) + enc_len(len(payload)) + payload


def enc_int(n):
    body = b"\x00" if n == 0 else n.to_bytes((n.bit_length() + 8) // 8, "big", signed=True)
    return tlv(0x02, body)


def enc_str(s):
    return tlv(0x04, s.encode() if isinstance(s, str) else s)


def enc_oid(oid):
    parts = [int(x) for x in oid.split(".")]
    body = bytes([parts[0] * 40 + parts[1]])
    for p in parts[2:]:
        chars = [p & 0x7F]
        p >>= 7
        while p:
            chars.append(0x80 | (p & 0x7F))
            p >>= 7
        body += bytes(reversed(chars))
    return tlv(0x06, body)


def snmp_get():
    vb = tlv(0x30, enc_oid(OID) + b"\x05\x00")
    pdu = tlv(0xA0, enc_int(1) + enc_int(0) + enc_int(0) + tlv(0x30, vb))
    msg = tlv(0x30, enc_int(1) + enc_str(COMMUNITY) + pdu)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(4)
    try:
        sock.sendto(msg, (PRINTER, 161))
        data, _ = sock.recvfrom(4096)
    finally:
        sock.close()
    return data


def parse_tlv(buf, i):
    tag = buf[i]
    i += 1
    n = buf[i]
    i += 1
    if n & 0x80:
        ln = n & 0x7F
        n = int.from_bytes(buf[i:i + ln], "big")
        i += ln
    return tag, buf[i:i + n], i + n


def octet_string(msg):
    _, body, _ = parse_tlv(msg, 0)
    i = 0
    _, _, i = parse_tlv(body, i)
    _, _, i = parse_tlv(body, i)
    _, pdu, _ = parse_tlv(body, i)
    j = 0
    _, _, j = parse_tlv(pdu, j)
    _, _, j = parse_tlv(pdu, j)
    _, _, j = parse_tlv(pdu, j)
    _, vbl, _ = parse_tlv(pdu, j)
    _, vb, _ = parse_tlv(vbl, 0)
    k = 0
    _, _, k = parse_tlv(vb, k)
    tag, val, _ = parse_tlv(vb, k)
    if tag != 0x04:
        raise ValueError("maintenance value is not an octet string")
    return val


def toner_percent():
    blob = octet_string(snmp_get())
    if blob.endswith(b"\xff" * 4):
        blob = blob[:-4]
    blob = blob.replace(b"\xff" * 3, b"")
    found = None
    i = 0
    while i + 7 <= len(blob):
        if blob[i + 1] != 0x01 or blob[i + 2] != 0x04:
            break
        if blob[i] == TONER_ID:
            found = int.from_bytes(blob[i + 3:i + 7], "big")
        i += 7
    if found is None or found < 0 or found > 100:
        raise ValueError("toner percent missing")
    return found


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/metrics", "/"):
            self.send_error(404)
            return
        try:
            percent = toner_percent()
        except Exception:
            self.send_error(500)
            return
        body = (
            "# HELP brother_toner_remaining_percent Black toner remaining, Brother maintenance record 0x81.\n"
            "# TYPE brother_toner_remaining_percent gauge\n"
            "brother_toner_remaining_percent{name=\"brother-printer\"} %d\n" % percent
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(LISTEN, Handler).serve_forever()
EOH
      }

      config {
        image        = "python:3.12-alpine"
        network_mode = "host"
        entrypoint   = ["python3", "/local/exporter.py"]

        volumes = [
          "local/exporter.py:/local/exporter.py:ro",
        ]

        dns_servers = ["100.100.100.100", "8.8.8.8"]
      }

      resources {
        cpu    = 50
        memory = 128
      }
    }
  }
}
