// Gallery render thread. Each thread owns its own mxslc compiler, MaterialX shader generator
// and an OffscreenCanvas WebGL renderer, so a card goes MXSL -> MaterialX -> GLSL -> frames
// without touching the main thread. The page only draws the bitmaps it gets back.
//
//   { op: 'init', args: { size } }                     -> { op: 'ready', ok, error? }
//   { id, op: 'render', args: { src, opts, frames, files?, view? } } -> { id, ok: true, frames: ImageBitmap[], nodes, label, ms }
//   files: [{ name, blob }], the project's images for image("name.png")
//   view:  { geo, env, spin, yaw, pitch, dist } as in the editor; frames turn the camera when it
//          spins, else step through time; a still shader with no spin gives a single frame
//                                                      |  { id, ok: false, stage, error, nodes?, ms? }
import Mxslc from '../lib/JsMxslc.js';
import MaterialX from '../lib/JsMaterialXGenShader.js';
import { THREE, mxMsg, loadEnvironment, makeChecker, createGenerator, generateShader, createMaterial, makeUniformUpdater, listTargets, captureShaderErrors, makeTextures, disposeTextures, textureResolver, cleanView, makeViewGeometry, makeScreenCamera, orbitCamera, BACKDROP } from './mx-shader.js';
import { countNodes } from './graph.js';

const libFile = (name) => new URL('../lib/' + name, import.meta.url).href;
const errText = (e) => String((e && (e.message || e.error)) || e || 'Unknown error');

let mxc = null, mx = null, g = null, env = null, checker = null, size = 256;
let canvas = null, renderer = null, scene = null, camera = null, screenCam = null, mesh = null;
const geos = {};
let shaderError = '', frameNo = 0;

// The GPU is shared by every thread and by the page, and the GPU process compiles shaders
// one at a time, so the GPU stage runs under a slot handed out by the pool: the thread asks
// for it, renders, and gives it back. The WebGL context is created inside the first slot.
let gpuGrant = null;
function waitForGpu(id) {
  return new Promise((resolve) => { gpuGrant = resolve; self.postMessage({ id, op: 'gpu-request' }); });
}

async function init(args) {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('OffscreenCanvas is not available in this browser');
  size = args.size;
  const [m1, m2, e] = await Promise.all([
    Mxslc({ locateFile: libFile, print: () => {}, printErr: () => {} }),
    MaterialX({ locateFile: libFile, print: () => {}, printErr: () => {} }),
    loadEnvironment(libFile),
  ]);
  mxc = m1; mx = m2; env = e;
  g = await createGenerator(mx);
  checker = makeChecker();
}

function initGpu() {
  canvas = new OffscreenCanvas(size, size);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  captureShaderErrors(renderer, (msg) => { shaderError = msg; });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100); // same lens as the editor preview
  screenCam = makeScreenCamera();
  mesh = new THREE.Mesh(geometry('sphere'), new THREE.MeshBasicMaterial({ color: 0x333a48 }));
  mesh.onBeforeRender = makeUniformUpdater(mesh, performance.now(), () => frameNo);
  scene.add(mesh);
}

function geometry(geo) { return (geos[geo] ??= makeViewGeometry(geo)); }

async function render(id, args) {
  const textures = await makeTextures(args.files);
  try { return await renderWith(id, args, textureResolver(textures)); }
  finally { disposeTextures(textures); }
}

async function renderWith(id, { src, opts, frames: n, view: rawView }, resolve) {
  const view = cleanView(rawView);
  const ms = {};
  let t = performance.now();

  // 1. MXSL -> MaterialX
  let xml;
  const o = new mxc.CompileOptions();
  try {
    Object.assign(o, opts || {});
    xml = mxc.compileSlxToMtlx(src, o);
  } catch (e) {
    return { ok: false, stage: 'compile', error: errText(e) };
  } finally { o.delete(); }
  ms.compile = performance.now() - t;
  const nodes = countNodes(xml);

  // 2. MaterialX -> GLSL
  t = performance.now();
  let shader, label;
  try {
    const doc = mx.createDocument();
    doc.setDataLibrary(g.stdlib);
    await mx.readFromXmlString(doc, xml);
    const target = listTargets(mx, doc)[0];
    if (!target) return { ok: false, stage: 'empty', nodes, ms };
    label = target.label;
    shader = generateShader(mx, g, target.el, checker, resolve);
  } catch (e) {
    return { ok: false, stage: 'shader', error: mxMsg(mx, e), nodes, ms };
  }
  ms.gen = performance.now() - t;

  // 3. GLSL -> GPU -> turntable frames, one thread at a time
  ms.wait = performance.now();
  await waitForGpu(id);
  ms.wait = performance.now() - ms.wait;
  t = performance.now();
  if (!renderer) initGpu();
  const mat = createMaterial(shader, env, g);
  mesh.material = mat;
  mesh.geometry = geometry(view.geo);
  const screen = view.geo === 'screen';
  scene.background = view.env && !screen ? env.bg : new THREE.Color(BACKDROP);
  const spin = view.spin && !screen;
  const animated = !!(mat.uniforms.u_time || mat.uniforms.u_frame);
  const count = spin || animated ? n : 1; // nothing moves: one frame says it all
  shaderError = '';
  const out = [];
  for (let i = 0; i < count; i++) {
    if (!screen) orbitCamera(camera, view.yaw + (spin ? (i / count) * Math.PI * 2 : 0), view.pitch, view.dist);
    frameNo = i;
    if (mat.uniforms.u_time) mat.uniforms.u_time.value = (i / count) * 4;
    renderer.render(scene, screen ? screenCam : camera);
    if (shaderError) break;
    out.push(canvas.transferToImageBitmap());
    if (i === 0) ms.gpu = performance.now() - t;
  }
  mesh.material = new THREE.MeshBasicMaterial({ color: 0x333a48 });
  mat.dispose();
  if (shaderError) {
    for (const f of out) f.close();
    return { ok: false, stage: 'gpu', error: shaderError, nodes, ms };
  }
  ms.frames = performance.now() - t;
  return { ok: true, frames: out, nodes, label, ms };
}

// jobs run one after another on this thread
let chain = Promise.resolve();
self.onmessage = (e) => {
  const { id, op, args } = e.data;
  if (op === 'gpu-grant') { const go = gpuGrant; gpuGrant = null; go?.(); return; }
  chain = chain.then(async () => {
    if (op === 'init') {
      try { await init(args); self.postMessage({ op: 'ready', ok: true }); }
      catch (err) { self.postMessage({ op: 'ready', ok: false, error: mxMsg(mx, err) }); }
      return;
    }
    try {
      const r = await render(id, args);
      self.postMessage({ id, ...r }, r.frames || []);
    } catch (err) {
      self.postMessage({ id, ok: false, stage: 'crash', error: mxMsg(mx, err) });
    }
  });
};
