// F26-23 — Lab III hub mode copy.
//
// The three week menus stay independent. This suite pins the student-facing
// distinction: Adaptive targets a performance-guided 6+4 mix inside a ceiling,
// Week Focus is that week only, and Standard Weekly Practice is a fixed mix.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");

function htmlText(source) {
  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const hub = read("lab3-fall-2026.html");
const launcher = read("assets/js/fall-2026-lab3-launcher.js");
const hero = htmlText(hub.slice(hub.indexOf("<h1"), hub.indexOf('id="adaptive-practice"')));
const adaptive = htmlText(hub.slice(hub.indexOf('id="adaptive-practice"'), hub.indexOf('id="week-focus"')));
const weekFocus = htmlText(hub.slice(hub.indexOf('id="week-focus"'), hub.indexOf('aria-label="Study resources"')));
const standard = htmlText(hub.slice(hub.indexOf('id="standard-weekly-practice"')));
const adaptiveSummary = launcher.slice(
  launcher.indexOf("function describeAdaptiveSelection("),
  launcher.indexOf("function syncAdaptiveAvailability(")
);

test("the hub hero names Adaptive, Week Focus, and Standard as three modes", () => {
  assert.match(hero, /Adaptive Practice is the recommended performance-guided path/);
  assert.match(hero, /Week Focus is 10 questions from one selected week, with no prior-week review/);
  assert.match(hero, /Standard Weekly Practice uses a fixed mix and no personalized selection/);
  assert.match(hero, /All three use the official Fall P2 source for Weeks 1–10/);
  assert.doesNotMatch(hero, /Both use the official/);

  const description = /<meta name="description" content="([^"]+)"/.exec(hub)?.[1] || "";
  assert.match(description, /Adaptive Practice/);
  assert.match(description, /Week Focus/);
  assert.match(description, /Standard Weekly Practice/);
});

test("Adaptive copy states the F26-19 target, the Week 1 exception, and the ceiling fallback", () => {
  assert.match(adaptive, /Recommended 10-question rounds shaped by your saved performance/);
  assert.match(adaptive, /Week 1: all 10 questions from Week 1/);
  assert.match(adaptive, /Weeks 2–10 target 6 questions from the week you choose and 4 prior-week review questions/);
  assert.match(adaptive, /If there aren't enough eligible questions for that mix, the round adjusts but still never goes past your selected week/);
  assert.doesNotMatch(adaptive, /Nothing after that week is included/);
  assert.doesNotMatch(adaptive, /selected-week ceiling/);
  assert.match(adaptive, /never includes material after the week you choose/i);
  assert.doesNotMatch(adaptive, /can use Weeks 1/i);
  assert.doesNotMatch(adaptive, /always (?:uses|includes)?\s*6/i);
  assert.doesNotMatch(adaptive, /6 new \+ 4 cumulative-review/);
  assert.doesNotMatch(adaptive, /no prior-week review/i);
});

test("the Adaptive live summary is selected-week-specific and no longer a Weeks 1–N pool", () => {
  assert.match(adaptiveSummary, /all 10 questions from Week 1/);
  assert.match(adaptiveSummary, /targets 6 Week \$\{targetWeek\} questions and 4 review questions from \$\{priorWeeks\}/);
  assert.match(adaptiveSummary, /guided by your saved performance/);
  assert.doesNotMatch(adaptiveSummary, /chosen from your saved performance/);
  assert.match(adaptiveSummary, /Nothing after Week \$\{targetWeek\} is included/);
  assert.match(adaptiveSummary, /targetWeek === 2 \? "Week 1" : `Weeks 1–\$\{targetWeek - 1\}`/);
  assert.doesNotMatch(adaptiveSummary, /content ceiling/i);
  assert.doesNotMatch(adaptiveSummary, /can use Weeks 1/);
});

test("Week Focus, Standard, and Adaptive descriptions stay semantically distinct", () => {
  assert.match(weekFocus, /10 questions from the selected week only, with no prior-week review/);
  assert.match(weekFocus, /does not include prior-week review/i);
  assert.doesNotMatch(weekFocus, /targets 6|saved performance|6 new \+ 4 cumulative-review|personalized selection/i);

  assert.match(standard, /Week 1 uses Week 1 only/i);
  assert.match(standard, /Weeks 2–10 use 6 new \+ 4 cumulative-review questions/);
  assert.match(standard, /without personalized selection/);
  assert.doesNotMatch(standard, /saved performance|selected-week ceiling|no prior-week review/i);

  assert.match(adaptive, /saved performance/);
  assert.match(adaptive, /never goes past your selected week/);
  assert.doesNotMatch(adaptive, /6 new \+ 4 cumulative-review|selected week only/i);
});

test("mode copy does not collapse the three week selectors", () => {
  const selectIds = [...hub.matchAll(/<select\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(selectIds, ["adaptive-week", "week-focus-week", "weekly-week"]);
  assert.match(hub, /id="adaptive-launch"/);
  assert.match(hub, /id="week-focus-launch"/);
  assert.match(hub, /id="weekly-launch"/);
  assert.match(hub, /assets\/js\/fall-2026-lab3-launcher\.js\?v=20261005a/);
});
