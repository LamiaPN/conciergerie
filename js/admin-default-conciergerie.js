/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-default-conciergerie.js
   RÔLE    : Respecter #conciergerie comme vue d'ouverture de l'admin.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Détection de la vue demandée                                   │
   │  2 — Ouverture différée                                             │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  /* ═══ SECTION 1 — DÉTECTION DE LA VUE DEMANDÉE ════════════════════════ */
  if (!document.querySelector("#admin-dashboard")) return;
  if (location.hash !== "#conciergerie") return;

  /* ═══ SECTION 2 — OUVERTURE DIFFÉRÉE ══════════════════════════════════ */
  let essais = 0;
  const ouvrir = () => {
    essais += 1;
    const nav = document.querySelector("#navConciergerie");
    const partenaires = document.querySelectorAll("#sidebarNav [data-partner-id]");

    if (nav && partenaires.length) {
      nav.click();
      return;
    }

    if (essais < 40) window.setTimeout(ouvrir, 250);
  };

  window.setTimeout(ouvrir, 0);
})();
