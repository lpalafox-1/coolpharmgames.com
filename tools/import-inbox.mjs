#!/usr/bin/env node
// Import questions from an external inbox JSON into quizzes/* safely.
// Usage:
//   node tools/import-inbox.mjs path/to/inbox.json --dry-run
//   node tools/import-inbox.mjs path/to/inbox.json --write
// Options:
//   --allow-duplicates  Allow inserting items that match existing content (default: false)
// Inbox format (minimal):
// {
//   "items": [
//     {
//       "targetId": "calc-practice-exam1",    // REQUIRED: quizzes/<targetId>.json
//       "difficulty": "easy"|"hard"|"expert",  // default: easy
//       "type": "short"|"mcq"|"tf",           // REQUIRED
//       "prompt": "...",                         // REQUIRED
//       // For mcq: provide choices + answer (string) OR answerIndex (number)
//       "choices": ["A","B","C"],
//       "answer": "B", // or ["B"] or number index via answerIndex
//       // For short: provide answerText (string or [string]); tolerance/range allowed via schema
//       "answerText": "5", // or ["5","5 mg"], optional: tolerance, hints, solution, explain
//       "tolerance": 0.1,
//       "hints": ["Convert units first"],
//       "solution": "...", "explain": "..."
//     }
//   ]
// }

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function parseArgs(){
  const args = process.argv.slice(2);
  if (!args.length) die('Usage: node tools/import-inbox.mjs <inbox.json> [--dry-run|--write] [--allow-duplicates]');
  const file = args[0];
  const opts = {
    write: args.includes('--write'),
    dryRun: args.includes('--dry-run') || !args.includes('--write'),
    allowDupes: args.includes('--allow-duplicates'),
  };
  return { file, opts };
}
function die(msg){ console.error(msg); process.exit(1); }
function loadJson(file){
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  try { return JSON.parse(raw); } catch(e){ die(`Invalid JSON in ${file}: ${e.message}`); }
}
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : p;
  });
}
function normalizeInboxItem(it){
  const out = { ...it };
  // trim basics
  out.targetId = String(out.targetId || '').trim();
  out.difficulty = (out.difficulty || 'easy').toLowerCase();
  out.type = String(out.type || '').toLowerCase();
  out.prompt = String(out.prompt || '').trim();
  // harmonize tf answer casing
  if (out.type === 'tf' && typeof out.answer === 'string') {
    if (/^true$/i.test(out.answer)) out.answer = 'True';
    if (/^false$/i.test(out.answer)) out.answer = 'False';
  }
  // short: move answer->answerText if needed
  if (out.type === 'short' && out.answer && !out.answerText) {
    out.answerText = out.answer;
    delete out.answer;
  }
  return out;
}
function validateInboxItem(it){
  const errs = [];
  if (!it.targetId) errs.push('missing targetId');
  if (!it.type || !['short','mcq','tf'].includes(it.type)) errs.push('invalid type');
  if (!it.prompt) errs.push('missing prompt');
  if (it.type === 'mcq') {
    if (!Array.isArray(it.choices) || it.choices.length < 2) errs.push('mcq requires choices[>=2]');
    if (it.answer === undefined && typeof it.answerIndex !== 'number') errs.push('mcq requires answer or answerIndex');
  }
  if (it.type === 'tf') {
    if (typeof it.answer !== 'string' || !['True','False','true','false'].includes(it.answer)) errs.push('tf requires answer True/False');
  }
  if (it.type === 'short') {
    if (it.answerText === undefined && it.answer === undefined) errs.push('short requires answerText');
  }
  if (!['easy','hard','expert'].includes(it.difficulty)) errs.push('invalid difficulty');
  return errs;
}
function readQuiz(targetId){
  const file = path.join('quizzes', `${targetId}.json`);
  if (!fs.existsSync(file)) return { file, exists:false };
  const json = loadJson(file);
  const pools = json.pools || null;
  const questions = json.questions || null;
  return { file, exists:true, json, pools, questions };
}
function hashItem(it){
  const key = JSON.stringify({ type:it.type, prompt:it.prompt, answer:it.answer ?? it.answerText ?? it.answerIndex, choices:it.choices||null });
  return crypto.createHash('sha1').update(key).digest('hex');
}
function buildExistingHashset(qjson){
  const items = [];
  if (qjson.pools){
    for (const k of Object.keys(qjson.pools)){
      const arr = Array.isArray(qjson.pools[k]) ? qjson.pools[k] : [];
      arr.forEach(x => items.push(x));
    }
  } else if (Array.isArray(qjson.questions)) {
    items.push(...qjson.questions);
  }
  const set = new Set();
  for (const x of items){ set.add(hashItem(x)); }
  return set;
}
function toSchemaItem(it){
  const base = { type: it.type, prompt: it.prompt };
  if (it.type === 'mcq'){
    const o = { ...base, choices: it.choices };
    if (typeof it.answerIndex === 'number') o.answerIndex = it.answerIndex;
    else if (typeof it.answer === 'string' || Array.isArray(it.answer)) o.answer = it.answer;
    return { ...o, explain: it.explain, solution: it.solution, hints: it.hints, tolerance: it.tolerance };
  }
  if (it.type === 'tf'){
    return { ...base, answer: it.answer, explain: it.explain, solution: it.solution, hints: it.hints };
  }
  // short
  const answerText = Array.isArray(it.answerText) ? it.answerText : [String(it.answerText ?? '')].filter(Boolean);
  return { ...base, answerText, explain: it.explain, solution: it.solution, hints: it.hints, tolerance: it.tolerance };
}

(function main(){
  const { file, opts } = parseArgs();
  const inbox = loadJson(file);
  const items = Array.isArray(inbox.items) ? inbox.items : die('Inbox must have items[]');

  const normalized = items.map(normalizeInboxItem);
  const byTarget = new Map();
  const errors = [];
  for (let i=0;i<normalized.length;i++){
    const it = normalized[i];
    const errs = validateInboxItem(it);
    if (errs.length){ errors.push({ index:i, it, errs }); continue; }
    if (!byTarget.has(it.targetId)) byTarget.set(it.targetId, []);
    byTarget.get(it.targetId).push(it);
  }

  if (errors.length){
    console.log(`Found ${errors.length} invalid items:`);
    for (const e of errors){
      console.log(` - #${e.index} target=${e.it.targetId||'?'} type=${e.it.type||'?'}: ${e.errs.join('; ')}`);
    }
  }

  const summary = [];
  for (const [targetId, arr] of byTarget.entries()){
    const q = readQuiz(targetId);
    if (!q.exists){ summary.push({ targetId, error:'MISSING_QUIZ' }); continue; }
    const existing = buildExistingHashset(q.json);
    const buckets = { easy:[], hard:[], expert:[] };
    let dupes = 0;
    for (const it of arr){
      const sch = toSchemaItem(it);
      const h = hashItem(sch);
      if (!opts.allowDupes && existing.has(h)) { dupes++; continue; }
      buckets[it.difficulty].push(sch);
    }
    summary.push({ targetId, counts: { easy:buckets.easy.length, hard:buckets.hard.length, expert:buckets.expert.length, dupes }, file:q.file, buckets });
  }

  // Print summary
  console.log(`\n=== Import Summary (${opts.dryRun ? 'dry-run' : 'write'}) ===`);
  for (const s of summary){
    if (s.error){ console.log(`${s.targetId} | ERROR: ${s.error}`); continue; }
    console.log(`${s.targetId} -> ${path.relative('.', s.file)} | add e=${s.counts.easy}, h=${s.counts.hard}, x=${s.counts.expert} | skipped dupes=${s.counts.dupes}`);
  }

  if (opts.dryRun){
    console.log('\nNo files modified (dry-run). Use --write to apply changes.');
    process.exit(0);
  }

  // Apply writes
  for (const s of summary){
    if (s.error) continue;
    const raw = fs.readFileSync(s.file, 'utf8');
    const j = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (j.pools) {
      j.pools.easy = Array.isArray(j.pools.easy) ? j.pools.easy : [];
      j.pools.hard = Array.isArray(j.pools.hard) ? j.pools.hard : [];
      j.pools.expert = Array.isArray(j.pools.expert) ? j.pools.expert : [];
      j.pools.easy.push(...s.buckets.easy);
      j.pools.hard.push(...s.buckets.hard);
      j.pools.expert.push(...s.buckets.expert);
    } else if (Array.isArray(j.questions)) {
      const merged = [...s.buckets.easy, ...s.buckets.hard, ...s.buckets.expert];
      j.questions.push(...merged);
    } else {
      j.pools = { easy: s.buckets.easy, hard: s.buckets.hard, expert: s.buckets.expert };
    }
    fs.writeFileSync(s.file, JSON.stringify(j, null, 2));
  }
  console.log('\nWrite complete. Please run your validator next.');
})();
