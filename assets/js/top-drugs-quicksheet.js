const THEME_KEY = "pharmlet.theme";
const QUICKSHEET_POOL_PATH = "assets/data/master_pool.json";

const quicksheetState = {
  allDrugs: [],
  filteredDrugs: []
};

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  wireControls();
  await loadQuicksheet();
});

function initTheme() {
  const toggle = document.getElementById("theme-toggle");
  const label = document.getElementById("theme-label");
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const start = saved || (prefersDark ? "dark" : "light");

  document.documentElement.classList.toggle("dark", start === "dark");
  if (label) label.textContent = start === "dark" ? "Light" : "Dark";

  toggle?.addEventListener("click", () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem(THEME_KEY, next);
    if (label) label.textContent = next === "dark" ? "Light" : "Dark";
  });
}

function wireControls() {
  document.getElementById("quicksheet-search")?.addEventListener("input", applyFilters);
  document.getElementById("quicksheet-lab")?.addEventListener("change", applyFilters);
  document.getElementById("quicksheet-clear")?.addEventListener("click", () => {
    const search = document.getElementById("quicksheet-search");
    const lab = document.getElementById("quicksheet-lab");
    if (search) search.value = "";
    if (lab) lab.value = "all";
    applyFilters();
  });
}

async function loadQuicksheet() {
  try {
    const response = await fetch(QUICKSHEET_POOL_PATH);
    if (!response.ok) {
      throw new Error(`Unable to load ${QUICKSHEET_POOL_PATH}`);
    }

    const data = await response.json();
    quicksheetState.allDrugs = Array.isArray(data)
      ? [...data].sort((a, b) => String(a?.generic || "").localeCompare(String(b?.generic || "")))
      : [];
    applyFilters();
  } catch (error) {
    const grid = document.getElementById("quicksheet-grid");
    if (grid) {
      grid.innerHTML = `<div class="card p-5 text-red-600"><strong>Error:</strong> ${escapeHtml(error.message)}</div>`;
    }
  }
}

function applyFilters() {
  const query = normalizeText(document.getElementById("quicksheet-search")?.value || "");
  const labValue = document.getElementById("quicksheet-lab")?.value || "all";

  quicksheetState.filteredDrugs = quicksheetState.allDrugs.filter((drug) => {
    const matchesQuery = !query || [
      drug?.generic,
      drug?.brand,
      drug?.class,
      drug?.category,
      drug?.moa,
      `lab ${drug?.metadata?.lab || ""}`,
      `week ${drug?.metadata?.week || ""}`
    ].some((field) => normalizeText(field).includes(query));

    const matchesLab = labValue === "all" || String(drug?.metadata?.lab || "") === labValue;
    return matchesQuery && matchesLab;
  });

  renderQuicksheet();
}

function renderQuicksheet() {
  const countEl = document.getElementById("quicksheet-count");
  const grid = document.getElementById("quicksheet-grid");
  if (!countEl || !grid) return;

  countEl.textContent = `Showing ${quicksheetState.filteredDrugs.length} of ${quicksheetState.allDrugs.length} Top Drugs entries.`;

  if (!quicksheetState.filteredDrugs.length) {
    grid.innerHTML = `<div class="card p-5 text-sm opacity-75">No drugs matched that search. Try a generic name, a brand, or a class/category keyword.</div>`;
    return;
  }

  grid.innerHTML = quicksheetState.filteredDrugs.map((drug) => {
    const generic = escapeHtml(drug?.generic || "Unknown");
    const brand = escapeHtml(drug?.brand || "N/A");
    const drugClass = escapeHtml(drug?.class || "N/A");
    const category = escapeHtml(drug?.category || "N/A");
    const moa = escapeHtml(drug?.moa || "N/A");
    const lab = escapeHtml(drug?.metadata?.lab || "—");
    const week = escapeHtml(drug?.metadata?.week || "—");

    return `
      <article class="card p-5 flex flex-col gap-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-2xl font-black">${generic}</div>
            <div class="mt-1 text-sm opacity-75">Brand: <span class="font-semibold">${brand}</span></div>
          </div>
          <div class="text-right text-xs font-black uppercase tracking-[0.16em] opacity-60">
            <div>Lab ${lab}</div>
            <div class="mt-1">Week ${week}</div>
          </div>
        </div>
        <div>
          <div class="text-xs font-black uppercase tracking-[0.16em] opacity-60">Class</div>
          <div class="mt-1 text-sm leading-relaxed">${drugClass}</div>
        </div>
        <div>
          <div class="text-xs font-black uppercase tracking-[0.16em] opacity-60">Category</div>
          <div class="mt-1 text-sm leading-relaxed">${category}</div>
        </div>
        <div>
          <div class="text-xs font-black uppercase tracking-[0.16em] opacity-60">MOA</div>
          <div class="mt-1 text-sm leading-relaxed">${moa}</div>
        </div>
      </article>
    `;
  }).join("");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
