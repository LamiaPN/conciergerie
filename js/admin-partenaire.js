/* ============================================================
   admin-partenaire.js — Espace administrateur PN (vue d'un partenaire)
   Sidebar générée depuis data.json. Tableau des organisations proposées.
   Ligne verte = sélectionnée par le partenaire. Filtre Tous / Sélectionnés / Non.
   Pas de pagination : toutes les organisations sur une seule page (scroll).
   ============================================================ */
(() => {
  "use strict";

  const state = {
    vivier: null,
    partenaireId: null,
    orgs: [],
    selected: new Set(),
    segment: "all",           // all | selected | unselected
    search: "",
    adminToken: ""            // jeton admin (lecture de toutes les sélections)
  };

  const $ = s => document.querySelector(s);
  const el = {
    nav: $("#sidebarNav"),
    navSearch: $("#navSearch"),
    title: $("#adminTitle"),
    lvl: $("#partnerLvl"),
    kQuota: $("#kQuota"),
    kProposed: $("#kProposed"),
    kSelected: $("#kSelected"),
    tbody: $("#adminTbody"),
    search: $("#tableSearch"),
    segment: $("#segment"),
    themeFilter: $("#themeFilter"),
    typeFilter: $("#typeFilter")
  };

  async function init() {
    const params = new URLSearchParams(location.search);
    state.partenaireId = (params.get("p") || "desjardins").toLowerCase();
    state.adminToken = params.get("token") || "";

    state.vivier = await API.loadVivier();
    buildSidebar();

    const p = API.getPartenaire(state.vivier, state.partenaireId);
    if (!p) { el.title.textContent = "Partenaire introuvable"; return; }

    state.orgs = API.organisationsProposees(state.vivier, state.partenaireId);
    try {
      const sel = await API.getSelectionsAdmin(state.partenaireId, state.adminToken);
      sel.forEach(id => state.selected.add(id));
    } catch (e) { /* mode démo ou jeton admin absent : liste vide */ }

    el.title.textContent = p.nom;
    el.lvl.innerHTML = `<i class="fas fa-medal"></i> Niveau ${p.niveau}`;
    el.kQuota.textContent = p.meeting_quota;
    el.kProposed.textContent = state.orgs.length;

    buildAxisFilters();
    bindEvents();
    render();
  }

  /* --- SIDEBAR dynamique --- */
  function buildSidebar() {
    const items = state.vivier.partenaires.map(p =>
      `<a href="?p=${p.id}${state.adminToken ? "&token=" + encodeURIComponent(state.adminToken) : ""}"
          class="nav-item ${p.id === state.partenaireId ? "active" : ""}" data-nom="${p.nom.toLowerCase()}">
         <i class="fas fa-building"></i> ${escapeHtml(p.nom)}
       </a>`).join("");
    el.nav.innerHTML = items;

    el.navSearch.addEventListener("input", e => {
      const q = e.target.value.toLowerCase();
      el.nav.querySelectorAll(".nav-item").forEach(a =>
        a.style.display = a.dataset.nom.includes(q) ? "" : "none");
    });
  }

  /* --- Filtres thématique / type --- */
  function buildAxisFilters() {
    const themes = uniq("thematique"), types = uniq("type");
    el.themeFilter.innerHTML = `<option value="">Toutes</option>` + themes.map(t => `<option>${escapeHtml(t)}</option>`).join("");
    el.typeFilter.innerHTML = `<option value="">Tous</option>` + types.map(t => `<option>${escapeHtml(t)}</option>`).join("");
  }
  const uniq = key => [...new Set(state.orgs.map(o => o[key]).filter(Boolean))].sort();

  /* --- EVENTS --- */
  function bindEvents() {
    el.search.addEventListener("input", e => { state.search = e.target.value.toLowerCase(); render(); });
    el.segment.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      state.segment = b.dataset.seg;
      el.segment.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      render();
    });
    [el.themeFilter, el.typeFilter].forEach(s => s.addEventListener("change", render));
  }

  /* --- FILTRAGE --- */
  function rows() {
    return state.orgs.filter(o => {
      const sel = state.selected.has(o.id);
      if (state.segment === "selected" && !sel) return false;
      if (state.segment === "unselected" && sel) return false;
      if (el.themeFilter.value && o.thematique !== el.themeFilter.value) return false;
      if (el.typeFilter.value && o.type !== el.typeFilter.value) return false;
      if (state.search && !(`${o.nom} ${o.secteur} ${o.thematique} ${o.type} ${o.localisation}`.toLowerCase().includes(state.search))) return false;
      return true;
    });
  }

  /* --- RENDER --- */
  function render() {
    const list = rows();
    const nSel = state.orgs.filter(o => state.selected.has(o.id)).length;
    el.kSelected.textContent = nSel;

    // libellés des segments avec compteurs
    el.segment.querySelector('[data-seg="all"]').textContent = `Tous (${state.orgs.length})`;
    el.segment.querySelector('[data-seg="selected"]').textContent = `Sélectionnés (${nSel})`;
    el.segment.querySelector('[data-seg="unselected"]').textContent = `Non sélectionnés (${state.orgs.length - nSel})`;

    el.tbody.innerHTML = list.length ? list.map(o => {
      const on = state.selected.has(o.id);
      return `<tr class="${on ? "is-selected" : ""}">
        <td><span class="org-name">${escapeHtml(o.nom)}</span></td>
        <td>${escapeHtml(o.secteur || "—")}</td>
        <td>${escapeHtml(o.thematique || "—")}</td>
        <td>${escapeHtml(o.type || "—")}</td>
        <td>${escapeHtml(o.localisation || "—")}</td>
        <td>${on
          ? `<span class="sel-dot"><i class="fas fa-circle-check"></i> Sélectionnée</span>`
          : `<span class="sel-dot no"><i class="far fa-circle"></i> Non sélectionnée</span>`}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty-state">Aucune organisation ne correspond à ces filtres.</td></tr>`;
  }

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  document.addEventListener("DOMContentLoaded", init);
})();
