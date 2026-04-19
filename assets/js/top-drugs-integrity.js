const THEME_KEY = "pharmlet.theme";
const TYPO_RISK_PATTERNS = [
  { label: "Horomone Replacement", pattern: /horomone replacement/i },
  { label: "degredation", pattern: /degredation/i },
  { label: "vasoconstricton", pattern: /vasoconstricton/i },
  { label: "Agent Alpha-1 Antagonist", pattern: /agent alpha-1 antagonist/i },
  { label: "Beta-Blocker", pattern: /beta-blocker/i },
  { label: "Rapid-acting insulin", pattern: /rapid-acting insulin/i }
];

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await renderIntegrityPage();
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

async function renderIntegrityPage() {
  const [poolResult, auditResult] = await Promise.allSettled([
    window.TopDrugsData?.loadPool?.(),
    window.TopDrugsData?.loadAuditStatus?.()
  ]);

  if (poolResult.status !== "fulfilled" || !poolResult.value?.data) {
    renderFatalPoolError(poolResult.reason);
    return;
  }

  const { data, version } = poolResult.value;
  window.TopDrugsData.renderVersionBadge("top-drugs-version-badge", version);

  const duplicates = findDuplicateGroups(data);
  const typoFlags = findTypoRiskFlags(data);
  const classDrift = findLabelDriftGroups(data, "class");
  const categoryDrift = findLabelDriftGroups(data, "category");
  const audit = auditResult.status === "fulfilled" ? auditResult.value : null;

  document.getElementById("integrity-entry-count").textContent = String(data.length);
  document.getElementById("integrity-duplicate-count").textContent = String(duplicates.length);
  document.getElementById("integrity-typo-count").textContent = String(typoFlags.length);
  document.getElementById("integrity-drift-count").textContent = String(classDrift.length + categoryDrift.length);
  document.getElementById("integrity-audit-status").textContent = audit?.statusLabel || "Missing";

  renderDuplicateGroups(duplicates);
  renderTypoFlags(typoFlags);
  renderDriftGroups("integrity-class-drift", classDrift, "No class label drift clusters are currently flagged.");
  renderDriftGroups("integrity-category-drift", categoryDrift, "No category label drift clusters are currently flagged.");
  renderAuditStatus(audit);
}

function renderFatalPoolError(error) {
  const message = error?.message || "Unable to load the Top Drugs pool.";
  const targets = [
    "integrity-duplicates",
    "integrity-typos",
    "integrity-class-drift",
    "integrity-category-drift",
    "integrity-pdf-audit"
  ];
  targets.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class="rounded-2xl border border-red-300 px-4 py-4 text-red-600"><strong>Error:</strong> ${escapeHtml(message)}</div>`;
  });
}

function findDuplicateGroups(drugs) {
  const genericGroups = groupByNormalizedValue(drugs, (drug) => drug?.generic);
  const brandGroups = groupByNormalizedValue(
    drugs.flatMap((drug) => splitValues(drug?.brand).map((brand) => ({ brand, generic: drug?.generic }))),
    (entry) => entry?.brand
  );

  return [
    ...buildDuplicateEntries(genericGroups, "Generic"),
    ...buildDuplicateEntries(brandGroups, "Brand")
  ].sort((a, b) => a.type.localeCompare(b.type) || a.key.localeCompare(b.key));
}

function groupByNormalizedValue(items, selector) {
  const groups = new Map();
  items.forEach((item) => {
    const raw = String(selector(item) || "").trim();
    const normalized = normalizeText(raw);
    if (!normalized) return;
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized).push(item);
  });
  return groups;
}

function buildDuplicateEntries(groups, type) {
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({
      type,
      key,
      entries
    }));
}

function findTypoRiskFlags(drugs) {
  const flags = [];
  drugs.forEach((drug) => {
    const fields = [
      { label: "Generic", value: drug?.generic || "" },
      { label: "Brand", value: drug?.brand || "" },
      { label: "Class", value: drug?.class || "" },
      { label: "Category", value: drug?.category || "" },
      { label: "MOA", value: drug?.moa || "" }
    ];

    fields.forEach((field) => {
      TYPO_RISK_PATTERNS.forEach((risk) => {
        if (risk.pattern.test(field.value)) {
          flags.push({
            generic: drug?.generic || "Unknown",
            field: field.label,
            phrase: risk.label,
            value: field.value
          });
        }
      });

      if (/\s{2,}/.test(field.value || "")) {
        flags.push({
          generic: drug?.generic || "Unknown",
          field: field.label,
          phrase: "Double spaces",
          value: field.value
        });
      }
    });
  });

  return flags;
}

function findLabelDriftGroups(drugs, field) {
  const groups = new Map();

  drugs.forEach((drug) => {
    const rawValue = String(drug?.[field] || "").trim();
    if (!rawValue) return;

    const normalizedBase = normalizeDriftBase(rawValue);
    if (!normalizedBase) return;

    if (!groups.has(normalizedBase)) groups.set(normalizedBase, new Set());
    groups.get(normalizedBase).add(rawValue);
  });

  return [...groups.entries()]
    .map(([base, values]) => ({ base, values: [...values].sort() }))
    .filter((entry) => entry.values.length > 1)
    .sort((a, b) => b.values.length - a.values.length || a.base.localeCompare(b.base));
}

function normalizeDriftBase(value) {
  return normalizeText(value)
    .replace(/\bagent\b/g, " ")
    .replace(/\btherapy\b/g, " ")
    .replace(/\bmedication\b/g, " ")
    .replace(/\bdrug\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderDuplicateGroups(duplicates) {
  const container = document.getElementById("integrity-duplicates");
  if (!container) return;

  if (!duplicates.length) {
    container.innerHTML = `<p class="text-sm opacity-70">No duplicate generic or brand groups are currently flagged.</p>`;
    return;
  }

  container.innerHTML = duplicates.map((group) => `
    <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">${escapeHtml(group.type)}</div>
          <div class="mt-1 font-semibold">${escapeHtml(toDisplayTitle(group.key))}</div>
        </div>
        <div class="text-sm opacity-70">${group.entries.length} entries</div>
      </div>
      <div class="mt-3 text-sm opacity-75">
        ${group.entries.map((entry) => {
          if (group.type === "Brand") {
            return escapeHtml(`${entry?.brand || "Unknown"} → ${entry?.generic || "Unknown"}`);
          }
          return escapeHtml(entry?.generic || "Unknown");
        }).join(" • ")}
      </div>
    </div>
  `).join("");
}

function renderTypoFlags(flags) {
  const container = document.getElementById("integrity-typos");
  if (!container) return;

  if (!flags.length) {
    container.innerHTML = `<p class="text-sm opacity-70">No typo-risk phrases are currently flagged by the integrity scan.</p>`;
    return;
  }

  container.innerHTML = flags.map((flag) => `
    <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="font-semibold">${escapeHtml(flag.generic)}</div>
          <div class="mt-1 text-sm opacity-70">${escapeHtml(flag.field)} • ${escapeHtml(flag.phrase)}</div>
        </div>
      </div>
      <div class="mt-3 text-sm">${escapeHtml(flag.value)}</div>
    </div>
  `).join("");
}

function renderDriftGroups(containerId, groups, emptyMessage) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!groups.length) {
    container.innerHTML = `<p class="text-sm opacity-70">${emptyMessage}</p>`;
    return;
  }

  container.innerHTML = groups.map((group) => `
    <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
      <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">${escapeHtml(group.base)}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        ${group.values.map((value) => `<span class="rounded-full border border-[var(--ring)] px-3 py-1 text-xs font-semibold">${escapeHtml(value)}</span>`).join("")}
      </div>
    </div>
  `).join("");
}

function renderAuditStatus(audit) {
  const badge = document.getElementById("pdf-audit-badge");
  const container = document.getElementById("integrity-pdf-audit");
  if (!container) return;

  if (!audit) {
    if (badge) {
      badge.textContent = "PDF Audit Missing";
      badge.classList.remove("hidden");
    }
    container.innerHTML = `<p class="text-sm opacity-70">No saved PDF audit snapshot was found. Re-run the audit script to refresh this section.</p>`;
    return;
  }

  if (badge) {
    badge.textContent = audit.statusBadge || "PDF Audit Ready";
    badge.title = audit.auditedAt || "";
    badge.classList.remove("hidden");
  }

  container.innerHTML = `
    <div class="grid gap-4 md:grid-cols-4">
      <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
        <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Audited</div>
        <div class="mt-2 font-semibold">${escapeHtml(formatAuditDate(audit.auditedAt))}</div>
      </div>
      <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
        <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Missing Generics</div>
        <div class="mt-2 text-2xl font-black text-[var(--accent)]">${Number(audit.missingGenericsCount || 0)}</div>
      </div>
      <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
        <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Missing Brands</div>
        <div class="mt-2 text-2xl font-black text-[var(--accent)]">${Number(audit.missingBrandAliasesCount || 0)}</div>
      </div>
      <div class="rounded-2xl border border-[var(--ring)] px-4 py-4">
        <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">Cleanup Flags</div>
        <div class="mt-2 text-2xl font-black text-[var(--accent)]">${Number(audit.flaggedEntriesCount || 0)}</div>
      </div>
    </div>
    <div class="rounded-2xl border border-[var(--ring)] px-5 py-4">
      <div class="font-semibold">${escapeHtml(audit.statusSummary || "PDF audit snapshot loaded.")}</div>
      <div class="mt-2 text-sm opacity-75">Source docs: ${escapeHtml(audit?.sourceDocuments?.lab1 || "Lab 1 PDF")} • ${escapeHtml(audit?.sourceDocuments?.lab2 || "Lab 2 PDF")}</div>
      ${renderAuditList("Missing generics", audit.missingGenerics, (item) => `Lab ${item.lab}: ${item.generic}`)}
      ${renderAuditList("Missing brand aliases", audit.missingBrandAliases, (item) => `Lab ${item.lab}: ${item.generic} → ${item.brand}`)}
      ${renderAuditList("Flagged cleanup entries", audit.flaggedEntries, (item) => `Lab ${item.lab}: ${item.generic}`)}
    </div>
  `;
}

function renderAuditList(label, items, formatItem) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <div class="mt-4">
      <div class="text-xs font-black uppercase tracking-[0.18em] opacity-60">${escapeHtml(label)}</div>
      <div class="mt-2 flex flex-wrap gap-2">
        ${items.slice(0, 8).map((item) => `<span class="rounded-full border border-[var(--ring)] px-3 py-1 text-xs">${escapeHtml(formatItem(item))}</span>`).join("")}
      </div>
    </div>
  `;
}

function splitValues(value) {
  return String(value || "")
    .split(/[;,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatAuditDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toDisplayTitle(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeText(value) {
  return window.TopDrugsData?.normalizeText?.(value) || String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeHtml(value) {
  return window.TopDrugsData?.escapeHtml?.(value) || String(value || "");
}
