#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const checklist = {
  "Chapter Reviews": {
    "Chapter 1 Review": { "Easy Target": "8–10", "Hard Target": "8–10", "Total Target": "15–20" },
    "Chapter 2 Review": { "Easy Target": "8–10", "Hard Target": "8–10", "Total Target": "15–20" },
    "Chapter 3 Review": { "Easy Target": "8–10", "Hard Target": "8–10", "Total Target": "15–20" },
    "Chapter 4 Review": { "Easy Target": "8–10", "Hard Target": "8–10", "Total Target": "15–20" },
    "Chapter 5 Review": { "Easy Target": "8–10", "Hard Target": "8–10", "Total Target": "15–20" }
  },
  "Exam Practice": {
    "Practice E1 — Exam 1 Prep (Chapters 1–4)": { "Easy Target": "10–12", "Hard Target": "12–15", "Total Target": "25–30" },
    "Practice E2A — Exam 2 Prep (Chapters 1–5)": { "Easy Target": "10–12", "Hard Target": "12–15", "Total Target": "25–30" },
    "Practice E2B — Exam 2 Prep (Expanded, Future)": { "Easy Target": "10–12", "Hard Target": "12–15", "Expert Target": "5–8", "Total Target": "30–35" }
  },
  "Supplemental": {
    "Supplemental Exam 1 2024": { "Easy Target": "8–10", "Hard Target": "8–10", "Total Target": "15–20" }
  },
  "Fun Modes": {
    "SIG Wildcards": { "Easy Target": "10+", "Hard Target": "5–8", "Total Target": "15–18" },
    "Latin Fun": { "Easy Target": "10+", "Hard Target": "5–8", "Total Target": "15–18" }
  }
};

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : p;
  });
}
function loadJson(file){
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}
function summarize(file){
  try {
    const j = loadJson(file);
    const id = j.id || path.basename(file, '.json');
    const title = j.title || id;
    const counts = { easy:0, hard:0, expert:0, total:0 };
    if (j.pools) {
      for (const k of ['easy','hard','expert']) {
        counts[k] = Array.isArray(j.pools[k]) ? j.pools[k].length : 0;
        counts.total += counts[k];
      }
    } else if (Array.isArray(j.questions)) {
      counts.total = j.questions.length;
    }
    return {file,id,title,counts};
  } catch(e) { return {file,error:e.message}; }
}
function parseTarget(s){
  if (!s) return {min:0,max:0};
  const plus = /^(\d+)\+$/; const range = /^(\d+)\s*[–-]\s*(\d+)$/;
  const mPlus = String(s).match(plus); if (mPlus) { const n=Number(mPlus[1]); return {min:n,max:Infinity}; }
  const mRange = String(s).match(range); if (mRange){ return {min:Number(mRange[1]), max:Number(mRange[2])}; }
  const n = Number(String(s).replace(/[^\d]/g,'')); return {min:n||0, max:n||0};
}
function gapLine(title, counts, targets){
  const tEasy = parseTarget(targets["Easy Target"]);
  const tHard = parseTarget(targets["Hard Target"]);
  const tExpert = parseTarget(targets["Expert Target"]);
  const tTotal = parseTarget(targets["Total Target"]);
  const need = (have, t)=> Math.max(0, (Number.isFinite(t.min)?t.min:0) - have);
  const easyNeed = need(counts.easy, tEasy);
  const hardNeed = need(counts.hard, tHard);
  const expertNeed = need(counts.expert, tExpert);
  const totalNeed = need(counts.total, tTotal);
  return `${title} | have e=${counts.easy}, h=${counts.hard}, x=${counts.expert}, total=${counts.total} | need e+=${easyNeed}, h+=${hardNeed}, x+=${expertNeed}, total+=${totalNeed}`;
}

const files = listFiles('quizzes').filter(f=>f.endsWith('.json'));
const rows = files.map(summarize);

const nameMap = new Map(rows.map(r=>[r.title, r]));

for (const [section, items] of Object.entries(checklist)){
  console.log(`\n== ${section} ==`);
  for (const [title, targets] of Object.entries(items)){
    const row = nameMap.get(title);
    if (!row) { console.log(`${title} | MISSING`); continue; }
    if (row.error) { console.log(`${title} | ERROR ${row.error}`); continue; }
    console.log(gapLine(title, row.counts, targets));
  }
}

console.log("\nOverall Goal: Each quiz ~15–30 questions depending on type. Across all, aim for ~200–250 total.");
