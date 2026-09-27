// Stats semantic text contrast.
// Guards the page-local success and error colors. Shared --good and --bad stay put.
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

test("Stats semantic text clears AA without moving the shared tokens", () => {
  const page = read("stats.html");
  const light = page.slice(page.indexOf(":root {"), page.indexOf(".dark {"));
  assert.match(light, /--stats-good-text:\s*#15803d;/);
  assert.match(light, /--stats-bad-text:\s*#b91c1c;/);
  const dark = page.slice(page.indexOf(".dark {"), page.indexOf(".stat-card"));
  assert.match(dark, /--stats-good-text:\s*var\(--good\);/);
  assert.match(dark, /--stats-bad-text:\s*var\(--bad\);/);

  const good = [0x15, 0x80, 0x3d];
  const bad = [0xb9, 0x1c, 0x1c];
  const card = [0xff, 0xff, 0xff];
  const pageBg = [0xf6, 0xf5, 0xf5];
  const tint = [0xf8, 0xf2, 0xf3];
  for (const background of [card, pageBg, tint]) {
    assert.ok(contrast(good, background) >= 4.5);
    assert.ok(contrast(bad, background) >= 4.5);
  }

  const css = read("assets/css/styles.css");
  const root = css.slice(css.indexOf(":root{"), css.indexOf(".dark{"));
  assert.match(root, /--good:#10b981;/);
  assert.match(root, /--bad:#ef4444;/);
  const themeDark = css.slice(css.indexOf(".dark{"), css.indexOf(".dark #"));
  assert.match(themeDark, /--good:#34d399;/);
  assert.match(themeDark, /--bad:#f87171;/);
  assert.ok(contrast([0x34, 0xd3, 0x99], [0x1f, 0x29, 0x37]) >= 4.5);
  assert.ok(contrast([0xf8, 0x71, 0x71], [0x1f, 0x29, 0x37]) >= 4.5);

  const stats = read("assets/js/stats.js");
  assert.equal(stats.match(/var\(--stats-good-text\)/g)?.length, 4);
  assert.equal(stats.match(/var\(--stats-bad-text\)/g)?.length, 6);
  assert.equal(stats.match(/var\(--good\)/g), null);
  assert.equal(stats.match(/var\(--bad\)/g), null);
  assert.equal(stats.match(/opacity-60 cursor-not-allowed/g)?.length, 2);
});
