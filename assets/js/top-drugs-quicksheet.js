const THEME_KEY = "pharmlet.theme";

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
  document.getElementById("quicksheet-field")?.addEventListener("change", applyFilters);
  document.getElementById("quicksheet-lab")?.addEventListener("change", applyFilters);
  document.getElementById("quicksheet-clear")?.addEventListener("click", () => {
    const search = document.getElementById("quicksheet-search");
    const field = document.getElementById("quicksheet-field");
    const lab = document.getElementById("quicksheet-lab");
    if (search) search.value = "";
    if (field) field.value = "all";
    if (lab) lab.value = "all";
    applyFilters();
  });
}

async function loadQuicksheet() {
  try {
    const result = await window.TopDrugsData?.loadPool?.();
    if (!result?.data) {
      throw new Error("Unable to load the Top Drugs pool.");
    }

    quicksheetState.allDrugs = [...result.data].sort((a, b) => String(a?.generic || "").localeCompare(String(b?.generic || "")));
    if (result.version) {
      window.TopDrugsData.renderVersionBadge("top-drugs-version-badge", result.version);
    }

    hydrateControlsFromUrl();
    applyFilters();
  } catch (error) {
    const grid = document.getElementById("quicksheet-grid");
    if (grid) {
      grid.innerHTML = `<div class="card p-5 text-red-600"><strong>Error:</strong> ${escapeHtml(error.message)}</div>`;
    }
  }
}

function hydrateControlsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const searchValue = params.get("value") || params.get("q") || "";
  const fieldValue = params.get("field") || "all";
  const labValue = params.get("lab") || "all";

  const search = document.getElementById("quicksheet-search");
  const field = document.getElementById("quicksheet-field");
  const lab = document.getElementById("quicksheet-lab");

  if (search) search.value = searchValue;
  if (field && ["all", "generic", "brand", "class", "category", "moa"].includes(fieldValue)) field.value = fieldValue;
  if (lab && ["all", "1", "2"].includes(labValue)) lab.value = labValue;
}

function applyFilters() {
  const rawQuery = document.getElementById("quicksheet-search")?.value || "";
  const query = normalizeText(rawQuery);
  const fieldValue = document.getElementById("quicksheet-field")?.value || "all";
  const labValue = document.getElementById("quicksheet-lab")?.value || "all";

  quicksheetState.filteredDrugs = quicksheetState.allDrugs.filter((drug) => {
    const fieldMap = {
      generic: drug?.generic,
      brand: drug?.brand,
      class: drug?.class,
      category: drug?.category,
      moa: drug?.moa
    };

    const matchesQuery = !query || (
      fieldValue === "all"
        ? Object.values(fieldMap).concat([`lab ${drug?.metadata?.lab || ""}`, `week ${drug?.metadata?.week || ""}`])
          .some((field) => normalizeText(field).includes(query))
        : normalizeText(fieldMap[fieldValue]).includes(query)
    );

    const matchesLab = labValue === "all" || String(drug?.metadata?.lab || "") === labValue;
    return matchesQuery && matchesLab;
  });

  syncUrl(rawQuery, fieldValue, labValue);
  renderQuicksheet(rawQuery, fieldValue, labValue);
}

function syncUrl(query, fieldValue, labValue) {
  const params = new URLSearchParams();
  if (query) params.set("value", query);
  if (fieldValue !== "all") params.set("field", fieldValue);
  if (labValue !== "all") params.set("lab", labValue);

  const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
  window.history.replaceState({}, "", next);
}

function renderQuicksheet(query, fieldValue, labValue) {
  const countEl = document.getElementById("quicksheet-count");
  const activeFilterEl = document.getElementById("quicksheet-active-filter");
  const grid = document.getElementById("quicksheet-grid");
  if (!countEl || !grid || !activeFilterEl) return;

  countEl.textContent = `Showing ${quicksheetState.filteredDrugs.length} of ${quicksheetState.allDrugs.length} Top Drugs entries.`;

  const activeBits = [];
  if (query) activeBits.push(`Search: ${query}`);
  if (fieldValue !== "all") activeBits.push(`Field: ${fieldValue.toUpperCase()}`);
  if (labValue !== "all") activeBits.push(`Lab: ${labValue}`);
  activeFilterEl.textContent = activeBits.length ? `Active filter: ${activeBits.join(" • ")}` : "Active filter: All Top Drugs entries";

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
  return window.TopDrugsData?.normalizeText?.(value) || String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeHtml(value) {
  return window.TopDrugsData?.escapeHtml?.(value) || String(value || "");
}
