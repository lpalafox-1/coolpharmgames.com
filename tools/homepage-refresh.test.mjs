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
