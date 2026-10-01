// Syntax highlighting for the two editors: MXSL on the left, MaterialX XML on the right.
export const KW = new Set(['if','else','for','from','to','return','null','ref','out','const','mutable','consteval','global','geomprop','nodegraph','nodedef','inline','default','comptime','using','class','this','uniform','varying','namespace','print','typeof','break','true','false']);
export const TYPES = new Set(['bool','int','float','string','bool2','bool3','bool4','int2','int3','int4','float2','float3','float4','double','double2','double3','double4','color2','color3','color4','vector2','vector3','vector4','vec2','vec3','vec4','matrix33','matrix44','filename','surfaceshader','displacementshader','volumeshader','lightshader','material','void','BSDF','EDF','VDF']);
export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MXSL_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(#\w+)|(\b\d+(?:\.\d*)?(?:[eE][-+]?\d+)?\b|\.\d+\b)|([A-Za-z_]\w*)(\s*(?=[(<]))?/g;
export function highlightMxsl(src) {
  let out = '', last = 0, m;
  MXSL_RE.lastIndex = 0;
  while ((m = MXSL_RE.exec(src))) {
    out += esc(src.slice(last, m.index));
    const t = m[0];
    if (m[1]) out += `<span class="co">${esc(t)}</span>`;
    else if (m[2]) out += `<span class="st">${esc(t)}</span>`;
    else if (m[3]) out += `<span class="pp">${esc(t)}</span>`;
    else if (m[4]) out += `<span class="nu">${t}</span>`;
    else if (m[5]) {
      const w = m[5];
      if (KW.has(w)) out += `<span class="kw">${w}</span>`;
      else if (TYPES.has(w)) out += `<span class="ty">${w}</span>`;
      else if (m[6] !== undefined) out += `<span class="fn">${w}</span>`;
      else out += w;
      if (m[6]) out += m[6];
    }
    last = m.index + t.length;
  }
  return out + esc(src.slice(last));
}

const XML_RE = /(<!--[\s\S]*?-->)|(<\??\/?)([\w:.-]+)|([\w:.-]+)(=)("[^"]*")|(\??\/?>)/g;
export function highlightXml(src) {
  let out = '', last = 0, m;
  XML_RE.lastIndex = 0;
  while ((m = XML_RE.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) out += `<span class="co">${esc(m[1])}</span>`;
    else if (m[3]) out += `<span class="tg">${esc(m[2])}${m[3]}</span>`;
    else if (m[4]) out += `<span class="at">${m[4]}</span>=<span class="st">${esc(m[6])}</span>`;
    else out += `<span class="tg">${esc(m[7])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}
