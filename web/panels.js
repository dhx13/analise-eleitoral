/* Recolhimento nativo: funciona com teclado e mantém a escolha neste navegador. */
(function () {
  "use strict";
  const key = "territorio-do-voto:panels:v1";
  const panels = [...document.querySelectorAll("details[data-panel]")];
  let saved = {};
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    saved =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    /* Preferências opcionais. */
  }
  panels.forEach((panel) => {
    if (typeof saved[panel.dataset.panel] === "boolean")
      panel.open = saved[panel.dataset.panel];
    panel.addEventListener("toggle", () => {
      saved[panel.dataset.panel] = panel.open;
      try {
        localStorage.setItem(key, JSON.stringify(saved));
      } catch {
        /* Modo privado pode impedir a gravação. */
      }
    });
  });
  document.querySelectorAll("[data-panels-action]").forEach((button) =>
    button.addEventListener("click", () => {
      panels.forEach((panel) => {
        panel.open = button.dataset.panelsAction === "expand";
      });
    }),
  );
  window.PanelControls = {
    open(id) {
      const panel = document.getElementById(id);
      if (panel) panel.open = true;
    },
  };
})();
