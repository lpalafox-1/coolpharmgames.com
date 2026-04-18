#!/usr/bin/env node
/**
 * Check if all quiz links in index.html correspond to actual quiz files
 */

import { readFileSync, readdirSync } from 'fs';

const indexPath = 'index.html';
const quizzesDir = 'quizzes';
const virtualQuizIds = new Set(['log-lab-final-2', 'bdt-unit10-quiz8', 'custom-quiz', 'review-quiz']);

function getQuizIds() {
  const ids = new Set();

  for (const file of readdirSync(quizzesDir).filter(f => f.endsWith('.json'))) {
    const raw = readFileSync(`${quizzesDir}/${file}`, 'utf8');
    const quiz = JSON.parse(raw);
    if (quiz.id) ids.add(quiz.id);
  }

  return ids;
}

try {
  // Read index.html
  const indexContent = readFileSync(indexPath, 'utf8');

  // Get all quiz IDs from JSON plus generated virtual quizzes
  const quizIds = getQuizIds();
  for (const id of virtualQuizIds) quizIds.add(id);

  // Extract quiz IDs from links in index.html
  const linkRegex = /quiz\.html\?id=([a-z0-9-]+)/g;
  const foundLinks = [];
  let match;

  while ((match = linkRegex.exec(indexContent)) !== null) {
    foundLinks.push(match[1]);
  }

  const uniqueLinks = [...new Set(foundLinks)];

  console.log('\n🔗 Quiz Link Validation Report');
  console.log('=' .repeat(40));

  let allValid = true;

  // Check if all links have corresponding files
  for (const linkId of uniqueLinks) {
    if (quizIds.has(linkId)) {
      console.log(`✅ ${linkId}`);
    } else {
      console.log(`❌ ${linkId} - FILE MISSING`);
      allValid = false;
    }
  }

  // Check if there are quiz files not linked
  const unlinkedQuizIds = [...quizIds]
    .filter(id => !virtualQuizIds.has(id))
    .filter(id => !uniqueLinks.includes(id));
  if (unlinkedQuizIds.length > 0) {
    console.log('\n📁 Quiz IDs not linked in menu:');
    unlinkedQuizIds.forEach(id => console.log(`⚠️  ${id}`));
  }

  console.log(`\n📊 Summary: ${uniqueLinks.length} unique links, ${quizIds.size} total quiz IDs`);

  if (allValid && unlinkedQuizIds.length === 0) {
    console.log('🎉 All links are valid!');
    process.exit(0);
  } else {
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
