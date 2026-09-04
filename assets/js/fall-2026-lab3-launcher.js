import {
  WEEK_1_PRACTICE_NOTE,
  generateFall2026Quiz
} from "./fall-2026-quiz-generator.js?v=20260827a";
import {
  ADAPTIVE_MEMORY_KEY,
  buildFall2026AdaptivePayload,
  normalizeAdaptiveMemory,
  recordAdaptiveRound
} from "./fall-2026-adaptive-practice.js?v=20260904a";

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
    ]).then(([drugData, policy]) => ({ drugData, policy }));
  }
  return sourcePromise;
}

export function createFall2026PracticeSeed(quizWeek) {
  requireSupportedWeek(quizWeek);
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return `fall-2026-lab3-week-${quizWeek}-${Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("")}`;
}

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

function setLaunchState(activeWeek, message = "") {
  document.querySelectorAll("[data-launch-week]").forEach((button) => {
    const week = Number(button.dataset.launchWeek);
    button.disabled = activeWeek !== null;
    button.setAttribute("aria-busy", String(activeWeek === week));
    const idleLabel = button.dataset.idleLabel || button.textContent.trim();
    button.dataset.idleLabel = idleLabel;
    button.textContent = activeWeek === week ? `Generating Week ${week}…` : idleLabel;
  });

  const status = document.getElementById("launch-status");
  if (status) {
    status.textContent = message;
    status.classList.toggle("hidden", !message);
  }
}

async function handleLaunch(quizWeek) {
  setLaunchState(quizWeek, `Building a fresh Week ${quizWeek} practice set from the Fall 2026 source data…`);
  try {
    await launchFall2026Lab3Practice(quizWeek);
  } catch (error) {
    console.error("Fall 2026 Lab III launch failed:", error);
    setLaunchState(null, error.message || "Unable to generate this practice set.");
  }
}

function setAdaptiveState(busy, message = "") {
  const button = document.getElementById("adaptive-launch");
  if (button) {
    button.disabled = busy;
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
}

function getSelectedAdaptiveWeek() {
  const select = document.getElementById("adaptive-week");
  const week = Number(select?.value);
  return SUPPORTED_WEEKS.has(week) ? week : null;
}

async function handleAdaptiveLaunch() {
  const targetWeek = getSelectedAdaptiveWeek();
  if (!targetWeek) {
    setAdaptiveState(false, "Choose a week to practice through first.");
    return;
  }

  setAdaptiveState(true, `Reviewing your saved Pharm-let performance through Week ${targetWeek}…`);
  try {
    await launchFall2026Lab3Adaptive(targetWeek);
  } catch (error) {
    console.error("Fall 2026 Lab III adaptive launch failed:", error);
    setAdaptiveState(false, error.message || "Unable to build an adaptive round right now.");
  }
}

function initializePage() {
  document.querySelectorAll("[data-launch-week]").forEach((button) => {
    button.addEventListener("click", () => handleLaunch(Number(button.dataset.launchWeek)));
  });

  document.getElementById("adaptive-launch")?.addEventListener("click", handleAdaptiveLaunch);
  document.getElementById("adaptive-week")?.addEventListener("change", () => setAdaptiveState(false, ""));

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

  const requestedWeek = Number(new URLSearchParams(window.location.search).get("week"));
  if (SUPPORTED_WEEKS.has(requestedWeek)) {
    handleLaunch(requestedWeek);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", initializePage);
}
