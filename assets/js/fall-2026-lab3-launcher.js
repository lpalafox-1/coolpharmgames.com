import {
  WEEK_1_PRACTICE_NOTE,
  generateFall2026Quiz
} from "./fall-2026-quiz-generator.js?v=20260819b";

const CUSTOM_QUIZ_KEY = "pharmlet.custom-quiz";
const SUPPORTED_WEEKS = new Set([1, 2, 3]);
const TIMER_SECONDS = 10 * 60;
const DRUG_DATA_URL = "assets/data/fall-2026-p2-top-drugs.json";
const POLICY_URL = "assets/data/fall-2026-lab3-quiz-policy.json";

let sourcePromise;

function requireSupportedWeek(quizWeek) {
  if (!SUPPORTED_WEEKS.has(quizWeek)) {
    throw new Error("Fall 2026 Lab III practice is currently available for Weeks 1-3.");
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

function initializePage() {
  document.querySelectorAll("[data-launch-week]").forEach((button) => {
    button.addEventListener("click", () => handleLaunch(Number(button.dataset.launchWeek)));
  });

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
