// Apex Tutoring theme toggle. The page's <head> already set data-theme (saved choice, else the device setting).
(function () {
  const root = document.documentElement;
  function label(btn) {
    const dark = root.dataset.theme === "dark";
    btn.textContent = dark ? "☀️" : "🌙";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = btn.getAttribute("aria-label");
  }
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    label(btn);
    btn.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("apexTheme", root.dataset.theme); } catch (e) {}
      document.querySelectorAll(".theme-toggle").forEach(label);
    });
  });
  // Follow the device setting live, unless the visitor picked a theme themselves.
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      let saved = null; try { saved = localStorage.getItem("apexTheme"); } catch (_) {}
      if (!saved) { root.dataset.theme = e.matches ? "dark" : "light"; document.querySelectorAll(".theme-toggle").forEach(label); }
    });
  } catch (e) {}
})();
