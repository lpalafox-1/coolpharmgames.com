// assets/js/favorites.js
// Shared quiz-favorites storage, controls, and Favorites page rendering.

(function (global) {
  "use strict";

  const FAVORITES_KEY = "pharmlet.favorites";

  function getCatalog() {
    return global.PharmletQuizCatalog || null;
  }

  function normalizeId(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeIds(value) {
    if (!Array.isArray(value)) return [];

    const seen = new Set();
    const normalized = [];
    for (const item of value) {
      const id = normalizeId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
    }
    return normalized;
  }

  function getAll() {
    try {
      const raw = global.localStorage?.getItem(FAVORITES_KEY);
      return normalizeIds(JSON.parse(raw || "[]"));
    } catch {
      return [];
    }
  }

  function writeAll(ids) {
    try {
      global.localStorage?.setItem(FAVORITES_KEY, JSON.stringify(normalizeIds(ids)));
      return true;
    } catch {
      return false;
    }
  }

  function has(id) {
    const normalizedId = normalizeId(id);
    return Boolean(normalizedId && getAll().includes(normalizedId));
  }

  function add(id) {
    const normalizedId = normalizeId(id);
    if (!normalizedId) return false;

    const favorites = getAll();
    if (favorites.includes(normalizedId)) {
      syncControls(normalizedId);
      return true;
    }

    const saved = writeAll([...favorites, normalizedId]);
    if (saved) syncControls(normalizedId);
    return saved;
  }

  function remove(id) {
    const normalizedId = normalizeId(id);
    if (!normalizedId) return false;

    const saved = writeAll(getAll().filter((favoriteId) => favoriteId !== normalizedId));
    if (saved) syncControls(normalizedId);
    return saved;
  }

  function clear() {
    const saved = writeAll([]);
    if (saved) syncControls();
    return saved;
  }

  function toggle(id) {
    return has(id) ? remove(id) : add(id);
  }

  function getControlTitle(button) {
    return button?.dataset?.favoriteTitle || button?.dataset?.favoriteId || "quiz";
  }

  function updateControl(button) {
    const id = normalizeId(button?.dataset?.favoriteId);
    if (!id) return;

    const title = getControlTitle(button);
    const isFavorite = has(id);
    button.textContent = isFavorite ? "★" : "☆";
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute(
      "aria-label",
      `${isFavorite ? "Remove" : "Add"} ${title} ${isFavorite ? "from" : "to"} favorites`
    );
    button.title = isFavorite ? "Remove from favorites" : "Add to favorites";
  }

  function syncControls(id) {
    const normalizedId = normalizeId(id);
    const controls = global.document?.querySelectorAll?.("[data-favorite-id]") || [];
    for (const button of controls) {
      if (!normalizedId || normalizeId(button.dataset?.favoriteId) === normalizedId) {
        updateControl(button);
      }
    }
  }

  function bindToggleButton(button, { id, title } = {}) {
    const normalizedId = normalizeId(id || button?.dataset?.favoriteId);
    if (!button || !normalizedId) return null;

    button.type = "button";
    button.dataset.favoriteId = normalizedId;
    button.dataset.favoriteTitle = String(title || button.dataset.favoriteTitle || normalizedId).trim();
    button.classList?.add("favorite-toggle");

    if (button.dataset.favoriteBound !== "true") {
      button.dataset.favoriteBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(normalizedId);
      });
    }

    updateControl(button);
    return button;
  }

  function createToggleButton({ id, title, className = "" } = {}) {
    const button = global.document?.createElement?.("button");
    if (!button) return null;
    button.className = `favorite-toggle ${className}`.trim();
    return bindToggleButton(button, { id, title });
  }

  function resolveFavoriteDescriptor(id) {
    const normalizedId = normalizeId(id);
    if (!normalizedId) return null;

    const catalog = getCatalog();
    const entry = catalog?.getEntry?.(normalizedId);
    if (entry) {
      return {
        id: normalizedId,
        title: entry.title || normalizedId,
        category: entry.favoriteCategory || "other",
        modes: Array.isArray(entry.modes) && entry.modes.length ? [...entry.modes] : ["easy"],
        dynamic: false
      };
    }

    let category = "";
    let match = normalizedId.match(/^lab-(1|2)-week-(\d+)$/);
    if (match) {
      const week = Number(match[2]);
      const maxWeek = match[1] === "1" ? 5 : 11;
      if (week < 1 || week > maxWeek) return null;
      category = "lab";
    } else {
      match = normalizedId.match(/^lab-(1|2)-weeks-(\d+)-(\d+)$/);
      if (!match) return null;
      const startWeek = Number(match[2]);
      const endWeek = Number(match[3]);
      const maxWeek = match[1] === "1" ? 5 : 11;
      if (startWeek < 1 || startWeek > endWeek || endWeek > maxWeek) return null;
      category = "cumulative";
    }

    const title = catalog?.buildDynamicQuizLabel?.(normalizedId);
    if (!title || title === normalizedId) return null;

    return {
      id: normalizedId,
      title,
      category,
      modes: [],
      dynamic: true
    };
  }

  function resolveLocationFavorite(locationLike = global.location) {
    const params = new URLSearchParams(locationLike?.search || "");
    const catalogId = normalizeId(params.get("id"));
    if (catalogId) return resolveFavoriteDescriptor(catalogId);

    const lab = /^\d+$/.test(params.get("lab") || "") ? params.get("lab") : "2";
    const week = params.get("week");
    if (/^\d+$/.test(week || "")) return resolveFavoriteDescriptor(`lab-${lab}-week-${week}`);

    const weeks = params.get("weeks");
    if (/^\d+-\d+$/.test(weeks || "")) return resolveFavoriteDescriptor(`lab-${lab}-weeks-${weeks}`);

    return null;
  }

  function getLaunchActions(descriptor) {
    const catalog = getCatalog();
    if (!descriptor || !catalog?.buildQuizHref) return [];

    if (descriptor.dynamic) {
      return [{ label: "Open Quiz", href: catalog.buildQuizHref(descriptor.id) }];
    }

    return descriptor.modes.map((mode) => ({
      label: catalog.getModeLabel?.(mode) || mode,
      href: catalog.buildQuizHref(descriptor.id, mode)
    }));
  }

  function projectFavorites(ids = getAll()) {
    const normalizedIds = normalizeIds(ids);
    const items = [];
    const unavailableIds = [];

    for (const id of normalizedIds) {
      const descriptor = resolveFavoriteDescriptor(id);
      if (descriptor) items.push(descriptor);
      else unavailableIds.push(id);
    }

    return { items, unavailableIds };
  }

  function sortFavorites(items, sortBy = "recent") {
    const sorted = [...items];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "category") {
      sorted.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
    } else {
      sorted.reverse();
    }
    return sorted;
  }

  function filterFavorites(items, category = "") {
    return category ? items.filter((item) => item.category === category) : [...items];
  }

  function createEmptyState({ filtered = false, unavailableCount = 0 } = {}) {
    const wrap = global.document.createElement("div");
    wrap.className = "col-span-2 text-center py-12";
    wrap.style.color = "var(--muted)";

    const heading = global.document.createElement("p");
    heading.className = "text-lg font-semibold";
    heading.textContent = filtered ? "No quizzes match this filter." : "No favorites yet!";
    wrap.appendChild(heading);

    if (!filtered) {
      const instructions = global.document.createElement("p");
      instructions.className = "mt-2";
      instructions.textContent = "Use the ☆ button beside a quiz in Quiz Library, or in a quiz header, to save it here.";
      wrap.appendChild(instructions);

      const browse = global.document.createElement("a");
      browse.href = "custom-quiz.html";
      browse.className = "btn btn-blue mt-4 inline-flex items-center justify-center";
      browse.textContent = "Browse Quiz Library";
      wrap.appendChild(browse);
    }

    if (unavailableCount > 0) {
      const note = global.document.createElement("p");
      note.className = "mt-3 text-sm";
      note.textContent = `${unavailableCount} saved ${unavailableCount === 1 ? "quiz is" : "quizzes are"} no longer available and ${unavailableCount === 1 ? "was" : "were"} skipped.`;
      wrap.appendChild(note);
    }

    return wrap;
  }

  function createUnavailableNote(count) {
    if (!count) return null;
    const note = global.document.createElement("p");
    note.className = "col-span-2 text-sm rounded-xl border border-[var(--ring)] px-4 py-3";
    note.style.color = "var(--muted)";
    note.textContent = `${count} unavailable saved ${count === 1 ? "quiz was" : "quizzes were"} skipped. Your stored list was not changed.`;
    return note;
  }

  function createFavoriteCard(quiz) {
    const catalog = getCatalog();
    const card = global.document.createElement("article");
    card.className = "favorite-item";

    const head = global.document.createElement("div");
    head.className = "flex items-start justify-between gap-3 mb-3";

    const details = global.document.createElement("div");
    details.className = "min-w-0";

    const heading = global.document.createElement("h3");
    heading.className = "font-semibold text-lg";
    heading.textContent = quiz.title;

    const category = global.document.createElement("span");
    category.className = "text-sm";
    category.style.color = "var(--muted)";
    category.textContent = catalog?.getFavoriteCategoryLabel?.(quiz.category) || "Other";

    details.append(heading, category);

    const removeButton = createToggleButton({ id: quiz.id, title: quiz.title, className: "remove-favorite" });
    removeButton.addEventListener("click", loadFavoritesPage);
    head.append(details, removeButton);

    const actions = global.document.createElement("div");
    actions.className = "favorite-actions";
    for (const action of getLaunchActions(quiz)) {
      const link = global.document.createElement("a");
      link.href = action.href;
      link.className = "btn btn-blue flex-1 text-center inline-flex items-center justify-center";
      link.textContent = action.label;
      actions.appendChild(link);
    }

    card.append(head, actions);
    return card;
  }

  function loadFavoritesPage() {
    const container = global.document?.getElementById?.("favorites-list");
    if (!container) return;

    const sortBy = global.document.getElementById("sort-by")?.value || "recent";
    const filterCategory = global.document.getElementById("filter-category")?.value || "";
    const projection = projectFavorites();
    const visible = filterFavorites(sortFavorites(projection.items, sortBy), filterCategory);
    container.replaceChildren();

    if (projection.items.length === 0) {
      container.appendChild(createEmptyState({ unavailableCount: projection.unavailableIds.length }));
      return;
    }

    if (visible.length === 0) {
      container.appendChild(createEmptyState({ filtered: true }));
    } else {
      for (const quiz of visible) container.appendChild(createFavoriteCard(quiz));
    }

    const unavailableNote = createUnavailableNote(projection.unavailableIds.length);
    if (unavailableNote) container.appendChild(unavailableNote);
  }

  function initializeFavoritesPage() {
    if (!global.document?.getElementById?.("favorites-list")) return;
    global.PharmletSite?.initTheme?.();
    loadFavoritesPage();
    global.document.getElementById("sort-by")?.addEventListener("change", loadFavoritesPage);
    global.document.getElementById("filter-category")?.addEventListener("change", loadFavoritesPage);
    global.document.getElementById("clear-all")?.addEventListener("click", () => {
      if (global.confirm?.("Are you sure you want to remove all favorites? This cannot be undone.")) {
        clear();
        loadFavoritesPage();
      }
    });
  }

  function mountQuizHeaderFavorite() {
    const slot = global.document?.getElementById?.("favorite-quiz-control");
    if (!slot) return;

    const descriptor = resolveLocationFavorite();
    if (!descriptor) {
      slot.hidden = true;
      return;
    }

    const button = createToggleButton({ id: descriptor.id, title: descriptor.title });
    if (!button) return;
    slot.hidden = false;
    slot.replaceChildren(button);
  }

  const api = Object.freeze({
    STORAGE_KEY: FAVORITES_KEY,
    normalizeIds,
    getAll,
    has,
    add,
    remove,
    clear,
    toggle,
    bindToggleButton,
    createToggleButton,
    syncControls,
    resolveFavoriteDescriptor,
    resolveLocationFavorite,
    getLaunchActions,
    projectFavorites,
    sortFavorites,
    filterFavorites,
    loadFavoritesPage,
    mountQuizHeaderFavorite
  });

  global.PharmletFavorites = api;

  global.document?.addEventListener?.("DOMContentLoaded", () => {
    initializeFavoritesPage();
    mountQuizHeaderFavorite();
    syncControls();
  });

  global.addEventListener?.("storage", (event) => {
    if (event.key !== FAVORITES_KEY) return;
    syncControls();
    loadFavoritesPage();
  });
})(window);
