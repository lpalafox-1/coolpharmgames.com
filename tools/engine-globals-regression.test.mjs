import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  extractGlobalSurface,
  formatEngineManifest,
  generateEngineManifest
} from "./generate-engine-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const enginePath = path.join(repoRoot, "assets/js/quizEngine.js");
const manifestPath = path.join(repoRoot, "tools/engine-globals.manifest.json");

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

test("engine manifest generator reproduces the committed manifest byte-for-byte", () => {
  const committed = readFileSync(manifestPath, "utf8");
  const generated = formatEngineManifest(generateEngineManifest(readFileSync(enginePath, "utf8")));

  assert.equal(generated, committed);
});

test("manifest generator CLI runs when invoked through a symlinked path", () => {
  // Reproduces the Copilot finding: argv[1] is the alias while Node resolves
  // import.meta.url to the real path, so URL-string entrypoint detection
  // silently skips main(). The CLI must still execute and produce output.
  const committed = readFileSync(manifestPath, "utf8");
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pharmlet-manifest-cli-"));
  try {
    const linkPath = path.join(tmpDir, "manifest-cli-link.mjs");
    symlinkSync(path.join(repoRoot, "tools/generate-engine-manifest.mjs"), linkPath);

    const stdoutRun = spawnSync(process.execPath, [linkPath], { encoding: "utf8" });
    assert.equal(stdoutRun.status, 0, stdoutRun.stderr);
    assert.equal(stdoutRun.stdout, committed, "default stdout mode must emit the manifest via the symlinked CLI");

    const outputPath = path.join(tmpDir, "manifest-out.json");
    const outputRun = spawnSync(process.execPath, [linkPath, "--output", outputPath], { encoding: "utf8" });
    assert.equal(outputRun.status, 0, outputRun.stderr);
    assert.equal(outputRun.stdout, "", "--output mode must not write to stdout");
    assert.equal(readFileSync(outputPath, "utf8"), committed, "--output mode must write the manifest file");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("historically fragile helpers are present in the engine", () => {
  // These exact helpers were silently deleted by past edits (see "restore X" commits).
  const source = readFileSync(enginePath, "utf8");
  for (const name of ["toggleMark", "toggleTimer", "getQuestionPointValue", "getTotalQuestionPoints", "scoreCurrent", "render", "shuffled"]) {
    assert.match(source, new RegExp(`^(?:async )?function ${name}\\s*\\(`, "m"), `missing load-bearing helper: ${name}`);
  }
});
