// MaterialX shader generation glue shared by the editor preview (preview.js, main thread)
// and the gallery render threads (render-worker.js): environment maps, the light rig,
// uniform conversion, geometry attributes and target selection.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { LIGHT_RIG } from './presets.js';

export { THREE };

export function mxMsg(mx, e) {
  if (typeof e === 'number' && mx && mx.getExceptionMessage) {
    try { const m = mx.getExceptionMessage(e); return Array.isArray(m) ? m.join(': ') : String(m); } catch { /* fall through */ }
  }
  return (e && (e.message || e.error || String(e))) || 'Unknown error';
}

// Raw RGBE bytes (as stored in lib/*.rgbe) to a half-float texture.
export function rgbeToHalf(bytes, w, h) {
  const out = new Uint16Array(w * h * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const e = bytes[j + 3];
    const f = e ? Math.pow(2, e - 136) : 0;
    out[j] = toHalf(bytes[j] * f);
    out[j + 1] = toHalf(bytes[j + 1] * f);
    out[j + 2] = toHalf(bytes[j + 2] * f);
    out[j + 3] = toHalf(1);
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// The environment used for lighting and reflections: radiance 512x256, irradiance 256x128.
export async function loadEnvironment(libFile) {
  const [radB, irrB] = await Promise.all([libFile('env-radiance.rgbe'), libFile('env-irradiance.rgbe')].map(async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`${r.status} loading ${u}`);
    return r.arrayBuffer();
  }));
  const rad = rgbeToHalf(new Uint8Array(radB), 512, 256);
  const irr = rgbeToHalf(new Uint8Array(irrB), 256, 128);
  const bg = rad.clone();
  bg.mapping = THREE.EquirectangularReflectionMapping;
  bg.needsUpdate = true;
  return { rad, irr, bg };
}

// Image inputs have no files to load, so they get a checker.
export function makeChecker() {
  const n = 256, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const on = ((x >> 5) + (y >> 5)) & 1, i = (y * n + x) * 4;
    d[i] = on ? 200 : 70; d[i + 1] = on ? 200 : 70; d[i + 2] = on ? 205 : 78; d[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Creates the ESSL generator with the light rig bound, the way the MaterialX web viewer does.
export async function createGenerator(mx) {
  const gen = mx.EsslShaderGenerator.create();
  const ctx = new mx.GenContext(gen);
  const stdlib = mx.loadStandardLibraries(ctx);
  ctx.getOptions().hwSrgbEncodeOutput = true;

  const rig = mx.createDocument();
  await mx.readFromXmlString(rig, LIGHT_RIG);
  const base = mx.createDocument();
  base.setDataLibrary(stdlib);
  base.importLibrary(rig);
  mx.HwShaderGenerator.unbindLightShaders(ctx);
  const envMatrix = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  let id = 1;
  const bound = {};
  const lightData = [];
  for (const light of base.getNodes()) {
    if (light.getType() !== 'lightshader') continue;
    const nd = light.getNodeDef();
    if (!bound[nd.getName()]) { bound[nd.getName()] = id; mx.HwShaderGenerator.bindLightShader(nd, id++, ctx); }
    lightData.push({
      type: bound[nd.getName()],
      direction: new THREE.Vector3(...light.getValueElement('direction').getValue().getData().data()).transformDirection(envMatrix),
      color: new THREE.Vector3(...light.getValueElement('color').getValue().getData().data()),
      intensity: light.getValueElement('intensity').getValue().getData(),
    });
  }
  ctx.getOptions().hwMaxActiveLightSources = Math.max(1, lightData.length);
  return { gen, ctx, stdlib, lightData, envMatrix };
}

const vecData = (v, n) => (v ? Array.from(v.data()) : new Array(n).fill(0));
function matData(m, n) {
  if (!m) return new Array(n).fill(0);
  const out = [];
  for (let r = 0; r < m.numRows(); r++) for (let c = 0; c < m.numColumns(); c++) out.push(m.getItem(r, c));
  return out;
}
// Textures for a project's images, keyed by lower-case file name. Bitmaps are flipped on decode
// so the image's top row sits at v = 1, as MaterialX texture coordinates expect.
export async function makeTextures(files) {
  const map = new Map();
  for (const f of files || []) {
    try {
      const bmp = await createImageBitmap(f.blob, { imageOrientation: 'flipY' });
      const tex = new THREE.Texture(bmp);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      map.set(f.name.toLowerCase(), { name: f.name, tex });
    } catch { /* unreadable image: the shader falls back to the checker */ }
  }
  return map;
}
export function disposeTextures(map) {
  for (const { tex } of map?.values() || []) { tex.image?.close?.(); tex.dispose(); }
}
// Looks up image("…") in a texture map: same file name, else same name without extension.
export function textureResolver(map) {
  if (!map || !map.size) return null;
  const stem = (n) => n.replace(/\.[^.]*$/, '');
  return (requested) => {
    const want = String(requested).split(/[\\/]/).pop().toLowerCase();
    if (map.has(want)) return map.get(want).tex;
    for (const [k, v] of map) if (stem(k) === stem(want)) return v.tex;
    return null;
  };
}

function toUniformValue(type, value, checker, usedTextures, resolve) {
  switch (type) {
    case 'float': case 'integer': case 'boolean': return value;
    case 'vector2': return vecData(value, 2);
    case 'vector3': case 'color3': return vecData(value, 3);
    case 'vector4': case 'color4': return vecData(value, 4);
    case 'matrix33': return matData(value, 9);
    case 'matrix44': return matData(value, 16);
    case 'filename': {
      // a project image when there is one by that name, else the checker (and say so)
      const tex = value && resolve ? resolve(String(value)) : null;
      if (tex) return tex;
      if (value) usedTextures.push(String(value));
      return checker;
    }
    default: return null;
  }
}
function stageUniforms(stage, checker, usedTextures, resolve) {
  const u = {};
  for (const block of Object.values(stage.getUniformBlocks())) {
    if (block.empty()) continue;
    for (let i = 0; i < block.size(); i++) {
      const v = block.get(i);
      const value = v.getValue() ? v.getValue().getData() : null;
      u[v.getVariable()] = new THREE.Uniform(toUniformValue(v.getType().getName(), value, checker, usedTextures, resolve));
    }
  }
  return u;
}

// Generates the GLSL for one element and collects its uniforms. Throws the MaterialX error.
// resolve(name) -> THREE.Texture | null maps image file names to the project's images;
// usedTextures lists the names it could not find (shown as the checker).
export function generateShader(mx, g, target, checker, resolve = null) {
  const usedTextures = [];
  const opts = g.ctx.getOptions();
  const transparent = mx.isTransparentSurface(target, g.gen.getTarget());
  opts.hwTransparency = transparent;
  opts.shaderInterfaceType = mx.ShaderInterfaceType.SHADER_INTERFACE_COMPLETE;
  const shader = g.gen.generate(target.getNamePath(), target, g.ctx);
  const vs = shader.getSourceCode('vertex').replace(/^#version\s+.*\n/, '');
  const fs = shader.getSourceCode('pixel').replace(/^#version\s+.*\n/, '');
  const uniforms = { ...stageUniforms(shader.getStage('vertex'), checker, usedTextures, resolve), ...stageUniforms(shader.getStage('pixel'), checker, usedTextures, resolve) };
  return { vs, fs, uniforms, transparent, usedTextures };
}

// The lighting uniforms every generated shader expects, plus the material itself.
export function createMaterial(shader, env, g) {
  const uniforms = Object.assign(shader.uniforms, {
    u_numActiveLightSources: { value: g.lightData.length },
    u_lightData: { value: g.lightData },
    u_envMatrix: { value: g.envMatrix },
    u_envRadiance: { value: env.rad },
    u_envRadianceMips: { value: Math.trunc(Math.log2(512)) + 1 },
    u_envRadianceSamples: { value: 16 },
    u_envIrradiance: { value: env.irr },
    u_refractionEnv: { value: true },
  });
  const mat = new THREE.RawShaderMaterial({
    uniforms, vertexShader: shader.vs, fragmentShader: shader.fs, glslVersion: THREE.GLSL3,
    transparent: shader.transparent, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusSrcAlphaFactor, blendDst: THREE.SrcAlphaFactor, side: THREE.DoubleSide,
  });
  mat.userData.vs = shader.vs;
  mat.userData.fs = shader.fs;
  return mat;
}

// Generated shaders read i_position / i_normal / i_texcoord_0 / i_tangent (vec3).
export function prepareGeometry(g) {
  g.computeTangents();
  g.setAttribute('i_position', g.attributes.position);
  g.setAttribute('i_normal', g.attributes.normal);
  g.setAttribute('i_texcoord_0', g.attributes.uv);
  const t4 = g.attributes.tangent;
  const t3 = new Float32Array(t4.count * 3);
  for (let i = 0; i < t4.count; i++) { t3[i * 3] = t4.getX(i); t3[i * 3 + 1] = t4.getY(i); t3[i * 3 + 2] = t4.getZ(i); }
  g.setAttribute('i_tangent', new THREE.BufferAttribute(t3, 3));
  return g;
}

// Per-draw uniforms (camera, object transform, time) for a mesh drawn with a generated shader.
export function makeUniformUpdater(mesh, t0, getFrame) {
  const vp = new THREE.Matrix4(), wit = new THREE.Matrix4(), pos = new THREE.Vector3();
  return (renderer, scene, camera, geometry, material) => {
    const u = material.uniforms;
    if (!u) return;
    if (u.u_worldMatrix) u.u_worldMatrix.value = mesh.matrixWorld;
    if (u.u_viewProjectionMatrix) u.u_viewProjectionMatrix.value = vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (u.u_viewPosition) u.u_viewPosition.value = camera.getWorldPosition(pos);
    if (u.u_worldInverseTransposeMatrix) u.u_worldInverseTransposeMatrix.value = wit.copy(mesh.matrixWorld).invert().transpose();
    if (u.u_time) u.u_time.value = (performance.now() - t0) / 1000;
    if (u.u_frame) u.u_frame.value = getFrame();
  };
}

const PREVIEWABLE = new Set(['color3', 'color4', 'float', 'vector2', 'vector3', 'vector4', 'integer', 'boolean']);
// Everything in a document worth drawing: materials first, then named values, newest first.
export function listTargets(mx, doc) {
  const targets = [];
  for (const mat of doc.getMaterialNodes()) {
    const shaders = mx.getShaderNodes(mat);
    if (shaders.length) targets.push({ key: 'mat:' + mat.getName(), label: `${mat.getName()} (material)`, el: shaders[0] });
  }
  const nodes = doc.getNodes();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!PREVIEWABLE.has(n.getType()) || /^var__\d+$/.test(n.getName())) continue;
    targets.push({ key: 'node:' + n.getName(), label: `${n.getName()} (${n.getType()} from ${n.getCategory()})`, el: n });
  }
  return targets;
}

export function captureShaderErrors(renderer, onError) {
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const log = (gl.getShaderInfoLog(fs) || '') + (gl.getShaderInfoLog(vs) || '') + (gl.getProgramInfoLog(program) || '');
    onError(log.trim().split('\n').slice(0, 6).join('\n') || 'Shader failed to link.');
  };
}
