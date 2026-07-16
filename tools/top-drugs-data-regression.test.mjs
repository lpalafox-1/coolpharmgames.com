import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadTopDrugsData() {
  return loadBrowserGlobal("assets/js/top-drugs-data.js").TopDrugsData;
}

const FIXED_POOL = [
  { generic: "lisinopril", brand: "Zestril", class: "ACE inhibitor", category: "Antihypertensive", moa: "Inhibits ACE", metadata: { lab: 2, week: 1, is_new: true } },
  { generic: "metoprolol", brand: "Lopressor", class: "Beta blocker", category: "Antihypertensive", moa: "Blocks beta-1 receptors", metadata: { lab: 2, week: 1, is_new: false } }
];

test("computePoolVersion is stable for a fixed input vector", () => {
  const td = loadTopDrugsData();
  const info = td.computePoolVersion(FIXED_POOL);

  assert.equal(info.version, "v2-c19a5997");
  assert.equal(info.count, 2);
  assert.equal(info.badgeText, "Top Drugs Data v2-c19a5997");
});

test("computePoolVersion ignores object key order and extraneous fields", () => {
  const td = loadTopDrugsData();
  const reordered = FIXED_POOL.map((entry) => ({
    metadata: entry.metadata,
    moa: entry.moa,
    brand: entry.brand,
    generic: entry.generic,
    category: entry.category,
    class: entry.class,
    unrelatedField: "must not affect the projection"
  }));

  assert.equal(td.computePoolVersion(reordered).version, "v2-c19a5997");
});

test("computePoolVersion changes when projected fields change", () => {
  const td = loadTopDrugsData();
  const mutated = [{ ...FIXED_POOL[0], brand: "Prinivil" }, FIXED_POOL[1]];

  assert.notEqual(td.computePoolVersion(mutated).version, "v2-c19a5997");
});

test("the live master pool matches the committed version snapshot", () => {
  const td = loadTopDrugsData();
  const snapshot = JSON.parse(readFileSync(path.join(repoRoot, "tools/top-drugs-pool-version.snapshot.json"), "utf8"));
  const pool = JSON.parse(readFileSync(path.join(repoRoot, snapshot.poolPath), "utf8"));
  const info = td.computePoolVersion(pool);

  assert.equal(info.count, snapshot.count, "master pool entry count drifted from snapshot");
  assert.equal(info.hash, snapshot.hash, "master pool content hash drifted from snapshot");
  assert.equal(
    info.version,
    snapshot.version,
    "the user-visible Top Drugs version badge would change — update the snapshot only alongside an approved master-pool change"
  );
});
