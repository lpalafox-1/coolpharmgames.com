import {
  WEEK_1_PRACTICE_NOTE,
  generateFall2026Quiz
} from "./fall-2026-quiz-generator.js?v=20261006a";
import {
  ADAPTIVE_MEMORY_KEY,
  buildFall2026AdaptivePayload,
  normalizeAdaptiveMemory,
  recordAdaptiveRound
} from "./fall-2026-adaptive-practice.js?v=20261006a";

const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const HISTORY_KEY = "pharmlet.history";
const REVIEW_KEY = "pharmlet.review-queue";
const SUPPORTED_WEEKS = new Set(Array.from({ length: 10 }, (_, index) => index + 1));
const TIMER_SECONDS = 10 * 60;
const DRUG_DATA_URL = "assets/data/fall-2026-p2-top-drugs.json";
const POLICY_URL = "assets/data/fall-2026-lab3-quiz-policy.json";

let sourcePromise;

function requireSupportedWeek(quizWeek) {
  if (!SUPPORTED_WEEKS.has(quizWeek)) {
    throw new Error("Fall 2026 Lab III practice is available for Weeks 1-10.");
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${url} (HTTP ${response.status}).`);
  }
  return response.json();
}

function loadSources() {
  if (!sourcePromise) {
    sourcePromise = Promise.all([
      fetchJson(DRUG_DATA_URL),
      fetchJson(POLICY_URL)
    ])
      .then(([drugData, policy]) => ({ drugData, policy }))
      // A rejected promise must not stay cached. Otherwise one transient
      // network failure poisons every later attempt until a full page reload,
      // and the retry the error message invites can never succeed.
      .catch((error) => {
        sourcePromise = undefined;
        throw error;
      });
  }
  return sourcePromise;
}

export function createFall2026PracticeSeed(quizWeek) {
  requireSupportedWeek(quizWeek);
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return `fall-2026-lab3-week-${quizWeek}-${Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("")}`;
}

export const WEEK_FOCUS_KIND = "fall-2026-lab3-week-focus";
const WEEK_FOCUS_QUESTION_COUNT = 10;

export function buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed }) {
  requireSupportedWeek(quizWeek);
  const generated = generateFall2026Quiz({
    drugData,
    policy,
    quizWeek,
    seed,
    ...(quizWeek === 1 ? { mode: "practice", questionCount: 10 } : {})
  });

  if (generated.status !== "generated" || generated.questions.length !== 10) {
    throw new Error(`Week ${quizWeek} did not produce a complete 10-question practice set.`);
  }

  const title = `Lab III Fall 2026 - Week ${quizWeek} Practice`;
  const sourceQuizId = `fall-2026-lab3-week-${quizWeek}-practice`;

  return {
    id: "custom-quiz",
    title,
    metadata: {
      kind: "fall-2026-lab3-practice",
      generator: "fall-2026-p2-lab3-deterministic-generator",
      generatedFrom: sourceQuizId,
      sourceTitle: title,
      quizWeek,
      seed: generated.seed,
      timerSeconds: TIMER_SECONDS,
      composition: { ...generated.composition },
      practiceNote: quizWeek === 1 ? WEEK_1_PRACTICE_NOTE : ""
    },
    questions: generated.questions.map((question) => ({
      ...question,
      sourceQuizId,
      sourceTitle: title
    }))
  };
}

export async function launchFall2026Lab3Practice(quizWeek, options = {}) {
  requireSupportedWeek(quizWeek);
  const { drugData, policy } = options.drugData && options.policy
    ? options
    : await loadSources();
  const seed = options.seed || createFall2026PracticeSeed(quizWeek);
  const payload = buildFall2026Lab3Payload({ drugData, policy, quizWeek, seed });

  localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
  window.location.assign("quiz.html?id=custom-quiz");
  return payload;
}

export function createFall2026WeekFocusSeed(quizWeek) {
  requireSupportedWeek(quizWeek);
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return `fall-2026-lab3-week-focus-week-${quizWeek}-${Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("")}`;
}

export function buildFall2026WeekFocusPayload({ drugData, policy, quizWeek, seed }) {
  requireSupportedWeek(quizWeek);
  const generated = generateFall2026Quiz({
    drugData,
    policy,
    quizWeek,
    seed,
    mode: "week-focus",
    questionCount: WEEK_FOCUS_QUESTION_COUNT
  });

  if (generated.status !== "generated" || generated.questions.length !== WEEK_FOCUS_QUESTION_COUNT) {
    throw new Error(`Week ${quizWeek} Focus did not produce a complete 10-question set.`);
  }

  const title = `Lab III Fall 2026 - Week ${quizWeek} Focus`;
  const sourceQuizId = `fall-2026-lab3-week-${quizWeek}-week-focus`;

  return {
    id: "custom-quiz",
    title,
    metadata: {
      kind: WEEK_FOCUS_KIND,
      generator: "fall-2026-p2-lab3-deterministic-generator",
      generatedFrom: sourceQuizId,
      sourceTitle: title,
      quizWeek,
      seed: generated.seed,
      timerSeconds: TIMER_SECONDS,
      composition: { ...generated.composition }
    },
    questions: generated.questions.map((question) => ({
      ...question,
      sourceQuizId,
      sourceTitle: title
    }))
  };
}

export async function launchFall2026Lab3WeekFocus(quizWeek, options = {}) {
  requireSupportedWeek(quizWeek);
  const { drugData, policy } = options.drugData && options.policy
    ? options
    : await loadSources();
  const seed = options.seed || createFall2026WeekFocusSeed(quizWeek);
  const payload = buildFall2026WeekFocusPayload({ drugData, policy, quizWeek, seed });

  localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(payload));
  window.location.assign("quiz.html?id=custom-quiz");
  return payload;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// Review Queue entries are read through the shared store when it is present so
// this file never restates the store's normalization rules. Without it the raw
// array is used as-is; the adaptive module reads defensively either way.
function readReviewEntries() {
  const raw = readJson(REVIEW_KEY, []);
  const queue = Array.isArray(raw) ? raw : [];
  const store = globalThis.PharmletReviewQueueStore;
  try {
    return store?.normalizeQueue ? store.normalizeQueue(queue) : queue;
  } catch {
    return queue;
  }
}

const ADAPTIVE_REQUEST_KEY = "pharmlet.fall-2026-lab3.adaptive-request";
const ADAPTIVE_REQUEST_MAX_AGE_MS = 10 * 60 * 1000;

// Continuation requests written by the completion screen in quiz.html. Each is
// a small { week, createdAt } record that a real completion click writes and
// that expires, so a bookmarked or shared hub URL can never generate a round.
const BOSS_REMIX_REQUEST_KEY = "pharmlet.fall-2026-lab3.boss-remix-request";
const WEEKLY_REQUEST_KEY = "pharmlet.fall-2026-lab3.weekly-request";
const CONTINUATION_REQUEST_MAX_AGE_MS = 10 * 60 * 1000;

// Strict, not coercive, for the same reason as the adaptive request below:
// Number() would turn true, "1" and [1] into Week 1. A future-dated record
// would otherwise have negative age and slip past the expiry check.
function readContinuationWeek(saved, weekField, now) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return 0;
  const week = saved[weekField];
  const { createdAt } = saved;
  if (typeof week !== "number" || !Number.isInteger(week)) return 0;
  if (!SUPPORTED_WEEKS.has(week)) return 0;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return 0;
  const age = now - createdAt;
  if (age < 0 || age > CONTINUATION_REQUEST_MAX_AGE_MS) return 0;
  return week;
}

// Read-and-remove, exactly like the adaptive request. "New Week N Practice
// Set" on the completion screen writes this; the request is spent whether or
// not it turns out valid, so a stale or malformed one cannot re-fire later.
export function consumeWeeklyLaunchRequest(now = Date.now()) {
  let saved = null;
  try {
    const raw = localStorage.getItem(WEEKLY_REQUEST_KEY);
    if (raw === null) return 0;
    localStorage.removeItem(WEEKLY_REQUEST_KEY);
    saved = JSON.parse(raw);
  } catch {
    try { localStorage.removeItem(WEEKLY_REQUEST_KEY); } catch { /* nothing to clear */ }
    return 0;
  }
  return readContinuationWeek(saved, "quizWeek", now);
}

// Read-only. The engine owns the Boss Remix request: it writes it from a real
// "Boss Remix +1" click, validates the full record, and consumes it when the
// matching Week N practice payload loads in quiz.html. The hub only needs to
// know that a Standard launch for that week is wanted right now, so it checks
// the week and the age and removes nothing - an invalid or expired record is
// still the engine's to clear.
export function peekBossRemixLaunchWeek(now = Date.now()) {
  let saved = null;
  try {
    const raw = localStorage.getItem(BOSS_REMIX_REQUEST_KEY);
    if (raw === null) return 0;
    saved = JSON.parse(raw);
  } catch {
    return 0;
  }
  return readContinuationWeek(saved, "quizWeek", now);
}

// Read-and-remove. The request is spent whether or not it turns out valid, so
// a stale or malformed one cannot re-fire on the next visit.
export function consumeAdaptiveRoundRequest(now = Date.now()) {
  let saved = null;
  try {
    const raw = localStorage.getItem(ADAPTIVE_REQUEST_KEY);
    if (raw === null) return 0;
    localStorage.removeItem(ADAPTIVE_REQUEST_KEY);
    saved = JSON.parse(raw);
  } catch {
    try { localStorage.removeItem(ADAPTIVE_REQUEST_KEY); } catch { /* nothing to clear */ }
    return 0;
  }

  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return 0;

  // Strict, not coercive. This request is written internally with real numbers,
  // so anything else is malformed - and Number() would otherwise turn true into
  // 1, "1" into 1, and [1] into 1, letting a corrupt request auto-launch Week 1.
  const { targetWeek, createdAt } = saved;
  if (typeof targetWeek !== "number" || !Number.isInteger(targetWeek)) return 0;
  if (!SUPPORTED_WEEKS.has(targetWeek)) return 0;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return 0;

  // A future-dated request would otherwise have negative age and slip past the
  // expiry check entirely.
  const age = now - createdAt;
  if (age < 0 || age > ADAPTIVE_REQUEST_MAX_AGE_MS) return 0;

  return targetWeek;
}

export function createFall2026AdaptiveSeed(targetWeek) {
  requireSupportedWeek(targetWeek);
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return `fall-2026-lab3-adaptive-week-${targetWeek}-${Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("")}`;
}

// Signals are re-read at launch time, so the next round always reflects the
// results of the previous one rather than a precomputed sequence.
export async function launchFall2026Lab3Adaptive(targetWeek, options = {}) {
  requireSupportedWeek(targetWeek);
  const { drugData, policy } = options.drugData && options.policy
    ? options
    : await loadSources();
  const seed = options.seed || createFall2026AdaptiveSeed(targetWeek);
  const memory = normalizeAdaptiveMemory(readJson(ADAPTIVE_MEMORY_KEY, null));

  const payload = buildFall2026AdaptivePayload({
    drugData,
    policy,
    targetWeek,
    seed,
    reviewEntries: readReviewEntries(),
    historyEntries: readJson(HISTORY_KEY, []),
    memory
  });

  const { selection, ...storedPayload } = payload;
  localStorage.setItem(CUSTOM_QUIZ_KEY, JSON.stringify(storedPayload));

  // Anti-repetition memory only. This is the sole store adaptive writes; it
  // never touches history, the Review Queue, or any adaptive weakness signal.
  try {
    localStorage.setItem(ADAPTIVE_MEMORY_KEY, JSON.stringify(
      recordAdaptiveRound({ memory, questions: payload.questions, targetWeek })
    ));
  } catch (error) {
    console.warn("Unable to record the adaptive round:", error);
  }

  window.location.assign("quiz.html?id=custom-quiz");
  return payload;
}

function getSelectedWeeklyWeek() {
  const select = document.getElementById("weekly-week");
  const week = Number(select?.value);
  return SUPPORTED_WEEKS.has(week) ? week : null;
}

function describeWeeklySelection(quizWeek) {
  if (quizWeek === null) return "Choose a week to enable Standard Weekly Practice.";
  if (quizWeek === 1) {
    return "Week 1 selected. This round uses Week 1 material only, with no prior-week review.";
  }
  return `Week ${quizWeek} selected. This round uses 6 new Week ${quizWeek} items and 4 cumulative-review items.`;
}

function syncWeeklyAvailability() {
  const button = document.getElementById("weekly-launch");
  const select = document.getElementById("weekly-week");
  const quizWeek = getSelectedWeeklyWeek();

  if (select) select.disabled = launchInFlight;
  if (button) button.disabled = launchInFlight || quizWeek === null;

  const summary = document.getElementById("weekly-selection-summary");
  if (summary) summary.textContent = describeWeeklySelection(quizWeek);
}

function setWeeklyLaunchState(busy, message = "") {
  const button = document.getElementById("weekly-launch");
  if (button) {
    button.setAttribute("aria-busy", String(busy));
    const idleLabel = button.dataset.idleLabel || button.textContent.trim();
    button.dataset.idleLabel = idleLabel;
    button.textContent = busy ? "Building your weekly practice set…" : idleLabel;
  }

  const status = document.getElementById("launch-status");
  if (status) {
    status.textContent = message;
    status.classList.toggle("hidden", !message);
  }

  syncWeeklyAvailability();
}

async function handleWeeklyLaunch() {
  if (launchInFlight) return;

  const quizWeek = getSelectedWeeklyWeek();
  if (quizWeek === null) {
    setWeeklyLaunchState(false, "Choose a week to practice first.");
    return;
  }

  await startWeeklyLaunch(quizWeek, `Building a fresh Week ${quizWeek} practice set from the Fall 2026 source data…`);
}

async function startWeeklyLaunch(quizWeek, busyMessage) {
  if (launchInFlight) return;

  launchInFlight = true;
  syncAllLaunchAvailability();
  setWeeklyLaunchState(true, busyMessage);
  try {
    await launchFall2026Lab3Practice(quizWeek);
  } catch (error) {
    console.error("Fall 2026 Lab III launch failed:", error);
    launchInFlight = false;
    setWeeklyLaunchState(false, error.message || "Unable to generate this practice set.");
    syncAllLaunchAvailability();
    return;
  }
  launchInFlight = false;
  syncAllLaunchAvailability();
}

// One launch at a time across the three study paths. Without this, a second
// click during the ~1s adaptive pool build could start a competing round and
// leave two payloads racing for the same custom-quiz key.
let launchInFlight = false;

function setAdaptiveState(busy, message = "") {
  const button = document.getElementById("adaptive-launch");
  if (button) {
    button.setAttribute("aria-busy", String(busy));
    const idleLabel = button.dataset.idleLabel || button.textContent.trim();
    button.dataset.idleLabel = idleLabel;
    button.textContent = busy ? "Building your adaptive round…" : idleLabel;
  }

  const status = document.getElementById("adaptive-status");
  if (status) {
    status.textContent = message;
    status.classList.toggle("hidden", !message);
  }

  syncAdaptiveAvailability();
}

function getSelectedAdaptiveWeek() {
  const select = document.getElementById("adaptive-week");
  const week = Number(select?.value);
  return SUPPORTED_WEEKS.has(week) ? week : null;
}

// The adaptive button stays unavailable until the student has actually chosen a
// target, and while any launch is running. There is deliberately no default
// week: course progress cannot be inferred from the calendar.
// The visible summary must describe the CURRENT selection. Weeks 2–10 state
// the 6+4 target for that week. They do not describe a generic Weeks 1–N pool.
function describeAdaptiveSelection(targetWeek) {
  if (targetWeek === null) return "Choose a week to enable Adaptive Practice.";
  if (targetWeek === 1) {
    return "Week 1 selected: all 10 questions from Week 1. Nothing after Week 1 is included.";
  }
  const priorWeeks = targetWeek === 2 ? "Week 1" : `Weeks 1–${targetWeek - 1}`;
  return `Week ${targetWeek} selected. This round targets 6 Week ${targetWeek} questions and 4 review questions from ${priorWeeks}, guided by your saved performance. Nothing after Week ${targetWeek} is included.`;
}

function syncAdaptiveAvailability() {
  const button = document.getElementById("adaptive-launch");
  const select = document.getElementById("adaptive-week");
  const targetWeek = getSelectedAdaptiveWeek();

  if (select) select.disabled = launchInFlight;
  if (button) button.disabled = launchInFlight || targetWeek === null;

  const summary = document.getElementById("adaptive-selection-summary");
  if (summary) summary.textContent = describeAdaptiveSelection(targetWeek);
}

function getSelectedWeekFocusWeek() {
  const select = document.getElementById("week-focus-week");
  const week = Number(select?.value);
  return SUPPORTED_WEEKS.has(week) ? week : null;
}

function describeWeekFocusSelection(quizWeek) {
  if (quizWeek === null) return "Choose a week to enable Week Focus.";
  return `Week ${quizWeek} selected. This round uses Week ${quizWeek} material only, with no prior-week review.`;
}

function syncWeekFocusAvailability() {
  const button = document.getElementById("week-focus-launch");
  const select = document.getElementById("week-focus-week");
  const quizWeek = getSelectedWeekFocusWeek();

  if (select) select.disabled = launchInFlight;
  if (button) button.disabled = launchInFlight || quizWeek === null;

  const summary = document.getElementById("week-focus-selection-summary");
  if (summary) summary.textContent = describeWeekFocusSelection(quizWeek);
}

function setWeekFocusState(busy, message = "") {
  const button = document.getElementById("week-focus-launch");
  if (button) {
    button.setAttribute("aria-busy", String(busy));
    const idleLabel = button.dataset.idleLabel || button.textContent.trim();
    button.dataset.idleLabel = idleLabel;
    button.textContent = busy ? "Building your Week Focus set…" : idleLabel;
  }

  const status = document.getElementById("week-focus-status");
  if (status) {
    status.textContent = message;
    status.classList.toggle("hidden", !message);
  }

  syncWeekFocusAvailability();
}

function syncAllLaunchAvailability() {
  syncAdaptiveAvailability();
  syncWeekFocusAvailability();
  syncWeeklyAvailability();
}

async function handleAdaptiveLaunch() {
  if (launchInFlight) return;

  // Validated in the handler, not only through the disabled attribute, so a
  // dispatched or scripted click cannot bypass the target requirement.
  const targetWeek = getSelectedAdaptiveWeek();
  if (targetWeek === null) {
    setAdaptiveState(false, "Choose a week to practice through first.");
    return;
  }

  launchInFlight = true;
  syncAllLaunchAvailability();
  setAdaptiveState(true, `Reviewing your saved Pharm-let performance through Week ${targetWeek}…`);
  try {
    await launchFall2026Lab3Adaptive(targetWeek);
  } catch (error) {
    console.error("Fall 2026 Lab III adaptive launch failed:", error);
    launchInFlight = false;
    setAdaptiveState(false, error.message || "Unable to build an adaptive round right now.");
    syncAllLaunchAvailability();
    return;
  }
  launchInFlight = false;
  setAdaptiveState(false, "");
  syncAllLaunchAvailability();
}

// A completion-screen continuation already chose the week. Mirror it into the
// Standard select so the visible state matches what is launching, then start.
function launchStandardContinuation(quizWeek, busyMessage) {
  const select = document.getElementById("weekly-week");
  if (select) select.value = String(quizWeek);
  syncAllLaunchAvailability();
  return startWeeklyLaunch(quizWeek, busyMessage);
}

// A bare ?week=N only preselects. Standard Weekly Practice is the last card on
// the page, so without this the student lands on an empty Adaptive select while
// their week sits below the fold. Focus goes to the section (tabindex="-1"),
// never to the select, so phone pickers do not open on load.
function revealStandardWeeklyPractice() {
  const section = document.getElementById("standard-weekly-practice");
  if (!section) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  section.scrollIntoView?.({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  section.focus?.({ preventScroll: true });
}

async function handleWeekFocusLaunch() {
  if (launchInFlight) return;

  const quizWeek = getSelectedWeekFocusWeek();
  if (quizWeek === null) {
    setWeekFocusState(false, "Choose a week to focus first.");
    return;
  }

  launchInFlight = true;
  syncAllLaunchAvailability();
  setWeekFocusState(true, `Building a Week ${quizWeek} Focus set from the Fall 2026 source data…`);
  try {
    await launchFall2026Lab3WeekFocus(quizWeek);
  } catch (error) {
    console.error("Fall 2026 Lab III Week Focus launch failed:", error);
    launchInFlight = false;
    setWeekFocusState(false, error.message || "Unable to generate this Week Focus set.");
    syncAllLaunchAvailability();
    return;
  }
  launchInFlight = false;
  setWeekFocusState(false, "");
  syncAllLaunchAvailability();
}

export function initializePage() {
  document.getElementById("adaptive-launch")?.addEventListener("click", handleAdaptiveLaunch);
  document.getElementById("adaptive-week")?.addEventListener("change", () => setAdaptiveState(false, ""));
  document.getElementById("week-focus-launch")?.addEventListener("click", handleWeekFocusLaunch);
  document.getElementById("week-focus-week")?.addEventListener("change", () => setWeekFocusState(false, ""));
  document.getElementById("weekly-launch")?.addEventListener("click", handleWeeklyLaunch);
  document.getElementById("weekly-week")?.addEventListener("change", () => setWeeklyLaunchState(false, ""));
  syncAllLaunchAvailability();

  const themeToggle = document.getElementById("theme-toggle");
  const themeLabel = document.getElementById("theme-label");
  themeToggle?.addEventListener("click", () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("pharmlet.theme", next);
    if (themeLabel) themeLabel.textContent = next === "dark" ? "Light" : "Dark";
  });

  if (themeLabel) {
    themeLabel.textContent = document.documentElement.classList.contains("dark") ? "Light" : "Dark";
  }

  // Bounded, single-use handoff from the completion screen's "New Adaptive
  // Round". A request is written only by a real completion click, is consumed
  // on read, and expires, so a bookmarked or shared URL can never generate a
  // round - the ?adaptive= query parameter deliberately does nothing.
  // Both single-use requests are consumed up front so neither can linger past
  // this page load, whichever one wins. Adaptive keeps precedence.
  const adaptiveRequestWeek = consumeAdaptiveRoundRequest();
  const weeklyRequestWeek = consumeWeeklyLaunchRequest();
  if (SUPPORTED_WEEKS.has(adaptiveRequestWeek)) {
    const select = document.getElementById("adaptive-week");
    if (select) {
      select.value = String(adaptiveRequestWeek);
      syncAdaptiveAvailability();
    }
    return handleAdaptiveLaunch();
  }

  // "New Week N Practice Set" wrote a weekly request from a real completion
  // click; the ?week=N in the URL is only its fallback preselection.
  if (SUPPORTED_WEEKS.has(weeklyRequestWeek)) {
    return launchStandardContinuation(
      weeklyRequestWeek,
      `Building a fresh Week ${weeklyRequestWeek} practice set from the Fall 2026 source data…`
    );
  }

  // "Boss Remix +1" sends the student here with a live remix request. The
  // remix itself is built from a fresh Week N Standard practice set, so the
  // only thing missing is that launch; a second click used to be required
  // and nothing on the page said so. The request stays in storage for the
  // engine to consume when the set loads.
  const remixWeek = peekBossRemixLaunchWeek();
  if (SUPPORTED_WEEKS.has(remixWeek)) {
    return launchStandardContinuation(
      remixWeek,
      `Building a fresh Week ${remixWeek} practice set for your Boss Remix…`
    );
  }

  // A bare ?week=N (homepage quick links, bookmarks, shared URLs) never
  // launches. It preselects the Standard week and brings that card into view.
  const requestedWeek = Number(new URLSearchParams(window.location.search).get("week"));
  if (SUPPORTED_WEEKS.has(requestedWeek)) {
    const select = document.getElementById("weekly-week");
    if (select) select.value = String(requestedWeek);
    syncAllLaunchAvailability();
    revealStandardWeeklyPractice();
  }
  return undefined;
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initializePage);
}
