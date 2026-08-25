/* ════════════════════════════════════════════════════════════════════════
   FICHIER : partenaire-selection.js
   RÔLE    : Portail partenaire — choix parmi les propositions PN.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — État & paramètres URL                                           │
   │  2 — Éléments DOM                                                    │
   │  3 — Initialisation                                                  │
   │  4 — Chargement des propositions et sélections                       │
   │  5 — Filtres optionnels                                              │
   │  6 — Listes : choix actuels puis autres propositions                 │
   │  7 — Regroupement par secteur                                        │
   │  8 — Fiche organisation                                              │
   │  9 — Sélection & recommandation quota × 2                            │
   │ 10 — Sauvegarde                                                      │
   │ 11 — Utilitaires                                                     │
   └──────────────────────────────────────────────────────────────────────┘

   RÈGLES :
   - IDs Airtable sensibles à la casse : trim() uniquement.
   - Les choix déjà cochés restent toujours visibles, même si un filtre est actif.
   - Les filtres sont optionnels et ne portent PAS sur Secteur :
     le secteur structure déjà visuellement la liste.
   - Le partenaire peut dépasser quota × 2 : avertissement uniquement.
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  /* ═══ SECTION 1 — ÉTAT & PARAMÈTRES URL ════════════════════════════════ */
  const params = typeof location !== "undefined"
    ? new URLSearchParams(location.search)
    : new URLSearchParams();

  const state = {
    partenaireId: (params.get("p") || "").trim(),
    token: (params.get("token") || "").trim(),
    partenaire: null,
    orgs: [],
    proposedIds: new Set(),
    selected: new Set(),
    filters: {
      expertise: new Set(),
      taille: new Set(),
      type: new Set(),
      localisation: new Set()
    }
  };

  /* ═══ SECTION 2 — ÉLÉMENTS DOM ═════════════════════════════════════════ */
  const $ = selector => document.querySelector(selector);
  let el = {};

  function cacheDom() {
    el = {
      grid: $("#orgGrid"),
      count: $("#selCount"),
      result: $("#resultCount"),
      saveBtn: $("#saveBtn"),
      title: $("#partnerTitle"),
      tag: $("#partnerTag"),
      filterPanel: $("#filterPanel"),
      filterCount: $("#filterCount"),
      quotaWarning: $("#quotaWarning"),
      quotaWarningText: $("#quotaWarningText")
    };
  }

  /* ═══ SECTION 3 — INITIALISATION ════════════════════════════════════════ */
  async function init() {
    cacheDom();

    if (!state.partenaireId || !state.token) {
      return fatal("Lien invalide : identifiant ou jeton manquant.");
    }

    try {
      const vivier = await API.loadVivier();
      state.partenaire = API.getPartenaire(vivier, state.partenaireId);

      if (!state.partenaire) {
        return fatal("Partenaire introuvable. Vérifiez votre lien.");
      }

      await chargerPropositions(vivier);
      await restaurerSelections();

      el.title.textContent = state.partenaire.nom;
      el.tag.textContent = `Espace ${state.partenaire.nom} · 13–15 octobre 2026`;

      buildFilters();
      bindEvents();
      render();
    } catch (error) {
      fatal(error.message || "Erreur de chargement.");
    }
  }

  /* ═══ SECTION 4 — PROPOSITIONS ET SÉLECTIONS ═══════════════════════════ */
  async function chargerPropositions(vivier) {
    const ids = await API.getPropositions(state.partenaireId, state.token);

    state.proposedIds = new Set(
      (ids || []).map(id => String(id).trim()).filter(Boolean)
    );

    state.orgs = (vivier.organisations || []).filter(org =>
      state.proposedIds.has(String(org.id || "").trim())
    );
  }

  async function restaurerSelections() {
    const ids = await API.getSelections(state.partenaireId, state.token);

    (ids || []).forEach(id => {
      const propre = String(id).trim();

      // On restaure uniquement les organisations encore proposées par PN.
      if (state.proposedIds.has(propre)) {
        state.selected.add(propre);
      }
    });
  }

  /* ═══ SECTION 5 — FILTRES OPTIONNELS ═══════════════════════════════════ */
  function buildFilters() {
    const axes = [
      ["Expertise", "expertise"],
      ["Taille", "taille"],
      ["Type d'organisation", "type"],
      ["Localisation", "localisation"]
    ];

    const blocks = axes.map(([label, key]) => {
      const values = uniqueValues(key);
      if (!values.length) return "";

      return `<div class="form-group full-width">
        <label>${escapeHtml(label)}</label>
        <div class="choice-grid" data-axis="${escapeAttr(key)}">
          ${values.map(value =>
            `<button type="button" class="choice-chip" data-val="${escapeAttr(value)}">
              <i class="fas fa-plus"></i> ${escapeHtml(value)}
            </button>`
          ).join("")}
        </div>
      </div>`;
    }).join("");

    el.filterPanel.innerHTML = blocks
      ? `<div class="form-grid">${blocks}</div>
         <div class="screen-actions partner-filter-actions">
           <button type="button" class="btn btn-ghost btn-small" id="resetBtn">
             <i class="fas fa-rotate-left"></i> Réinitialiser
           </button>
         </div>`
      : `<p class="hint">Aucun filtre disponible pour cette liste.</p>`;

    updateFilterCount();
  }

  function uniqueValues(key) {
    const values = [];

    state.orgs.forEach(org => {
      if (key === "expertise") {
        expertiseValues(org).forEach(value => values.push(value));
        return;
      }

      const value = String(org[key] ?? "").trim();
      if (value) values.push(value);
    });

    return [...new Set(values)]
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }

  function onFilterClick(event) {
    const chip = event.target.closest(".choice-chip");

    if (chip) {
      const axisElement = chip.closest("[data-axis]");
      if (!axisElement) return;

      const axis = axisElement.dataset.axis;
      const value = chip.dataset.val;
      const set = state.filters[axis];

      set.has(value) ? set.delete(value) : set.add(value);

      chip.classList.toggle("selected", set.has(value));

      const icon = chip.querySelector("i");
      if (icon) {
        icon.className = set.has(value) ? "fas fa-check" : "fas fa-plus";
      }

      updateFilterCount();
      render();
      return;
    }

    if (event.target.closest("#resetBtn")) {
      resetFilters();
    }
  }

  function resetFilters() {
    Object.values(state.filters).forEach(set => set.clear());

    el.filterPanel.querySelectorAll(".choice-chip").forEach(chip => {
      chip.classList.remove("selected");

      const icon = chip.querySelector("i");
      if (icon) icon.className = "fas fa-plus";
    });

    updateFilterCount();
    render();
  }

  function updateFilterCount() {
    if (!el.filterCount) return;

    const count = Object.values(state.filters)
      .reduce((total, set) => total + set.size, 0);

    el.filterCount.textContent = `${count} actif${count > 1 ? "s" : ""}`;
    el.filterCount.classList.toggle("has-filters", count > 0);
  }

  function matchesFilters(org, filters) {
    const tailleOk =
      filters.taille.size === 0 ||
      filters.taille.has(String(org.taille ?? "").trim());

    const typeOk =
      filters.type.size === 0 ||
      filters.type.has(String(org.type ?? "").trim());

    const localisationOk =
      filters.localisation.size === 0 ||
      filters.localisation.has(String(org.localisation ?? "").trim());

    const expertises = expertiseValues(org);
    const expertiseOk =
      filters.expertise.size === 0 ||
      expertises.some(value => filters.expertise.has(value));

    // OU à l'intérieur d'un axe, ET entre les axes.
    return expertiseOk && tailleOk && typeOk && localisationOk;
  }

  /* ═══ SECTION 6 — CHOIX ACTUELS PUIS AUTRES PROPOSITIONS ══════════════ */
  function buildVisibleLists(orgs, selectedIds, filters) {
    const selectedOrgs = [];
    const otherOrgs = [];

    orgs.forEach(org => {
      const id = String(org.id || "").trim();

      if (selectedIds.has(id)) {
        // Les choix actuels restent toujours visibles.
        selectedOrgs.push(org);
      } else if (matchesFilters(org, filters)) {
        // Les filtres s'appliquent uniquement aux autres propositions.
        otherOrgs.push(org);
      }
    });

    return { selectedOrgs, otherOrgs };
  }

  function render() {
    const { selectedOrgs, otherOrgs } =
      buildVisibleLists(state.orgs, state.selected, state.filters);

    if (!state.orgs.length) {
      el.grid.innerHTML =
        `<p class="hint">Aucune organisation ne vous a encore été proposée.</p>`;

      el.result.innerHTML = `<b>0</b> organisation proposée`;
      el.saveBtn.disabled = true;

      renderSelectionCount();
      renderQuotaWarning();
      return;
    }

    const totalOther = Math.max(0, state.orgs.length - state.selected.size);
    const filterActive = Object.values(state.filters).some(set => set.size > 0);

    el.result.innerHTML =
      `<b>${state.selected.size}</b> choix sur ` +
      `<b>${state.orgs.length}</b> organisation${state.orgs.length > 1 ? "s" : ""} proposée${state.orgs.length > 1 ? "s" : ""}` +
      (filterActive
        ? ` · <span>${otherOrgs.length} autre${otherOrgs.length > 1 ? "s" : ""} affichée${otherOrgs.length > 1 ? "s" : ""} sur ${totalOther}</span>`
        : "");

    el.grid.innerHTML =
      renderListSection(
        "Vos choix actuels",
        selectedOrgs,
        "selected",
        state.selected.size
      ) +
      renderListSection(
        "Autres organisations proposées",
        otherOrgs,
        "other",
        filterActive ? `${otherOrgs.length} / ${totalOther}` : totalOther
      );

    el.saveBtn.disabled = false;
    renderSelectionCount();
    renderQuotaWarning();
  }

  function renderListSection(title, organisations, mode, countLabel) {
    const emptyMessage = mode === "selected"
      ? "Vous n'avez encore sélectionné aucune organisation."
      : "Aucune autre organisation ne correspond aux filtres actifs.";

    return `<section class="partner-list-section ${mode}">
      <header class="partner-list-heading">
        <h2>${escapeHtml(title)}</h2>
        <span>${escapeHtml(String(countLabel))}</span>
      </header>
      ${organisations.length
        ? renderSectorGroups(organisations)
        : `<p class="partner-list-empty">${escapeHtml(emptyMessage)}</p>`}
    </section>`;
  }

  /* ═══ SECTION 7 — REGROUPEMENT PAR SECTEUR ═════════════════════════════ */
  function groupBySector(organisations) {
    const groups = new Map();

    organisations.forEach(org => {
      const sector = String(org.secteur || "").trim() || "Autre";

      if (!groups.has(sector)) groups.set(sector, []);
      groups.get(sector).push(org);
    });

    return [...groups.entries()]
      .sort(([sectorA], [sectorB]) =>
        sectorA.localeCompare(sectorB, "fr", { sensitivity: "base" })
      )
      .map(([sector, orgs]) => ({
        sector,
        orgs: orgs.sort((a, b) =>
          String(a.nom || "").localeCompare(
            String(b.nom || ""),
            "fr",
            { sensitivity: "base" }
          )
        )
      }));
  }

  function renderSectorGroups(organisations) {
    return groupBySector(organisations)
      .map(group => `
        <section class="partner-sector-group">
          <h3 class="partner-sector-title">
            ${escapeHtml(group.sector)}
            <span>${group.orgs.length}</span>
          </h3>
          <div class="choice-list partner-sector-list">
            ${group.orgs.map(cardHTML).join("")}
          </div>
        </section>`)
      .join("");
  }

  /* ═══ SECTION 8 — FICHE ORGANISATION ═══════════════════════════════════ */
  function cardHTML(org) {
    const id = String(org.id || "").trim();
    const selected = state.selected.has(id);
    const expertises = expertiseValues(org);

    // Le secteur n'est PAS répété ici : il est déjà le titre du groupe.
    const meta = [
      org.taille ? escapeHtml(org.taille) : "",
      org.type ? escapeHtml(org.type) : "",
      org.localisation ? escapeHtml(org.localisation) : ""
    ].filter(Boolean);

    const expertiseLine = expertises.length
      ? `<div class="partner-org-expertise">
          <span class="partner-org-label">Expertise :</span>
          <span class="partner-org-tags">
            ${expertises.map(value =>
              `<span class="tag-label">${escapeHtml(value)}</span>`
            ).join("")}
          </span>
        </div>`
      : "";

    const description = String(org.description || "").trim();
    const descriptionHtml = description
      ? `<p class="partner-org-description">${escapeHtml(description)}</p>`
      : "";

    return `<button type="button"
        class="choice-btn partner-org-card ${selected ? "selected" : ""}"
        data-id="${escapeAttr(id)}"
        role="checkbox"
        aria-checked="${selected}">
      <span class="partner-org-content">
        <span class="partner-org-title-row">
          <strong>${escapeHtml(org.nom || id)}</strong>
          ${selected
            ? `<span class="partner-selected-check" aria-label="Sélectionnée">
                 <i class="fas fa-check"></i>
               </span>`
            : ""}
        </span>

        ${meta.length
          ? `<span class="partner-org-meta">${meta.join(`<span class="partner-meta-dot">·</span>`)}</span>`
          : ""}

        ${expertiseLine}
        ${descriptionHtml}
      </span>
    </button>`;
  }

  /* ═══ SECTION 9 — SÉLECTION & QUOTA × 2 ════════════════════════════════ */
  function bindEvents() {
    el.filterPanel.addEventListener("click", onFilterClick);

    el.grid.addEventListener("click", event => {
      const card = event.target.closest("[data-id]");
      if (card) toggle(card.dataset.id);
    });

    el.grid.addEventListener("keydown", event => {
      if (event.key !== " " && event.key !== "Enter") return;

      const card = event.target.closest("[data-id]");
      if (!card) return;

      event.preventDefault();
      toggle(card.dataset.id);
    });

    el.saveBtn.addEventListener("click", save);
  }

  function toggle(id) {
    const propre = String(id || "").trim();

    state.selected.has(propre)
      ? state.selected.delete(propre)
      : state.selected.add(propre);

    render();
  }

  function recommendedLimit() {
    const quota = Number(state.partenaire?.meeting_quota);
    return Number.isFinite(quota) && quota > 0 ? quota * 2 : null;
  }

  function renderSelectionCount() {
    const count = state.selected.size;
    const limit = recommendedLimit();

    el.count.innerHTML =
      `<b>${count}</b> organisation${count > 1 ? "s" : ""} sélectionnée${count > 1 ? "s" : ""}` +
      (limit ? ` · jusqu'à <b>${limit}</b> recommandées` : "");
  }

  function renderQuotaWarning() {
    if (!el.quotaWarning || !el.quotaWarningText) return;

    const count = state.selected.size;
    const quota = Number(state.partenaire?.meeting_quota);
    const limit = recommendedLimit();

    if (!limit || count <= limit) {
      el.quotaWarning.hidden = true;
      el.quotaWarningText.textContent = "";
      return;
    }

    el.quotaWarning.hidden = false;
    el.quotaWarningText.textContent =
      `Vous avez sélectionné ${count} organisations, au-delà des ${limit} recommandées ` +
      `pour ${quota} rencontre${quota > 1 ? "s" : ""}. C'est permis : cette liste plus large ` +
      `nous donne davantage de flexibilité pour organiser vos rendez-vous.`;
  }

  /* ═══ SECTION 10 — SAUVEGARDE ══════════════════════════════════════════ */
  async function save() {
    el.saveBtn.disabled = true;

    const original = el.saveBtn.innerHTML;
    el.saveBtn.innerHTML = `<span class="spinner"></span> Enregistrement…`;

    try {
      const result = await API.saveSelections(
        state.partenaire.id,
        state.token,
        [...state.selected]
      );

      toast(
        result.demo
          ? "Choix enregistrés en mode démonstration."
          : "Vos choix ont bien été enregistrés. Vous pourrez revenir les modifier à tout moment."
      );
    } catch (error) {
      toast(error.message || "Échec de l'enregistrement. Réessayez.", true);
    } finally {
      el.saveBtn.disabled = !state.orgs.length;
      el.saveBtn.innerHTML = original;
    }
  }

  /* ═══ SECTION 11 — UTILITAIRES ═════════════════════════════════════════ */
  function expertiseValues(org) {
    if (Array.isArray(org?.expertise)) {
      return org.expertise
        .map(value => String(value ?? "").trim())
        .filter(Boolean);
    }

    const raw = String(org?.expertise ?? "").trim();
    if (!raw) return [];

    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
          return parsed
            .map(value => String(value ?? "").trim())
            .filter(Boolean);
        }
      } catch (_) {
        // Compatibilité ancienne chaîne séparée par virgules.
      }
    }

    return raw
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
  }

  function fatal(message) {
    document.body.innerHTML =
      `<div class="screen-inner screen-center">
        <div>
          <h2 class="screen-title">Accès impossible</h2>
          <p class="hero-description">${escapeHtml(message)}</p>
        </div>
      </div>`;
  }

  function toast(message, isError = false) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = isError ? `Erreur : ${message}` : message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  const escapeHtml = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const escapeAttr = escapeHtml;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      expertiseValues,
      matchesFilters,
      buildVisibleLists,
      groupBySector
    };
  }
})();
