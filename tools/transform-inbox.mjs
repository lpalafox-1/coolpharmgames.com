#!/usr/bin/env node
// Transform the provided structured JSON into importer inbox format.
// Usage: node tools/transform-inbox.mjs tools/inbox-structured.json > tools/inbox-from-structured.json

import fs from 'fs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('Usage: node tools/transform-inbox.mjs <structured.json>'); process.exit(1); }
const raw = fs.readFileSync(args[0], 'utf8').replace(/^\uFEFF/, '');
const src = JSON.parse(raw);

const titleToId = new Map([
  ['Chapter 1 — Review','chapter1-review'],
  ['Chapter 1 – Review','chapter1-review'],
  ['Chapter 1 - Review','chapter1-review'],
  ['Chapter 1 Review','chapter1-review'],
  ['Chapter 2 — Review','chapter2-review'],
  ['Chapter 2 – Review','chapter2-review'],
  ['Chapter 2 - Review','chapter2-review'],
  ['Chapter 2 Review','chapter2-review'],
  ['Chapter 3 — Review','chapter3-review'],
  ['Chapter 3 – Review','chapter3-review'],
  ['Chapter 3 - Review','chapter3-review'],
  ['Chapter 3 Review','chapter3-review'],
  ['Chapter 4 — Review','chapter4-review'],
  ['Chapter 4 – Review','chapter4-review'],
  ['Chapter 4 - Review','chapter4-review'],
  ['Chapter 4 Review','chapter4-review'],
  ['Chapter 5 — Review','chapter5-review'],
  ['Chapter 5 – Review','chapter5-review'],
  ['Chapter 5 - Review','chapter5-review'],
  ['Chapter 5 Review','chapter5-review'],
  ['Practice E1 — Exam 1 Prep (Chapters 1–4)','practice-e1-exam1-prep-ch1-4'],
  ['Practice E2A — Exam 2 Prep (Chapters 1–5)','practice-e2a-exam2-prep-ch1-5'],
  ['Supplemental Exam 1 2024','supplemental-exam1-2024'],
  ['SIG Wildcards','sig-wildcards'],
  ['Latin Fun','latin-fun'],
]);

function mapType(t){
  const s = String(t||'').toLowerCase();
  if (s === 'numeric') return 'short';
  if (s === 'short-answer') return 'short';
  if (s === 'text') return 'short';
  if (s === 'mcq' || s === 'tf') return s;
  return 'short';
}

function itemToInbox(targetId, difficulty, item){
  const type = mapType(item.type);
  const prompt = item.question || item.prompt || '';
  // numeric/text to short
  if (type === 'short'){
    const answerText = Array.isArray(item.answer) ? item.answer : [String(item.answer||'')].filter(Boolean);
    return {
      targetId, difficulty, type: 'short', prompt,
      answerText: answerText.length ? answerText : undefined,
      hints: item.hint || item.hints,
      solution: item.solution,
      explain: item.explain
    };
  }
  // pass-through others
  return { targetId, difficulty, type, prompt, choices: item.choices, answer: item.answer, answerIndex: item.answerIndex, hints: item.hint||item.hints, solution: item.solution, explain: item.explain };
}

const out = { items: [] };

function pushSection(section){
  for (const [title, payload] of Object.entries(section||{})){
    const targetId = titleToId.get(title) || titleToId.get(payload.title || '') || null;
    if (!targetId) {
      // unknown title; skip but log
      console.error(`WARN: Unmapped title: ${title}`);
      continue;
    }
    const modes = payload.modes || {};
    for (const diff of ['easy','hard']){
      const arr = Array.isArray(modes[diff]) ? modes[diff] : [];
      for (const it of arr){ out.items.push(itemToInbox(targetId, diff, it)); }
    }
  }
}

pushSection(src['Chapter Reviews']);
pushSection(src['Exam Practice']);
pushSection(src['Supplemental']);
pushSection(src['Fun Modes']);

console.log(JSON.stringify(out, null, 2));
