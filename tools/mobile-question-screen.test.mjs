// Mobile question-screen QoL.
//
// The layout itself is CSS in quiz.html and was verified by measurement in a
// real browser at 360, 375, 390, 414 and 768px plus 1280px desktop. Node cannot
// lay out a page, so these tests do the part a browser run cannot keep doing
// for us: they pin the ENGINE behaviors that CSS silently depends on. If any of
// those change, the sticky bar, the completion guard, or the compact streak
// would break without a single visual test failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const quizPage = read("quiz.html");
const engine = read("assets/js/quizEngine.js");

// The body of the mobile media block, so assertions cannot be satisfied by a
// rule that happens to exist somewhere else on the page.
function mobileBlock() {
  const start = quizPage.indexOf("@media (max-width: 1023px)");
  assert.ok(start >= 0, "quiz.html must carry the mobile layout block");
  let depth = 0;
  for (let index = quizPage.indexOf("{", start); index < quizPage.length; index += 1) {
    if (quizPage[index] === "{") depth += 1;
    if (quizPage[index] === "}") depth -= 1;
    if (depth === 0) return quizPage.slice(start, index + 1);
  }
  throw new Error("unterminated mobile media block");
}

// --- engine contracts the CSS depends on ---------------------------------------

test("completion still hides the footer buttons through data-completion-hidden", () => {
  // The sticky bar collapses on the results screen by matching
  // #prev[data-completion-hidden]. That only works while completion hides the
  // individual buttons, including #prev, by setting that exact attribute.
  const ids = engine.match(/const COMPLETION_CONTROL_IDS = \[([^\]]*)\]/);
  assert.ok(ids, "COMPLETION_CONTROL_IDS must still exist");
  for (const id of ["prev", "check", "check-all", "next"]) {
    assert.ok(ids[1].includes(`"${id}"`), `completion must still hide #${id}`);
  }
  assert.match(engine, /element\.dataset\.completionHidden = "true";/,
    "completion must still mark hidden controls with data-completion-hidden");
  assert.match(engine, /delete element\.dataset\.completionHidden;/,
    "restoring controls (e.g. Review Missed) must still clear the attribute, or the bar would stay hidden");
});

test("the engine still toggles .hot on the streak panel at a streak of 3+", () => {
  // The compact streak shows its flavor text only under .hot. If the engine
  // stops toggling it, the celebration silently disappears on phones.
  assert.match(engine, /panel\.classList\.toggle\("hot", streak >= 3\);/);
  assert.match(quizPage, /id="streak-panel" class="streak-panel/);
});

test("hiding #drug-context on phones loses no information", () => {
  // #drug-context is either the round title itself or a context label. The
  // mobile block hides it because #quiz-title already carries the same text.
  // That holds only while every label is contained in its own quiz title.
  assert.match(engine, /return state\.title \|\| quizCatalog\?\.getEntry\?\.\(quizId\)\?\.title/,
    "non-concept routes must still use the round title as the context label");

  const conceptTitle = engine.match(/const CONCEPT_QUIZ_TITLE = "([^"]+)";/)?.[1];
  assert.ok(conceptTitle);
  const routes = [...engine.matchAll(/title: ([^,\n]+),\s*\n\s*questionContextLabel: "([^"]+)"/g)];
  assert.ok(routes.length >= 3, `expected the concept routes, found ${routes.length}`);

  for (const [, rawTitle, label] of routes) {
    const title = rawTitle.trim() === "CONCEPT_QUIZ_TITLE" ? conceptTitle : rawTitle.trim().replace(/^"|"$/g, "");
    assert.ok(title.includes(label),
      `context label "${label}" is not contained in its title "${title}", so hiding it on phones would lose information`);
  }
});

// --- the mobile layout ----------------------------------------------------------

test("the action row is sticky on phones and collapses on the results screen", () => {
  assert.match(quizPage, /<footer class="quiz-action-bar /, "the action row needs its stable hook");
  const block = mobileBlock();
  assert.match(block, /main > \.quiz-action-bar \{[^}]*position: sticky;[^}]*bottom: 0;/);
  assert.match(block, /main > \.quiz-action-bar:has\(#prev\[data-completion-hidden\]\) \{ display: none; \}/,
    "an empty sticky bar must not float over the results screen");
  assert.match(block, /html \{ scroll-padding-bottom: /, "keyboard focus must land above the sticky bar");
});

test("the action row stays one line, except the three-button end state", () => {
  const block = mobileBlock();
  assert.match(block, /main > \.quiz-action-bar \{ flex-direction: row; flex-wrap: nowrap;/);
  // ID selectors are required to outrank styles.css #check { width: 100% }.
  assert.match(block, /main > \.quiz-action-bar > #check,/);
  assert.match(block, /main > \.quiz-action-bar:has\(> #check-all:not\(\.hidden\)\) \{ flex-wrap: wrap;/);
  assert.match(block, /> #check-all \{ flex: 1 1 100%; order: 3; \}/);
});

test("the streak is compact and the duplicate title is hidden on phones only", () => {
  const block = mobileBlock();
  assert.match(block, /#drug-context \{ display: none; \}/);
  assert.match(block, /\.streak-panel \.streak-track \{ display: none; \}/);
  assert.match(block, /\.streak-panel:not\(\.hot\) \.streak-flavor \{ display: none; \}/);

  // None of this may leak outside the mobile block onto desktop.
  const outside = quizPage.replace(block, "");
  assert.doesNotMatch(outside, /#drug-context \{ display: none; \}/);
  assert.doesNotMatch(outside, /position: sticky;\s*bottom: 0;/);
});

test("desktop layout rules are unchanged", () => {
  assert.ok(quizPage.includes(
    "      .action-btn { max-width: 250px; padding: 1rem 1.5rem !important; font-size: 0.875rem !important; border-radius: 12px !important; }\n"
    + "      #question-card { padding: 3rem !important; }"
  ), "the existing min-width: 1024px rule must be untouched");
});
