import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBrowserGlobal } from "./browser-global-harness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p1Path = path.join(repoRoot, "assets", "data", "master_pool.json");
const p2Path = path.join(repoRoot, "assets", "data", "fall-2026-p2-top-drugs.json");
const policyPath = path.join(repoRoot, "assets", "data", "fall-2026-lab3-quiz-policy.json");
const generatorPath = path.join(repoRoot, "assets", "js", "fall-2026-quiz-generator.js");
const enginePath = path.join(repoRoot, "assets", "js", "quizEngine.js");
const pagePath = path.join(repoRoot, "top-drugs-quicksheet.html");
const quicksheetPath = path.join(repoRoot, "assets", "js", "top-drugs-quicksheet.js");
const p1SourceText = readFileSync(p1Path, "utf8");
const p2SourceText = readFileSync(p2Path, "utf8");
const p1Source = JSON.parse(p1SourceText);
const p2Source = JSON.parse(p2SourceText);
const referenceData = loadBrowserGlobal("assets/js/top-drugs-reference-data.js").TopDrugsReferenceData;
const quicksheetController = loadBrowserGlobal("assets/js/top-drugs-quicksheet.js", {
  TopDrugsReferenceData: referenceData
}).TopDrugsQuicksheet;
const library = referenceData.buildReferenceLibrary(p1Source, p2Source);

const APPROVED_BASELINES = Object.freeze({
  p1: "1fb50e96e60252a9839406d53bc929e9569d76c0ddc2522aff43adf9bdf2a87c",
  p2: "2af02b84674401d2d7fb3d9a8a1e6b2dc40d7c4fe72067320cfde2694c864f01",
  policy: "307696a5d5f189bc40710df3d72228854fee58b52371f07bc2498b9a1e3c1171",
  generator: "39e123b914f665282f6abce23110bf3e2bd4f0bcc1974b7038e0f9384cf9871a",
  engine: "db7c0c7850135eed1b985b025a0518db4a43913bba17f9b281d8cdb533f2ffaa"
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function recordsFor(query, filters = {}) {
  return referenceData.filterRecords(library.records, { query, ...filters });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the unified library loads every legacy P1 and official P2 record without merging sources", () => {
  assert.equal(library.sources.p1.path, "assets/data/master_pool.json");
  assert.equal(library.sources.p2Fall.path, "assets/data/fall-2026-p2-top-drugs.json");
  assert.deepEqual(plain(library.summary), {
    total: 269,
    p1: 169,
    p2: 100,
    semesters: ["Fall 2025", "Spring 2026", "Fall 2026"]
  });
  assert.equal(new Set(library.records.map((record) => record.id)).size, 269);
  assert.equal(library.records.filter((record) => record.sourceType === "legacy-p1").length, 169);
  assert.equal(library.records.filter((record) => record.sourceType === "official-p2-fall").length, 100);
});

test("progressive rendering starts with a bounded slice and can expose every record without duplicates", () => {
  assert.equal(quicksheetController.INITIAL_RENDER_LIMIT, 12);
  assert.equal(quicksheetController.RENDER_BATCH_SIZE, 24);
  assert.ok(quicksheetController.INITIAL_RENDER_LIMIT < library.records.length);

  let visibleCount = quicksheetController.INITIAL_RENDER_LIMIT;
  let visible = quicksheetController.getVisibleRecords(library.records, visibleCount);
  assert.equal(visible.length, 12);

  while (visibleCount < library.records.length) {
    const nextCount = quicksheetController.nextVisibleCount(visibleCount, library.records.length);
    assert.ok(nextCount > visibleCount);
    visibleCount = nextCount;
    visible = quicksheetController.getVisibleRecords(library.records, visibleCount);
    assert.equal(new Set(visible.map((record) => record.id)).size, visible.length);
  }

  assert.equal(visible.length, 269);
  assert.deepEqual(plain(visible.map((record) => record.id)), plain(library.records.map((record) => record.id)));
});

test("current-P2, week, P1, and all-record shortcuts retain complete source-backed result sets", () => {
  const expected = new Map([
    ["p2-fall", 100],
    ["p2-week-1", 10],
    ["p2-week-2", 10],
    ["p2-week-3", 10],
    ["p1", 169],
    ["all", 269]
  ]);

  for (const [shortcut, count] of expected) {
    const filters = quicksheetController.filtersForShortcut(shortcut);
    const matches = referenceData.filterRecords(library.records, filters);
    assert.equal(matches.length, count, `${shortcut} must expose ${count} records`);

    if (shortcut.startsWith("p2-")) {
      assert.ok(matches.every((record) => (
        record.professionalYear === "P2"
        && record.semester === "Fall 2026"
        && record.lab === "Lab III"
      )));
    }
    if (shortcut.startsWith("p2-week-")) {
      const expectedWeek = Number(shortcut.at(-1));
      assert.ok(matches.every((record) => record.week === expectedWeek));
    }
  }
});

test("global search filters the full library before the progressive render slice", () => {
  const zolpidem = recordsFor("Zolpidem", { field: "generic" });
  assert.ok(zolpidem.length > 0);
  assert.ok(zolpidem.every((record) => record.generic === "Zolpidem"));

  const benazepril = recordsFor("Benazepril");
  const lotensin = recordsFor("Lotensin");
  assert.ok(benazepril.some((record) => record.sourceRecordId === "p2-fall-quiz-01-drug-06"));
  assert.ok(lotensin.some((record) => record.sourceRecordId === "p2-fall-quiz-01-drug-06"));

  const fluticasone = recordsFor("Fluticasone");
  assert.equal(fluticasone.length, 5);
  assert.equal(new Set(fluticasone.map((record) => record.id)).size, 5);
  assert.equal(quicksheetController.getVisibleRecords(fluticasone).length, 5);
});

test("legacy and current URL filters round-trip while Clear Filters restores all records", () => {
  const legacy = quicksheetController.filtersFromSearch(
    "?q=Lotensin&field=brand&year=P2&semester=Fall%202026&lab=III&week=1"
  );
  assert.deepEqual(plain(legacy), {
    query: "Lotensin",
    field: "brand",
    professionalYear: "P2",
    semester: "Fall 2026",
    lab: "3",
    week: "1"
  });
  assert.equal(
    quicksheetController.filtersToSearch(legacy),
    "value=Lotensin&field=brand&year=P2&semester=Fall+2026&lab=3&week=1"
  );

  const cleared = quicksheetController.createAllFilters();
  assert.deepEqual(plain(cleared), {
    query: "",
    field: "all",
    professionalYear: "all",
    semester: "all",
    lab: "all",
    week: "all"
  });
  assert.equal(quicksheetController.filtersToSearch(cleared), "");
  assert.equal(referenceData.filterRecords(library.records, cleared).length, 269);
});

test("the Drug Sheet exposes accessible current-P2 and progressive-rendering controls", () => {
  const page = readFileSync(pagePath, "utf8");
  const script = readFileSync(quicksheetPath, "utf8");

  assert.match(page, /id="current-p2-shortcuts"/);
  assert.match(page, /P2 Fall 2026 · Lab III/);
  assert.match(page, /href="lab3-fall-2026\.html"[^>]*>Open Lab III Practice</);
  assert.match(page, /data-quicksheet-shortcut="p2-week-1"/);
  assert.match(page, /data-quicksheet-shortcut="p2-week-2"/);
  assert.match(page, /data-quicksheet-shortcut="p2-week-3"/);
  assert.doesNotMatch(page, /data-quicksheet-shortcut="p2-week-(?:[4-9]|10)"/);
  assert.equal((page.match(/data-quicksheet-shortcut="[^"]+" aria-pressed="false"/g) || []).length, 6);
  assert.match(page, /reference filters; Lab III practice is available for Weeks 1–10 from the separate practice hub/);
  assert.match(page, /id="quicksheet-load-more"[^>]*type="button"[^>]*aria-controls="quicksheet-grid"/);
  assert.match(page, /id="quicksheet-count"[^>]*aria-live="polite"/);
  assert.equal((page.match(/class="quiz-link inline-flex min-h-11 items-center"/g) || []).length, 4);
  assert.match(page, /assets\/js\/top-drugs-quicksheet\.js\?v=20260821b/);
  assert.match(script, /addEventListener\("popstate"/);
  assert.match(script, /historyMode === "push" \? "pushState" : "replaceState"/);
  assert.match(script, /grid\.innerHTML = visibleDrugs\.map\(renderDrugCard\)\.join\(""\)/);
  assert.doesNotMatch(script, /grid\.innerHTML \+=/);
});

test("Benazepril uses the complete official P2 source record and every requested field is searchable", () => {
  const canonical = p2Source.drugs.find((record) => record.genericName === "Benazepril");
  const [benazepril] = recordsFor("Benazepril", { professionalYear: "P2" });

  assert.ok(canonical);
  assert.ok(benazepril);
  assert.equal(benazepril.generic, canonical.genericName);
  assert.deepEqual(benazepril.brands, canonical.brandNames);
  assert.equal(benazepril.drugClass, canonical.drugClass);
  assert.deepEqual(benazepril.indications, canonical.fdaIndications);
  assert.equal(benazepril.moa, canonical.mechanismOfAction);
  assert.equal(benazepril.boxWarning, canonical.boxWarning);
  assert.deepEqual(benazepril.adverseReactions, canonical.adverseReactions);
  assert.equal(benazepril.professionalYear, "P2");
  assert.equal(benazepril.semester, "Fall 2026");
  assert.equal(benazepril.lab, "Lab III");
  assert.equal(benazepril.week, 1);
  assert.equal(benazepril.sourceRecordId, canonical.id);

  for (const [field, query] of [
    ["brand", "Lotensin"],
    ["class", "ACEI, Antihypertensive"],
    ["indication", "Hypertension"],
    ["moa", "conversion of angiotensin I"],
    ["bbw", "Pregnancy"],
    ["adr", "Dizziness"],
    ["adr", "Hypotension"],
    ["adr", "Angioedema"]
  ]) {
    assert.ok(recordsFor(query, { field }).some((record) => record.id === benazepril.id), `${field}:${query} must find Benazepril`);
  }
});

test("multiple official P2 brands remain separate, readable, and individually searchable", () => {
  const diltiazem = library.records.find((record) => record.sourceRecordId === "p2-fall-quiz-01-drug-10");
  assert.deepEqual(diltiazem.brands, ["Cardizem", "Cartia XT", "Dilacor XR", "Dilt-XR", "Taztia XT", "Tiazac"]);

  for (const brand of diltiazem.brands) {
    assert.ok(recordsFor(brand, { field: "brand", professionalYear: "P2" }).some((record) => record.id === diltiazem.id));
  }
});

test("indication, ADR, BBW, and legacy category searches stay source-scoped", () => {
  assert.ok(recordsFor("Heart failure", { field: "indication" }).every((record) => record.sourceType === "official-p2-fall"));
  assert.ok(recordsFor("Angioedema", { field: "adr" }).every((record) => record.sourceType === "official-p2-fall"));
  assert.ok(recordsFor("Pregnancy", { field: "bbw" }).every((record) => record.sourceType === "official-p2-fall"));

  const legacyCategoryMatches = recordsFor("Antihypertensive", { field: "category" });
  assert.ok(legacyCategoryMatches.length > 0);
  assert.ok(legacyCategoryMatches.every((record) => record.sourceType === "legacy-p1"));
});

test("the P2 Access Pharmacy sorting category is retained only as excluded source metadata", () => {
  assert.equal(library.sources.p2Fall.excludedFromTestableData.length, 1);
  assert.match(library.sources.p2Fall.excludedFromTestableData[0].sourceColumn, /Do NOT memorize/);
  assert.ok(library.records.filter((record) => record.sourceType === "official-p2-fall").every((record) => record.legacyCategory === ""));
  assert.equal(recordsFor("Do NOT memorize").length, 0);
  assert.equal(recordsFor("Access Pharmacy").length, 0);
});

test("the two official P2 Fluticasone rows remain distinct and retain review provenance", () => {
  const searchMatches = recordsFor("Fluticasone", { field: "generic", professionalYear: "P2" });
  const matches = searchMatches.filter((record) => record.generic === "Fluticasone");
  assert.ok(searchMatches.some((record) => record.generic === "Fluticasone+Salmeterol"));
  assert.equal(matches.length, 2);
  assert.deepEqual(plain(matches.map((record) => record.sourceRecordId)), [
    "p2-fall-quiz-08-drug-03",
    "p2-fall-quiz-08-drug-04"
  ]);
  assert.deepEqual(plain(matches.map((record) => record.brands)), [
    ["Flovent", "Arnuity"],
    ["Flonase", "Xhance"]
  ]);
  assert.deepEqual(plain(matches.map((record) => record.indications)), [
    ["Asthma"],
    ["Allergic/non-allergic rhinitis"]
  ]);
  assert.ok(matches.every((record) => record.sourceReviewFlags.some((flag) => /two distinct Fluticasone rows/i.test(flag.reason))));
});

test("same-generic records remain separate across curriculum and source contexts", () => {
  const lisinopril = recordsFor("Lisinopril", { field: "generic" });
  assert.ok(lisinopril.some((record) => record.professionalYear === "P1"));
  assert.ok(lisinopril.some((record) => record.professionalYear === "P2"));
  assert.ok(new Set(lisinopril.map((record) => record.id)).size === lisinopril.length);
  assert.ok(new Set(lisinopril.map((record) => record.sourceType)).size >= 2);
});

test("professional year, semester, lab, and week filters use only loaded curriculum contexts", () => {
  const options = plain(referenceData.getFilterOptions(library.records));
  assert.deepEqual(options.professionalYears, ["P1", "P2"]);
  assert.deepEqual(options.semesters, ["Fall 2025", "Spring 2026", "Fall 2026"]);
  assert.deepEqual(options.labs, [
    { value: "1", label: "Lab I" },
    { value: "2", label: "Lab II" },
    { value: "3", label: "Lab III" }
  ]);
  assert.deepEqual(options.weeks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  const p2Week1 = referenceData.filterRecords(library.records, {
    professionalYear: "P2",
    semester: "Fall 2026",
    lab: "Lab III",
    week: "1"
  });
  assert.equal(p2Week1.length, 10);
  assert.ok(p2Week1.every((record) => record.sourceType === "official-p2-fall" && record.week === 1));
  assert.equal(referenceData.filterRecords(library.records, { professionalYear: "P3" }).length, 0);
  assert.equal(referenceData.filterRecords(library.records, { lab: "Lab IV" }).length, 0);
});

test("legacy query parameters and the existing Drug Sheet route remain compatible", () => {
  const page = readFileSync(pagePath, "utf8");
  const script = readFileSync(quicksheetPath, "utf8");
  const index = readFileSync(path.join(repoRoot, "index.html"), "utf8");

  assert.match(script, /params\.get\("value"\) \|\| params\.get\("q"\)/);
  assert.match(script, /params\.get\("field"\)/);
  assert.match(script, /params\.get\("lab"\)/);
  assert.equal(referenceData.normalizeLabFilter("1"), "1");
  assert.equal(referenceData.normalizeLabFilter("Lab II"), "2");
  assert.equal(referenceData.normalizeSearchField("category"), "category");
  assert.match(index, /href="top-drugs-quicksheet\.html"/);
  assert.match(page, /assets\/js\/top-drugs-reference-data\.js\?v=20260819a/);
  assert.doesNotMatch(page, /current Top Drugs master pool/i);
  assert.doesNotMatch(page, /value="P3"|value="4"/);
});

test("P1 records do not gain richer P2 fields while P2 records retain them", () => {
  const p1Records = library.records.filter((record) => record.sourceType === "legacy-p1");
  const p2Records = library.records.filter((record) => record.sourceType === "official-p2-fall");
  assert.ok(p1Records.every((record) => record.indications.length === 0));
  assert.ok(p1Records.every((record) => record.adverseReactions.length === 0));
  assert.ok(p1Records.every((record) => record.boxWarning === ""));
  assert.ok(p2Records.every((record) => record.indications.length > 0));
  assert.ok(p2Records.every((record) => record.adverseReactions.length > 0));
  assert.ok(p2Records.every((record) => record.boxWarning));
});

test("normalization does not mutate canonical sources and protected Fall runtime files remain unchanged", () => {
  const p1Before = JSON.stringify(p1Source);
  const p2Before = JSON.stringify(p2Source);
  referenceData.buildReferenceLibrary(p1Source, p2Source);
  assert.equal(JSON.stringify(p1Source), p1Before);
  assert.equal(JSON.stringify(p2Source), p2Before);

  assert.equal(sha256(readFileSync(p1Path)), APPROVED_BASELINES.p1);
  assert.equal(sha256(readFileSync(p2Path)), APPROVED_BASELINES.p2);
  assert.equal(sha256(readFileSync(policyPath)), APPROVED_BASELINES.policy);
  assert.equal(sha256(readFileSync(generatorPath)), APPROVED_BASELINES.generator);
  assert.equal(sha256(readFileSync(enginePath)), APPROVED_BASELINES.engine);
  assert.ok(p1Source.every((record) => !Object.hasOwn(record, "genericName")), "P2 records must not be copied into master_pool.json");
});
