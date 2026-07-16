import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const enginePath = path.join(repoRoot, "assets/js/quizEngine.js");
const manifestPath = path.join(repoRoot, "tools/engine-globals.manifest.json");

function extractGlobalSurface(source) {
  const functions = [...source.matchAll(/^(?:async )?function ([A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]);
  const windowExports = [...source.matchAll(/^\s*window\.([A-Za-z0-9_$]+)\s*=/gm)].map((m) => m[1]);
  return {
    functions: [...new Set(functions)].sort(),
    windowExports: [...new Set(windowExports)].sort()
  };
}

test("quizEngine.js global surface matches the committed manifest", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const current = extractGlobalSurface(readFileSync(enginePath, "utf8"));

  for (const [surface, expected] of [["functions", manifest.functions], ["windowExports", manifest.windowExports]]) {
    const actual = new Set(current[surface]);
    const expectedSet = new Set(expected);
    const missing = expected.filter((name) => !actual.has(name));
    const added = current[surface].filter((name) => !expectedSet.has(name));

    assert.deepEqual(
      missing,
      [],
      `${surface} removed from quizEngine.js (past regressions silently deleted load-bearing helpers): ${missing.join(", ")}`
    );
    assert.deepEqual(
      added,
      [],
      `${surface} added to quizEngine.js without updating tools/engine-globals.manifest.json (update it in the same approved engine commit): ${added.join(", ")}`
    );
  }
});

test("historically fragile helpers are present in the engine", () => {
  // These exact helpers were silently deleted by past edits (see "restore X" commits).
  const source = readFileSync(enginePath, "utf8");
  for (const name of ["toggleMark", "toggleTimer", "getQuestionPointValue", "getTotalQuestionPoints", "scoreCurrent", "render", "shuffled"]) {
    assert.match(source, new RegExp(`^(?:async )?function ${name}\\s*\\(`, "m"), `missing load-bearing helper: ${name}`);
  }
});
