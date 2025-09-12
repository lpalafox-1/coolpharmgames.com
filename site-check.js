import { readFileSync, readdirSync } from 'fs';

console.log('🔍 COMPREHENSIVE SITE HEALTH CHECK\n');

// 1. Quiz validation
const quizDir = './quizzes/';
const files = readdirSync(quizDir).filter(f => f.endsWith('.json'));
let totalQuestions = 0;
let issueCount = 0;

console.log('📋 QUIZ FILE ANALYSIS:');
files.forEach(file => {
  try {
    const quiz = JSON.parse(readFileSync(quizDir + file, 'utf8'));
    const easy = quiz.pools?.easy?.length || 0;
    const hard = quiz.pools?.hard?.length || 0;
    const total = easy + hard;
    totalQuestions += total;
    
    // Check for issues
    if (!quiz.id) {
      console.log(`❌ ${file}: Missing ID`);
      issueCount++;
    }
    if (total === 0) {
      console.log(`⚠️  ${file}: Empty quiz (${total} questions)`);
      issueCount++;
    }
    if (total < 10) {
      console.log(`⚠️  ${file}: Very small quiz (${total} questions)`);
    }
  } catch (e) {
    console.log(`❌ ${file}: JSON parse error - ${e.message}`);
    issueCount++;
  }
});

console.log(`\n📊 TOTALS:`);
console.log(`   Total questions: ${totalQuestions}`);
console.log(`   Quiz files: ${files.length}`);
console.log(`   Issues found: ${issueCount}`);

// 2. Footer count check
const homepage = readFileSync('./index.html', 'utf8');
const footerMatch = homepage.match(/(\d+) practice questions/);
const footerCount = footerMatch ? parseInt(footerMatch[1]) : 0;

console.log(`\n🏠 HOMEPAGE CHECK:`);
console.log(`   Footer shows: ${footerCount} questions`);
if (footerCount !== totalQuestions) {
  console.log(`❌ Footer mismatch! Should be ${totalQuestions}`);
  issueCount++;
} else {
  console.log(`✅ Footer count is accurate`);
}

// 3. Check for broken links
const quizLinkMatches = [...homepage.matchAll(/quiz\.html\?id=([^&"]+)/g)];
const referencedIds = quizLinkMatches.map(match => match[1]);
const existingIds = new Set();

files.forEach(file => {
  try {
    const quiz = JSON.parse(readFileSync(quizDir + file, 'utf8'));
    if (quiz.id) existingIds.add(quiz.id);
  } catch (e) {}
});

const brokenLinks = referencedIds.filter(id => !existingIds.has(id));

console.log(`\n🔗 LINK CHECK:`);
if (brokenLinks.length > 0) {
  console.log(`❌ Broken links found:`);
  brokenLinks.forEach(id => console.log(`   - ${id}`));
  issueCount += brokenLinks.length;
} else {
  console.log(`✅ All quiz links are valid`);
}

console.log(`\n🎯 OVERALL HEALTH: ${issueCount === 0 ? '✅ EXCELLENT' : `⚠️  ${issueCount} issues found`}`);