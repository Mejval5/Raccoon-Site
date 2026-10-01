"use strict";

/**
 * Compiles ShadingLanguageX on the server with the same WebAssembly build of mxslc the
 * playground uses (lib/mxslc/, copied from site/shadinglanguagex/lib/). The gallery function
 * refuses anything that does not compile, so nothing broken is ever stored.
 *
 * The module is loaded once per function instance (about 400 ms) and reused.
 */

const path = require("node:path");

const MXSLC_DIR = path.join(__dirname, "mxslc");

// MaterialX elements that are structure, not nodes of the graph (same list as the page's graph.js)
const NOT_NODES = new Set(["materialx", "input", "output", "nodedef", "nodegraph", "implementation", "typedef", "look", "materialassign", "collection", "geominfo", "geomprop", "token", "variant", "variantset", "backdrop", "parameter"]);

function countNodes(xml) {
  let n = 0;
  for (const m of xml.matchAll(/<([A-Za-z_][\w.-]*)[\s/>]/g)) if (!NOT_NODES.has(m[1])) n++;
  return n;
}

function lineOf(msg) {
  const m = /line (\d+)/i.exec(msg);
  return m ? Number(m[1]) : 0;
}

let modulePromise = null;
function getMxslc() {
  if (!modulePromise) {
    modulePromise = import("./mxslc/JsMxslc.mjs").then(({ default: Mxslc }) =>
      Mxslc({
        locateFile: (f) => path.join(MXSLC_DIR, f),
        print: () => {},
        printErr: () => {},
      })
    );
    modulePromise.catch(() => { modulePromise = null; });
  }
  return modulePromise;
}

const OPTION_KEYS = ["reduceGraph", "errorOnMissingGlobals", "errorOnUnusedGlobals"];

/**
 * @param {string} src MXSL source
 * @param {object} [opts] subset of CompileOptions (booleans); unknown keys are ignored
 * @returns {Promise<{ok: true, xml: string, nodes: number} | {ok: false, error: string, line: number}>}
 */
async function compileCheck(src, opts = {}) {
  const m = await getMxslc();
  const o = new m.CompileOptions();
  try {
    for (const k of OPTION_KEYS) if (typeof opts[k] === "boolean") o[k] = opts[k];
    const xml = m.compileSlxToMtlx(String(src), o);
    return { ok: true, xml, nodes: countNodes(xml) };
  } catch (e) {
    const error = String((e && e.message) || e || "compile failed");
    return { ok: false, error, line: lineOf(error) };
  } finally {
    o.delete();
  }
}

module.exports = { compileCheck, countNodes, lineOf, OPTION_KEYS };
