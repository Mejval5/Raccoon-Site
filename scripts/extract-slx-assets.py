#!/usr/bin/env python3
"""One-off: pull the WebAssembly builds and environment maps out of the old single-file
ShadingLanguageX playground page into site/shadinglanguagex/lib/ as real files.

The old page (the Claude artifact) carried everything inline as base64 + gzip:
  #wasm-gz / #data-gz            mxslc compiler   (JsMxslc.wasm / JsMxslc.data)
  #mxgen-wasm-gz / #mxgen-data-gz MaterialX shader generator (JsMaterialXGenShader.wasm / .data)
  #env-rad-gz / #env-irr-gz      environment maps, raw RGBE bytes (512x256 and 256x128)
plus the two Emscripten glue scripts as text. The glue scripts are written out as ES modules
with a default export, which is the shape both upstream builds ship in.

Usage: python scripts/extract-slx-assets.py <old-index.html> [lib-dir]
"""
import base64
import gzip
import os
import re
import sys

src_path = sys.argv[1]
lib = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'site', 'shadinglanguagex', 'lib')
os.makedirs(lib, exist_ok=True)
html = open(src_path, encoding='utf-8').read()


def payload(el_id):
    m = re.search(r'<script type="application/octet-stream" id="%s">([^<]*)</script>' % el_id, html)
    if not m:
        sys.exit(f'payload #{el_id} not found')
    return gzip.decompress(base64.b64decode(m.group(1).strip()))


def write(name, data):
    with open(os.path.join(lib, name), 'wb') as f:
        f.write(data)
    print(f'{name:32} {len(data):>10,} bytes')


for el_id, name in [('wasm-gz', 'JsMxslc.wasm'), ('data-gz', 'JsMxslc.data'),
                    ('mxgen-wasm-gz', 'JsMaterialXGenShader.wasm'), ('mxgen-data-gz', 'JsMaterialXGenShader.data'),
                    ('env-rad-gz', 'env-radiance.rgbe'), ('env-irr-gz', 'env-irradiance.rgbe')]:
    write(name, payload(el_id))


def glue(start_marker, name, factory):
    a = html.index(start_marker)
    tail = '  return moduleRtn;\n}\n);\n})();'  # the minified body has its own "})();", so match the factory's tail
    b = html.index(tail, a) + len(tail)
    code = html[a:b]
    assert code.startswith('var ' + factory), code[:40]
    if factory == 'MaterialX':
        # MaterialX's library-loading helpers only know a window or Node and throw "Unknown
        # environment!" inside a Web Worker. The gallery renders in workers, so let them take
        # the web path, with new URL() in place of the <a> element workers do not have.
        patches = [
            ('else if(ENVIRONMENT_IS_WEB){var link=document.createElement("a");link.href=path;if(link.origin+link.pathname+link.search+link.hash===path){path=wasmRootFolder+link.pathname}}else{throw new Error("Unknown environment!")}',
             'else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){var link=new URL(path,self.location.href);if(link.origin+link.pathname+link.search+link.hash===path){path=wasmRootFolder+link.pathname}}else{throw new Error("Unknown environment!")}'),
            ('if(ENVIRONMENT_IS_WEB){promise=fetchXml(fileToLoad,searchPaths)}else if(ENVIRONMENT_IS_NODE)',
             'if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){promise=fetchXml(fileToLoad,searchPaths)}else if(ENVIRONMENT_IS_NODE)'),
            ('else if(ENVIRONMENT_IS_WEB){var cwd=window.location.pathname;',
             'else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){var cwd=self.location.pathname;'),
        ]
        for old, new in patches:
            assert code.count(old) == 1, old[:60]
            code = code.replace(old, new)
    out = ('// %s: Emscripten build, extracted unchanged from the single-file playground page.\n'
           '// Fetches %s and %s from next to this file.\n' % (name, name.replace('.js', '.wasm'), name.replace('.js', '.data'))
           + code + '\nexport default %s;\n' % factory)
    write(name, out.encode('utf-8'))


glue('var Mxslc = (() => {', 'JsMxslc.js', 'Mxslc')
glue('var MaterialX = (() => {', 'JsMaterialXGenShader.js', 'MaterialX')
