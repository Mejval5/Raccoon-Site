// The node-graph readout under the editor: how many nodes the MaterialX output has, by type.
import { esc } from './highlight.js';

const PALETTE = ['#e3b341','#82aaff','#c792ea','#8fd694','#f78c6c','#89ddff','#f07178','#ffcb6b','#a6accd'];
// MaterialX elements that are structure, not nodes of the graph
export const NOT_NODES = new Set(['materialx','input','output','nodedef','nodegraph','implementation','typedef','look','materialassign','collection','geominfo','geomprop','token','variant','variantset','backdrop','parameter']);

// Counts the nodes in a MaterialX document without parsing it as XML, so it also runs
// in workers and on the server.
export function countNodes(xml) {
  let n = 0;
  for (const m of xml.matchAll(/<([A-Za-z_][\w.-]*)[\s/>]/g)) if (!NOT_NODES.has(m[1])) n++;
  return n;
}

export function renderGraph(xml) {
  const host = document.getElementById('graph');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) { host.innerHTML = '<div class="empty">The MaterialX output is not valid XML.</div>'; return; }
  const counts = new Map();
  let nodes = 0;
  for (const el of doc.getElementsByTagName('*')) {
    const tag = el.tagName;
    if (NOT_NODES.has(tag)) continue;
    nodes++;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const graphs = doc.getElementsByTagName('nodegraph').length;
  const defs = doc.getElementsByTagName('nodedef').length;
  const materials = counts.get('surfacematerial') || 0;
  if (!nodes) { host.innerHTML = '<div class="empty">No nodes in the output. Declare a material or an output value to get a graph.</div>'; return; }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, PALETTE.length - 1);
  const rest = sorted.slice(PALETTE.length - 1).reduce((s, e) => s + e[1], 0);
  if (rest) top.push([`${sorted.length - top.length} others`, rest]);
  const bar = top.map(([k, v], i) => `<span style="flex:${v};background:${PALETTE[i]}" title="${esc(k)}: ${v}"></span>`).join('');
  const legend = top.map(([k, v], i) => `<span><i style="background:${PALETTE[i]}"></i>${esc(k)}<em>${v}</em></span>`).join('');
  host.innerHTML = `
    <div class="graph-top">
      <span class="stat"><b>${nodes}</b>nodes</span>
      <span class="stat"><b>${counts.size}</b>node types</span>
      <span class="stat"><b>${graphs}</b>nodegraphs</span>
      <span class="stat"><b>${defs}</b>nodedefs</span>
      <span class="stat"><b>${materials}</b>materials</span>
    </div>
    <div class="bar">${bar}</div>
    <div class="legend">${legend}</div>`;
}
