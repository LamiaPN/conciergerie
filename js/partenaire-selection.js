/* ============================================================
   partenaire-selection.js — Portail partenaire (écran de sélection)
   Lit ?p=<partenaire>&token=<jeton> dans l'URL.
   Filtres combinables (thématique OU · type OU · localisation OU),
   sélection SANS limite, persistance des choix, sauvegarde vers le Sheet.
   ============================================================ */
(() => {
  "use strict";

  /* --- STATE --- */
  const state = {
    partenaire: null,
    orgs: [],                 // organisations proposées à ce partenaire
    selected: new Set(),      // organisation_id sélectionnés (persistant)
    filters: { thematique: new Set(), type: new Set(), localisation: new Set() },
    token: ""
  };

  /* --- ELEMENTS --- */
  const $ = sel => document.querySelector(sel);
  const el = {
    grid: $("#orgGrid"),
    count: $("#selCount"),
    result: $("#resultCount"),
    saveBtn: $("#saveBtn"),
    title: $("#partnerTitle"),
    tag: $("#partnerTag"),
    filterPanel: $("#filterPanel")
  };

  /* --- INIT --- */
  async function init() {
    const params = new URLSearchParams(location.search);
    const pid = (params.get("p") || "").toLowerCase();
    state.token = params.get("token") || "";

    try {
      const v = await API.loadVivier();
      state.partenaire = API.getPartenaire(v, pid);
      if (!state.partenaire) return fatal("Partenaire introuvable. Vérifiez votre lien.");

      state.orgs = API.organisationsProposees(v, pid);
      buildFilters(v);

      // Restaure les choix précédents.
      try {
        const prev = await API.getSelections(pid, state.token);
        prev.forEach(id => state.selected.add(id));
      } catch (e) { toast("Sélection précédente indisponible — vous pouvez continuer.", true); }

      el.title.textContent = state.partenaire.nom;
      el.tag.textContent = `Espace ${state.partenaire.nom} · 13–15 octobre 2026`;
      render();
    } catch (e) {
      fatal(e.message || "Erreur de chargement.");
    }
  }

  /* --- FILTRES (référentiels réels du vivier) --- */
  function buildFilters(v) {
    const rows = [
      ["Thématique", "thematique", uniqueValues("thematique")],
      ["Type d'organisation", "type", uniqueValues("type")],
      ["Localisation", "localisation", uniqueValues("localisation")]
    ];
    el.filterPanel.innerHTML = rows.map(([label, key, vals]) => `
      <div class="filter-row">
        <span class="filter-row-label">${label}</span>
        <div class="choice-grid" data-axis="${key}">
          ${vals.map(val => `<button class="choice-chip" data-val="${escapeAttr(val)}"><i class="fas fa-plus"></i> ${escapeHtml(val)}</button>`).join("")}
        </div>
      </div>`).join("") +
      `<button class="filter-reset" id="resetBtn"><i class="fas fa-rotate-left"></i> Réinitialiser les filtres</button>`;

    el.filterPanel.addEventListener("click", onFilterClick);
  }

  function uniqueValues(key) {
    return [...new Set(state.orgs.map(o => o[key]).filter(Boolean))].sort();
  }

  function onFilterClick(e) {
    const chip = e.target.closest(".choice-chip");
    if (chip) {
      const axis = chip.closest("[data-axis]").dataset.axis;
      const val = chip.dataset.val;
      const set = state.filters[axis];
      set.has(val) ? set.delete(val) : set.add(val);
      chip.classList.toggle("selected");
      chip.querySelector("i").className = set.has(val) ? "fas fa-check" : "fas fa-plus";
      render();
      return;
    }
    if (e.target.closest("#resetBtn")) resetFilters();
  }

  function resetFilters() {
    Object.values(state.filters).forEach(s => s.clear());
    el.filterPanel.querySelectorAll(".choice-chip").forEach(c => {
      c.classList.remove("selected");
      c.querySelector("i").className = "fas fa-plus";
    });
    render();
  }

  /* --- FILTRAGE : à l'intérieur d'un axe = OU ; entre axes = ET --- */
  function visibleOrgs() {
    const f = state.filters;
    return state.orgs.filter(o => {
      const okTheme = f.thematique.size === 0 || f.thematique.has(o.thematique);
      const okType  = f.type.size === 0 || f.type.has(o.type);
      const okLoc   = f.localisation.size === 0 || f.localisation.has(o.localisation);
      return okTheme && okType && okLoc;
    });
  }

  /* --- RENDER --- */
  function render() {
    const list = visibleOrgs();
    el.grid.innerHTML = list.length
      ? list.map(cardHTML).join("")
      : `<p class="empty-hint">Aucune organisation ne correspond à ces filtres.</p>`;

    // compteur de résultats
    const active = [...Object.entries(state.filters)]
      .flatMap(([, s]) => [...s]);
    el.result.innerHTML = `<b>${list.length}</b> organisation${list.length > 1 ? "s" : ""} affichée${list.length > 1 ? "s" : ""}` +
      (active.length ? ` · filtres : ${active.map(escapeHtml).join(", ")}` : "");

    // compteur de sélection (SANS limite — jamais "x / quota")
    const n = state.selected.size;
    el.count.innerHTML = `<b>${n}</b> organisation${n > 1 ? "s" : ""} sélectionnée${n > 1 ? "s" : ""}`;
  }

  function cardHTML(o) {
    const on = state.selected.has(o.id);
    const initials = o.nom.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
    return `
      <div class="org-card ${on ? "selected" : ""}" data-id="${o.id}" role="checkbox" aria-checked="${on}" tabindex="0">
        <div class="org-card-head">
          <div class="org-logo">${escapeHtml(initials)}</div>
          <div class="org-check"><i class="fas fa-check"></i></div>
        </div>
        <div>
          <div class="org-title">${escapeHtml(o.nom)}</div>
          <div class="org-sector">${escapeHtml(o.secteur)}${o.localisation ? " · " + escapeHtml(o.localisation) : ""}</div>
        </div>
        ${o.description ? `<p class="org-desc">${escapeHtml(o.description)}</p>` : ""}
        <div class="org-meta">
          ${o.thematique ? `<span class="theme">${escapeHtml(o.thematique)}</span>` : ""}
          ${o.type ? `<span>${escapeHtml(o.type)}</span>` : ""}
        </div>
      </div>`;
  }

  /* --- SÉLECTION (toggle, persistante entre filtres) --- */
  el.grid.addEventListener("click", e => {
    const card = e.target.closest(".org-card");
    if (card) toggle(card.dataset.id);
  });
  el.grid.addEventListener("keydown", e => {
    if ((e.key === " " || e.key === "Enter")) {
      const card = e.target.closest(".org-card");
      if (card) { e.preventDefault(); toggle(card.dataset.id); }
    }
  });

  function toggle(id) {
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    render(); // les choix hors filtre restent dans state.selected
  }

  /* --- SAUVEGARDE --- */
  el.saveBtn.addEventListener("click", async () => {
    el.saveBtn.disabled = true;
    const original = el.saveBtn.innerHTML;
    el.saveBtn.innerHTML = `<span class="spinner"></span> Enregistrement…`;
    try {
      const r = await API.saveSelections(state.partenaire.id, state.token, [...state.selected]);
      toast(r.demo ? "Choix enregistrés (mode démo, sans serveur)." : "Vos choix ont bien été enregistrés. Vous pourrez revenir les modifier à tout moment.");
    } catch (e) {
      toast(e.message || "Échec de l'enregistrement. Réessayez.", true);
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.innerHTML = original;
    }
  });

  /* --- HELPERS --- */
  function fatal(msg) {
    document.body.innerHTML = `<div style="max-width:520px;margin:80px auto;padding:0 24px;text-align:center;font-family:var(--font-main);">
      <h2 style="font-family:var(--font-title);margin-bottom:10px;">Accès impossible</h2>
      <p style="color:var(--gris-text);">${escapeHtml(msg)}</p></div>`;
  }
  function toast(msg, isErr) {
    const t = document.createElement("div");
    t.className = "toast";
    if (isErr) t.style.background = "var(--danger)";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escapeAttr = escapeHtml;

  document.addEventListener("DOMContentLoaded", init);
})();
