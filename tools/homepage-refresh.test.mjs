import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const links = source => [...source.matchAll(/href="([^"]+)"/g)].map(m => m[1].replaceAll("&amp;", "&"));
const between = (start, end) => html.slice(html.indexOf(`id="${start}"`), html.indexOf(`id="${end}"`));

test("homepage features truthful cumulative Final practice before weekly study", () => {
  const feature = between("lab3-final-feature", "lab3-current");
  assert.match(feature, /100-question Final/);
  assert.match(feature, /Exactly 10 from each week/);
  assert.match(feature, /Weeks 1–10/);
  assert.match(feature, /Six knowledge domains/);
  assert.match(feature, /Start with Balanced/);
  assert.match(feature, /Choose Adaptive.*saved performance/);
  assert.match(feature, /Optional.*strict 100-minute True Exam Mode/);
  assert.match(feature, /domain balance and wording are not an exact official faculty exam/);
  assert.deepEqual(links(feature), ["lab3-fall-2026.html#final-practice"]);
});

test("first-visit welcome reaches Final setup directly and retains existing dismissal controls", () => {
  const welcome = between("welcome", "menu");
  assert.equal(links(welcome)[0], "lab3-fall-2026.html#final-practice");
  for (const destination of ["#standard-weekly-practice", "#adaptive-practice"]) {
    assert.ok(links(welcome).includes(`lab3-fall-2026.html${destination}`));
  }
  assert.ok(links(welcome).includes("top-drugs-quicksheet.html"));
  for (const id of ["start-now", "skip"]) assert.ok(welcome.includes(`id="${id}"`));
  // The deployed welcome/theme/resume script remains the only homepage runtime.
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(scripts.filter(s => !s.startsWith("https:")), ["assets/js/home.js?v=20260429a"]);
});

test("all homepage Fall entry points use supported hub setup routes without direct-launch parameters", () => {
  const fall = links(html).filter(h => h.startsWith("lab3-fall-2026.html"));
  const hub = read("lab3-fall-2026.html");
  const expectedAnchors = ["#final-practice", "#week-focus", "#adaptive-practice", "#standard-weekly-practice"];
  for (const hash of expectedAnchors) {
    assert.ok(fall.includes(`lab3-fall-2026.html${hash}`), hash);
    assert.ok(hub.includes(`id="${hash.slice(1)}"`), `${hash} must exist at the real destination`);
  }
  const weeks = [];
  for (const href of fall) {
    const url = new URL(href, "https://pharmlet.local/");
    if (url.search) {
      assert.deepEqual([...url.searchParams.keys()], ["week"]);
      const week = Number(url.searchParams.get("week"));
      assert.ok(Number.isInteger(week) && week >= 1 && week <= 10);
      weeks.push(week);
    } else assert.ok(url.hash === "" || expectedAnchors.includes(url.hash));
  }
  assert.deepEqual(weeks, Array.from({length:10}, (_,i) => i+1));
});

test("every authored homepage link has an existing page and an existing fragment target", () => {
  for (const href of links(html).filter(h => h !== "#")) {
    const url = new URL(href, "https://pharmlet.local/index.html");
    assert.equal(url.origin, "https://pharmlet.local");
    const file = url.pathname.slice(1);
    assert.ok(existsSync(path.join(root, file)), href);
    if (url.hash) assert.ok(read(file).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), href);
  }
});

test("primary Reference and Study Tools precede future content and remain outside closed disclosures", () => {
  const primary = between("current-semester", "utilities");
  assert.doesNotMatch(primary, /<details\b/);
  for (const href of ["top-drugs-quicksheet.html", "review-queue.html", "stats.html", "favorites.html", "study-timer.html", "custom-quiz.html"]) assert.ok(links(primary).includes(href), href);
  assert.ok(html.indexOf('id="upcoming-planned"') > html.indexOf('id="study-tools"'));
  assert.match(html, /\.home-week-grid\{[^}]*repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(html, /\.home-nav-link:focus-visible[^}]*outline:3px solid var\(--home-focus\)/);
});

// --- PR #93 corrections (CORRECTIONS.md items 1-8 and 10) ---------------------------

test("Final card: facts, two non-interactive mode tiles, then the single CTA, in phone reading order", () => {
  const feature = between("lab3-final-feature", "lab3-current");
  const order = ['class="home-eyebrow"', 'id="lab3-final-heading"', 'class="home-final-facts"', 'class="home-final-modes"', "home-final-cta", "home-final-exam", "home-final-note"]
    .map(marker => feature.indexOf(marker));
  assert.ok(order.every(index => index >= 0), "every Final card region must exist");
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "markup must follow phone reading order: eyebrow, title, facts, tiles, CTA, True Exam line, disclaimer");
  for (const fact of ["100 questions", "100 min, pausable in study practice", "Exactly 10 from each week", "Weeks 1–10", "Six knowledge domains"]) {
    assert.ok(feature.includes(`<li>${fact}</li>`), fact);
  }
  const tiles = [...feature.matchAll(/<div class="home-mode-tile[^"]*">[\s\S]*?<\/div>/g)].map(m => m[0]);
  assert.equal(tiles.length, 2, "exactly two mode tiles");
  assert.match(tiles[0], /home-mode-tile-balanced/);
  assert.match(tiles[0], /Recommended/);
  assert.match(tiles[0], /Start with Balanced: even coverage, ignores your history\./);
  assert.doesNotMatch(tiles[1], /home-mode-tile-balanced|Recommended/);
  assert.match(tiles[1], /Choose Adaptive for picks shaped by saved performance\./);
  for (const tile of tiles) assert.doesNotMatch(tile, /<a\b|<button\b|tabindex|href=|cursor:pointer|→/, "tiles are plain, non-interactive elements");
  assert.equal((feature.match(/<a\b/g) || []).length, 1, "the Final card keeps exactly one link");
  assert.equal((feature.match(/btn-blue/g) || []).length, 1, "the CTA is the only filled button");
  assert.equal((feature.match(/Recommended/g) || []).length, 1);
  assert.ok(feature.indexOf("home-final-modes") < feature.indexOf("home-final-cta"), "the tiles sit directly above the CTA");
});

test("weekly card: three outlined mode tiles, a plain jump label, number-only week links with sr-only text", () => {
  const weekly = between("lab3-current", "top-drugs-reference-current");
  const tiles = [...weekly.matchAll(/<a href="(lab3-fall-2026\.html#[a-z-]+)" class="home-mode-link home-outline"><span class="home-mode-link-title">([^<]+)<\/span><span class="home-mode-link-desc">([^<]+)<\/span><\/a>/g)]
    .map(m => m.slice(1));
  assert.deepEqual(tiles, [
    ["lab3-fall-2026.html#week-focus", "Week Focus", "One week, no review mix"],
    ["lab3-fall-2026.html#adaptive-practice", "Adaptive Practice", "Rounds shaped by your saved performance"],
    ["lab3-fall-2026.html#standard-weekly-practice", "Standard Weekly", "Week 1 only; Weeks 2–10 mix 6 new + 4 review"]
  ]);
  assert.doesNotMatch(weekly, /<h3\b|Recommended|btn-blue/, "no heading wrapper, no Recommended badge, no filled button in the weekly card");
  const label = weekly.indexOf('<p class="home-week-label">Jump to a week · Standard Weekly</p>');
  const nav = weekly.indexOf('<nav class="home-week-grid');
  assert.ok(label >= 0 && nav > label, "the jump label is plain text directly above the week grid");
  const weekLinks = [...weekly.matchAll(/<a href="lab3-fall-2026\.html\?week=(\d+)" data-live-week="(\d+)" class="btn btn-ghost home-outline home-action home-week">([\s\S]*?)<\/a>/g)];
  assert.deepEqual(weekLinks.map(m => m[1]), Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const m of weekLinks) {
    assert.equal(m[2], m[1]);
    assert.equal(m[3], `<span class="sr-only">Week </span>${m[1]}`, `week ${m[1]} shows only the numeral and keeps "Week" for screen readers`);
  }
  assert.ok(weekly.includes('<p id="weekly-shortcuts-note" class="mt-3 text-xs leading-relaxed" style="color:var(--muted)">Week links open practice setup. Week 1: Week 1 only. Weeks 2–10: 6 new + 4 cumulative review.</p>'), "the weekly note stays word for word");
  assert.ok(weekly.indexOf("Weeks 4–10 are study-ahead Pharm-let practice.") > weekly.indexOf('id="weekly-shortcuts-note"'), "the study-ahead sentence follows the weekly note");
  assert.match(html, /\.home-mode-link\{[^}]*border:1px solid var\(--home-control-border\)/);
  assert.match(html, /\.home-mode-tile\{[^}]*border:1px solid var\(--home-control-border\)/);
  assert.doesNotMatch(html, /\.home-study-grid\{grid-template-columns:1fr 1fr\}/, "the Final and weekly cards stack at every width");
  assert.doesNotMatch(html, /\.home-week\{[^}]*flex-direction:column/, "week buttons no longer stack their label");
  assert.match(html, /\.home-week-grid\{[^}]*repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(html, /@media\(max-width:374px\)\{\.home-week-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}\}/);
  assert.doesNotMatch(html, /repeat\(10,minmax\(0,1fr\)\)/, "item 9 (ten across) is deliberately not built");
});
