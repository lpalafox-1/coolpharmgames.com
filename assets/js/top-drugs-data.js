const TOP_DRUGS_POOL_PATH = "assets/data/master_pool.json";
const TOP_DRUGS_PDF_AUDIT_STATUS_PATH = "assets/data/top_drugs_pdf_audit_status.json";

window.TopDrugsData = (() => {
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

  function stableSerialize(value) {
    if (Array.isArray(value)) {
      return `[${value.map(stableSerialize).join(",")}]`;
    }

    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
    }

    return JSON.stringify(value ?? null);
  }

  function hashString(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function computePoolVersion(pool) {
    const normalizedPool = Array.isArray(pool) ? pool.map((entry) => ({
      generic: entry?.generic || "",
      brand: entry?.brand || "",
      class: entry?.class || "",
      category: entry?.category || "",
      moa: entry?.moa || "",
      metadata: {
        lab: Number(entry?.metadata?.lab || 0),
        week: Number(entry?.metadata?.week || 0),
        is_new: Boolean(entry?.metadata?.is_new)
      }
    })) : [];

    const hash = hashString(stableSerialize(normalizedPool));
    const count = normalizedPool.length;
    const version = `v${count}-${hash.slice(0, 8)}`;

    return {
      count,
      hash,
      version,
      badgeText: `Top Drugs Data ${version}`,
      title: `${count} entries from ${TOP_DRUGS_POOL_PATH}`
    };
  }

  async function loadPool() {
    const response = await fetch(TOP_DRUGS_POOL_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load ${TOP_DRUGS_POOL_PATH}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Top Drugs pool is not an array.");
    }

    return {
      data,
      version: computePoolVersion(data)
    };
  }

  async function loadAuditStatus() {
    const response = await fetch(TOP_DRUGS_PDF_AUDIT_STATUS_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load ${TOP_DRUGS_PDF_AUDIT_STATUS_PATH}`);
    }

    return response.json();
  }

  function renderVersionBadge(target, versionInfo, prefix = "") {
    const element = typeof target === "string" ? document.getElementById(target) : target;
    if (!element || !versionInfo) return;

    element.textContent = prefix ? `${prefix} ${versionInfo.version}` : versionInfo.badgeText;
    element.title = versionInfo.title;
    element.classList.remove("hidden");
  }

  return {
    TOP_DRUGS_POOL_PATH,
    TOP_DRUGS_PDF_AUDIT_STATUS_PATH,
    normalizeText,
    escapeHtml,
    computePoolVersion,
    loadPool,
    loadAuditStatus,
    renderVersionBadge
  };
})();
