#!/usr/bin/env python3
"""Tiny dual-stack static server for local preview of the coding platform.

Serves the coding_platform/ directory on both IPv4 (127.0.0.1) and IPv6 (::1),
so it works regardless of how `localhost` resolves.

    python3 tools/serve.py [port]      # default 8123
"""
import http.server, socket, socketserver, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # coding_platform/
os.chdir(ROOT)


class DualStack(socketserver.ThreadingTCPServer):
    address_family = socket.AF_INET6
    allow_reuse_address = True

    def server_bind(self):
        # accept IPv4-mapped addresses too, so 127.0.0.1 AND ::1 both work
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    handler = http.server.SimpleHTTPRequestHandler
    with DualStack(("::", PORT), handler) as httpd:
        print(f"serving {ROOT} on http://localhost:{PORT} (dual-stack)", flush=True)
        httpd.serve_forever()
