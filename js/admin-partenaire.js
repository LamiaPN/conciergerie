/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-partenaire.js
   RÔLE    : Administration fusionnée de la Conciergerie MTLC 2026.
             Gère la pioche des propositions et l'édition du vivier.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — État, DOM et noms courts                                       │
   │  2 — Initialisation                                                  │
   │  3 — Besoins, historique et notifications formulaire                   │
   │  4 — Sidebar partenaires
   │  5 — Filtres et événements                                          │
   │  6 — Filtrage et rendu du tableau                                   │
   │  7 — Enregistrement des propositions                                 │
   │  8 — Gestion des référentiels                                      │
   │  9 — Éditeur du vivier                                               │
   │ 10 — Utilitaires                                                     │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  /* ═══ SECTION 1 — ÉTAT, DOM ET NOMS COURTS ═══════════════════════════ */
  const state = {
    vivier: null,
    partenaireId: null,
    orgs: [],                 // tout le vivier (on pioche dedans)
    proposed: new Set(),      // MES propositions (cochées par PN)
    selected: new Set(),      // CHOIX du partenaire (lecture seule)
    segment: "all",           // selected=Proposés | accepted=Choix partenaire | all | unselected
    search: "",
    adminToken: "",
    formulaire: null,
    formHistory: [],
    formNotifications: new Map(),
    referentiels: {},
    referentielEdit: null,
    referentielDelete: null,
    editExpertises: [],
    pendingExpertises: new Set(),
    partnerLoadSeq: 0,
    partnerLoading: false,
    plannedCount: 0
  };

  const $ = s => document.querySelector(s);
  const el = {
    nav: $("#sidebarNav"),
    title: $("#adminTitle"),
    lvl: $("#partnerLvl"),
    kQuota: $("#kQuota"),
    kProposed: $("#kProposed"),
    kSelected: $("#kSelected"),
    kPlanned: $("#kPlanned"),
    needs: $("#partnerNeeds"),
    needsState: $("#partnerNeedsState"),
    needsBody: $("#partnerNeedsBody"),
    tbody: $("#adminTbody"),
    search: $("#tableSearch"),
    segment: $("#segment"),
    filterSecteur: $("#filterSecteur"),
    filterExpertise: $("#filterExpertise"),
    filterTaille: $("#filterTaille"),
    filterType: $("#filterType"),
    saveBtn: $("#saveProposals"),
    saveStatus: $("#saveStatus"),
    addOrganisation: $("#addOrganisation"),
    manageReferentiels: $("#manageReferentiels"),
    referentielModal: $("#referentielModal"),
    referentielClose: $("#referentielClose"),
    referentielCancel: $("#referentielCancel"),
    referentielCategory: $("#referentielCategory"),
    referentielList: $("#referentielList"),
    referentielCount: $("#referentielCount"),
    referentielStatus: $("#referentielStatus"),
    referentielDeleteModal: $("#referentielDeleteModal"),
    referentielDeleteClose: $("#referentielDeleteClose"),
    referentielDeleteCancel: $("#referentielDeleteCancel"),
    referentielDeleteConfirm: $("#referentielDeleteConfirm"),
    referentielDeleteValue: $("#referentielDeleteValue"),
    referentielDeleteStatus: $("#referentielDeleteStatus"),
    organisationModal: $("#organisationModal"),
    organisationModalTitle: $("#organisationModalTitle"),
    organisationDelete: $("#organisationDelete"),
    organisationDeleteModal: $("#organisationDeleteModal"),
    organisationDeleteClose: $("#organisationDeleteClose"),
    organisationDeleteCancel: $("#organisationDeleteCancel"),
    organisationDeleteConfirm: $("#organisationDeleteConfirm"),
    organisationDeleteName: $("#organisationDeleteName"),
    organisationDeleteStatus: $("#organisationDeleteStatus"),
    organisationClose: $("#organisationClose"),
    organisationCancel: $("#organisationCancel"),
    organisationSave: $("#organisationSave"),
    orgId: $("#orgEditId"),
    orgNom: $("#orgEditNom"),
    orgSecteur: $("#orgEditSecteur"),
    newSecteurWrap: $("#newSecteurWrap"),
    orgNewSecteur: $("#orgEditNewSecteur"),
    orgExpertise: $("#orgEditExpertise"),
    orgExpertiseTags: $("#orgExpertiseTags"),
    newExpertiseWrap: $("#newExpertiseWrap"),
    orgNewExpertise: $("#orgEditNewExpertise"),
    addNewExpertiseBtn: $("#addNewExpertiseBtn"),
    orgTheme: $("#orgEditTheme"),
    orgType: $("#orgEditType"),
    newTypeWrap: $("#newTypeWrap"),
    orgNewType: $("#orgEditNewType"),
    orgTaille: $("#orgEditTaille"),
    newTailleWrap: $("#newTailleWrap"),
    orgNewTaille: $("#orgEditNewTaille"),
    orgLocalisation: $("#orgEditLocalisation"),
    orgSite: $("#orgEditSite"),
    orgDescription: $("#orgEditDescription")
  };

  /* --- Noms courts (repli sur nom complet) --- */
  function nomAffiche(p) {
    if (!p) return "";
    return (typeof NOMS_COURTS !== "undefined" && NOMS_COURTS[p.id]) || p.nom;
  }

  const FORM_FIELD_META = {
    organisation: { section: "1 — Votre organisation", label: "Organisation" },
    secteurs: { section: "1 — Votre organisation", label: "Secteurs d'activité" },
    type: { section: "1 — Votre organisation", label: "Type d'organisation" },
    taille: { section: "1 — Votre organisation", label: "Taille" },
    site: { section: "1 — Votre organisation", label: "Site web" },
    description: { section: "1 — Votre organisation", label: "Description" },
    lieu: { section: "1 — Votre organisation", label: "Pays / Ville" },

    contact_nom: { section: "2 — Participant aux rendez-vous", label: "Nom du participant" },
    contact_poste: { section: "2 — Participant aux rendez-vous", label: "Fonction" },
    contact_email: { section: "2 — Participant aux rendez-vous", label: "Courriel" },
    contact_tel: { section: "2 — Participant aux rendez-vous", label: "Téléphone" },
    langues: { section: "2 — Participant aux rendez-vous", label: "Langues" },

    type_recherche: { section: "3 — Qui souhaitez-vous rencontrer ?", label: "Type d'organisation recherché" },
    secteurs_cibles: { section: "3 — Qui souhaitez-vous rencontrer ?", label: "Secteurs ciblés" },
    taille_recherchee: { section: "3 — Qui souhaitez-vous rencontrer ?", label: "Taille recherchée" },
    roles: { section: "3 — Qui souhaitez-vous rencontrer ?", label: "Rôles / fonctions visés" },

    objectifs: { section: "4 — Objectifs des rencontres", label: "Objectifs" },
    objectifs_libre: { section: "4 — Objectifs des rencontres", label: "Précisions" },

    disponibilites_conciergerie: { section: "5 — Disponibilités Conciergerie", label: "Plages réservées" },

    contacts_identifies: { section: "6 — Compléments", label: "Organisations déjà identifiées" }
  };

  /* ═══ SECTION 2 — INITIALISATION ═══════════════════════════════════════ */
  async function init() {
    const params = new URLSearchParams(location.search);
    state.partenaireId = (params.get("p") || "").trim();
    state.adminToken = (params.get("token") || "").trim();

    // Chargement lourd unique pour toute la session admin.
    state.vivier = await API.loadVivier();
    state.orgs = state.vivier.organisations || [];

    const [referentielsResult, notificationsResult] = await Promise.allSettled([
      API.getReferentiels(),
      state.adminToken
        ? API.getFormNotificationsAdmin(state.adminToken)
        : Promise.resolve([])
    ]);

    state.referentiels = referentielsResult.status === "fulfilled"
      ? (referentielsResult.value || {})
      : {};

    const notifications = notificationsResult.status === "fulfilled"
      ? (notificationsResult.value || [])
      : [];

    state.formNotifications = new Map(
      notifications
        .map(item => [String(item.partenaire_id || "").trim(), item])
        .filter(([id]) => Boolean(id))
    );

    buildSidebar();
    buildAxisFilters();
    bindEvents();

    // Rafraîchit les pastilles sans recharger toute l'administration.
    window.setInterval(refreshFormNotifications, 60000);
    window.addEventListener("focus", refreshFormNotifications);

    if (!state.partenaireId) {
      el.title.textContent = "Choisir un partenaire";
      return;
    }

    await loadPartner(state.partenaireId, { updateHistory: false });
  }

  async function loadPartner(partenaireId, { updateHistory = true } = {}) {
    const id = String(partenaireId || "").trim();
    if (!id || (state.partnerLoading && id === state.partenaireId)) return;

    const partenaire = API.getPartenaire(state.vivier, id);
    if (!partenaire) {
      el.title.textContent = "Partenaire introuvable";
      return;
    }

    const requestSeq = ++state.partnerLoadSeq;
    state.partnerLoading = true;
    state.partenaireId = id;

    activatePartnerView();
    updateSidebarActive();
    resetPartnerViewState();

    el.title.textContent = nomAffiche(partenaire);
    if (el.lvl) el.lvl.innerHTML = `<i class="fas fa-medal"></i> Niveau ${partenaire.niveau ?? "—"}`;
    el.kQuota.textContent = partenaire.meeting_quota ?? "—";
    if (el.saveStatus) el.saveStatus.textContent = "Chargement des données du partenaire…";

    if (updateHistory) {
      const url = new URL(location.href);
      url.searchParams.set("p", id);
      url.hash = "";
      history.pushState({ partenaireId: id }, "", url);
    }

    const [propResult, selResult, formResult, formHistoryResult, rdvResult] = await Promise.allSettled([
      API.getPropositionsAdmin(id, state.adminToken),
      API.getSelectionsAdmin(id, state.adminToken),
      API.getFormulaireAdmin(id, state.adminToken),
      API.getFormHistoryAdmin(id, state.adminToken),
      API.getRencontresAdmin(state.adminToken)
    ]);

    if (requestSeq !== state.partnerLoadSeq) return;

    state.proposed = new Set(propResult.status === "fulfilled"
      ? (propResult.value || []).map(value => String(value).trim()).filter(Boolean)
      : []);

    state.selected = new Set(selResult.status === "fulfilled"
      ? (selResult.value || []).map(value => String(value).trim()).filter(Boolean)
      : []);

    state.formHistory = formHistoryResult.status === "fulfilled"
      ? (formHistoryResult.value || [])
      : [];

    const isPlannedField = value => {
      const text = String(value ?? "").trim();
      return Boolean(text && text !== "—");
    };

    state.plannedCount = rdvResult.status === "fulfilled"
      ? (rdvResult.value || []).filter(rdv =>
          String(rdv?.partenaire_id ?? "").trim() === id &&
          isPlannedField(rdv?.date) &&
          isPlannedField(rdv?.heure) &&
          isPlannedField(rdv?.salle)
        ).length
      : 0;

    if (formResult.status === "fulfilled") {
      state.formulaire = formResult.value;
      renderPartnerNeeds(state.formulaire, state.formHistory);
    } else {
      state.formulaire = null;
      renderPartnerNeedsError(formResult.reason);
    }

    setDefaultPartnerSegment();

    state.partnerLoading = false;
    if (el.saveStatus) el.saveStatus.textContent = "";
    render();

    // La pastille disparaît seulement après ouverture effective de la fiche.
    if (state.formNotifications.has(id)) {
      try {
        await API.markFormNotificationsRead(id, state.adminToken);
        state.formNotifications.delete(id);
        updateSidebarNotificationState(id, false);
      } catch (error) {
        console.warn("Notification formulaire non marquée comme lue :", error);
      }
    }
  }

  function setDefaultPartnerSegment() {
    state.segment = state.proposed.size > 0 ? "selected" : "all";
    if (!el.segment) return;

    el.segment.querySelectorAll("button").forEach(button => {
      button.classList.toggle("on", button.dataset.seg === state.segment);
    });
  }

  function resetPartnerViewState() {
    state.proposed = new Set();
    state.selected = new Set();
    state.plannedCount = 0;
    state.formulaire = null;
    state.formHistory = [];
    state.segment = "all";
    state.search = "";

    if (el.search) el.search.value = "";
    [el.filterSecteur, el.filterExpertise, el.filterTaille, el.filterType].forEach(select => {
      if (select) select.value = "";
    });
    if (el.segment) el.segment.querySelectorAll("button").forEach(button => {
      button.classList.toggle("on", button.dataset.seg === "all");
    });

    if (el.needsState) {
      el.needsState.textContent = "Chargement…";
      el.needsState.className = "partner-needs-state loading";
    }
    if (el.needsBody) {
      el.needsBody.innerHTML = `<div class="partner-needs-message"><span class="spinner"></span> Chargement du formulaire…</div>`;
    }
    render();
  }

  function activatePartnerView() {
    const partnerView = document.querySelector("#partnerAdminView");
    const conciergerieView = document.querySelector("#conciergerieView");
    const navConciergerie = document.querySelector("#navConciergerie");
    if (partnerView) partnerView.classList.add("active");
    if (conciergerieView) conciergerieView.classList.remove("active");
    if (navConciergerie) navConciergerie.classList.remove("active");
  }

  function updateSidebarActive() {
    if (!el.nav) return;
    el.nav.querySelectorAll("[data-partner-id]").forEach(link => {
      link.classList.toggle("active", link.dataset.partnerId === state.partenaireId);
    });
  }

  /* ═══ SECTION 3 — BESOINS EXPRIMÉS PAR LE PARTENAIRE ═════════════════ */
  function renderPartnerNeeds(formulaire, historique = []) {
    if (!el.needsBody || !el.needsState) return;

    if (!formulaire) {
      el.needsState.textContent = "Non rempli";
      el.needsState.className = "partner-needs-state empty";
      el.needsBody.innerHTML = `
        <div class="partner-needs-message muted">
          <i class="fas fa-circle-info"></i>
          Ce partenaire n'a pas encore rempli son formulaire de besoins.
        </div>`;
      return;
    }

    const latest = Array.isArray(historique) && historique.length
      ? historique[0]
      : null;

    if (latest && latest.lu_admin === false) {
      el.needsState.textContent = latest.type_evenement === "creation"
        ? "Nouveau formulaire"
        : "Formulaire modifié";
    } else {
      el.needsState.textContent = "Formulaire reçu";
    }
    el.needsState.className = "partner-needs-state received";

    const cherche = [
      needsField("Type d'organisation recherché", formulaire.type_recherche, true),
      needsField("Secteurs ciblés", formulaire.secteurs_cibles, true),
      needsField("Taille recherchée", formulaire.taille_recherchee, true),
      needsField("Rôles / fonctions visés", formulaire.roles)
    ].join("");

    const objectifs = [
      needsField("Objectifs", formulaire.objectifs, true),
      needsField("Précisions", formulaire.objectifs_libre, false, true)
    ].join("");

    const disponibilites = needsField(
      "Plages réservées",
      formulaire.disponibilites_conciergerie,
      true
    );

    const identifies = needsField(
      "Organisations déjà identifiées",
      formulaire.contacts_identifies,
      false,
      true
    );

    const contact = [
      needsField("Nom", formulaire.contact_nom),
      needsField("Poste", formulaire.contact_poste),
      needsField("Courriel", formulaire.contact_email, false, false, "email"),
      needsField("Téléphone", formulaire.contact_tel, false, false, "tel")
    ].join("");

    el.needsBody.innerHTML = `
      <div class="partner-needs-date">
        <i class="fas fa-clock"></i> ${escapeHtml(formatFormDate(formulaire.date_modification))}
      </div>

      ${renderFormHistory(historique)}

      <div class="partner-needs-grid">
        <section class="partner-needs-group">
          <h4><i class="fas fa-magnifying-glass"></i> Ce qu'il cherche</h4>
          ${cherche}
        </section>

        <section class="partner-needs-group">
          <h4><i class="fas fa-bullseye"></i> Objectifs</h4>
          ${objectifs}
        </section>

        <section class="partner-needs-group">
          <h4><i class="fas fa-calendar-check"></i> Disponibilités Conciergerie</h4>
          ${disponibilites}
        </section>

        <section class="partner-needs-group">
          <h4><i class="fas fa-address-book"></i> Déjà identifiés</h4>
          ${identifies}
        </section>

        <section class="partner-needs-group">
          <h4><i class="fas fa-user"></i> Contact</h4>
          ${contact}
        </section>
      </div>`;
  }

  function renderPartnerNeedsError(error) {
    if (!el.needsBody || !el.needsState) return;
    el.needsState.textContent = "Lecture impossible";
    el.needsState.className = "partner-needs-state error";
    el.needsBody.innerHTML = `
      <div class="partner-needs-message error">
        <i class="fas fa-triangle-exclamation"></i>
        ${escapeHtml(error?.message || "Impossible de charger le formulaire de besoins.")}
      </div>`;
  }

  function needsField(label, value, asTags = false, multiline = false, linkType = "") {
    const raw = String(value ?? "").trim();

    let content = `<span class="partner-needs-empty">—</span>`;
    if (raw) {
      if (asTags) {
        content = `<div class="partner-needs-tags">${splitNeedsValues(raw)
          .map(item => `<span>${escapeHtml(item)}</span>`)
          .join("")}</div>`;
      } else if (linkType === "email") {
        content = `<a href="mailto:${escapeAttr(raw)}">${escapeHtml(raw)}</a>`;
      } else if (linkType === "tel") {
        const telHref = raw.replace(/[^\d+]/g, "");
        content = `<a href="tel:${escapeAttr(telHref)}">${escapeHtml(raw)}</a>`;
      } else {
        content = `<span class="${multiline ? "partner-needs-multiline" : ""}">${escapeHtml(raw)}</span>`;
      }
    }

    return `
      <div class="partner-needs-field">
        <span class="partner-needs-label">${escapeHtml(label)}</span>
        <div class="partner-needs-value">${content}</div>
      </div>`;
  }

  function splitNeedsValues(value) {
    return String(value ?? "")
      .split(/\s*,\s*|\n+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function formatFormDate(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "Date de mise à jour non disponible";

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!match) return `Dernière mise à jour : ${raw}`;

    const [, year, month, day, hour, minute] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const dateText = new Intl.DateTimeFormat("fr-CA", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);

    return `Dernière mise à jour : ${dateText}${hour ? ` à ${hour}:${minute}` : ""}`;
  }

  function renderFormHistory(historique) {
    const events = Array.isArray(historique) ? historique : [];
    if (!events.length) return "";

    const eventHtml = events.map((event, index) => {
      const isCreation = event.type_evenement === "creation";
      const title = isCreation ? "Premier formulaire reçu" : "Formulaire modifié";
      const unread = event.lu_admin === false;

      return `
        <details class="partner-history-event${unread ? " is-unread" : ""}" ${index === 0 ? "open" : ""}>
          <summary>
            <span>
              <strong>${escapeHtml(title)}</strong>
              <small>${escapeHtml(formatHistoryDate(event.date_modification))}</small>
            </span>
            ${unread ? `<span class="partner-history-new">Nouveau</span>` : ""}
          </summary>
          <div class="partner-history-event-body">
            ${isCreation
              ? `<p class="partner-history-creation">Le partenaire a envoyé son formulaire pour la première fois.</p>`
              : renderFormChangesBySection(event.changements)}
          </div>
        </details>`;
    }).join("");

    return `
      <details class="partner-history" ${events.some(event => event.lu_admin === false) ? "open" : ""}>
        <summary class="partner-history-summary">
          <span><i class="fas fa-clock-rotate-left"></i> Modifications du formulaire</span>
          <span class="partner-history-count">${events.length}</span>
        </summary>
        <div class="partner-history-list">${eventHtml}</div>
      </details>`;
  }

  function renderFormChangesBySection(changements) {
    const entries = Object.entries(changements || {});
    if (!entries.length) {
      return `<p class="partner-history-creation">Aucun changement détaillé enregistré.</p>`;
    }

    const sections = new Map();

    entries.forEach(([field, values]) => {
      const meta = FORM_FIELD_META[field] || {
        section: "Autres modifications",
        label: field
      };

      if (!sections.has(meta.section)) sections.set(meta.section, []);
      sections.get(meta.section).push({
        label: meta.label,
        avant: values?.avant ?? "",
        apres: values?.apres ?? ""
      });
    });

    return [...sections.entries()].map(([section, changes]) => `
      <section class="partner-history-section">
        <h5>${escapeHtml(section)}</h5>
        ${changes.map(change => `
          <div class="partner-history-change">
            <strong>${escapeHtml(change.label)}</strong>
            <div>
              <span class="before">${escapeHtml(displayHistoryValue(change.avant))}</span>
              <i class="fas fa-arrow-right"></i>
              <span class="after">${escapeHtml(displayHistoryValue(change.apres))}</span>
            </div>
          </div>`).join("")}
      </section>`).join("");
  }

  function displayHistoryValue(value) {
    const text = String(value ?? "").trim();
    return text || "—";
  }

  function formatHistoryDate(value) {
    const raw = String(value ?? "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!match) return raw || "Date inconnue";

    const [, year, month, day, hour, minute] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const dateText = new Intl.DateTimeFormat("fr-CA", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(date);

    return `${dateText}${hour ? ` · ${hour}:${minute}` : ""}`;
  }

  function updateSidebarNotificationState(partenaireId, hasNotification) {
    if (!el.nav) return;

    const link = [...el.nav.querySelectorAll("[data-partner-id]")]
      .find(item => item.dataset.partnerId === partenaireId);

    if (!link) return;

    link.classList.toggle("has-form-update", hasNotification);

    let dot = link.querySelector(".partner-nav-dot");
    if (hasNotification && !dot) {
      dot = document.createElement("span");
      dot.className = "partner-nav-dot";
      dot.setAttribute("aria-label", "Formulaire nouveau ou modifié");
      link.appendChild(dot);
    } else if (!hasNotification && dot) {
      dot.remove();
    }
  }


  async function refreshFormNotifications() {
    if (!state.adminToken || !state.vivier) return;

    try {
      const notifications = await API.getFormNotificationsAdmin(state.adminToken);
      const next = new Map(
        (notifications || [])
          .map(item => [String(item.partenaire_id || "").trim(), item])
          .filter(([id]) => Boolean(id))
      );

      state.formNotifications = next;

      (state.vivier.partenaires || []).forEach(partenaire => {
        const id = String(partenaire.id || "").trim();
        updateSidebarNotificationState(id, next.has(id));
      });
    } catch (error) {
      console.warn("Impossible de rafraîchir les notifications formulaire :", error);
    }
  }

  /* ═══ SECTION 4 — SIDEBAR PARTENAIRES ════════════════════════════════ */
  function buildSidebar() {
    const items = state.vivier.partenaires.map(p => {
      const hasNotification = state.formNotifications.has(String(p.id || "").trim());

      return `
        <a href="?p=${encodeURIComponent(p.id)}${state.adminToken ? "&token=" + encodeURIComponent(state.adminToken) : ""}"
           class="nav-item partner-nav-item ${p.id === state.partenaireId ? "active" : ""}${hasNotification ? " has-form-update" : ""}"
           data-partner-id="${escapeAttr(p.id)}"
           data-nom="${escapeHtml(nomAffiche(p).toLowerCase())}">
          <span class="partner-nav-main">
            <i class="fas fa-building"></i>
            <span class="partner-nav-label">${escapeHtml(nomAffiche(p))}</span>
          </span>
          ${hasNotification
            ? `<span class="partner-nav-dot" aria-label="Formulaire nouveau ou modifié"></span>`
            : ""}
        </a>`;
    }).join("");

    el.nav.innerHTML = items;
  }

  /* ═══ SECTION 5 — FILTRES ET ÉVÉNEMENTS ══════════════════════════════ */
  function buildAxisFilters() {
    fillFilter(el.filterSecteur, state.referentiels.secteur, "Tous");
    fillFilter(el.filterExpertise, state.referentiels.expertise, "Toutes");
    fillFilter(el.filterTaille, state.referentiels.taille, "Toutes");
    fillFilter(el.filterType, state.referentiels.type, "Tous");
  }

  function fillFilter(select, values, allLabel) {
    const list = Array.isArray(values) ? values : [];
    select.innerHTML = `<option value="">${allLabel}</option>` + list
      .map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)
      .join("");
  }

  const orgTheme = o => String(o?.theme || o?.thematique || "").trim();

  /* --- EVENTS --- */
  function bindEvents() {
    if (el.nav) el.nav.addEventListener("click", e => {
      const link = e.target.closest("[data-partner-id]");
      if (!link) return;
      e.preventDefault();
      const id = String(link.dataset.partnerId || "").trim();
      if (!id) return;

      const samePartner = id === state.partenaireId;
      if (samePartner && !state.formNotifications.has(id)) return;

      loadPartner(id, { updateHistory: !samePartner });
    });

    window.addEventListener("popstate", () => {
      if (location.hash === "#conciergerie") return;
      const id = String(new URLSearchParams(location.search).get("p") || "").trim();
      if (id && id !== state.partenaireId) loadPartner(id, { updateHistory: false });
    });

    el.search.addEventListener("input", e => { state.search = e.target.value.toLowerCase(); render(); });
    el.segment.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      state.segment = b.dataset.seg;
      el.segment.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      render();
    });
    [el.filterSecteur, el.filterExpertise, el.filterTaille, el.filterType]
      .forEach(select => select.addEventListener("change", render));

    // Cocher / décocher une proposition
    el.tbody.addEventListener("change", e => {
      const cb = e.target.closest("input[type='checkbox'][data-org-id]");
      if (!cb) return;
      const id = cb.dataset.orgId;
      cb.checked ? state.proposed.add(id) : state.proposed.delete(id);
      updateProposedCount();
    });

    if (el.saveBtn) el.saveBtn.addEventListener("click", saveProposals);
    if (el.addOrganisation) el.addOrganisation.addEventListener("click", () => openOrganisationModal());
    if (el.manageReferentiels) el.manageReferentiels.addEventListener("click", openReferentielModal);
    if (el.referentielClose) el.referentielClose.addEventListener("click", closeReferentielModal);
    if (el.referentielCancel) el.referentielCancel.addEventListener("click", closeReferentielModal);
    if (el.referentielCategory) el.referentielCategory.addEventListener("change", () => {
      state.referentielEdit = null;
      renderReferentielManager();
    });
    if (el.referentielModal) el.referentielModal.addEventListener("click", e => {
      if (e.target === el.referentielModal) closeReferentielModal();
    });
    if (el.referentielList) el.referentielList.addEventListener("click", handleReferentielAction);
    if (el.referentielDeleteClose) el.referentielDeleteClose.addEventListener("click", closeReferentielDeleteModal);
    if (el.referentielDeleteCancel) el.referentielDeleteCancel.addEventListener("click", closeReferentielDeleteModal);
    if (el.referentielDeleteConfirm) el.referentielDeleteConfirm.addEventListener("click", confirmReferentielDelete);
    if (el.referentielDeleteModal) el.referentielDeleteModal.addEventListener("click", e => {
      if (e.target === el.referentielDeleteModal) closeReferentielDeleteModal();
    });
    if (el.organisationClose) el.organisationClose.addEventListener("click", closeOrganisationModal);
    if (el.organisationCancel) el.organisationCancel.addEventListener("click", closeOrganisationModal);
    if (el.organisationSave) el.organisationSave.addEventListener("click", saveOrganisation);
    if (el.organisationDelete) el.organisationDelete.addEventListener("click", openOrganisationDeleteModal);
    if (el.organisationDeleteClose) el.organisationDeleteClose.addEventListener("click", closeOrganisationDeleteModal);
    if (el.organisationDeleteCancel) el.organisationDeleteCancel.addEventListener("click", closeOrganisationDeleteModal);
    if (el.organisationDeleteConfirm) el.organisationDeleteConfirm.addEventListener("click", confirmOrganisationDelete);
    if (el.organisationDeleteModal) el.organisationDeleteModal.addEventListener("click", e => {
      if (e.target === el.organisationDeleteModal) closeOrganisationDeleteModal();
    });
    [
      [el.orgSecteur, "secteur"],
      [el.orgType, "type"],
      [el.orgTaille, "taille"]
    ].forEach(([select, categorie]) => {
      if (select) select.addEventListener("change", () => handleReferenceChoice(categorie));
    });
    if (el.orgExpertise) el.orgExpertise.addEventListener("change", handleExpertisePicker);
    if (el.addNewExpertiseBtn) el.addNewExpertiseBtn.addEventListener("click", addNewExpertiseTag);
    if (el.orgNewExpertise) el.orgNewExpertise.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); addNewExpertiseTag(); }
    });
    if (el.orgExpertiseTags) el.orgExpertiseTags.addEventListener("click", e => {
      const btn = e.target.closest("[data-remove-expertise]");
      if (!btn) return;
      state.editExpertises = state.editExpertises.filter(value => value !== btn.dataset.removeExpertise);
      renderExpertiseTags();
      fillExpertisePicker();
    });
    if (el.organisationModal) el.organisationModal.addEventListener("click", e => { if (e.target === el.organisationModal) closeOrganisationModal(); });
    el.tbody.addEventListener("click", e => {
      const btn = e.target.closest("[data-edit-org]");
      if (!btn) return;
      const org = state.orgs.find(o => o.id === btn.dataset.editOrg);
      if (org) openOrganisationModal(org);
    });
  }

  /* ═══ SECTION 6 — FILTRAGE ET RENDU DU TABLEAU ═══════════════════════ */
  function rows() {
    return state.orgs.filter(o => {
      const prop = state.proposed.has(o.id);
      const accepted = state.selected.has(o.id);
      if (state.segment === "selected" && !prop) return false;
      if (state.segment === "accepted" && !accepted) return false;
      if (state.segment === "unselected" && prop) return false;

      if (el.filterSecteur.value && String(o.secteur || "").trim() !== el.filterSecteur.value.trim()) return false;
      if (el.filterExpertise.value && !expertiseValues(o.expertise).includes(el.filterExpertise.value.trim())) return false;
      if (el.filterTaille.value && String(o.taille || "").trim() !== el.filterTaille.value.trim()) return false;
      if (el.filterType.value && String(o.type || "").trim() !== el.filterType.value.trim()) return false;

      if (state.search) {
        const searchable = [
          o.nom,
          o.secteur,
          expertiseValues(o.expertise).join(" "),
          o.type,
          o.taille,
          o.localisation,
          o.description,
          o.site_web,
          orgTheme(o)
        ]
          .map(value => String(value ?? "").trim())
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(state.search)) return false;
      }
      return true;
    });
  }

  function updateProposedCount() {
    el.kProposed.textContent = state.proposed.size;
    const proposedCount = state.proposed.size;
    const acceptedCount = state.selected.size;

    el.segment.querySelector('[data-seg="selected"]').textContent = `Proposés (${proposedCount})`;
    el.segment.querySelector('[data-seg="accepted"]').textContent = `Acceptés (${acceptedCount})`;
    el.segment.querySelector('[data-seg="all"]').textContent = `Tous (${state.orgs.length})`;
    el.segment.querySelector('[data-seg="unselected"]').textContent = `Non proposés (${state.orgs.length - proposedCount})`;
  }

  /* --- RENDER --- */
  function render() {
    const list = rows();
    el.kProposed.textContent = state.proposed.size;
    el.kSelected.textContent = state.selected.size;
    if (el.kPlanned) {
      el.kPlanned.textContent = `${state.plannedCount} / ${state.selected.size}`;
    }
    updateProposedCount();

    el.tbody.innerHTML = list.length ? list.map(o => {
      const prop = state.proposed.has(o.id);
      const chosen = state.selected.has(o.id);
      return `<tr class="${prop ? "is-selected" : ""}">
        <td class="check-cell"><input type="checkbox" data-org-id="${escapeAttr(o.id)}" ${prop ? "checked" : ""} aria-label="Proposer ${escapeAttr(o.nom)}"></td>
        <td><span class="org-name">${escapeHtml(o.nom)}</span></td>
        <td>${escapeHtml(o.secteur || "—")}</td>
        <td>${renderExpertiseBadges(o.expertise)}</td>
        <td>${escapeHtml(o.taille || "—")}</td>
        <td>${escapeHtml(o.type || "—")}</td>
        <td>${escapeHtml(o.localisation || "—")}</td>
        <td>${chosen
          ? `<span class="sel-dot"><i class="fas fa-circle-check"></i> Sélectionnée</span>`
          : `<span class="sel-dot no"><i class="far fa-circle"></i> —</span>`}</td>
        <td><button class="btn btn-outline btn-sm edit-org-btn" type="button" data-edit-org="${escapeAttr(o.id)}"><i class="fas fa-pen"></i> Modifier</button></td>
      </tr>`;
    }).join("") : `<tr><td colspan="9" class="empty-state">Aucune organisation ne correspond à ces filtres.</td></tr>`;
  }

  /* ═══ SECTION 7 — ENREGISTREMENT DES PROPOSITIONS ════════════════════ */
  async function saveProposals() {
    if (!state.partenaireId) return;
    el.saveBtn.disabled = true;
    const original = el.saveBtn.innerHTML;
    el.saveBtn.innerHTML = `<span class="spinner"></span> Enregistrement…`;
    if (el.saveStatus) el.saveStatus.textContent = "";
    try {
      const result = await API.savePropositions(state.partenaireId, state.adminToken, [...state.proposed]);
      if (el.saveStatus) el.saveStatus.textContent = `${result.count ?? state.proposed.size} proposition(s) enregistrée(s).`;
      toast("Propositions enregistrées.");
    } catch (err) {
      if (el.saveStatus) el.saveStatus.textContent = err.message || "Échec de l'enregistrement.";
      toast(err.message || "Échec de l'enregistrement.", true);
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.innerHTML = original;
    }
  }



  /* ═══ SECTION 8 — GESTION DES RÉFÉRENTIELS ════════════════════════════ */
  function openReferentielModal() {
    if (!el.referentielModal) return;
    el.referentielModal.hidden = false;
    if (el.referentielStatus) el.referentielStatus.textContent = "";
    renderReferentielManager();
  }

  function closeReferentielModal() {
    state.referentielEdit = null;
    closeReferentielDeleteModal();
    if (el.referentielModal) el.referentielModal.hidden = true;
  }

  function referentielUsages(categorie, valeur) {
    const target = String(valeur || "").trim();
    if (!target) return [];

    return state.orgs.filter(org => {
      if (categorie === "expertise") return expertiseValues(org.expertise).includes(target);
      return String(org?.[categorie] || "").trim() === target;
    });
  }

  function referentielLabel(categorie) {
    return {
      secteur: "Secteur",
      expertise: "Expertise",
      type: "Type",
      taille: "Taille"
    }[categorie] || categorie;
  }

  function renderReferentielManager() {
    if (!el.referentielList || !el.referentielCategory) return;
    const categorie = el.referentielCategory.value;
    const values = Array.isArray(state.referentiels[categorie]) ? state.referentiels[categorie] : [];

    if (el.referentielCount) {
      el.referentielCount.textContent = `${values.length} appellation${values.length > 1 ? "s" : ""}`;
    }

    el.referentielList.innerHTML = values.length ? values.map(value => {
      const usages = referentielUsages(categorie, value);
      const used = usages.length > 0;
      const title = used
        ? `Utilisée par : ${usages.slice(0, 8).map(o => o.nom).join(", ")}${usages.length > 8 ? "…" : ""}`
        : "Aucune organisation liée";

      const editing = state.referentielEdit &&
        state.referentielEdit.categorie === categorie &&
        state.referentielEdit.ancienne === value;

      return `<div class="referentiel-row ${editing ? "is-editing" : ""}">
        <div class="referentiel-value">
          ${editing
            ? `<input class="referentiel-edit-input" type="text"
                      data-ref-edit-input
                      value="${escapeAttr(state.referentielEdit.nouvelle)}"
                      aria-label="Modifier l'appellation">`
            : escapeHtml(value)}
        </div>
        <div class="referentiel-usage" title="${escapeAttr(title)}">
          ${used
            ? `<span class="usage-badge used">${usages.length} utilisation${usages.length > 1 ? "s" : ""}</span>`
            : `<span class="usage-badge free">Non utilisée</span>`}
        </div>
        <div class="referentiel-actions">
          ${editing ? `
            <button class="btn btn-primary btn-sm" type="button"
                    data-save-ref="${escapeAttr(value)}"
                    data-ref-category="${escapeAttr(categorie)}">
              <i class="fas fa-save"></i> Enregistrer
            </button>
            <button class="btn btn-outline btn-sm" type="button"
                    data-cancel-ref="${escapeAttr(value)}"
                    data-ref-category="${escapeAttr(categorie)}">
              Annuler
            </button>
          ` : `
            <button class="btn btn-outline btn-sm" type="button"
                    data-rename-ref="${escapeAttr(value)}"
                    data-ref-category="${escapeAttr(categorie)}">
              <i class="fas fa-pen"></i> Modifier
            </button>
          `}
          <button class="btn btn-outline btn-sm danger-soft" type="button"
                  data-delete-ref="${escapeAttr(value)}"
                  data-ref-category="${escapeAttr(categorie)}"
                  ${used || editing ? "disabled" : ""}
                  title="${used ? "Suppression impossible : cette appellation est utilisée." : editing ? "Terminez ou annulez la modification avant de supprimer." : "Supprimer cette appellation"}">
            <i class="fas fa-trash"></i> Supprimer
          </button>
        </div>
      </div>`;
    }).join("") : `<div class="empty-state">Aucune appellation dans ce référentiel.</div>`;
  }

  async function handleReferentielAction(e) {
    const renameBtn = e.target.closest("[data-rename-ref]");
    if (renameBtn) {
      startReferentielEdit(renameBtn.dataset.refCategory, renameBtn.dataset.renameRef);
      return;
    }

    const saveBtn = e.target.closest("[data-save-ref]");
    if (saveBtn) {
      await saveReferentielEdit(saveBtn.dataset.refCategory, saveBtn.dataset.saveRef);
      return;
    }

    const cancelBtn = e.target.closest("[data-cancel-ref]");
    if (cancelBtn) {
      cancelReferentielEdit();
      return;
    }

    const deleteBtn = e.target.closest("[data-delete-ref]");
    if (deleteBtn) {
      await deleteReferentiel(deleteBtn.dataset.refCategory, deleteBtn.dataset.deleteRef);
    }
  }

  function startReferentielEdit(categorie, ancienne) {
    state.referentielEdit = { categorie, ancienne, nouvelle: ancienne };
    renderReferentielManager();

    const input = el.referentielList?.querySelector("[data-ref-edit-input]");
    if (!input) return;

    input.focus();
    input.select();

    input.addEventListener("input", () => {
      if (state.referentielEdit) state.referentielEdit.nouvelle = input.value;
    });

    input.addEventListener("keydown", async event => {
      if (event.key === "Enter") {
        event.preventDefault();
        await saveReferentielEdit(categorie, ancienne);
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelReferentielEdit();
      }
    });
  }

  function cancelReferentielEdit() {
    state.referentielEdit = null;
    renderReferentielManager();
  }

  async function saveReferentielEdit(categorie, ancienne) {
    const input = el.referentielList?.querySelector("[data-ref-edit-input]");
    const nouvelle = String(input?.value || state.referentielEdit?.nouvelle || "").trim();

    if (!nouvelle) {
      toast("La nouvelle appellation ne peut pas être vide.", true);
      input?.focus();
      return;
    }

    if (nouvelle === ancienne) {
      state.referentielEdit = null;
      renderReferentielManager();
      return;
    }

    const existe = (state.referentiels[categorie] || []).includes(nouvelle);
    if (existe) {
      toast(`L'appellation « ${nouvelle} » existe déjà.`, true);
      input?.focus();
      return;
    }

    await renameReferentiel(categorie, ancienne, nouvelle);
  }

  function organisationAvecReferentielRenomme(org, categorie, ancienne, nouvelle) {
    const copie = {
      id: org.id,
      nom: org.nom || "",
      secteur: org.secteur || "",
      expertise: expertiseValues(org.expertise),
      type: org.type || "",
      taille: org.taille || "",
      localisation: org.localisation || "",
      description: org.description || "",
      site_web: org.site_web || "",
      theme: orgTheme(org)
    };

    if (categorie === "expertise") {
      copie.expertise = copie.expertise.map(value => value === ancienne ? nouvelle : value);
    } else {
      copie[categorie] = nouvelle;
    }

    return copie;
  }

  async function renameReferentiel(categorie, ancienne, nouvelle) {
    const usages = referentielUsages(categorie, ancienne);

    setReferentielBusy(true, "Modification en cours…");
    try {
      await API.addReferentiel(state.adminToken, categorie, nouvelle);

      for (const org of usages) {
        await API.saveOrganisation(
          state.adminToken,
          organisationAvecReferentielRenomme(org, categorie, ancienne, nouvelle)
        );
      }

      await API.deleteReferentiel(state.adminToken, categorie, ancienne, 0);

      state.referentielEdit = null;
      await refreshAfterReferentielChange();
      toast(`${referentielLabel(categorie)} modifié${categorie === "expertise" ? "e" : ""}.`);
    } catch (err) {
      toast(err.message || "Échec de la modification du référentiel.", true);
      try {
        state.referentiels = await API.getReferentiels();
        renderReferentielManager();
      } catch (_) {}
    } finally {
      setReferentielBusy(false, "");
    }
  }

  async function deleteReferentiel(categorie, valeur) {
    const usages = referentielUsages(categorie, valeur);
    if (usages.length) {
      toast(`Suppression impossible : ${usages.length} organisation(s) utilisent encore « ${valeur} ».`, true);
      renderReferentielManager();
      return;
    }

    state.referentielDelete = { categorie, valeur };
    if (el.referentielDeleteValue) el.referentielDeleteValue.textContent = `« ${valeur} »`;
    if (el.referentielDeleteStatus) el.referentielDeleteStatus.textContent = "";
    if (el.referentielDeleteModal) el.referentielDeleteModal.hidden = false;
  }

  function closeReferentielDeleteModal() {
    state.referentielDelete = null;
    if (el.referentielDeleteStatus) el.referentielDeleteStatus.textContent = "";
    if (el.referentielDeleteModal) el.referentielDeleteModal.hidden = true;
  }

  async function confirmReferentielDelete() {
    const pending = state.referentielDelete;
    if (!pending) return;

    const usages = referentielUsages(pending.categorie, pending.valeur);
    if (usages.length) {
      if (el.referentielDeleteStatus) {
        el.referentielDeleteStatus.textContent =
          `Suppression impossible : ${usages.length} organisation(s) utilisent encore cette appellation.`;
      }
      return;
    }

    const btn = el.referentielDeleteConfirm;
    const original = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Suppression…`;
    }

    try {
      await API.deleteReferentiel(state.adminToken, pending.categorie, pending.valeur, 0);
      closeReferentielDeleteModal();
      await refreshAfterReferentielChange();
      toast("Appellation supprimée.");
    } catch (err) {
      if (el.referentielDeleteStatus) {
        el.referentielDeleteStatus.textContent =
          err.message || "Échec de la suppression du référentiel.";
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  }

  async function refreshAfterReferentielChange() {
    state.referentiels = await API.getReferentiels();
    API.resetCache();
    state.vivier = await API.loadVivier();
    state.orgs = state.vivier.organisations || [];
    buildAxisFilters();
    render();
    renderReferentielManager();
  }

  function setReferentielBusy(busy, message) {
    if (el.referentielStatus) el.referentielStatus.textContent = message || "";
    if (!el.referentielList) return;
    el.referentielList.querySelectorAll("button").forEach(btn => {
      if (busy) {
        btn.dataset.wasDisabled = btn.disabled ? "1" : "0";
        btn.disabled = true;
      } else if (btn.dataset.wasDisabled !== "1") {
        btn.disabled = false;
      }
    });
  }

  /* ═══ SECTION 9 — ÉDITEUR DU VIVIER ═══════════════════════════════════ */

  /* Secteur : référentiel central administrable.
     Type / taille / thème : valeurs déjà présentes dans le vivier. */
  const ADD_NEW_SECTOR = "__add_new_sector__";

  function referenceValues(getter) {
    return [...new Set(state.orgs
      .map(getter)
      .map(value => String(value ?? "").trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }

  function fillReferenceSelect(select, values, currentValue = "") {
    const current = String(currentValue ?? "").trim();
    const options = [...values];
    if (current && !options.includes(current)) options.push(current);
    options.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    select.innerHTML = `<option value="">— Non renseigné —</option>` + options
      .map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)
      .join("");
    select.value = current;
  }

  const ADD_NEW_REFERENCE = "__add_new_reference__";

  const referenceConfig = {
    secteur: { select: () => el.orgSecteur, wrap: () => el.newSecteurWrap, input: () => el.orgNewSecteur, label: "secteur" },
    type: { select: () => el.orgType, wrap: () => el.newTypeWrap, input: () => el.orgNewType, label: "type" },
    taille: { select: () => el.orgTaille, wrap: () => el.newTailleWrap, input: () => el.orgNewTaille, label: "taille" }
  };

  function centralReferenceValues(categorie, currentValue = "") {
    const values = Array.isArray(state.referentiels[categorie]) ? [...state.referentiels[categorie]] : [];
    const current = String(currentValue || "").trim();
    if (current && !values.includes(current)) values.push(current);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }

  function fillCentralReference(categorie, currentValue = "") {
    const cfg = referenceConfig[categorie];
    if (!cfg) return;
    const select = cfg.select();
    const wrap = cfg.wrap();
    const input = cfg.input();
    const current = String(currentValue || "").trim();
    const values = centralReferenceValues(categorie, current);

    select.innerHTML = `<option value="">— Non renseigné —</option>` +
      values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("") +
      `<option value="${ADD_NEW_REFERENCE}">+ Ajouter une nouvelle appellation</option>`;

    select.value = current;
    if (wrap) wrap.hidden = true;
    if (input) input.value = "";
  }

  function handleReferenceChoice(categorie) {
    const cfg = referenceConfig[categorie];
    if (!cfg) return;
    const adding = cfg.select().value === ADD_NEW_REFERENCE;
    if (cfg.wrap()) cfg.wrap().hidden = !adding;
    if (adding && cfg.input()) setTimeout(() => cfg.input().focus(), 0);
  }


  function expertiseValues(value) {
    if (Array.isArray(value)) return [...new Set(value.map(v => String(v || "").trim()).filter(Boolean))];
    const text = String(value || "").trim();
    if (!text) return [];
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return expertiseValues(parsed);
      } catch (_) {}
    }
    return [...new Set(text.split(",").map(v => v.trim()).filter(Boolean))];
  }

  function renderExpertiseBadges(value) {
    const values = expertiseValues(value);
    if (!values.length) return "—";
    return `<div class="expertise-badges">${values
      .map(v => `<span class="expertise-badge">${escapeHtml(v)}</span>`)
      .join("")}</div>`;
  }

  function renderExpertiseTags() {
    if (!el.orgExpertiseTags) return;
    el.orgExpertiseTags.innerHTML = state.editExpertises.length
      ? state.editExpertises.map(value =>
          `<span class="expertise-tag">${escapeHtml(value)}
             <button type="button" data-remove-expertise="${escapeAttr(value)}" aria-label="Retirer ${escapeAttr(value)}">×</button>
           </span>`).join("")
      : `<span class="expertise-empty">Aucune expertise sélectionnée</span>`;
  }

  function fillExpertisePicker() {
    if (!el.orgExpertise) return;
    const values = Array.isArray(state.referentiels.expertise) ? state.referentiels.expertise : [];
    const available = values.filter(value => !state.editExpertises.includes(value));
    el.orgExpertise.innerHTML =
      `<option value="">+ Ajouter une expertise</option>` +
      available.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("") +
      `<option value="${ADD_NEW_REFERENCE}">+ Nouvelle expertise</option>`;
    el.orgExpertise.value = "";
    if (el.newExpertiseWrap) el.newExpertiseWrap.hidden = true;
    if (el.orgNewExpertise) el.orgNewExpertise.value = "";
  }

  function handleExpertisePicker() {
    const value = el.orgExpertise.value;
    if (!value) return;
    if (value === ADD_NEW_REFERENCE) {
      if (el.newExpertiseWrap) el.newExpertiseWrap.hidden = false;
      if (el.orgNewExpertise) setTimeout(() => el.orgNewExpertise.focus(), 0);
      return;
    }
    if (!state.editExpertises.includes(value)) state.editExpertises.push(value);
    renderExpertiseTags();
    fillExpertisePicker();
  }

  function addNewExpertiseTag() {
    const value = String(el.orgNewExpertise?.value || "").trim();
    if (!value) { toast("Saisis la nouvelle expertise.", true); el.orgNewExpertise?.focus(); return; }
    if (!state.editExpertises.includes(value)) state.editExpertises.push(value);
    if (!(state.referentiels.expertise || []).includes(value)) state.pendingExpertises.add(value);
    renderExpertiseTags();
    fillExpertisePicker();
  }

  function prepareReferenceSelects(org = null) {
    fillCentralReference("secteur", org?.secteur || "");
    state.editExpertises = expertiseValues(org?.expertise);
    state.pendingExpertises = new Set();
    renderExpertiseTags();
    fillExpertisePicker();
    fillReferenceSelect(el.orgTheme, referenceValues(orgTheme), org ? orgTheme(org) : "");
    fillCentralReference("type", org?.type || "");
    fillCentralReference("taille", org?.taille || "");
  }

  function openOrganisationModal(org = null) {
    const edition = Boolean(org);
    el.organisationModalTitle.innerHTML = edition
      ? `<i class="fas fa-pen-to-square"></i> Modifier l'organisation`
      : `<i class="fas fa-plus"></i> Ajouter une organisation`;

    prepareReferenceSelects(org);

    el.orgId.value = edition ? String(org.id || "").trim() : "";
    el.orgNom.value = edition ? (org.nom || "") : "";
    el.orgLocalisation.value = edition ? (org.localisation || "") : "";
    el.orgSite.value = edition ? (org.site_web || "") : "";
    el.orgDescription.value = edition ? (org.description || "") : "";

    const localEditable = edition && /^loc-\d+$/.test(String(org.id || "").trim());
    if (el.organisationDelete) el.organisationDelete.hidden = !localEditable;

    el.organisationModal.hidden = false;
    setTimeout(() => el.orgNom.focus(), 0);
  }

  function closeOrganisationModal() {
    closeOrganisationDeleteModal();
    if (el.organisationModal) el.organisationModal.hidden = true;
  }


  function openOrganisationDeleteModal() {
    const id = String(el.orgId?.value || "").trim();
    if (!/^loc-\d+$/.test(id)) {
      toast("Cette organisation provient du vivier importé. Supprime-la dans Airtable puis réimporte le vivier.", true);
      return;
    }
    if (el.organisationDeleteName) el.organisationDeleteName.textContent = `« ${el.orgNom.value.trim() || id} »`;
    if (el.organisationDeleteStatus) el.organisationDeleteStatus.textContent = "";
    if (el.organisationDeleteModal) el.organisationDeleteModal.hidden = false;
  }

  function closeOrganisationDeleteModal() {
    if (el.organisationDeleteStatus) el.organisationDeleteStatus.textContent = "";
    if (el.organisationDeleteModal) el.organisationDeleteModal.hidden = true;
  }

  async function confirmOrganisationDelete() {
    const id = String(el.orgId?.value || "").trim();
    if (!/^loc-\d+$/.test(id)) return;

    const btn = el.organisationDeleteConfirm;
    const original = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Suppression…`;
    }

    try {
      await API.deleteOrganisation(state.adminToken, id);
      closeOrganisationDeleteModal();
      if (el.organisationModal) el.organisationModal.hidden = true;
      API.resetCache();
      state.vivier = await API.loadVivier();
      state.orgs = state.vivier.organisations || [];
      buildSidebar();
      buildAxisFilters();
      updateSidebarActive();
      render();
      toast("Organisation supprimée.");
    } catch (err) {
      if (el.organisationDeleteStatus) {
        el.organisationDeleteStatus.textContent = err.message || "Échec de la suppression de l'organisation.";
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  }

  function selectedReferenceValue(categorie) {
    const cfg = referenceConfig[categorie];
    if (!cfg) return "";
    return cfg.select().value === ADD_NEW_REFERENCE
      ? cfg.input().value.trim()
      : cfg.select().value.trim();
  }

  function collectOrganisation() {
    return {
      id: el.orgId.value.trim(),
      nom: el.orgNom.value.trim(),
      secteur: selectedReferenceValue("secteur"),
      expertise: [...state.editExpertises],
      type: selectedReferenceValue("type"),
      taille: selectedReferenceValue("taille"),
      localisation: el.orgLocalisation.value.trim(),
      description: el.orgDescription.value.trim(),
      site_web: el.orgSite.value.trim(),
      theme: el.orgTheme.value.trim()
    };
  }

  async function saveOrganisation() {
    const organisation = collectOrganisation();
    if (!organisation.nom) { toast("Le nom de l'organisation est requis.", true); el.orgNom.focus(); return; }
    for (const categorie of ["secteur", "type", "taille"]) {
      const cfg = referenceConfig[categorie];
      if (cfg.select().value === ADD_NEW_REFERENCE && !selectedReferenceValue(categorie)) {
        toast(`Saisis la nouvelle appellation pour ${cfg.label}.`, true);
        cfg.input().focus();
        return;
      }
    }

    const original = el.organisationSave.innerHTML;
    el.organisationSave.disabled = true;
    el.organisationSave.innerHTML = `<span class="spinner"></span> Enregistrement…`;

    try {
      for (const categorie of ["secteur", "type", "taille"]) {
        const cfg = referenceConfig[categorie];
        if (cfg.select().value === ADD_NEW_REFERENCE) {
          await API.addReferentiel(state.adminToken, categorie, organisation[categorie]);
        }
      }
      for (const expertise of state.pendingExpertises) {
        await API.addReferentiel(state.adminToken, "expertise", expertise);
      }
      state.referentiels = await API.getReferentiels();

      const result = await API.saveOrganisation(state.adminToken, organisation);
      closeOrganisationModal();
      API.resetCache();
      state.vivier = await API.loadVivier();
      state.orgs = state.vivier.organisations || [];
      buildSidebar();
      buildAxisFilters();
      updateSidebarActive();
      render();
      toast(organisation.id ? "Organisation modifiée." : `Organisation ajoutée (${result.id}).`);
    } catch (err) {
      toast(err.message || "Échec de l'enregistrement de l'organisation.", true);
    } finally {
      el.organisationSave.disabled = false;
      el.organisationSave.innerHTML = original;
    }
  }

  /* ═══ SECTION 10 — UTILITAIRES ═════════════════════════════════════════ */
  function toast(msg, isErr) {
    const t = document.createElement("div");
    t.className = "toast" + (isErr ? " toast-error" : "");
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escapeAttr = escapeHtml;

  document.addEventListener("DOMContentLoaded", init);
})();
