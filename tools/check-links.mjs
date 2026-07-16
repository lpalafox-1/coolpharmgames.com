#!/usr/bin/env node
/**
 * Check if all quiz links in index.html correspond to known catalog entries.
 */

import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const indexPath = path.join(repoRoot, 'index.html');
const catalogPath = path.join(repoRoot, 'assets', 'js', 'quiz-catalog.js');
const virtualQuizIds = new Set(['log-lab-final-2', 'bdt-unit10-quiz8', 'custom-quiz', 'review-quiz']);

function loadCatalogIds() {
  const sandbox = { window: {}, URLSearchParams };
  vm.runInNewContext(readFileSync(catalogPath, 'utf8'), sandbox, {
    filename: catalogPath,
    timeout: 1_000
  });

  const entries = sandbox.window.PharmletQuizCatalog?.entries;
  if (!Array.isArray(entries)) {
    throw new Error('quiz catalog must expose an entries array');
  }

  return new Set(entries.map((entry) => entry.id).filter(Boolean));
}

function extractLinkedQuizIds(html) {
  const ids = [];
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1] ?? match[2];
    const url = new URL(href, 'https://pharmlet.local/');
    if (!url.pathname.endsWith('/quiz.html')) continue;

    const id = url.searchParams.get('id');
    if (id) ids.push(id);
  }

  return [...new Set(ids)];
}

try {
  const indexContent = readFileSync(indexPath, 'utf8');

  const quizIds = loadCatalogIds();
  for (const id of virtualQuizIds) quizIds.add(id);

  const uniqueLinks = extractLinkedQuizIds(indexContent);

  console.log('\n🔗 Quiz Link Validation Report');
  console.log('=' .repeat(40));

  let allValid = true;

  // Check if all links resolve to the runtime quiz catalog.
  for (const linkId of uniqueLinks) {
    if (quizIds.has(linkId)) {
      console.log(`✅ ${linkId}`);
    } else {
      console.log(`❌ ${linkId} - FILE MISSING`);
      allValid = false;
    }
  }

  // Check if there are catalog entries not linked from the homepage.
  const unlinkedQuizIds = [...quizIds]
    .filter(id => !virtualQuizIds.has(id))
    .filter(id => !uniqueLinks.includes(id));
  if (unlinkedQuizIds.length > 0) {
    console.log('\n📁 Quiz IDs not linked in menu:');
    unlinkedQuizIds.forEach(id => console.log(`⚠️  ${id}`));
  }

  console.log(`\n📊 Summary: ${uniqueLinks.length} unique links, ${quizIds.size} total quiz IDs`);

  if (allValid) {
    console.log('🎉 All links are valid!');
    process.exit(0);
  } else {
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
