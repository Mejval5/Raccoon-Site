#!/usr/bin/env python3
"""Local static server for site/ (used by run_locally.bat).

Same as `python -m http.server`, but with the MIME types Firebase Hosting sends: on Windows
Python takes .js from the registry, which often says text/plain, and browsers refuse module
scripts and workers served that way. Listens on all interfaces so the local network can reach it.

Usage: python scripts/serve.py <port> [directory]
"""
import mimetypes
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
root = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'site')

for ext, mime in {'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
                  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
                  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mtlx': 'application/xml',
                  '.rgbe': 'application/octet-stream', '.data': 'application/octet-stream'}.items():
    mimetypes.add_type(mime, ext, strict=True)
    SimpleHTTPRequestHandler.extensions_map[ext] = mime


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=root, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


ThreadingHTTPServer.allow_reuse_address = True
ThreadingHTTPServer(('', port), Handler).serve_forever()
