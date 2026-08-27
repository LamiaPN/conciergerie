/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-priorites.js
   RÔLE    : Distinguer visuellement et ordonner les organisations dans
             la vue partenaire de l'admin.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Styles                                                         │
   │  2 — Détection du statut d'une ligne                                │
   │  3 — Tri permanent                                                  │
   │  4 — Synchronisation légère                                         │
   └──────────────────────────────────────────────────────────────────────┘

   PRIORITÉ :
   1. Accepté par le partenaire
   2. Proposé par PN
   3. Reste du vivier
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  if (window.__conciergerieAdminPrioritesLoaded) return;
  window.__conciergerieAdminPrioritesLoaded = true;

  /* ═══ SECTION 1 — STYLES ══════════════════════════════════════════════ */
  const style = document.createElement("style");
  style.textContent = `
    /* Proposé par PN : vert clair existant */
    #resp-table tbody tr.is-proposed{
      background:#E9F7E3 !important;
    }
    #resp-table tbody tr.is-proposed:hover{
      background:#DDF1D2 !important;
    }
    #resp-table tbody tr.is-proposed td:first-child{
      box-shadow:inset 3px 0 0 #6FBF4A !important;
    }

    /* Accepté par le partenaire : vert foncé */
    #resp-table tbody tr.is-accepted{
      background:#58A038 !important;
    }
    #resp-table tbody tr.is-accepted:hover{
      background:#4E9132 !important;
    }
    #resp-table tbody tr.is-accepted td{
      color:#fff !important;
    }
    #resp-table tbody tr.is-accepted td:first-child{
      box-shadow:inset 4px 0 0 #356F24 !important;
    }
    #resp-table tbody tr.is-accepted .org-name,
    #resp-table tbody tr.is-accepted .sel-dot,
    #resp-table tbody tr.is-accepted td a,
    #resp-table tbody tr.is-accepted td span,
    #resp-table tbody tr.is-accepted td i{
      color:#fff !important;
    }
    #resp-table tbody tr.is-accepted .edit-org-btn{
      color:#fff !important;
      border-color:rgba(255,255,255,.75) !important;
      background:transparent !important;
    }
    #resp-table tbody tr.is-accepted .edit-org-btn:hover{
      background:rgba(255,255,255,.12) !important;
    }
  `;
  document.head.appendChild(style);

  /* ═══ SECTION 2 — STATUT D'UNE LIGNE ══════════════════════════════════ */
  function rowStatus(row) {
    const checkbox = row.querySelector("input[type='checkbox'][data-org-id]");
    const partnerChoice = row.querySelector(".sel-dot");

    const proposed = Boolean(checkbox?.checked);
    const accepted = Boolean(partnerChoice && !partnerChoice.classList.contains("no"));

    return {
      accepted,
      proposed,
      rank: accepted ? 0 : proposed ? 1 : 2
    };
  }

  function applyRowClass(row) {
    const status = rowStatus(row);

    row.classList.remove("is-accepted", "is-proposed");

    if (status.accepted) {
      row.classList.add("is-accepted");
    } else if (status.proposed) {
      row.classList.add("is-proposed");
    }

    return status;
  }

  /* ═══ SECTION 3 — TRI PERMANENT ═══════════════════════════════════════ */
  function applyPriorityOrder() {
    const tbody = document.querySelector("#adminTbody");
    if (!tbody) return;

    const rows = [...tbody.querySelectorAll(":scope > tr")];
    if (!rows.length || rows.some(row => row.querySelector(".empty-state"))) return;

    const decorated = rows.map((row, index) => ({
      row,
      index,
      status: applyRowClass(row)
    }));

    decorated
      .sort((a, b) => a.status.rank - b.status.rank || a.index - b.index)
      .forEach(item => tbody.appendChild(item.row));
  }

  /* ═══ SECTION 4 — SYNCHRONISATION LÉGÈRE ══════════════════════════════ */
  let lastSignature = "";

  function currentSignature() {
    const tbody = document.querySelector("#adminTbody");
    if (!tbody) return "";

    return [...tbody.querySelectorAll(":scope > tr")]
      .map(row => {
        const checkbox = row.querySelector("input[type='checkbox'][data-org-id]");
        const choice = row.querySelector(".sel-dot");
        const name = row.querySelector(".org-name")?.textContent?.trim() || "";
        return `${name}|${checkbox?.checked ? 1 : 0}|${choice && !choice.classList.contains("no") ? 1 : 0}`;
      })
      .join("||");
  }

  function refreshIfNeeded() {
    const signature = currentSignature();
    if (!signature || signature === lastSignature) return;

    applyPriorityOrder();
    lastSignature = currentSignature();
  }

  document.addEventListener("change", event => {
    if (event.target.closest("#adminTbody, #filterSecteur, #filterExpertise, #filterTaille, #filterType")) {
      requestAnimationFrame(refreshIfNeeded);
    }
  });

  document.addEventListener("input", event => {
    if (event.target.closest("#tableSearch")) {
      requestAnimationFrame(refreshIfNeeded);
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest("#segment button, #sidebarNav [data-partner-id]")) {
      setTimeout(refreshIfNeeded, 50);
      setTimeout(refreshIfNeeded, 350);
      setTimeout(refreshIfNeeded, 900);
    }
  });

  setTimeout(refreshIfNeeded, 0);
  setTimeout(refreshIfNeeded, 400);
  setTimeout(refreshIfNeeded, 1000);

  // Vérification légère : aucun MutationObserver.
  window.setInterval(refreshIfNeeded, 600);
})();
