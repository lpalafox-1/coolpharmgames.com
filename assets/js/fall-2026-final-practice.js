// Pharm-let practice composition, not a faculty-authored final blueprint.
// No curriculum facts live here: all questions come from the shared Fall pool.
import { generateFall2026Quiz, createSeededRng, finalizeFall2026QuestionSet, isFall2026QuestionFormAllowed } from './fall-2026-quiz-generator.js?v=20261101b';
import { buildAdaptiveSignals, buildConceptWeakness, scoreCandidate, getQuestionFingerprint, getQuestionConceptKey, getQuestionSourceWeeks } from './fall-2026-adaptive-practice.js?v=20261101b';
export const FINAL_KINDS = Object.freeze({ balanced: 'fall-2026-lab3-final-balanced', adaptive: 'fall-2026-lab3-final-adaptive' });
export const FINAL_VERSION = 'fall-final100-v2';
export const FINAL_DOMAINS = Object.freeze(['brandGeneric', 'drugClass', 'fdaIndication', 'mechanismOfAction', 'topAdverseReactions', 'boxWarning']);
const WEEKS = Object.freeze(Array.from({ length: 10 }, (_, i) => i + 1));
const normalize = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
const weekOf = q => q.metadata.sourceDrugQuizWeek;
const domainOf = q => q.metadata.knowledgeDomain;
const testedDrugs = q => [...new Set(q.metadata.pairwiseSharedAdr?.sourceDrugIds || q.metadata.sourceDrugIds || [q.metadata.sourceDrugId])];
const concepts = q => [getQuestionConceptKey(q), ...testedDrugs(q).map(id => `${id}::${domainOf(q)}`)];
const negative = q => /\b(?:NOT|EXCEPT)\b/.test(q.prompt);
const pairwise = q => Boolean(q.metadata.pairwiseSharedAdr);
export function isRejectedFinalForm(q) {
  return !isFall2026QuestionFormAllowed(q);
}
export function buildFinalCandidatePool({ drugData, policy, seed, roundsPerWeek = 24 }) {
  if (!Number.isInteger(roundsPerWeek) || roundsPerWeek < 1 || roundsPerWeek > 32) throw new Error('Invalid Final sampling bound.');
  const pool = new Map();
  for (const week of WEEKS) for (let round = 0; round < roundsPerWeek; round++) {
    const generated = generateFall2026Quiz({ drugData, policy, quizWeek: week, mode: 'week-focus', questionCount: 10, seed: `${FINAL_VERSION}:${seed}:pool:${week}:${round}` });
    for (const q of generated.questions) {
      if (isRejectedFinalForm(q)) throw new Error('Rejected faculty form in shared pool.');
      if (q.metadata.generatorId !== 'fall-2026-p2-lab3-deterministic-generator' || weekOf(q) !== week || !getQuestionSourceWeeks(q).every(w => w >= 1 && w <= 10)) throw new Error('Final source provenance mismatch.');
      pool.set(getQuestionFingerprint(q), q);
    }
  }
  return [...pool.values()];
}
// A history-independent week/domain envelope. One of each domain per week;
// four extra slots go to the globally least represented domains with capacity.
export function buildFinalEnvelope(pool) {
  const totals = Object.fromEntries(FINAL_DOMAINS.map(d => [d, 10]));
  return WEEKS.flatMap(week => {
    const counts = Object.fromEntries(FINAL_DOMAINS.map(d => [d, 1]));
    const capacity = Object.fromEntries(FINAL_DOMAINS.map(d => [d, new Set(pool.filter(q => weekOf(q) === week && domainOf(q) === d).map(getQuestionConceptKey)).size]));
    if (FINAL_DOMAINS.some(d => !capacity[d])) throw new Error(`Final capacity: Week ${week} lacks a safe domain.`);
    for (let n = 0; n < 4; n++) {
      const domain = FINAL_DOMAINS.filter(d => counts[d] < Math.min(2, capacity[d])).sort((a, b) => totals[a] - totals[b] || FINAL_DOMAINS.indexOf(a) - FINAL_DOMAINS.indexOf(b))[0];
      if (!domain) throw new Error(`Final capacity: Week ${week} cannot fill ten slots.`);
      counts[domain]++; totals[domain]++;
    }
    return FINAL_DOMAINS.flatMap(domain => Array.from({ length: counts[domain] }, () => ({ week, domain })));
  });
}
function compatible(q, selected) {
  if (isRejectedFinalForm(q)) return false;
  const ds = testedDrugs(q), cs = new Set(concepts(q));
  if (ds.some(id => selected.filter(x => testedDrugs(x).includes(id)).length >= 2)) return false;
  if (selected.some(x => x.id === q.id || getQuestionFingerprint(x) === getQuestionFingerprint(q) || normalize(x.prompt) === normalize(q.prompt) || concepts(x).some(k => cs.has(k)))) return false;
  if (negative(q) && selected.filter(negative).length >= 3) return false;
  if (pairwise(q) && selected.filter(pairwise).length >= 5) return false;
  return true;
}
function orderFinal(questions, rng) {
  const remaining = questions.map(q => ({ q, tie: rng() })); const ordered = [];
  while (remaining.length) {
    const last = ordered.at(-1), before = ordered.at(-2);
    const choices = remaining.filter(({q}) => !last || (
      weekOf(q) !== weekOf(last) && !testedDrugs(q).some(id => testedDrugs(last).includes(id))
      && !(before && domainOf(q) === domainOf(last) && domainOf(q) === domainOf(before))
      && !(before && q.metadata.questionVariant === last.metadata.questionVariant && q.metadata.questionVariant === before.metadata.questionVariant)
    ));
    if (!choices.length) return null;
    choices.sort((a,b) => a.tie-b.tie);
    const item = choices[0]; ordered.push(item.q); remaining.splice(remaining.indexOf(item),1);
  }
  return ordered;
}
export function assertFinalInvariants(questions, envelope) {
  if (questions.length !== 100) throw new Error('Final must contain exactly 100 questions.');
  const checked = [];
  for (const q of questions) { if (!compatible(q, checked)) throw new Error(`Final diversity/safety conflict: ${q.id}`); checked.push(q); }
  for (const week of WEEKS) for (const domain of FINAL_DOMAINS) {
    if (questions.filter(q => weekOf(q) === week && domainOf(q) === domain).length !== envelope.filter(s => s.week === week && s.domain === domain).length) throw new Error('Final envelope changed.');
  }
}
export function buildFall2026FinalPayload(options = {}) {
  const { drugData, policy, seed, mode = 'balanced', roundsPerWeek = 24 } = options;
  if (!FINAL_KINDS[mode] || typeof seed !== 'string' || !seed) throw new Error('Invalid Final mode or seed.');
  const pool = buildFinalCandidatePool({ drugData, policy, seed, roundsPerWeek });
  const envelope = buildFinalEnvelope(pool);
  // Balanced deliberately never reads weakness/history/time options.
  const signals = mode === 'adaptive' ? buildAdaptiveSignals({ reviewEntries: options.reviewEntries, historyEntries: options.historyEntries, memory: options.memory, now: options.now }) : null;
  const weakness = signals ? buildConceptWeakness(pool, signals) : null;
  const scores = new Map(pool.map(q => [q, signals ? scoreCandidate(q, signals, weakness) : 0]));
  const groups = new Map();
  for (const slot of envelope) { const key = `${slot.week}:${slot.domain}`; if (!groups.has(key)) groups.set(key, pool.filter(q => weekOf(q) === slot.week && domainOf(q) === slot.domain)); }
  let questions, usedAttempt = 0;
  for (let attempt = 0; attempt < 80 && !questions; attempt++) {
    const rng = createSeededRng(`${FINAL_VERSION}:${seed}:select:${attempt}`);
    const slots = envelope.map(slot => ({...slot, tie:rng()})).sort((a,b) => groups.get(`${a.week}:${a.domain}`).length - groups.get(`${b.week}:${b.domain}`).length || a.tie-b.tie);
    const selected = [];
    for (const slot of slots) {
      const candidates = groups.get(`${slot.week}:${slot.domain}`).filter(q => compatible(q, selected)).map(q => ({ q, rank: scores.get(q) + rng() * (attempt < 10 ? 0.3 : 1) - testedDrugs(q).reduce((n,id)=>n+selected.filter(x=>testedDrugs(x).includes(id)).length,0) * 0.2 }));
      candidates.sort((a,b) => b.rank-a.rank);
      if (!candidates.length) break;
      selected.push(candidates[0].q);
    }
    if (selected.length !== 100) continue;
    try {
      const guarded = finalizeFall2026QuestionSet({ drugData, policy, questions: selected });
      assertFinalInvariants(guarded, envelope);
      for(let order=0;order<20&&!questions;order++) questions=orderFinal(guarded,createSeededRng(`${seed}:order:${attempt}:${order}`));
      usedAttempt = attempt;
    } catch (error) {
      if (error.code !== 'CROSS_QUESTION_BRAND_GENERIC_LEAKAGE' && !String(error.message).startsWith('Final diversity/safety conflict')) throw error;
    }
  }
  if (!questions) throw new Error('Final capacity: unable to build a safe 100-question set with exactly ten per week. No reduced or padded exam was saved.');
  assertFinalInvariants(questions, envelope);
  const kind = FINAL_KINDS[mode];
  const title = `Fall 2026 Lab III Final Practice — ${mode === 'balanced' ? 'Balanced' : 'Adaptive'} — 100 Questions`;
  return { id:'custom-quiz', title, metadata: {kind, generator:'fall-2026-p2-lab3-deterministic-generator', generatedFrom:kind, sourceTitle:title, quizWeek:10, seed, timerSeconds:100*60,
    finalPractice: { version: FINAL_VERSION, mode, eligibleWeeks:[...WEEKS], envelope, poolSize:pool.length, searchAttempt:usedAttempt, fallback:false, sourceSha256:drugData.source.sha256, policySha256:policy.source.sha256, orderedFingerprints:questions.map(getQuestionFingerprint), signalBasis: signals ? { now:signals.now, fallAttempts:signals.recentFallAttempts, recentAccuracy:signals.recentAccuracy, rememberedRounds:signals.exposure.roundCount } : null }
  }, questions:questions.map(q=>({...q,sourceQuizId:kind,sourceTitle:title})) };
}
