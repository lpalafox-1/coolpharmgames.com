// tools/browser-global-harness.mjs
// Loads a browser-global IIFE script (e.g. assets/js/review-queue-store.js)
// into a node:vm sandbox so tools tests can exercise it exactly as shipped,
// without modifying application code or adding devDependencies.
//
// Only the browser APIs the loaded scripts actually use are stubbed:
// - `window`: the sandbox itself (the IIFE receives it as its global).
// - `document.createElement("div")`: used by toPlainText-style helpers that
//   assign innerHTML and read textContent. The stub strips tags and decodes
//   the five common named entities, matching browser behavior for the
//   simple markup that appears in quiz prompts (<strong>, <b>, <em>).
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function decodeBasicEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function createElementStub() {
  return {
    innerHTML: "",
    get textContent() {
      return decodeBasicEntities(String(this.innerHTML).replace(/<[^>]*>/g, ""));
    },
    get innerText() {
      return this.textContent;
    }
  };
}

export function loadBrowserGlobal(repoRelativePath, extraGlobals = {}) {
  const scriptPath = path.join(repoRoot, repoRelativePath);
  const sandbox = {
    console,
    URLSearchParams,
    document: { createElement: createElementStub },
    ...extraGlobals
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(scriptPath, "utf8"), sandbox, { filename: repoRelativePath });
  return sandbox;
}
