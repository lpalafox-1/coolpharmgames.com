import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const defaultEnginePath = path.join(repoRoot, "assets/js/quizEngine.js");

export const MANIFEST_NOTE =
  "Global surface of assets/js/quizEngine.js. Regenerate deliberately (same commit as any approved engine change) — tools/engine-globals-regression.test.mjs fails on any drift.";

export function extractGlobalSurface(source) {
  const functions = [...source.matchAll(/^(?:async )?function ([A-Za-z0-9_$]+)\s*\(/gm)].map((match) => match[1]);
  const windowExports = [...source.matchAll(/^\s*window\.([A-Za-z0-9_$]+)\s*=/gm)].map((match) => match[1]);

  return {
    functions: [...new Set(functions)].sort(),
    windowExports: [...new Set(windowExports)].sort()
  };
}

export function generateEngineManifest(source) {
  return {
    note: MANIFEST_NOTE,
    ...extractGlobalSurface(source)
  };
}

export function formatEngineManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parseOutputPath(args) {
  if (args.length === 0) return null;
  if (args.length === 2 && args[0] === "--output" && args[1]) return path.resolve(args[1]);
  throw new Error("Usage: node tools/generate-engine-manifest.mjs [--output <path>]");
}

function main() {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const source = readFileSync(defaultEnginePath, "utf8");
  const output = formatEngineManifest(generateEngineManifest(source));

  if (outputPath) {
    writeFileSync(outputPath, output, "utf8");
    process.stderr.write(`Wrote engine manifest to ${outputPath}\n`);
    return;
  }

  process.stdout.write(output);
}

// URL-string comparison breaks under symlinks: Node's ESM loader resolves
// import.meta.url to the real path while process.argv[1] keeps the invoked
// (possibly aliased) path. Compare realpath-resolved filesystem paths instead.
function isDirectCliExecution(argvPath, moduleUrl) {
  if (!argvPath) return false;
  try {
    return realpathSync(path.resolve(argvPath)) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isDirectCliExecution(process.argv[1], import.meta.url)) main();
