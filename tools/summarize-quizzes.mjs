#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : p;
  });
}

function loadJson(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function summarizeQuiz(file) {
  try {
    const j = loadJson(file);
    const id = j.id || path.basename(file, '.json');
    const title = j.title || '';
    let total = 0;
    const counts = {};
    if (j.pools && typeof j.pools === 'object') {
      for (const [mode, arr] of Object.entries(j.pools)) {
        const n = Array.isArray(arr) ? arr.length : 0;
        counts[mode] = n;
        total += n;
      }
    } else if (Array.isArray(j.questions)) {
      counts.questions = j.questions.length;
      total = counts.questions;
    } else {
      total = 0;
    }
    return { file, id, title, total, counts };
  } catch (e) {
    return { file, error: e.message };
  }
}

const files = listFiles('quizzes').filter((f) => f.endsWith('.json'));
const rows = files.map(summarizeQuiz).sort((a, b) => (a.id || '').localeCompare(b.id || ''));

for (const r of rows) {
  if (r.error) {
    console.log(`${r.file} | ERROR ${r.error}`);
    continue;
  }
  const modes = Object.entries(r.counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  console.log(`${r.id} | total=${r.total} | ${modes} | file=${r.file}`);
}
