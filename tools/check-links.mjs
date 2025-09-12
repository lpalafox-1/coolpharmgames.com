#!/usr/bin/env node
/**
 * Check if all quiz links in index.html correspond to actual quiz files
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const indexPath = 'index.html';
const quizzesDir = 'quizzes';

try {
  // Read index.html
  const indexContent = readFileSync(indexPath, 'utf8');
  
  // Get all quiz files
  const quizFiles = readdirSync(quizzesDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
  
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
    if (quizFiles.includes(linkId)) {
      console.log(`✅ ${linkId}`);
    } else {
      console.log(`❌ ${linkId} - FILE MISSING`);
      allValid = false;
    }
  }
  
  // Check if there are quiz files not linked
  const unlinkedFiles = quizFiles.filter(f => !uniqueLinks.includes(f));
  if (unlinkedFiles.length > 0) {
    console.log('\n📁 Quiz files not linked in menu:');
    unlinkedFiles.forEach(f => console.log(`⚠️  ${f}`));
  }
  
  console.log(`\n📊 Summary: ${uniqueLinks.length} unique links, ${quizFiles.length} quiz files`);
  
  if (allValid && unlinkedFiles.length === 0) {
    console.log('🎉 All links are valid!');
    process.exit(0);
  } else {
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}