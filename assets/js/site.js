(function (global) {
  const THEME_KEY = "pharmlet.theme";

  function initTheme() {
    const root = global.document?.documentElement;
    const toggle = global.document?.getElementById?.("theme-toggle");
    const label = global.document?.getElementById?.("theme-label");
    if (!root) return;

    let saved;
    try { saved = global.localStorage?.getItem(THEME_KEY); } catch {}
    const prefersDark = global.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const setTheme = (theme) => {
      root.classList.toggle("dark", theme === "dark");
      if (label) label.textContent = theme === "dark" ? "Light" : "Dark";
    };

    setTheme(saved || (prefersDark ? "dark" : "light"));
    toggle?.addEventListener("click", () => {
      const theme = root.classList.contains("dark") ? "light" : "dark";
      setTheme(theme);
      try { global.localStorage?.setItem(THEME_KEY, theme); } catch {}
    });
  }

  function escapeHtml(value) {
    const element = global.document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
  }

  function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
      const count = Math.floor(seconds / size);
      if (count >= 1) return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
    }
    return "just now";
  }

  global.PharmletSite = { escapeHtml, initTheme, timeAgo };
})(window);
