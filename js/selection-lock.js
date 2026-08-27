/* ════════════════════════════════════════════════════════════════════════
   FICHIER : selection-lock.js
   RÔLE    : Validation finale côté partenaire + déverrouillage côté admin.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Styles communs                                                  │
   │  2 — Portail partenaire                                              │
   │  3 — Admin partenaire                                                │
   │  4 — Utilitaires                                                     │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  // Empêche une double initialisation si le module a aussi été préchargé par api.js.
  if (window.__conciergerieSelectionLockLoaded) return;
  window.__conciergerieSelectionLockLoaded = true;

  /* ═══ SECTION 1 — STYLES COMMUNS ══════════════════════════════════════ */
  const style = document.createElement("style");
  style.textContent = `
    .selection-lock-banner{display:flex;align-items:flex-start;gap:10px;margin:18px 0;padding:14px 16px;border:1px solid #b9dfaa;border-radius:12px;background:#f1faed;color:#2d6320;font-size:.9rem;line-height:1.45}
    .selection-lock-banner i{margin-top:2px}
    .selection-lock-final{margin-left:8px}
    body[data-selection-locked="true"] #orgGrid [data-id]{cursor:default!important}
    body[data-selection-locked="true"] #orgGrid [data-id]:hover{transform:none!important}
    body[data-selection-locked="true"] #saveBtn{pointer-events:none;opacity:.55}
    .selection-lock-admin-right{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
    .selection-lock-admin{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .selection-lock-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:.76rem;font-weight:700;white-space:nowrap}
    .selection-lock-badge.is-open{background:#eef8e9;color:#3d792c}
    .selection-lock-badge.is-locked{background:#f3f3f1;color:#323632}
    .selection-lock-admin button{padding:6px 10px}
    @media(max-width:900px){.selection-lock-final{margin-left:0;margin-top:8px}.selection-lock-admin-right{justify-content:flex-start}}
  `;
  document.head.appendChild(style);

  /* ═══ SECTION 2 — PORTAIL PARTENAIRE ══════════════════════════════════ */
  function initPartnerLock() {
    const grid = document.querySelector("#orgGrid");
    const saveBtn = document.querySelector("#saveBtn");
    const postActions = document.querySelector("#postListActions");
    if (!grid || !saveBtn || !postActions || typeof API === "undefined" || typeof API.getSelectionStatus !== "function") return;

    const params = new URLSearchParams(location.search);
    const partenaireId = String(params.get("p") || "").trim();
    const token = String(params.get("token") || "").trim();
    if (!partenaireId || !token) return;

    let locked = false;

    const finalBtn = document.createElement("button");
    finalBtn.type = "button";
    finalBtn.className = "btn btn-outline btn-medium selection-lock-final";
    finalBtn.innerHTML = `<i class="fas fa-lock"></i> Valider mes choix`;
    saveBtn.insertAdjacentElement("afterend", finalBtn);

    const applyLockedState = status => {
      locked = Boolean(status?.locked);
      document.body.dataset.selectionLocked = locked ? "true" : "false";

      saveBtn.setAttribute("aria-disabled", locked ? "true" : "false");
      grid.setAttribute("aria-readonly", locked ? "true" : "false");

      finalBtn.hidden = false;
      finalBtn.disabled = locked;
      finalBtn.innerHTML = locked
        ? `<i class="fas fa-check"></i> Choix validés`
        : `<i class="fas fa-lock"></i> Valider mes choix`;
    };

    const refreshStatus = async () => {
      try {
        const status = await API.getSelectionStatus(partenaireId, token);
        applyLockedState(status);
      } catch (error) {
        console.warn("Statut de validation indisponible :", error);
      }
    };

    document.addEventListener("click", event => {
      if (!locked) return;
      if (event.target.closest("#orgGrid [data-id], #saveBtn")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    document.addEventListener("keydown", event => {
      if (!locked || !["Enter", " "].includes(event.key)) return;
      if (event.target.closest("#orgGrid [data-id], #saveBtn")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    finalBtn.addEventListener("click", async () => {
      const ids = [...grid.querySelectorAll("[data-id][aria-checked='true'], [data-id].selected")]
        .map(node => String(node.dataset.id || "").trim())
        .filter(Boolean);
      const uniques = [...new Set(ids)];

      const original = finalBtn.innerHTML;
      finalBtn.disabled = true;
      finalBtn.innerHTML = `<span class="spinner"></span> Validation…`;

      try {
        const result = await API.finalizeSelections(partenaireId, token, uniques);
        applyLockedState(result.status || { locked: true });
      } catch (error) {
        toast(error.message || "Impossible de valider définitivement vos choix.", true);
      } finally {
        if (!locked) {
          finalBtn.disabled = false;
          finalBtn.innerHTML = `<i class="fas fa-lock"></i> Valider mes choix`;
        }
      }
    });

    refreshStatus();
    window.addEventListener("focus", refreshStatus);
  }

  /* ═══ SECTION 3 — ADMIN PARTENAIRE ════════════════════════════════════ */
  function initAdminLock() {
    const dashboard = document.querySelector("#admin-dashboard");
    const toolbar = document.querySelector("#partnerAdminView .table-toolbar");
    if (!dashboard || !toolbar || typeof API === "undefined" || typeof API.getSelectionStatusAdmin !== "function") return;

    const lastMod = toolbar.querySelector(".last-mod");
    const right = document.createElement("div");
    right.className = "selection-lock-admin-right";

    if (lastMod) {
      lastMod.parentNode.insertBefore(right, lastMod);
      right.appendChild(lastMod);
    } else {
      toolbar.appendChild(right);
    }

    const wrap = document.createElement("div");
    wrap.className = "selection-lock-admin";
    wrap.innerHTML = `
      <span class="selection-lock-badge is-open" id="selectionLockBadge"><i class="fas fa-lock-open"></i> Choix modifiables</span>
      <button type="button" class="btn btn-outline btn-sm" id="selectionUnlockBtn" hidden><i class="fas fa-lock-open"></i> Déverrouiller les choix</button>`;
    right.appendChild(wrap);

    const badge = wrap.querySelector("#selectionLockBadge");
    const unlockBtn = wrap.querySelector("#selectionUnlockBtn");
    let requestSeq = 0;

    const currentParams = () => {
      const params = new URLSearchParams(location.search);
      return {
        partenaireId: String(params.get("p") || "").trim(),
        token: String(params.get("token") || sessionStorage.getItem("conciergerie_admin_token_session") || "").trim()
      };
    };

    const setLoading = () => {
      badge.className = "selection-lock-badge is-open";
      badge.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Statut des choix…`;
      unlockBtn.hidden = true;
    };

    const renderStatus = status => {
      const locked = Boolean(status?.locked);
      badge.className = `selection-lock-badge ${locked ? "is-locked" : "is-open"}`;
      badge.innerHTML = locked
        ? `<i class="fas fa-lock"></i> Choix validés`
        : `<i class="fas fa-lock-open"></i> Choix modifiables`;
      unlockBtn.hidden = !locked;
    };

    const refreshStatus = async () => {
      if (location.hash === "#conciergerie") {
        wrap.hidden = true;
        return;
      }

      const { partenaireId, token } = currentParams();
      if (!partenaireId || !token) {
        wrap.hidden = true;
        return;
      }

      wrap.hidden = false;
      const seq = ++requestSeq;
      setLoading();

      try {
        const status = await API.getSelectionStatusAdmin(partenaireId, token);
        if (seq !== requestSeq) return;
        renderStatus(status);
      } catch (error) {
        if (seq !== requestSeq) return;
        badge.className = "selection-lock-badge is-locked";
        badge.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Statut indisponible`;
        unlockBtn.hidden = true;
        console.warn("Statut de sélection admin indisponible :", error);
      }
    };

    unlockBtn.addEventListener("click", async () => {
      const { partenaireId, token } = currentParams();
      if (!partenaireId || !token) return;

      if (!window.confirm("Déverrouiller les choix de ce partenaire ? Il pourra à nouveau modifier puis enregistrer sa sélection.")) return;

      const original = unlockBtn.innerHTML;
      unlockBtn.disabled = true;
      unlockBtn.innerHTML = `<span class="spinner"></span> Déverrouillage…`;

      try {
        const result = await API.unlockSelectionsAdmin(partenaireId, token);
        renderStatus(result.status || { locked: false });
        toast("Les choix du partenaire sont de nouveau modifiables.");
      } catch (error) {
        toast(error.message || "Impossible de déverrouiller les choix.", true);
      } finally {
        unlockBtn.disabled = false;
        unlockBtn.innerHTML = original;
      }
    });

    document.addEventListener("click", event => {
      if (event.target.closest("#sidebarNav [data-partner-id]")) {
        setTimeout(refreshStatus, 50);
        setTimeout(refreshStatus, 500);
      }
      if (event.target.closest("#navConciergerie")) {
        setTimeout(refreshStatus, 50);
      }
    }, true);

    window.addEventListener("popstate", () => setTimeout(refreshStatus, 50));
    window.addEventListener("hashchange", () => setTimeout(refreshStatus, 50));
    window.addEventListener("focus", refreshStatus);

    setTimeout(refreshStatus, 0);
  }

  /* ═══ SECTION 4 — UTILITAIRES ═════════════════════════════════════════ */
  function toast(message, isError = false) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = isError ? `Erreur : ${message}` : message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function init() {
    initPartnerLock();
    initAdminLock();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
