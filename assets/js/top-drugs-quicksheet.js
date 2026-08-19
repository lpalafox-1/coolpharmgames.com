const THEME_KEY = "pharmlet.theme";

const quicksheetState = {
  library: null,
  allDrugs: [],
  filteredDrugs: []
};

const FIELD_LABELS = {
  generic: "Generic",
  brand: "Brand",
  class: "Class",
  indication: "FDA Indication",
  moa: "MOA",
  adr: "Top ADR",
  bbw: "Boxed Warning",
  category: "Legacy P1 Category"
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
  [
    ["quicksheet-search", "input"],
    ["quicksheet-field", "change"],
    ["quicksheet-year", "change"],
    ["quicksheet-semester", "change"],
    ["quicksheet-lab", "change"],
    ["quicksheet-week", "change"]
  ].forEach(([id, eventName]) => document.getElementById(id)?.addEventListener(eventName, applyFilters));

  document.getElementById("quicksheet-clear")?.addEventListener("click", () => {
    setControlValue("quicksheet-search", "");
    setControlValue("quicksheet-field", "all");
    setControlValue("quicksheet-year", "all");
    setControlValue("quicksheet-semester", "all");
    setControlValue("quicksheet-lab", "all");
    setControlValue("quicksheet-week", "all");
    applyFilters();
  });
}

async function loadQuicksheet() {
  try {
    const library = await window.TopDrugsReferenceData?.loadReferenceLibrary?.();
    if (!library?.records) throw new Error("Unable to load the Top Drugs reference library.");

    quicksheetState.library = library;
    quicksheetState.allDrugs = [...library.records].sort((a, b) => (
      String(a?.generic || "").localeCompare(String(b?.generic || ""))
      || String(a?.professionalYear || "").localeCompare(String(b?.professionalYear || ""))
      || Number(a?.week || 0) - Number(b?.week || 0)
      || String(a?.sourceRecordId || "").localeCompare(String(b?.sourceRecordId || ""))
    ));

    populateFilterOptions();
    renderLibraryBadge(library);
    hydrateControlsFromUrl();
    applyFilters();
  } catch (error) {
    const grid = document.getElementById("quicksheet-grid");
    if (grid) {
      grid.innerHTML = `<div class="card p-5 text-red-600"><strong>Error:</strong> ${escapeHtml(error.message)}</div>`;
    }
  }
}

function populateFilterOptions() {
  const options = window.TopDrugsReferenceData?.getFilterOptions?.(quicksheetState.allDrugs);
  if (!options) return;

  replaceOptions("quicksheet-year", "All Years", options.professionalYears.map((value) => ({ value, label: value })));
  replaceOptions("quicksheet-semester", "All Semesters", options.semesters.map((value) => ({ value, label: value })));
  replaceOptions("quicksheet-lab", "All Labs", options.labs);
  replaceOptions("quicksheet-week", "All Weeks", options.weeks.map((value) => ({ value: String(value), label: `Week ${value}` })));
}

function replaceOptions(id, allLabel, options) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
  ].join("");
}

function renderLibraryBadge(library) {
  const badge = document.getElementById("top-drugs-version-badge");
  if (!badge) return;
  const semesters = library.summary?.semesters?.join(" • ") || "Loaded curriculum";
  badge.textContent = `${library.summary?.p1 || 0} P1 + ${library.summary?.p2 || 0} P2 records`;
  badge.title = `${library.summary?.total || 0} source records • ${semesters}`;
  badge.classList.remove("hidden");
}

function hydrateControlsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const searchValue = params.get("value") || params.get("q") || "";
  const fieldValue = window.TopDrugsReferenceData?.normalizeSearchField?.(params.get("field") || "all") || "all";
  const labValue = window.TopDrugsReferenceData?.normalizeLabFilter?.(params.get("lab") || "all") || "all";

  setControlValue("quicksheet-search", searchValue);
  setControlValueIfAvailable("quicksheet-field", fieldValue);
  setControlValueIfAvailable("quicksheet-year", params.get("year") || "all");
  setControlValueIfAvailable("quicksheet-semester", params.get("semester") || "all");
  setControlValueIfAvailable("quicksheet-lab", labValue);
  setControlValueIfAvailable("quicksheet-week", params.get("week") || "all");
}

function setControlValue(id, value) {
  const control = document.getElementById(id);
  if (control) control.value = value;
}

function setControlValueIfAvailable(id, value) {
  const control = document.getElementById(id);
  if (!control) return;
  const hasValue = [...control.options].some((option) => option.value === value);
  control.value = hasValue ? value : "all";
}

function currentFilters() {
  return {
    query: document.getElementById("quicksheet-search")?.value || "",
    field: document.getElementById("quicksheet-field")?.value || "all",
    professionalYear: document.getElementById("quicksheet-year")?.value || "all",
    semester: document.getElementById("quicksheet-semester")?.value || "all",
    lab: document.getElementById("quicksheet-lab")?.value || "all",
    week: document.getElementById("quicksheet-week")?.value || "all"
  };
}

function applyFilters() {
  const filters = currentFilters();
  quicksheetState.filteredDrugs = window.TopDrugsReferenceData?.filterRecords?.(quicksheetState.allDrugs, filters) || [];
  syncUrl(filters);
  renderQuicksheet(filters);
}

function syncUrl(filters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("value", filters.query);
  if (filters.field !== "all") params.set("field", filters.field);
  if (filters.professionalYear !== "all") params.set("year", filters.professionalYear);
  if (filters.semester !== "all") params.set("semester", filters.semester);
  if (filters.lab !== "all") params.set("lab", filters.lab);
  if (filters.week !== "all") params.set("week", filters.week);

  const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
  window.history.replaceState({}, "", next);
}

function renderQuicksheet(filters) {
  const countEl = document.getElementById("quicksheet-count");
  const activeFilterEl = document.getElementById("quicksheet-active-filter");
  const grid = document.getElementById("quicksheet-grid");
  if (!countEl || !grid || !activeFilterEl) return;

  countEl.textContent = `Showing ${quicksheetState.filteredDrugs.length} of ${quicksheetState.allDrugs.length} source records.`;

  const activeBits = [];
  if (filters.query) activeBits.push(`Search: ${filters.query}`);
  if (filters.field !== "all") activeBits.push(`Field: ${FIELD_LABELS[filters.field] || filters.field}`);
  if (filters.professionalYear !== "all") activeBits.push(`Year: ${filters.professionalYear}`);
  if (filters.semester !== "all") activeBits.push(`Semester: ${filters.semester}`);
  if (filters.lab !== "all") activeBits.push(`Lab: ${romanNumeral(filters.lab)}`);
  if (filters.week !== "all") activeBits.push(`Week: ${filters.week}`);
  activeFilterEl.textContent = activeBits.length ? `Active filters: ${activeBits.join(" • ")}` : "Active filters: All source records";

  if (!quicksheetState.filteredDrugs.length) {
    grid.innerHTML = `<div class="card p-5 text-sm opacity-75">No source records matched those filters. Try a generic, brand, class, indication, ADR, or boxed-warning term.</div>`;
    return;
  }

  grid.innerHTML = quicksheetState.filteredDrugs.map(renderDrugCard).join("");
}

function renderDrugCard(drug) {
  const generic = escapeHtml(drug?.generic || "Unknown");
  const brands = drug?.brands?.length ? drug.brands.map(escapeHtml).join(" <span aria-hidden=\"true\">•</span> ") : "Not provided in this source";
  const sourceLabel = drug?.sourceType === "official-p2-fall"
    ? "Official 2026–27 P2 Top Drug List"
    : "Legacy Pharm-let P1 source";
  const sourceDetail = [drug?.sourceRecordId, drug?.sourcePage ? `page ${drug.sourcePage}` : ""].filter(Boolean).join(" • ");

  return `
    <article class="card p-5 flex min-w-0 flex-col gap-4 overflow-hidden" data-record-id="${escapeHtml(drug?.id || "")}" data-source-type="${escapeHtml(drug?.sourceType || "")}">
      <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <div class="break-words text-2xl font-black">${generic}</div>
          <div class="mt-1 break-words text-sm leading-relaxed opacity-80">Brand${drug?.brands?.length === 1 ? "" : "s"}: <span class="font-semibold">${brands}</span></div>
        </div>
        <div class="flex flex-wrap gap-2 sm:max-w-[46%] sm:justify-end">
          ${renderPill(drug?.professionalYear)}
          ${renderPill(drug?.semester)}
          ${renderPill(drug?.lab)}
          ${renderPill(drug?.week ? `Week ${drug.week}` : "")}
        </div>
      </div>
      <div class="grid min-w-0 gap-4">
        ${renderTextSection("Drug Class", drug?.drugClass)}
        ${renderListSection("FDA Indications", drug?.indications)}
        ${renderTextSection("Legacy Category", drug?.legacyCategory)}
        ${renderTextSection("Mechanism of Action", drug?.moa)}
        ${renderListSection("Top ADRs", drug?.adverseReactions)}
        ${renderTextSection("Boxed Warning", drug?.boxWarning)}
      </div>
      <div class="mt-auto border-t border-[var(--ring)] pt-3 text-[11px] leading-relaxed opacity-60">
        <div class="font-bold">${escapeHtml(sourceLabel)}</div>
        <div class="break-all">${escapeHtml(sourceDetail)}</div>
      </div>
    </article>
  `;
}

function renderPill(value) {
  if (!value) return "";
  return `<span class="rounded-full border border-[var(--ring)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]">${escapeHtml(value)}</span>`;
}

function renderTextSection(label, value) {
  if (!String(value || "").trim()) return "";
  return `
    <section class="min-w-0">
      <h2 class="text-xs font-black uppercase tracking-[0.16em] opacity-60">${escapeHtml(label)}</h2>
      <p class="mt-1 break-words text-sm leading-relaxed">${escapeHtml(value)}</p>
    </section>
  `;
}

function renderListSection(label, values) {
  if (!Array.isArray(values) || !values.length) return "";
  return `
    <section class="min-w-0">
      <h2 class="text-xs font-black uppercase tracking-[0.16em] opacity-60">${escapeHtml(label)}</h2>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        ${values.map((value) => `<li class="break-words">${escapeHtml(value)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function romanNumeral(value) {
  return ({ 1: "I", 2: "II", 3: "III", 4: "IV" })[Number(value)] || value;
}

function escapeHtml(value) {
  return window.TopDrugsData?.escapeHtml?.(value) || String(value || "");
}
