/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-form-status.js
   RÔLE    : Afficher l'état permanent des formulaires partenaires.

   LÉGENDE :
   - ✓ vert   : un formulaire contenant des données a déjà été reçu ;
   - point orange : un formulaire nouveau/modifié reste non lu.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — État et utilitaires                                            │
   │  2 — Détection d'un formulaire reçu                                 │
   │  3 — Rafraîchissement séquentiel                                    │
   │  4 — Initialisation et cadence                                      │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  if (!document.querySelector("#admin-dashboard")) return;

  /* ═══ SECTION 1 — ÉTAT ET UTILITAIRES ═════════════════════════════════ */
  const params = new URLSearchParams(location.search);
  const adminToken = String(params.get("token") || "").trim();
  const known = new Map();
  let lastHeavyRefresh = 0;
  let running = false;

  function meaningfulForm(formulaire) {
    if (!formulaire || typeof formulaire !== "object") return false;
    const ignored = new Set(["partenaire_id", "date_modification"]);
    return Object.entries(formulaire).some(([key, value]) => {
      if (ignored.has(key)) return false;
      return Array.isArray(value)
        ? value.some(item => String(item ?? "").trim())
        : Boolean(String(value ?? "").trim());
    });
  }

  function partnerLinks() {
    return [...document.querySelectorAll("#sidebarNav [data-partner-id]")];
  }

  function setReceived(link, received) {
    if (!link) return;
    let check = link.querySelector(".partner-nav-form-received");

    if (received && !check) {
      check = document.createElement("span");
      check.className = "partner-nav-form-received";
      check.setAttribute("aria-label", "Formulaire reçu");
      check.title = "Formulaire reçu";
      check.innerHTML = '<i class="fas fa-check"></i>';
      link.appendChild(check);
    } else if (!received && check) {
      check.remove();
    }
  }

  function injectStyles() {
    if (document.querySelector("#adminFormStatusStyles")) return;
    const style = document.createElement("style");
    style.id = "adminFormStatusStyles";
    style.textContent = `
      .partner-nav-form-received{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e9f7e3;color:#58a038;font-size:10px;flex:0 0 auto}
      .partner-nav-item.has-form-update .partner-nav-form-received{margin-left:6px}
      .partner-nav-item .partner-nav-dot{flex:0 0 auto}
    `;
    document.head.appendChild(style);
  }

  /* ═══ SECTION 2 — DÉTECTION D'UN FORMULAIRE REÇU ══════════════════════ */
  async function checkOne(link) {
    const id = String(link?.dataset?.partnerId || "").trim();
    if (!id) return;

    try {
      const formulaire = await API.getFormulaireAdmin(id, adminToken);
      const received = meaningfulForm(formulaire);
      known.set(id, received);
      setReceived(link, received);
    } catch (error) {
      if (known.has(id)) setReceived(link, known.get(id));
      console.warn(`Statut formulaire indisponible pour ${id}:`, error);
    }
  }

  /* ═══ SECTION 3 — RAFRAÎCHISSEMENT SÉQUENTIEL ═════════════════════════ */
  async function refreshAll() {
    if (!adminToken || running) return;
    const links = partnerLinks();
    if (!links.length) return;

    running = true;
    try {
      for (const link of links) {
        await checkOne(link);
        await new Promise(resolve => window.setTimeout(resolve, 120));
      }
      lastHeavyRefresh = Date.now();
    } finally {
      running = false;
    }
  }

  /* ═══ SECTION 4 — INITIALISATION ET CADENCE ═══════════════════════════ */
  function initWhenSidebarReady() {
    let tries = 0;
    const wait = () => {
      tries += 1;
      if (partnerLinks().length) {
        injectStyles();
        refreshAll();
        window.setInterval(refreshAll, 5 * 60 * 1000);
        window.addEventListener("focus", () => {
          if (Date.now() - lastHeavyRefresh > 2 * 60 * 1000) refreshAll();
        });
        return;
      }
      if (tries < 40) window.setTimeout(wait, 250);
    };
    wait();
  }

  initWhenSidebarReady();
})();
