// The 3D preview on the editor page: MaterialX GenShader turns the compiled document into
// GLSL, three.js draws it on a sphere, plane or knot under the environment light.
import MaterialX from '../lib/JsMaterialXGenShader.js';
import { $, libFile } from './util.js';
import { THREE, mxMsg, loadEnvironment, makeChecker, createGenerator, generateShader, createMaterial, prepareGeometry, makeUniformUpdater, listTargets, captureShaderErrors, makeTextures, disposeTextures, textureResolver } from './mx-shader.js';

export const pv = {
  mx: null, g: null, env: null, ready: false,
  renderer: null, scene: null, camera: null, mesh: null, geos: {}, geo: 'sphere',
  checker: null, pendingXml: null, timer: 0, dirty: false, textures: null, resolve: null,
  yaw: 0.6, pitch: 0.25, dist: 4.0, t0: performance.now(), frame: 0, shaderError: '',
};
const pvMsg = (text, isErr = false) => {
  const el = $('pv-msg');
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('err', isErr);
};
const pvStatus = (text) => { $('pv-status').textContent = text; };

function buildGeometries() {
  pv.geos = {
    sphere: prepareGeometry(new THREE.SphereGeometry(1, 128, 64)),
    plane: prepareGeometry(new THREE.PlaneGeometry(2, 2, 1, 1)),
    knot: prepareGeometry(new THREE.TorusKnotGeometry(0.62, 0.22, 256, 48)),
  };
}

export async function initPreview() {
  try {
    const canvas = $('canvas');
    pv.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    pv.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    captureShaderErrors(pv.renderer, (msg) => { pv.shaderError = msg; });
    pv.scene = new THREE.Scene();
    pv.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
    pv.checker = makeChecker();

    const [env, mx] = await Promise.all([
      loadEnvironment(libFile),
      MaterialX({ locateFile: libFile, print: () => {}, printErr: () => {} }),
    ]);
    pv.env = env;
    pv.scene.background = $('pv-env').checked ? env.bg : new THREE.Color(0x0d1017);
    pv.scene.backgroundBlurriness = 0;
    pv.mx = mx;
    pv.g = await createGenerator(mx);

    buildGeometries();
    pv.mesh = new THREE.Mesh(pv.geos.sphere, new THREE.MeshBasicMaterial({ color: 0x333a48 }));
    pv.mesh.onBeforeRender = makeUniformUpdater(pv.mesh, pv.t0, () => pv.frame);
    pv.scene.add(pv.mesh);
    hookControls(canvas);
    new ResizeObserver(resizePreview).observe($('view-preview'));
    resizePreview();
    pv.ready = true;
    pvMsg('');
    requestAnimationFrame(tick);
    if (pv.pendingXml !== null) schedulePreview(pv.pendingXml, 0);
  } catch (e) {
    pvMsg(`The preview could not start: ${mxMsg(pv.mx, e)}`, true);
  }
}

export function resizePreview() {
  const host = $('view-preview');
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h || !pv.renderer) return;
  pv.renderer.setSize(w, h, false);
  pv.camera.aspect = w / h;
  pv.camera.updateProjectionMatrix();
  pv.dirty = true;
}

function hookControls(canvas) {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    pv.yaw += (e.clientX - drag.x) * 0.008;
    pv.pitch = Math.max(-1.4, Math.min(1.4, pv.pitch + (e.clientY - drag.y) * 0.008));
    drag = { x: e.clientX, y: e.clientY };
    pv.dirty = true;
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); pv.dist = Math.max(1.6, Math.min(8, pv.dist * (1 + e.deltaY * 0.001))); pv.dirty = true; }, { passive: false });
}

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick() {
  requestAnimationFrame(tick);
  if ($('view-preview').hidden) return;
  const spinning = $('pv-spin').checked && !reduceMotion;
  const animated = !!(pv.mesh.material.uniforms && (pv.mesh.material.uniforms.u_time || pv.mesh.material.uniforms.u_frame));
  if (!pv.dirty && !spinning && !animated) return;
  pv.dirty = false;
  pv.frame++;
  if (spinning) pv.yaw += 0.004;
  const cp = Math.cos(pv.pitch);
  pv.camera.position.set(Math.sin(pv.yaw) * cp * pv.dist, Math.sin(pv.pitch) * pv.dist, Math.cos(pv.yaw) * cp * pv.dist);
  pv.camera.lookAt(0, 0, 0);
  pv.renderer.render(pv.scene, pv.camera);
  if (pv.shaderError) {
    pvMsg(`The generated GLSL failed to compile on this GPU:\n\n${pv.shaderError}`, true);
    pv.shaderError = '';
    pv.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333a48 });
  }
}

export function schedulePreview(xml, delay = 120) {
  pv.pendingXml = xml;
  if (!pv.ready) return;
  clearTimeout(pv.timer);
  pv.timer = setTimeout(() => updatePreview(pv.pendingXml), delay);
}

let lastTargets = [];
let lastPreviewXml = null;

// The open project's images: image("name.png") in the shader samples these. Re-renders.
export async function setPreviewImages(files) {
  const next = await makeTextures(files);
  const old = pv.textures;
  pv.textures = next;
  pv.resolve = textureResolver(next);
  lastPreviewXml = null; // same MaterialX, different textures: render again
  if (pv.ready && pv.pendingXml !== null) await updatePreview(pv.pendingXml);
  disposeTextures(old);
}
async function updatePreview(xml) {
  const m = pv.mx;
  if (xml === lastPreviewXml) return;
  lastPreviewXml = xml;
  const sel = $('pv-target');
  const prevKey = sel.value;
  let doc;
  try {
    doc = m.createDocument();
    doc.setDataLibrary(pv.g.stdlib);
    await m.readFromXmlString(doc, xml);
  } catch (e) { pvMsg(`MaterialX could not read this document: ${mxMsg(m, e)}`, true); return; }

  lastTargets = listTargets(m, doc);
  sel.textContent = '';
  for (const t of lastTargets) { const o = document.createElement('option'); o.value = t.key; o.textContent = t.label; sel.appendChild(o); }
  if (!lastTargets.length) {
    pv.mesh.material = new THREE.MeshBasicMaterial({ color: 0x333a48 });
    pv.dirty = true;
    pvMsg('Nothing to preview yet. Add a material, or give a color or float value a name.');
    pvStatus('');
    return;
  }
  if (lastTargets.some((t) => t.key === prevKey)) sel.value = prevKey;
  renderTarget(lastTargets.find((t) => t.key === sel.value));
}

let compileToken = 0;
function applyValues(material, uniforms) {
  for (const [k, u] of Object.entries(uniforms)) {
    if (material.uniforms[k]) material.uniforms[k].value = u.value;
  }
}
async function renderTarget(target) {
  const t0 = performance.now();
  let shader;
  try {
    shader = generateShader(pv.mx, pv.g, target.el, pv.checker, pv.resolve);
  } catch (e) {
    pvMsg(`Shader generation failed: ${mxMsg(pv.mx, e)}`, true);
    pvStatus('');
    return;
  }
  const genMs = (performance.now() - t0).toFixed(0);
  const texNote = shader.usedTextures.length ? `. Missing images, shown as a checker (add them under Images): ${[...new Set(shader.usedTextures)].join(', ')}` : '';
  const label = `${target.el.getCategory()} "${target.el.getName()}"`;
  const cur = pv.mesh.material;

  // Same GLSL as what is on screen: values changed only, so just push uniforms. No GPU compile.
  if (cur.isRawShaderMaterial && cur.userData.vs === shader.vs && cur.userData.fs === shader.fs && cur.transparent === shader.transparent) {
    compileToken++;
    applyValues(cur, shader.uniforms);
    pv.dirty = true;
    pvMsg('');
    pvStatus(`${label}, values updated in ${genMs} ms, shader reused${texNote}`);
    return;
  }

  const mat = createMaterial(shader, pv.env, pv.g);

  // New GLSL: compile off to the side (parallel on drivers with KHR_parallel_shader_compile)
  // while the old material keeps rendering, then swap. Stale compiles are dropped.
  const token = ++compileToken;
  pvStatus(`${label}, compiling shader...`);
  const tmpScene = new THREE.Scene();
  const tmpMesh = new THREE.Mesh(pv.mesh.geometry, mat);
  tmpMesh.onBeforeRender = pv.mesh.onBeforeRender;
  tmpScene.add(tmpMesh);
  const c0 = performance.now();
  try {
    if (pv.renderer.compileAsync) await pv.renderer.compileAsync(tmpScene, pv.camera);
  } catch (e) { /* errors surface through onShaderError on first draw */ }
  if (token !== compileToken) { mat.dispose(); return; }
  const old = pv.mesh.material;
  pv.mesh.material = mat;
  if (old && old.dispose) old.dispose();
  pv.dirty = true;
  pvMsg('');
  pvStatus(`${label}, ${(shader.fs.length / 1024).toFixed(0)} KB of GLSL, generated in ${genMs} ms, GPU compile ${(performance.now() - c0).toFixed(0)} ms in the background${texNote}`);
}

$('pv-target').addEventListener('change', () => {
  const t = lastTargets.find((x) => x.key === $('pv-target').value);
  if (t) renderTarget(t);
});
for (const b of document.querySelectorAll('.seg button')) {
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll('.seg button')) o.setAttribute('aria-pressed', String(o === b));
    if (pv.mesh) pv.mesh.geometry = pv.geos[b.dataset.geo];
    pv.dirty = true;
    if (b.dataset.geo === 'plane') { pv.yaw = 0; pv.pitch = 0; $('pv-spin').checked = false; }
  });
}
$('pv-env').addEventListener('change', () => {
  if (pv.scene) pv.scene.background = $('pv-env').checked ? pv.env.bg : new THREE.Color(0x0d1017);
  pv.dirty = true;
});
