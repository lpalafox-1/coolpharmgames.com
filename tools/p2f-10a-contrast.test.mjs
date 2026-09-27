// P2F-10a — contrast and small-text class guards.
// Checks the approved tokens and class changes. It does not retest the
// mobile #drug-context hide, which tools/mobile-question-screen.test.mjs owns.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");

function lin(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground, background) {
  const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function mediaBlock(source, header) {
  const start = source.indexOf(header);
  assert.notEqual(start, -1, header);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unclosed ${header}`);
}

test("light --muted clears AA on the page, card, and tinted card", () => {
  const css = read("assets/css/styles.css");
  const root = css.slice(css.indexOf(":root{"), css.indexOf(".dark{"));
  assert.match(root, /--muted:#686f7d;/);
  assert.match(css, /\.dark\{[\s\S]*?--muted:#9ca3af;/);
  assert.match(css, /body\.high-contrast\s*\{[\s\S]*?--muted:\s*#ccc;/);

  const muted = [0x68, 0x6f, 0x7d];
  const page = [0xf6, 0xf5, 0xf5];
  const card = [0xff, 0xff, 0xff];
  const tint = [0xf8, 0xf2, 0xf3];
  assert.ok(contrast(muted, page) >= 4.5);
  assert.ok(contrast(muted, card) >= 4.5);
  assert.ok(contrast(muted, tint) >= 4.5);
});

test("quiz contrast classes and the drug-context bridge stay in place", () => {
  const quiz = read("quiz.html");
  assert.match(quiz, /text-\[10px\] font-black uppercase opacity-70 tracking-widest/);
  assert.match(quiz, /id="quiz-title" class="text-xs font-black uppercase tracking-\[0\.18em\] opacity-80"/);
  assert.match(quiz, /uppercase opacity-70 mb-5 tracking-widest">Mastery Controls/);
  assert.match(quiz, /id="timer-readout" class="[^"]*text-\[#8b1e3f\] dark:text-rose-200/);
  assert.match(quiz, /id="mode-banner-title" class="[^"]*text-\[#8b1e3f\] dark:text-rose-200"/);
  assert.match(quiz, /id="restart" class="[^"]*text-red-700 dark:text-red-400/);
  assert.match(quiz, /id="restart-mobile" class="[^"]*text-red-700 dark:text-red-400/);
  assert.doesNotMatch(quiz, /text-red-600/);
  assert.match(quiz, /assets\/css\/styles\.css\?v=20260927a/);

  const style = quiz.slice(quiz.indexOf("<style>"), quiz.indexOf("</style>"));
  const mobile = mediaBlock(style, "@media (max-width: 1023px)");
  const outside = style.replace(mobile, "");
  assert.match(outside, /#drug-context \{ opacity: 1; \}/);
  assert.match(outside, /\.dark #drug-context \{ color: #fecdd3; \}/);
  assert.doesNotMatch(mobile, /#drug-context \{ opacity: 1; \}/);

  assert.match(read("assets/js/quizEngine.js"), /id="drug-context"/);
});

test("stats dark totals and the two 10px eyebrows use the approved classes", () => {
  const page = read("stats.html");
  assert.match(page, /\.dark \.stat-value \{ color: #fda4af; \}/);
  assert.match(page, /assets\/js\/stats\.js\?v=20260927b/);

  const stats = read("assets/js/stats.js");
  const eyebrows = stats.match(/text-\[10px\] font-black uppercase tracking-\[0\.18em\] opacity-80/g);
  assert.equal(eyebrows?.length, 2);
  assert.equal(stats.match(/opacity-60 cursor-not-allowed/g)?.length, 2);
});
