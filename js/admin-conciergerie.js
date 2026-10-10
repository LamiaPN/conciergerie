/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-conciergerie.js
   VERSION : v76 — statuts RDV par partenaire + propositions supplémentaires
   RÔLE    : Planning Conciergerie — sélections uniquement.

   RÈGLES :
   - Dates : 13, 14, 15 octobre 2026 uniquement.
   - Créneaux : 30 min, de 09:00 à 16:30 inclus.
   - 2 salles par défaut, possibilité d'ajouter des salles.
   - Mail RDV prérempli depuis le formulaire s'il existe, mais modifiable.
   - Un RDV complet = Date + Heure + Salle.
   - Conflits bloquants :
     • même salle au même créneau ;
     • même partenaire au même créneau ;
     • même organisation au même créneau.
   - IDs sensibles à la casse : trim() uniquement.
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const EVENT_DATES = [
    { value: "2026-10-13", label: "13 oct. 2026" },
    { value: "2026-10-14", label: "14 oct. 2026" },
    { value: "2026-10-15", label: "15 oct. 2026" }
  ];

  const AVAILABILITY_WINDOWS = {
    "2026-10-13": { matin: "Mardi matin", apresMidi: "Mardi après-midi" },
    "2026-10-14": { matin: "Mercredi matin", apresMidi: "Mercredi après-midi" },
    "2026-10-15": { matin: "Jeudi matin", apresMidi: "Jeudi après-midi" }
  };

  const APRES_MIDI_A_PARTIR_DE = 13 * 60;

  /* ═══ CONSTANTES MÉTIER DU CALENDRIER ════════════════════════════════ */
  const HEURE_DEBUT = 9;
  const HEURE_FIN = 17;
  const PAS_MIN = 30;

  const TIME_SLOTS = buildTimeSlots(
    `${String(HEURE_DEBUT).padStart(2, "0")}:00`,
    `${String(HEURE_FIN).padStart(2, "0")}:00`,
    PAS_MIN
  );

  const DEFAULT_ROOMS = [
    "Salle Conciergerie 1",
    "Salle Conciergerie 2"
  ];

  const state = {
    adminToken: "",
    vivier: null,
    loading: false,
    relations: [],
    mode: "organisation",
    rdvFilter: "all",
    drafts: new Map(),
    dirty: new Set(),
    rooms: [...DEFAULT_ROOMS],
    calendarRooms: [],
    calendarDate: EVENT_DATES[0].value,
    calendarView: "planning",
    calendarRoom: DEFAULT_ROOMS[0],
    calendarPartnerId: "",
    singleNotificationKey: "",
    contactsByOrganisation: new Map(),
    formsByPartner: new Map(),
    conflicts: new Map(),
    availabilityWarnings: new Map()
  };

  const $ = selector => document.querySelector(selector);
  const exactId = value => String(value ?? "").trim();
  const relationKey = (partenaireId, organisationId) =>
    `${exactId(partenaireId)}::${exactId(organisationId)}`;

  const escapeHtml = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  function showConciergerieToast(message, type = "success") {
    let toast = document.querySelector("#conciergerieToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "conciergerieToast";
      toast.className = "conciergerie-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    toast.textContent = String(message || "").trim();
    toast.className = `conciergerie-toast ${type === "error" ? "error" : "success"} show`;

    window.clearTimeout(showConciergerieToast._timer);
    showConciergerieToast._timer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 4000);
  }

  function nomAffiche(partenaire) {
    if (!partenaire) return "";

    return (
      typeof NOMS_COURTS !== "undefined" &&
      NOMS_COURTS[partenaire.id]
    )
      || partenaire.nom
      || partenaire.id;
  }

  /* Affichage compact réservé aux rendez-vous : garde le sigle avant
     une parenthèse ou avant un tiret séparateur, sans modifier les données. */
  function nomRdvCourt(value) {
    let text = exactId(value);
    if (!text) return "";

    const paren = text.indexOf("(");
    if (paren > 0) text = text.slice(0, paren).trim();

    const match = text.match(/\s[-–—]\s/);
    if (match && Number.isInteger(match.index) && match.index > 0) {
      text = text.slice(0, match.index).trim();
    }

    return text;
  }

  const el = {};

  function cacheDom() {
    el.nav = $("#navConciergerie");
    el.partnerView = $("#partnerAdminView");
    el.view = $("#conciergerieView");
    el.title = $("#adminTitle");
    el.content = $("#conciergerieContent");
    el.loading = $("#conciergerieLoading");
    el.error = $("#conciergerieError");

    el.orgCount = $("#conciergerieOrgCount");
    el.relationCount = $("#conciergerieRelationCount");

    el.modeSegment = $("#conciergerieModeSegment");
    el.rdvSegment = $("#conciergerieRdvSegment");
    el.rdvFilterGroup = el.rdvSegment?.closest(".conciergerie-filtergroup") || null;
    el.modeOrgCount = $("#modeOrgCount");
    el.modePartnerCount = $("#modePartnerCount");
    el.rdvAllCount = $("#rdvAllCount");
    el.rdvWithCount = $("#rdvWithCount");
    el.rdvWithoutCount = $("#rdvWithoutCount");
    el.rdvProposalCount = $("#rdvProposalCount");

    el.savebar = $("#conciergerieSavebar");
    el.saveStatus = $("#conciergerieSaveStatus");
    el.saveBtn = $("#conciergerieSaveBtn");
    el.notifyBtn = $("#conciergerieNotifyBtn");
    el.notificationModal = $("#conciergerieNotificationModal");
    el.notificationClose = $("#conciergerieNotificationClose");
    el.notificationCancel = $("#conciergerieNotificationCancel");
    el.notificationConfirm = $("#conciergerieNotificationConfirm");
    el.singleNotificationModal = $("#conciergerieSingleNotificationModal");
    el.singleNotificationClose = $("#conciergerieSingleNotificationClose");
    el.singleNotificationCancel = $("#conciergerieSingleNotificationCancel");
    el.singleNotificationSend = $("#conciergerieSingleNotificationSend");
    el.singleNotificationEmail = $("#conciergerieSingleNotificationEmail");
    el.singleNotificationSummary = $("#conciergerieSingleNotificationSummary");

    el.addRoomBtn = $("#conciergerieAddRoomBtn");
    el.roomAddForm = $("#conciergerieRoomAddForm");
    el.newRoomInput = $("#conciergerieNewRoomInput");
    el.confirmRoomBtn = $("#conciergerieConfirmRoomBtn");
    el.cancelRoomBtn = $("#conciergerieCancelRoomBtn");

    el.quickBtn = $("#conciergerieQuickBtn");
    el.quickModal = $("#conciergerieQuickModal");
    el.quickClose = $("#conciergerieQuickClose");
    el.quickCancel = $("#conciergerieQuickCancel");
    el.quickCreate = $("#conciergerieQuickCreate");
    el.quickPartner = $("#conciergerieQuickPartner");
    el.quickOrganisation = $("#conciergerieQuickOrganisation");
    el.quickPartnerContact = $("#conciergerieQuickPartnerContact");
    el.quickOrganisationContact = $("#conciergerieQuickOrganisationContact");
    el.quickDate = $("#conciergerieQuickDate");
    el.quickTime = $("#conciergerieQuickTime");
    el.quickRoom = $("#conciergerieQuickRoom");
    el.quickStatus = $("#conciergerieQuickStatus");
  }

  function init() {
    cacheDom();

    if (!el.nav || !el.partnerView || !el.view) return;

    state.adminToken = exactId(
      new URLSearchParams(location.search).get("token")
    );

    el.nav.addEventListener("click", event => {
      event.preventDefault();

      if (location.hash !== "#conciergerie") {
        history.pushState(
          null,
          "",
          `${location.pathname}${location.search}#conciergerie`
        );
      }

      showConciergerie();
    });

    el.modeSegment?.addEventListener("click", event => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;

      const requestedMode = button.dataset.mode;

      state.mode = ["organisation", "partenaire", "calendrier"].includes(requestedMode)
        ? requestedMode
        : "organisation";

      updateSegments();
      renderCurrentView();
    });

    el.rdvSegment?.addEventListener("click", event => {
      const button = event.target.closest("[data-rdv]");
      if (!button) return;

      const value = button.dataset.rdv;
      state.rdvFilter = ["with", "without"].includes(value)
        ? value
        : "all";

      updateSegments();
      renderCurrentView();
    });

    el.content?.addEventListener("input", onMeetingInput);
    el.content?.addEventListener("change", onMeetingInput);
    el.content?.addEventListener("change", onCalendarPartnerChange);
    el.content?.addEventListener("click", onCalendarClick);
    el.content?.addEventListener("click", onSingleNotificationClick);

    el.saveBtn?.addEventListener("click", saveDirtyMeetings);
    el.notifyBtn?.addEventListener("click", openNotificationModal);
    el.notificationClose?.addEventListener("click", closeNotificationModal);
    el.notificationCancel?.addEventListener("click", closeNotificationModal);
    el.notificationConfirm?.addEventListener("click", sendNotifications);
    el.notificationModal?.addEventListener("click", event => {
      if (event.target === el.notificationModal) closeNotificationModal();
    });
    el.singleNotificationClose?.addEventListener("click", closeSingleNotificationModal);
    el.singleNotificationCancel?.addEventListener("click", closeSingleNotificationModal);
    el.singleNotificationSend?.addEventListener("click", sendSingleNotification);
    el.singleNotificationModal?.addEventListener("click", event => {
      if (event.target === el.singleNotificationModal) closeSingleNotificationModal();
    });
    el.addRoomBtn?.addEventListener("click", openRoomForm);
    el.confirmRoomBtn?.addEventListener("click", addRoom);
    el.cancelRoomBtn?.addEventListener("click", closeRoomForm);

    el.quickBtn?.addEventListener("click", openQuickMeetingModal);
    el.quickClose?.addEventListener("click", closeQuickMeetingModal);
    el.quickCancel?.addEventListener("click", closeQuickMeetingModal);
    el.quickCreate?.addEventListener("click", createQuickMeeting);
    el.quickPartner?.addEventListener("change", refreshQuickContacts);
    el.quickOrganisation?.addEventListener("change", refreshQuickContacts);
    el.quickModal?.addEventListener("click", event => {
      if (event.target === el.quickModal) closeQuickMeetingModal();
    });

    el.newRoomInput?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        addRoom();
      }

      if (event.key === "Escape") {
        closeRoomForm();
      }
    });

    window.addEventListener("hashchange", () => {
      if (location.hash === "#conciergerie") {
        showConciergerie();
      } else {
        showPartnerView();
      }
    });

    if (location.hash === "#conciergerie") {
      showConciergerie();
    }
  }

  function showConciergerie() {
    el.partnerView.classList.remove("active");
    el.view.classList.add("active");
    el.nav.classList.add("active");

    document
      .querySelectorAll("#sidebarNav .nav-item")
      .forEach(link => link.classList.remove("active"));

    if (el.title) el.title.textContent = "Conciergerie";

    loadAndRender();
  }

  async function showPartnerView() {
    el.view.classList.remove("active");
    el.partnerView.classList.add("active");
    el.nav.classList.remove("active");

    const partenaireId = exactId(
      new URLSearchParams(location.search).get("p")
    );

    document
      .querySelectorAll("#sidebarNav .nav-item")
      .forEach(link => {
        try {
          const url = new URL(link.href, location.href);

          link.classList.toggle(
            "active",
            exactId(url.searchParams.get("p")) === partenaireId
          );
        } catch (_) {
          link.classList.remove("active");
        }
      });

    try {
      const vivier = state.vivier || await API.loadVivier();
      state.vivier = vivier;

      const partenaire = API.getPartenaire(vivier, partenaireId);

      if (el.title) {
        el.title.textContent = partenaire
          ? nomAffiche(partenaire)
          : "Partenaire introuvable";
      }
    } catch (_) {}
  }

  async function loadAndRender() {
    if (state.loading) return;

    state.loading = true;
    setLoading();

    try {
      if (!state.adminToken) {
        throw new Error("ADMIN_TOKEN absent de l’URL.");
      }

      state.vivier = await API.loadVivier();

      const partenaires = Array.isArray(state.vivier.partenaires)
        ? state.vivier.partenaires
        : [];

      const [rencontres, referentiels, contacts, raw] = await Promise.all([
        API.getRencontresAdmin(state.adminToken),
        API.getReferentiels(),
        API.getContactsAdmin(state.adminToken),
        Promise.all(
          partenaires.map(async partenaire => {
            const partenaireId = exactId(partenaire.id);

            const [selections, formulaire] = await Promise.all([
              API.getSelectionsAdmin(
                partenaireId,
                state.adminToken
              ),
              API.getFormulaireAdmin(
                partenaireId,
                state.adminToken
              )
            ]);

            return {
              partenaire,
              formulaire: formulaire || null,
              selections: Array.isArray(selections)
                ? selections
                : []
            };
          })
        )
      ]);

      state.formsByPartner = new Map(
        (raw || []).map(entry => [
          exactId(entry.partenaire?.id),
          entry.formulaire || null
        ])
      );

      // Le calendrier lit STRICTEMENT les salles du référentiel "salle".
      // Le planning éditable garde ses valeurs historiques pour non-régression.
      state.calendarRooms = uniqueSorted(
        Array.isArray(referentiels?.salle)
          ? referentiels.salle
          : []
      );

      state.rooms = uniqueSorted([
        ...DEFAULT_ROOMS,
        ...state.calendarRooms,
        ...(rencontres || []).map(item => item.salle)
      ]);

      state.contactsByOrganisation = new Map();
      (Array.isArray(contacts) ? contacts : []).forEach(contact => {
        const orgId = exactId(contact.organisation_id);
        if (!orgId) return;
        if (!state.contactsByOrganisation.has(orgId)) state.contactsByOrganisation.set(orgId, []);
        state.contactsByOrganisation.get(orgId).push(contact);
      });

      state.relations = buildRelations(
        state.vivier,
        raw,
        rencontres
      );

      initialiseDrafts();
      validateConflicts();
      validateAvailabilityWarnings();
      updateAllCounts();
      updateSegments();
      updateSavebar();
      renderCurrentView();
    } catch (error) {
      showError(
        error.message ||
        "Impossible de charger la vue Conciergerie."
      );
    } finally {
      state.loading = false;
    }
  }

  function setLoading() {
    if (el.loading) el.loading.hidden = false;

    if (el.error) {
      el.error.hidden = true;
      el.error.textContent = "";
    }

    if (el.content) {
      el.content.hidden = true;
      el.content.innerHTML = "";
    }

    if (el.orgCount) el.orgCount.textContent = "—";
    if (el.relationCount) el.relationCount.textContent = "—";
  }

  function showError(message) {
    if (el.loading) el.loading.hidden = true;
    if (el.content) el.content.hidden = true;

    if (el.error) {
      el.error.textContent = message;
      el.error.hidden = false;
    }
  }

  function buildRelations(vivier, rawPartenaires, rencontres) {
    const organisationById = new Map(
      (vivier.organisations || [])
        .filter(org => exactId(org.id))
        .map(org => [exactId(org.id), org])
    );

    const meetingByKey = new Map(
      (rencontres || []).map(item => [
        relationKey(
          item.partenaire_id,
          item.organisation_id
        ),
        {
          date: exactId(item.date),
          heure: exactId(item.heure),
          salle: exactId(item.salle),
          email_rdv: exactId(item.email_rdv),
          participant_partenaire_contact_id: exactId(item.participant_partenaire_contact_id),
          participant_partenaire_nom: exactId(item.participant_partenaire_nom),
          participant_partenaire_email: exactId(item.participant_partenaire_email),
          participant_organisation_contact_id: exactId(item.participant_organisation_contact_id),
          participant_organisation_nom: exactId(item.participant_organisation_nom),
          participant_organisation_email: exactId(item.participant_organisation_email)
        }
      ])
    );

    const formulaireByPartenaireId = new Map(
      (rawPartenaires || []).map(entry => [
        exactId(entry.partenaire?.id),
        entry.formulaire || null
      ])
    );

    const relations = [];
    const seen = new Set();

    rawPartenaires.forEach(entry => {
      const partenaireId = exactId(
        entry.partenaire?.id
      );

      entry.selections.forEach(rawId => {
        const organisationId = exactId(rawId);
        if (!organisationId) return;

        const organisation =
          organisationById.get(organisationId);

        if (!organisation) return;

        const key = relationKey(
          partenaireId,
          organisationId
        );

        if (seen.has(key)) return;
        seen.add(key);

        const contactsPartenaire = state.contactsByOrganisation.get(partenaireId) || [];
        const contactsOrganisation = state.contactsByOrganisation.get(organisationId) || [];
        const formulaireEmail = exactId(entry.formulaire?.contact_email).toLowerCase();
        const formulaireNom = exactId(entry.formulaire?.contact_nom).toLowerCase();
        const contactPartenaireFormulaire = contactsPartenaire.find(contact =>
          formulaireEmail && exactId(contact.email).toLowerCase() === formulaireEmail
        ) || contactsPartenaire.find(contact =>
          formulaireNom && exactId(contact.nom).toLowerCase() === formulaireNom
        ) || null;
        const contactPartenairePrincipal = contactPartenaireFormulaire
          || contactsPartenaire.find(contact => String(contact.source || "").trim() === "Formulaire partenaire")
          || contactsPartenaire.find(contact => contact.principal === true)
          || contactsPartenaire.find(contact => exactId(contact.email))
          || null;
        const formulaireOrganisation = formulaireByPartenaireId.get(organisationId) || null;
        const formulaireOrganisationEmail = exactId(formulaireOrganisation?.contact_email).toLowerCase();
        const formulaireOrganisationNom = exactId(formulaireOrganisation?.contact_nom).toLowerCase();
        const contactOrganisationFormulaire = contactsOrganisation.find(contact =>
          formulaireOrganisationEmail && exactId(contact.email).toLowerCase() === formulaireOrganisationEmail
        ) || contactsOrganisation.find(contact =>
          formulaireOrganisationNom && exactId(contact.nom).toLowerCase() === formulaireOrganisationNom
        ) || null;
        const contactOrganisationPrincipal = contactOrganisationFormulaire
          || contactsOrganisation.find(contact => String(contact.source || "").trim() === "Formulaire partenaire")
          || contactsOrganisation.find(contact => contact.principal === true)
          || contactsOrganisation.find(contact => exactId(contact.email))
          || null;

        relations.push({
          key,
          partenaire: entry.partenaire,
          organisation,
          formulaire: entry.formulaire || null,
          contactsPartenaire,
          contactsOrganisation,
          contactPartenairePrincipal,
          contactOrganisationPrincipal,
          rdv: meetingByKey.get(key) || {
            date: "",
            heure: "",
            salle: "",
            email_rdv: ""
          }
        });
      });
    });

    return relations;
  }

  function initialiseDrafts() {
    state.drafts.clear();
    state.dirty.clear();

    state.relations.forEach(relation => {
      const rdv = relation.rdv || {};
      const partenaireContact = relation.contactsPartenaire.find(contact =>
        exactId(contact.contact_id) === exactId(rdv.participant_partenaire_contact_id)
      ) || relation.contactPartenairePrincipal || null;
      const organisationContact = relation.contactsOrganisation.find(contact =>
        exactId(contact.contact_id) === exactId(rdv.participant_organisation_contact_id)
      ) || relation.contactOrganisationPrincipal || null;

      state.drafts.set(relation.key, {
        partenaire_id: exactId(
          relation.partenaire?.id
        ),
        organisation_id: exactId(
          relation.organisation?.id
        ),
        date: exactId(relation.rdv?.date),
        heure: exactId(relation.rdv?.heure),
        salle: exactId(relation.rdv?.salle),
        participant_partenaire_contact_id: exactId(rdv.participant_partenaire_contact_id) || exactId(partenaireContact?.contact_id),
        participant_partenaire_nom: exactId(rdv.participant_partenaire_nom) || exactId(partenaireContact?.nom),
        participant_partenaire_email: exactId(rdv.participant_partenaire_email) || exactId(partenaireContact?.email),
        participant_organisation_contact_id: exactId(rdv.participant_organisation_contact_id) || exactId(organisationContact?.contact_id),
        participant_organisation_nom: exactId(rdv.participant_organisation_nom) || exactId(organisationContact?.nom),
        participant_organisation_email: exactId(rdv.participant_organisation_email) || exactId(organisationContact?.email),
        email_rdv: exactId(rdv.email_rdv) || exactId(rdv.participant_organisation_email) || exactId(organisationContact?.email)
      });
    });
  }

  function isCompleteMeeting(draft) {
    const isFilled = value => {
      const text = exactId(value);
      return Boolean(text && text !== "—");
    };

    return Boolean(
      isFilled(draft?.date) &&
      isFilled(draft?.heure) &&
      isFilled(draft?.salle)
    );
  }

  function hasRdv(relation) {
    return isCompleteMeeting(
      state.drafts.get(relation.key)
      || relation.rdv
    );
  }

  function partnerRdvStatus(relations = state.relations) {
    const scheduledPartners = new Set();

    relations.forEach(relation => {
      const partnerId = exactId(relation.partenaire?.id);
      if (partnerId && hasRdv(relation)) {
        scheduledPartners.add(partnerId);
      }
    });

    return {
      scheduledPartners,
      withRdv: relations.filter(hasRdv),
      withoutRdv: relations.filter(relation => {
        const partnerId = exactId(relation.partenaire?.id);
        return partnerId && !scheduledPartners.has(partnerId);
      }),
      proposals: relations.filter(relation => {
        const partnerId = exactId(relation.partenaire?.id);
        return partnerId && scheduledPartners.has(partnerId) && !hasRdv(relation);
      })
    };
  }

  function filteredRelations(relations, filter) {
    const status = partnerRdvStatus(relations);

    if (filter === "with") {
      return status.withRdv;
    }

    if (filter === "without") {
      return status.withoutRdv;
    }

    if (filter === "proposals") {
      return status.proposals;
    }

    // "Tous" = travail courant : RDV réellement planifiés +
    // partenaires dont le planning n'a pas encore commencé.
    // Les choix non retenus d'un partenaire déjà planifié sont rangés
    // uniquement dans "Propositions".
    return [...status.withRdv, ...status.withoutRdv];
  }

  function relationDraft(relation) {
    return state.drafts.get(relation.key) || relation.rdv || {};
  }

  function compareRelationsBySchedule(a, b, fallbackA = "", fallbackB = "") {
    const draftA = relationDraft(a);
    const draftB = relationDraft(b);
    const completeA = isCompleteMeeting(draftA);
    const completeB = isCompleteMeeting(draftB);

    if (completeA !== completeB) return completeA ? -1 : 1;

    if (completeA && completeB) {
      const dateCompare = exactId(draftA.date).localeCompare(exactId(draftB.date), "fr", { numeric:true });
      if (dateCompare) return dateCompare;

      const timeCompare = exactId(draftA.heure).localeCompare(exactId(draftB.heure), "fr", { numeric:true });
      if (timeCompare) return timeCompare;

      const roomCompare = exactId(draftA.salle).localeCompare(exactId(draftB.salle), "fr", { numeric:true, sensitivity:"base" });
      if (roomCompare) return roomCompare;
    }

    return String(fallbackA || "").localeCompare(
      String(fallbackB || ""),
      "fr",
      { sensitivity:"base", numeric:true }
    );
  }

  function uniqueOrganisationCount(relations) {
    return new Set(
      relations
        .map(rel => exactId(rel.organisation?.id))
        .filter(Boolean)
    ).size;
  }

  function uniquePartnerCount(relations) {
    return new Set(
      relations
        .map(rel => exactId(rel.partenaire?.id))
        .filter(Boolean)
    ).size;
  }

  function updateAllCounts() {
    const all = state.relations;
    const status = partnerRdvStatus(all);
    const withRdv = status.withRdv;
    const withoutRdv = status.withoutRdv;
    const proposals = status.proposals;
    const current = [...withRdv, ...withoutRdv];

    if (el.orgCount) {
      el.orgCount.textContent = `${withRdv.length} / ${current.length}`;
    }

    if (el.relationCount) {
      el.relationCount.textContent = String(all.length);
    }

    if (el.modeOrgCount) {
      el.modeOrgCount.textContent =
        String(uniqueOrganisationCount(all));
    }

    if (el.modePartnerCount) {
      el.modePartnerCount.textContent =
        String(uniquePartnerCount(all));
    }

    if (el.rdvAllCount) {
      el.rdvAllCount.textContent =
        String(current.length);
    }

    if (el.rdvWithCount) {
      el.rdvWithCount.textContent =
        String(withRdv.length);
    }

    if (el.rdvWithoutCount) {
      el.rdvWithoutCount.textContent =
        String(uniquePartnerCount(withoutRdv));
    }

    if (el.rdvProposalCount) {
      el.rdvProposalCount.textContent =
        String(proposals.length);
    }
  }

  function updateSegments() {
    el.modeSegment
      ?.querySelectorAll("[data-mode]")
      .forEach(button => {
        button.classList.toggle(
          "on",
          button.dataset.mode === state.mode
        );
      });

    el.rdvSegment
      ?.querySelectorAll("[data-rdv]")
      .forEach(button => {
        button.classList.toggle(
          "on",
          button.dataset.rdv === state.rdvFilter
        );
      });

    const calendarMode = state.mode === "calendrier";

    if (el.view) {
      el.view.classList.toggle("calendar-mode", calendarMode);
    }

    if (el.rdvFilterGroup) {
      el.rdvFilterGroup.hidden = calendarMode;
    }

    if (el.savebar) {
      el.savebar.hidden = calendarMode;
    }
  }

  function renderCurrentView() {
    if (el.loading) el.loading.hidden = true;
    if (el.error) el.error.hidden = true;

    if (state.mode === "calendrier") {
      renderCalendar();
      return;
    }

    const relations = filteredRelations(
      state.relations,
      state.rdvFilter
    );

    if (!relations.length) {
      renderEmptyState();
      return;
    }

    if (
      state.mode === "partenaire"
      || state.rdvFilter === "without"
      || state.rdvFilter === "proposals"
    ) {
      renderByPartner(relations);
    } else {
      renderByOrganisation(relations);
    }
  }


  /* ═══ VUE CALENDRIER PAR SALLE — LECTURE SEULE ═══════════════════════ */

  function onCalendarPartnerChange(event) {
    const select = event.target.closest("#calendarPartnerFilter");
    if (!select || state.mode !== "calendrier") return;

    state.calendarPartnerId = exactId(select.value);
    renderCalendar();
  }

  function calendarPartnerOptions() {
    const partners = new Map();

    state.relations.forEach(relation => {
      const id = exactId(relation.partenaire?.id);
      if (!id) return;

      partners.set(id, {
        id,
        label: nomRdvCourt(nomAffiche(relation.partenaire)),
        count: calendarPartnerCount(id)
      });
    });

    return [...partners.values()].sort((a, b) =>
      String(a.label || "").localeCompare(
        String(b.label || ""),
        "fr",
        { sensitivity: "base" }
      )
    );
  }

  function onCalendarClick(event) {
    if (state.mode !== "calendrier") return;

    const viewButton = event.target.closest("[data-calendar-view]");
    if (viewButton) {
      const view = exactId(viewButton.dataset.calendarView);
      if (["planning", "date", "salle", "partenaire"].includes(view)) {
        state.calendarView = view;
        renderCalendar();
      }
      return;
    }

    const dateButton = event.target.closest("[data-calendar-date]");
    if (dateButton) {
      const date = exactId(dateButton.dataset.calendarDate);
      if (EVENT_DATES.some(item => item.value === date)) {
        state.calendarDate = date;
        renderCalendar();
      }
      return;
    }

    const roomButton = event.target.closest("[data-calendar-room]");
    if (roomButton) {
      const room = exactId(roomButton.dataset.calendarRoom);
      if (state.calendarRooms.includes(room)) {
        state.calendarRoom = room;
        renderCalendar();
      }
    }
  }

  function buildCalendarOccupancy(
    relations,
    selectedDate,
    rooms
  ) {
    const roomSet = new Set(
      (rooms || []).map(value => exactId(value)).filter(Boolean)
    );

    const occupancy = new Map();

    (relations || []).forEach(relation => {
      const rdv = relationDraft(relation);

      if (!isCompleteMeeting(rdv)) return;
      if (exactId(rdv.date) !== exactId(selectedDate)) return;

      const room = exactId(rdv.salle);
      const time = exactId(rdv.heure);

      // La grille ne contient que les salles présentes dans Referentiels.
      if (!roomSet.has(room)) return;
      if (!TIME_SLOTS.includes(time)) return;

      const key = `${room}\u0000${time}`;

      if (!occupancy.has(key)) {
        occupancy.set(key, []);
      }

      occupancy.get(key).push(relation);
    });

    return occupancy;
  }

  function calendarCellKey(room, time) {
    return `${exactId(room)}\u0000${exactId(time)}`;
  }

  function completeCalendarRelations(relations = state.relations) {
    return (relations || []).filter(relation =>
      isCompleteMeeting(relationDraft(relation))
    );
  }

  function calendarMeetingCard(relation) {
    return `
      <div class="pn-calendar-meeting">
        <strong>${escapeHtml(nomRdvCourt(nomAffiche(relation.partenaire)))}</strong>
        <span>${escapeHtml(nomRdvCourt(relation.organisation?.nom || relation.organisation?.id || "Organisation"))}</span>
      </div>`;
  }

  function calendarDateCount(dateValue, complete = completeCalendarRelations()) {
    return complete.filter(relation =>
      exactId(relationDraft(relation).date) === exactId(dateValue)
    ).length;
  }

  function calendarRoomCount(room, complete = completeCalendarRelations()) {
    return complete.filter(relation =>
      exactId(relationDraft(relation).salle) === exactId(room)
    ).length;
  }

  function calendarPartnerCount(partnerId, complete = completeCalendarRelations()) {
    const id = exactId(partnerId);
    if (!id) return 0;

    return complete.reduce((count, relation) => {
      const requesterId = exactId(relation.partenaire?.id);
      const targetId = exactId(relation.organisation?.id);
      return count + ((requesterId === id || targetId === id) ? 1 : 0);
    }, 0);
  }
  function renderCalendarPlanningView(rooms) {
    const complete = completeCalendarRelations();
    const occupancies = new Map();

    EVENT_DATES.forEach(dateItem => {
      occupancies.set(
        dateItem.value,
        buildCalendarOccupancy(complete, dateItem.value, rooms)
      );
    });

    const header = TIME_SLOTS.map(time => `
      <th class="pn-planning-time-head">${escapeHtml(time)}</th>
    `).join("");

    const body = EVENT_DATES.map(dateItem => {
      const occupancy = occupancies.get(dateItem.value) || new Map();

      return `
        <tr class="pn-planning-day-row">
          <th class="pn-planning-day" colspan="${TIME_SLOTS.length + 1}">
            ${escapeHtml(dateItem.label)} (${calendarDateCount(dateItem.value, complete)})
          </th>
        </tr>
        ${rooms.map(room => `
          <tr>
            <th class="pn-planning-room">${escapeHtml(room)}</th>
            ${TIME_SLOTS.map(time => {
              const meetings = occupancy.get(calendarCellKey(room, time)) || [];

              if (!meetings.length) {
                return '<td class="pn-planning-slot is-free"></td>';
              }

              const conflict = meetings.length > 1;
              return `
                <td class="pn-planning-slot${conflict ? " is-conflict" : ""}">
                  ${conflict
                    ? `<div class="pn-calendar-conflict">
                         <i class="fas fa-triangle-exclamation"></i>
                         ×${meetings.length}
                       </div>`
                    : ""}
                  ${meetings.map(calendarMeetingCard).join("")}
                </td>`;
            }).join("")}
          </tr>
        `).join("")}
      `;
    }).join("");

    return `
      <div class="pn-planning-help">
        <strong>Planning global</strong>
        <span>Les jours sont regroupés verticalement, avec les salles en lignes et les créneaux horaires en colonnes.</span>
      </div>
      <div class="pn-planning-wrap">
        <table class="pn-planning-table">
          <thead>
            <tr>
              <th class="pn-planning-room-head">Jour / salle</th>
              ${header}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function renderCalendarDateView(rooms) {
    const complete = completeCalendarRelations();

    const header = TIME_SLOTS.map(time => `
      <th class="pn-planning-time-head">${escapeHtml(time)}</th>
    `).join("");

    const body = EVENT_DATES.map(dateItem => {
      const byTime = new Map();

      complete
        .filter(relation =>
          exactId(relationDraft(relation).date) === dateItem.value
        )
        .forEach(relation => {
          const time = exactId(relationDraft(relation).heure);
          if (!time) return;
          if (!byTime.has(time)) byTime.set(time, []);
          byTime.get(time).push(relation);
        });

      return `
        <tr>
          <th class="pn-planning-room">${escapeHtml(dateItem.label)} (${calendarDateCount(dateItem.value, complete)})</th>
          ${TIME_SLOTS.map(time => {
            const meetings = byTime.get(time) || [];

            if (!meetings.length) {
              return '<td class="pn-planning-slot is-free"></td>';
            }

            const conflict = meetings.length > 1;

            return `
              <td class="pn-planning-slot${conflict ? " is-conflict" : ""}">
                ${conflict
                  ? `<div class="pn-calendar-conflict">
                       <i class="fas fa-triangle-exclamation"></i>
                       ×${meetings.length}
                     </div>`
                  : ""}
                ${meetings.map(relation => {
                  const draft = relationDraft(relation);
                  const room = /^Salle Conciergerie\s+/i.test(draft.salle || "")
                    ? String(draft.salle).replace(/^Salle Conciergerie\s+/i, "Salle ")
                    : (draft.salle || "");

                  return `<div class="pn-calendar-meeting">
                    <strong>${escapeHtml(nomRdvCourt(nomAffiche(relation.partenaire)))}</strong>
                    <span>${escapeHtml(nomRdvCourt(relation.organisation?.nom || relation.organisation?.id || "Organisation"))}</span>
                    <span>${escapeHtml(room)}</span>
                  </div>`;
                }).join("")}
              </td>`;
          }).join("")}
        </tr>`;
    }).join("");

    return `
      <div class="pn-planning-help">
        <strong>Planning par date</strong>
        <span>Les dates sont en lignes, les créneaux horaires en colonnes, et chaque cellule affiche le partenaire prévu.</span>
      </div>
      <div class="pn-planning-wrap">
        <table class="pn-planning-table">
          <thead>
            <tr>
              <th class="pn-planning-room-head">Date</th>
              ${header}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function renderCalendarRoomView(rooms) {
    const selectedRoom = rooms.includes(state.calendarRoom)
      ? state.calendarRoom
      : rooms[0];

    state.calendarRoom = selectedRoom;

    const complete = completeCalendarRelations();

    const header = TIME_SLOTS.map(time => `
      <th class="pn-planning-time-head">${escapeHtml(time)}</th>
    `).join("");

    const body = EVENT_DATES.map(dateItem => {
      const byTime = new Map();

      complete
        .filter(relation =>
          exactId(relationDraft(relation).date) === dateItem.value
          && exactId(relationDraft(relation).salle) === selectedRoom
        )
        .forEach(relation => {
          const time = exactId(relationDraft(relation).heure);
          if (!time) return;
          if (!byTime.has(time)) byTime.set(time, []);
          byTime.get(time).push(relation);
        });

      return `
        <tr>
          <th class="pn-planning-room">${escapeHtml(dateItem.label)} (${calendarDateCount(dateItem.value, complete)})</th>
          ${TIME_SLOTS.map(time => {
            const meetings = byTime.get(time) || [];

            if (!meetings.length) {
              return '<td class="pn-planning-slot is-free"></td>';
            }

            const conflict = meetings.length > 1;

            return `
              <td class="pn-planning-slot${conflict ? " is-conflict" : ""}">
                ${conflict
                  ? `<div class="pn-calendar-conflict">
                       <i class="fas fa-triangle-exclamation"></i>
                       ×${meetings.length}
                     </div>`
                  : ""}
                ${meetings.map(relation => `
                  <div class="pn-calendar-meeting">
                    <strong>${escapeHtml(nomRdvCourt(nomAffiche(relation.partenaire)))}</strong>
                    <span>${escapeHtml(nomRdvCourt(relation.organisation?.nom || relation.organisation?.id || "Organisation"))}</span>
                  </div>
                `).join("")}
              </td>`;
          }).join("")}
        </tr>`;
    }).join("");

    return `
      <div class="pn-calendar-toolbar">
        <span class="pn-calendar-label">Salle :</span>
        <div class="pn-calendar-pills">
          ${rooms.map(room => `
            <button type="button"
                    data-calendar-room="${escapeHtml(room)}"
                    class="${room === selectedRoom ? "active" : ""}">
              ${escapeHtml(
                /^Salle Conciergerie\s+/i.test(room)
                  ? room.replace(/^Salle Conciergerie\s+/i, "Salle ")
                  : room
              )} (${calendarRoomCount(room, complete)})
            </button>
          `).join("")}
        </div>
      </div>

      <div class="pn-planning-help">
        <strong>Planning par salle</strong>
        <span>Les dates sont en lignes, les créneaux horaires en colonnes, et chaque cellule affiche le partenaire et l’organisation rencontrée.</span>
      </div>
      <div class="pn-planning-wrap">
        <table class="pn-planning-table">
          <thead>
            <tr>
              <th class="pn-planning-room-head">Date</th>
              ${header}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function renderCalendarPartnerView() {
    const complete = completeCalendarRelations();

    const partnerMap = new Map(
      (state.vivier?.partenaires || [])
        .filter(item => exactId(item?.id))
        .map(item => [exactId(item.id), item])
    );

    const involvedIds = new Set();
    complete.forEach(relation => {
      const requesterId = exactId(relation.partenaire?.id);
      const targetId = exactId(relation.organisation?.id);
      if (partnerMap.has(requesterId)) involvedIds.add(requesterId);
      if (partnerMap.has(targetId)) involvedIds.add(targetId);
    });

    const partners = [...involvedIds]
      .map(id => partnerMap.get(id))
      .filter(Boolean)
      .sort((x, y) =>
        nomRdvCourt(nomAffiche(x)).localeCompare(
          nomRdvCourt(nomAffiche(y)),
          "fr",
          { sensitivity: "base" }
        )
      );

    const header = TIME_SLOTS.map(time =>
      `<th class="pn-planning-time-head">${escapeHtml(time)}</th>`
    ).join("");

    const partnerBlocks = partners.map(partner => {
      const partnerId = exactId(partner.id);

      const rows = EVENT_DATES.map(dateItem => {
        const items = [];

        complete.forEach(relation => {
          if (exactId(relationDraft(relation).date) !== dateItem.value) return;

          const requesterId = exactId(relation.partenaire?.id);
          const targetId = exactId(relation.organisation?.id);

          if (requesterId === partnerId) {
            items.push({
              relation,
              direction: "outgoing",
              counterpart: nomRdvCourt(
                relation.organisation?.nom ||
                relation.organisation?.id ||
                "Organisation"
              )
            });
          }

          if (targetId === partnerId && requesterId !== partnerId) {
            items.push({
              relation,
              direction: "incoming",
              counterpart: nomRdvCourt(nomAffiche(relation.partenaire))
            });
          }
        });

        return `
          <tr>
            <th class="pn-planning-room">${escapeHtml(dateItem.label)} (${calendarDateCount(dateItem.value, complete)})</th>
            ${TIME_SLOTS.map(time => {
              const slotItems = items.filter(item =>
                exactId(relationDraft(item.relation).heure) === time
              );

              if (!slotItems.length) {
                return '<td class="pn-planning-slot is-free"></td>';
              }

              return `
                <td class="pn-planning-slot${slotItems.length > 1 ? " is-conflict" : ""}">
                  ${slotItems.map(item => {
                    const draft = relationDraft(item.relation);
                    const room = /^Salle Conciergerie\s+/i.test(draft.salle || "")
                      ? String(draft.salle).replace(/^Salle Conciergerie\s+/i, "Salle ")
                      : (draft.salle || "");

                    const incomingStyle = item.direction === "incoming"
                      ? ' style="background:#E8F1FF;border-color:#8BB7F0;"'
                      : "";

                    return `<div class="pn-calendar-meeting"${incomingStyle}>
                      <strong>${escapeHtml(item.counterpart)}</strong>
                      <span>${escapeHtml(room)}</span>
                    </div>`;
                  }).join("")}
                </td>`;
            }).join("")}
          </tr>`;
      }).join("");

      return `
        <tr class="pn-planning-day-row">
          <th class="pn-planning-day" colspan="${TIME_SLOTS.length + 1}">
            ${escapeHtml(nomRdvCourt(nomAffiche(partner)))} (${calendarPartnerCount(partnerId, complete)})
          </th>
        </tr>
        ${rows}`;
    }).join("");

    return `
      <div class="pn-planning-help">
        <strong>Planning par partenaire</strong>
        <span>Chaque partenaire est regroupé une seule fois, avec les 3 dates en lignes.</span>
        <span style="margin-left:12px"><b style="color:#347022">Vert</b> : demandé par le partenaire · <b style="color:#245B9E">Bleu</b> : demandé par un autre partenaire.</span>
      </div>
      <div class="pn-planning-wrap">
        <table class="pn-planning-table">
          <thead>
            <tr>
              <th class="pn-planning-room-head">Partenaire / date</th>
              ${header}
            </tr>
          </thead>
          <tbody>${partnerBlocks}</tbody>
        </table>
      </div>`;
  }

  function renderCalendar() {
    const rooms = [...state.calendarRooms];

    if (!rooms.length) {
      el.content.innerHTML = `
        <div class="conciergerie-empty">
          <i class="fas fa-door-open"></i>
          <strong>Aucune salle dans le référentiel</strong>
          <span>
            Ajoutez d'abord une salle via la gestion existante des salles,
            puis rechargez ou revenez au calendrier.
          </span>
        </div>`;

      el.content.hidden = false;
      return;
    }

    const view = ["planning", "date", "salle", "partenaire"].includes(state.calendarView)
      ? state.calendarView
      : "planning";

    state.calendarView = view;

    const complete = completeCalendarRelations();
    const totalRdv = complete.length;

    const content = view === "planning"
      ? renderCalendarPlanningView(rooms)
      : view === "salle"
        ? renderCalendarRoomView(rooms)
        : view === "partenaire"
          ? renderCalendarPartnerView()
          : renderCalendarDateView(rooms);

    el.content.innerHTML = `
      <section class="pn-rdv-calendar" aria-label="Calendrier des rendez-vous">
        <div class="pn-calendar-top">
          <div class="pn-calendar-tabs">
            <button type="button"
                    data-calendar-view="planning"
                    class="${view === "planning" ? "active" : ""}">
              Planning global
            </button>
            <button type="button"
                    data-calendar-view="date"
                    class="${view === "date" ? "active" : ""}">
              Par date
            </button>
            <button type="button"
                    data-calendar-view="salle"
                    class="${view === "salle" ? "active" : ""}">
              Par salle
            </button>
            <button type="button"
                    data-calendar-view="partenaire"
                    class="${view === "partenaire" ? "active" : ""}">
              Par partenaire
            </button>
          </div>

          <div class="pn-calendar-readonly">
            <i class="fas fa-eye"></i>
            Lecture seule
          </div>
        </div>

        ${content}

        <footer class="pn-calendar-footer">
          <span><strong>${totalRdv}</strong> RDV planifiés</span>
          <span>
            <strong>${rooms.length}</strong>
            salle${rooms.length > 1 ? "s" : ""}
          </span>
        </footer>
      </section>`;

    el.content.hidden = false;
  }

  function renderEmptyState() {
    let title = "Aucune sélection";
    let text =
      "La vue se remplira dès qu’un partenaire sélectionnera au moins une organisation.";

    if (state.rdvFilter === "with") {
      title = "Aucun rendez-vous planifié";
      text =
        "Aucune relation sélectionnée n'a encore Date + Heure + Salle.";
    }

    if (state.rdvFilter === "without") {
      title = "Aucun partenaire sans rendez-vous";
      text =
        "Tous les partenaires concernés ont déjà au moins un rendez-vous planifié.";
    }

    if (state.rdvFilter === "proposals") {
      title = "Aucune proposition supplémentaire";
      text =
        "Aucune organisation non planifiée n'est actuellement conservée comme option de remplacement.";
    }

    el.content.innerHTML = `
      <div class="conciergerie-empty">
        <i class="fas fa-calendar-check"></i>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </div>`;

    el.content.hidden = false;
  }

  function groupByOrganisation(relations) {
    const groups = new Map();

    relations.forEach(relation => {
      const id = exactId(
        relation.organisation?.id
      );

      if (!id) return;

      if (!groups.has(id)) {
        groups.set(id, {
          organisation: relation.organisation,
          relations: []
        });
      }

      groups.get(id).relations.push(relation);
    });

    return [...groups.values()]
      .map(group => ({
        ...group,
        relations: group.relations.sort(
          (a, b) => compareRelationsBySchedule(
            a,
            b,
            nomAffiche(a.partenaire),
            nomAffiche(b.partenaire)
          )
        )
      }))
      .sort((a, b) =>
        b.relations.length -
          a.relations.length
        ||
        String(a.organisation.nom || "")
          .localeCompare(
            String(
              b.organisation.nom || ""
            ),
            "fr",
            { sensitivity: "base" }
          )
      );
  }

  function renderByOrganisation(relations) {
    const groups =
      groupByOrganisation(relations);

    el.content.innerHTML = groups
      .map(group => {
        const count = group.relations.length;

        const rows = group.relations
          .map(relation =>
            meetingRow(
              relation,
              nomAffiche(
                relation.partenaire
              )
            )
          )
          .join("");

        return `
          <article class="conciergerie-org-card">
            <header class="conciergerie-org-head">
              <h3>${escapeHtml(nomRdvCourt(group.organisation.nom || group.organisation.id))}</h3>
              <span>${count} partenaire${count > 1 ? "s" : ""}</span>
            </header>

            <div class="table-scroll">
              <table class="conciergerie-table">
                <thead>
                  <tr>
                    <th>Partenaire</th>
                    <th>Participant partenaire</th>
                    <th>Participant organisation</th>
                    <th>Date</th>
                    <th>Heure</th>
                    <th>Salle</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </article>`;
      })
      .join("");

    el.content.hidden = false;
    refreshAllTimeAvailability();
    applyConflictStyles();
  }

  function groupByPartner(relations) {
    const groups = new Map();

    relations.forEach(relation => {
      const id = exactId(
        relation.partenaire?.id
      );

      if (!id) return;

      if (!groups.has(id)) {
        groups.set(id, {
          partenaire: relation.partenaire,
          relations: []
        });
      }

      groups.get(id).relations.push(relation);
    });

    return [...groups.values()]
      .map(group => ({
        ...group,
        relations: group.relations.sort(
          (a, b) => compareRelationsBySchedule(
            a,
            b,
            a.organisation?.nom || "",
            b.organisation?.nom || ""
          )
        )
      }))
      .sort((a, b) =>
        nomAffiche(a.partenaire)
          .localeCompare(
            nomAffiche(b.partenaire),
            "fr",
            { sensitivity: "base" }
          )
      );
  }

  function renderByPartner(relations) {
    const groups = groupByPartner(relations);

    el.content.innerHTML = groups
      .map(group => {
        const count = group.relations.length;

        const rows = group.relations
          .map(relation =>
            meetingRow(
              relation,
              relation.organisation?.nom
              || relation.organisation?.id
              || ""
            )
          )
          .join("");

        return `
          <article class="conciergerie-org-card">
            <header class="conciergerie-org-head">
              <h3>${escapeHtml(nomRdvCourt(nomAffiche(group.partenaire)))}</h3>
              <span>${count} organisation${count > 1 ? "s" : ""}</span>
            </header>

            <div class="table-scroll">
              <table class="conciergerie-table">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Participant partenaire</th>
                    <th>Participant organisation</th>
                    <th>Date</th>
                    <th>Heure</th>
                    <th>Salle</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </article>`;
      })
      .join("");

    el.content.hidden = false;
    refreshAllTimeAvailability();
    applyConflictStyles();
  }

  function meetingRow(relation, firstColumn) {
    const draft =
      state.drafts.get(relation.key)
      || {
        date: "",
        heure: "",
        salle: "",
        email_rdv: ""
      };

    return `
      <tr data-relation-key="${escapeHtml(relation.key)}">
        <td class="conciergerie-partner">
          ${escapeHtml(nomRdvCourt(firstColumn))}
        </td>

        <td>
          <select class="conciergerie-rdv-input conciergerie-contact-select" data-field="participant_partenaire_contact_id" aria-label="Participant partenaire">
            ${contactOptions(relation.contactsPartenaire, draft.participant_partenaire_contact_id)}
          </select>
        </td>

        <td>
          <select class="conciergerie-rdv-input conciergerie-contact-select" data-field="participant_organisation_contact_id" aria-label="Participant organisation">
            ${contactOptions(relation.contactsOrganisation, draft.participant_organisation_contact_id)}
          </select>
        </td>

        <td>
          <select
            class="conciergerie-rdv-input"
            data-field="date"
            aria-label="Date du rendez-vous">
            ${dateOptions(draft.date)}
          </select>
        </td>

        <td>
          <select
            class="conciergerie-rdv-input conciergerie-time"
            data-field="heure"
            aria-label="Heure du rendez-vous">
            ${timeOptions(draft.heure, relation.key, draft.date, draft.salle)}
          </select>
        </td>

        <td>
          <select
            class="conciergerie-rdv-input conciergerie-room"
            data-field="salle"
            aria-label="Salle du rendez-vous">
            ${roomOptions(draft.salle)}
          </select>
          <div class="conciergerie-conflict-message"></div>
          <div class="conciergerie-availability-message"></div>
        </td>

        <td>
          <button class="btn btn-outline btn-sm conciergerie-send-one" type="button" data-send-rdv="${escapeHtml(relation.key)}">
            <i class="fas fa-paper-plane"></i> Envoyer le RDV
          </button>
        </td>
      </tr>`;
  }

  function contactRdvStatus(contact) {
    const source = exactId(contact?.source);
    const role = exactId(contact?.role);

    if (source === "Participants MTL connecte 2026") {
      if (/\|\|RDV_ACTIVE\b/.test(role)) return "active";
      if (/\|\|RDV_HIDDEN\b/.test(role)) return "hidden";
      return "pending";
    }

    return "active";
  }

  function contactOptions(contacts, currentId) {
    const list = Array.isArray(contacts)
      ? contacts.filter(contact => exactId(contact.email) && contactRdvStatus(contact) !== "hidden")
      : [];

    return [
      `<option value="">— Choisir —</option>`,
      ...list.map(contact => {
        const id = exactId(contact.contact_id);
        const principal = contact?.principal === true || String(contact?.principal || "").toUpperCase() === "TRUE";
        const label = [principal ? "★" : "", exactId(contact.nom), exactId(contact.email)].filter(Boolean).join(principal ? " " : " — ");
        const style = principal ? ' style="font-weight:700;"' : "";
        return `<option value="${escapeHtml(id)}"${style}${id === exactId(currentId) ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
    ].join("");
  }

  function dateOptions(current) {
    return [
      `<option value="">—</option>`,
      ...EVENT_DATES.map(item =>
        `<option value="${escapeHtml(item.value)}"${item.value === current ? " selected" : ""}>${escapeHtml(item.label)}</option>`
      )
    ].join("");
  }

  function timeOptions(
    current,
    currentKey = "",
    date = "",
    salle = ""
  ) {
    return [
      `<option value="">—</option>`,
      ...TIME_SLOTS.map(value => {
        const occupied = isRoomSlotTaken(
          date,
          value,
          salle,
          currentKey
        );

        const selected =
          value === current
            ? " selected"
            : "";

        const disabled =
          occupied && value !== current
            ? " disabled"
            : "";

        const label =
          occupied && value !== current
            ? `${value} — occupé`
            : value;

        return `<option value="${escapeHtml(value)}"${selected}${disabled}>${escapeHtml(label)}</option>`;
      })
    ].join("");
  }

  function isRoomSlotTaken(
    date,
    heure,
    salle,
    excludeKey = ""
  ) {
    const d = exactId(date);
    const h = exactId(heure);
    const s = exactId(salle);

    if (!d || !h || !s) return false;

    for (const [key, draft] of state.drafts.entries()) {
      if (key === excludeKey) continue;

      if (
        exactId(draft?.date) === d
        && exactId(draft?.heure) === h
        && exactId(draft?.salle) === s
      ) {
        return true;
      }
    }

    return false;
  }

  function refreshTimeAvailabilityForRow(row) {
    if (!row) return;

    const key = row.dataset.relationKey;
    const draft = state.drafts.get(key);
    const select = row.querySelector(
      '[data-field="heure"]'
    );

    if (!draft || !select) return;

    const current = exactId(draft.heure);

    select.innerHTML = timeOptions(
      current,
      key,
      draft.date,
      draft.salle
    );

    select.value = current;
  }

  function refreshAllTimeAvailability() {
    el.content
      ?.querySelectorAll("[data-relation-key]")
      .forEach(refreshTimeAvailabilityForRow);
  }

  function roomOptions(current) {
    const values = uniqueSorted([
      ...state.rooms,
      current
    ]);

    return [
      `<option value="">—</option>`,
      ...values.map(value => {
        const label = /^Salle Conciergerie\s+/i.test(value)
          ? value.replace(/^Salle Conciergerie\s+/i, "Salle ")
          : value;
        return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(label)}</option>`;
      })
    ].join("");
  }

  function contactData(contact) {
    const data = contact || {};

    return {
      participant:
        exactId(data.nom),
      mail:
        exactId(data.email)
    };
  }

  function onMeetingInput(event) {
    const input = event.target.closest(
      ".conciergerie-rdv-input"
    );

    if (!input) return;

    const row = input.closest(
      "[data-relation-key]"
    );

    if (!row) return;

    const key = row.dataset.relationKey;
    const draft = state.drafts.get(key);

    if (!draft) return;

    const field = input.dataset.field;

    if (
      ![
        "date",
        "heure",
        "salle",
        "email_rdv",
        "participant_partenaire_contact_id",
        "participant_organisation_contact_id"
      ].includes(field)
    ) {
      return;
    }

    draft[field] = input.value.trim();

    const relation = state.relations.find(item => item.key === key);
    if (field === "participant_partenaire_contact_id" && relation) {
      const contact = relation.contactsPartenaire.find(item => exactId(item.contact_id) === exactId(input.value));
      draft.participant_partenaire_nom = exactId(contact?.nom);
      draft.participant_partenaire_email = exactId(contact?.email);
    }
    if (field === "participant_organisation_contact_id" && relation) {
      const contact = relation.contactsOrganisation.find(item => exactId(item.contact_id) === exactId(input.value));
      draft.participant_organisation_nom = exactId(contact?.nom);
      draft.participant_organisation_email = exactId(contact?.email);
      draft.email_rdv = exactId(contact?.email);
    }

    state.dirty.add(key);
    row.classList.add(
      "conciergerie-row-dirty"
    );

    validateConflicts();
    validateAvailabilityWarnings();

    if (
      ["date", "heure", "salle"].includes(field)
    ) {
      refreshAllTimeAvailability();
    }

    updateAllCounts();
    updateSavebar();
    applyConflictStyles();

    if (event.type === "change" && ["date", "heure", "salle"].includes(field)) {
      renderCurrentView();
    }
  }

  function validateConflicts() {
    state.conflicts.clear();

    const complete = state.relations
      .map(relation => ({
        relation,
        draft: state.drafts.get(
          relation.key
        )
      }))
      .filter(item =>
        exactId(item.draft?.date)
        && exactId(item.draft?.heure)
      );

    for (let i = 0; i < complete.length; i += 1) {
      for (let j = i + 1; j < complete.length; j += 1) {
        const a = complete[i];
        const b = complete[j];

        if (
          a.draft.date !== b.draft.date
          || a.draft.heure !== b.draft.heure
        ) {
          continue;
        }

        const reasons = [];

        if (
          exactId(a.draft.salle)
          && exactId(b.draft.salle)
          && a.draft.salle === b.draft.salle
        ) {
          reasons.push(
            `La salle « ${a.draft.salle} » est déjà occupée.`
          );
        }

        if (
          exactId(a.relation.partenaire?.id)
          === exactId(b.relation.partenaire?.id)
        ) {
          reasons.push(
            "Ce partenaire a déjà un rendez-vous à cette heure."
          );
        }

        if (
          exactId(a.relation.organisation?.id)
          === exactId(b.relation.organisation?.id)
        ) {
          reasons.push(
            "Cette organisation a déjà un rendez-vous à cette heure."
          );
        }

        if (reasons.length) {
          addConflict(
            a.relation.key,
            reasons
          );
          addConflict(
            b.relation.key,
            reasons
          );
        }
      }
    }

    return state.conflicts;
  }

  function parseAvailabilityValues(formulaire) {
    return new Set(
      String(formulaire?.disponibilites_conciergerie ?? "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean)
    );
  }

  function availabilityLabelFor(date, heure) {
    const windows = AVAILABILITY_WINDOWS[exactId(date)];
    if (!windows) return "";

    const match = exactId(heure).match(/^(\d{2}):(\d{2})$/);
    if (!match) return "";

    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return minutes < APRES_MIDI_A_PARTIR_DE
      ? windows.matin
      : windows.apresMidi;
  }

  function validateAvailabilityWarnings() {
    state.availabilityWarnings.clear();

    state.relations.forEach(relation => {
      const draft = state.drafts.get(relation.key);
      if (!draft) return;

      const reserved = parseAvailabilityValues(relation.formulaire);
      if (!reserved.size) return;

      const requiredWindow = availabilityLabelFor(draft.date, draft.heure);
      if (!requiredWindow || reserved.has(requiredWindow)) return;

      state.availabilityWarnings.set(
        relation.key,
        `Attention : le partenaire n'a pas réservé la plage « ${requiredWindow} ».`
      );
    });

    return state.availabilityWarnings;
  }


  function addConflict(key, reasons) {
    if (!state.conflicts.has(key)) {
      state.conflicts.set(key, []);
    }

    const target =
      state.conflicts.get(key);

    reasons.forEach(reason => {
      if (!target.includes(reason)) {
        target.push(reason);
      }
    });
  }

  function applyConflictStyles() {
    el.content
      ?.querySelectorAll("[data-relation-key]")
      .forEach(row => {
        const key = row.dataset.relationKey;

        const reasons = state.conflicts.get(key) || [];
        row.classList.toggle(
          "conciergerie-row-conflict",
          reasons.length > 0
        );

        const conflictMessage = row.querySelector(
          ".conciergerie-conflict-message"
        );
        if (conflictMessage) {
          conflictMessage.textContent = reasons.join(" ");
        }

        const availabilityMessage = state.availabilityWarnings.get(key) || "";
        row.classList.toggle(
          "conciergerie-row-availability-warning",
          Boolean(availabilityMessage)
        );

        const availabilityEl = row.querySelector(
          ".conciergerie-availability-message"
        );
        if (availabilityEl) {
          availabilityEl.textContent = availabilityMessage;
        }
      });
  }

  function updateSavebar(message = "") {
    const dirtyCount =
      state.dirty.size;

    const conflictCount =
      state.conflicts.size;

    if (el.saveBtn) {
      el.saveBtn.disabled =
        dirtyCount === 0
        || conflictCount > 0;
    }

    if (!el.saveStatus) return;

    if (message) {
      el.saveStatus.textContent =
        message;
      return;
    }

    if (conflictCount) {
      el.saveStatus.textContent =
        `${conflictCount} ligne${conflictCount > 1 ? "s" : ""} en conflit. Corrigez avant d'enregistrer.`;
      return;
    }

    el.saveStatus.textContent =
      dirtyCount
        ? `${dirtyCount} rendez-vous modifié${dirtyCount > 1 ? "s" : ""} à enregistrer.`
        : "Aucune modification à enregistrer.";
  }

  async function saveDirtyMeetings() {
    validateConflicts();
    validateAvailabilityWarnings();

    if (state.conflicts.size) {
      updateSavebar();
      applyConflictStyles();
      return;
    }

    if (
      !state.dirty.size
      || !el.saveBtn
    ) {
      return;
    }

    const keys = [...state.dirty];

    const payload = keys
      .map(key =>
        state.drafts.get(key)
      )
      .filter(Boolean)
      .map(item => ({ ...item }));

    el.saveBtn.disabled = true;

    const original =
      el.saveBtn.innerHTML;

    el.saveBtn.innerHTML =
      `<span class="spinner"></span> Enregistrement…`;

    updateSavebar(
      "Enregistrement en cours…"
    );

    try {
      await API.saveRencontresAdmin(
        state.adminToken,
        payload
      );

      keys.forEach(key => {
        const relation =
          state.relations.find(
            item => item.key === key
          );

        const draft =
          state.drafts.get(key);

        if (relation && draft) {
          relation.rdv = {
            date:
              exactId(draft.date),
            heure:
              exactId(draft.heure),
            salle:
              exactId(draft.salle),
            email_rdv:
              exactId(draft.email_rdv)
          };
        }

        state.dirty.delete(key);
      });

      validateConflicts();
      updateAllCounts();
      updateSavebar(
        "Rendez-vous enregistrés."
      );

      renderCurrentView();

      setTimeout(() => {
        if (!state.dirty.size) {
          updateSavebar();
        }
      }, 2200);
    } catch (error) {
      updateSavebar(
        `Erreur : ${
          error.message
          || "enregistrement impossible"
        }`
      );
    } finally {
      el.saveBtn.innerHTML =
        original;

      el.saveBtn.disabled =
        state.dirty.size === 0
        || state.conflicts.size > 0;
    }
  }

  function onSingleNotificationClick(event) {
    const button = event.target.closest("[data-send-rdv]");
    if (!button) return;
    const key = exactId(button.dataset.sendRdv);
    const relation = state.relations.find(item => item.key === key);
    const draft = state.drafts.get(key);
    if (!relation || !draft) return;
    state.singleNotificationKey = key;
    if (el.singleNotificationEmail) {
      el.singleNotificationEmail.value = exactId(draft.participant_organisation_email || draft.email_rdv);
      setTimeout(() => el.singleNotificationEmail && el.singleNotificationEmail.focus(), 0);
    }
    if (el.singleNotificationSummary) {
      const partenaire = nomAffiche(relation.partenaire);
      const organisation = relation.organisation?.nom || relation.organisation?.id || "";
      el.singleNotificationSummary.textContent = partenaire + " ↔ " + organisation + " · " + (draft.date || "date à définir") + " · " + (draft.heure || "heure à définir") + " · " + (draft.salle || "salle à définir");
    }
    if (el.singleNotificationModal) el.singleNotificationModal.hidden = false;
  }

  function closeSingleNotificationModal() {
    state.singleNotificationKey = "";
    if (el.singleNotificationModal) el.singleNotificationModal.hidden = true;
  }

  async function sendSingleNotification() {
    const key = state.singleNotificationKey;
    const relation = state.relations.find(item => item.key === key);
    const draft = state.drafts.get(key);
    if (!relation || !draft || !el.singleNotificationSend) return;
    const email = exactId(el.singleNotificationEmail?.value);
    if (!email) { toast("Ajoute le mail du participant avant envoi.", true); el.singleNotificationEmail?.focus(); return; }
    const rencontre = {
      partenaire_id: exactId(relation.partenaire?.id),
      organisation_id: exactId(relation.organisation?.id),
      partenaire_nom: nomAffiche(relation.partenaire),
      organisation_nom: exactId(relation.organisation?.nom || relation.organisation?.id),
      date: exactId(draft.date),
      heure: exactId(draft.heure),
      salle: exactId(draft.salle),
      email_rdv: exactId(draft.participant_organisation_email || email),
      participant_partenaire_contact_id: exactId(draft.participant_partenaire_contact_id),
      participant_partenaire_nom: exactId(draft.participant_partenaire_nom),
      participant_partenaire_email: exactId(draft.participant_partenaire_email),
      participant_organisation_contact_id: exactId(draft.participant_organisation_contact_id),
      participant_organisation_nom: exactId(draft.participant_organisation_nom),
      participant_organisation_email: exactId(draft.participant_organisation_email || email)
    };
    if (!rencontre.date || !rencontre.heure || !rencontre.salle) { toast("Complète la date, heure et salle avant envoi.", true); return; }
    if (!rencontre.participant_partenaire_email || !rencontre.participant_organisation_email) { toast("Choisis les deux participants du rendez-vous.", true); return; }
    const original = el.singleNotificationSend.innerHTML;
    el.singleNotificationSend.disabled = true;
    el.singleNotificationSend.innerHTML = '<span class="spinner"></span> Envoi…';
    try {
      const result = await API.sendNotification(state.adminToken, rencontre);
      draft.email_rdv = email;
      relation.rdv = { ...relation.rdv, ...rencontre };
      state.dirty.delete(key);
      toast(result.mode_test ? "RDV envoyé en MODE TEST." : "RDV envoyé.");
      closeSingleNotificationModal();
      renderCurrentView();
    } catch (error) {
      toast(error.message || "Envoi du RDV impossible.", true);
    } finally {
      el.singleNotificationSend.disabled = false;
      el.singleNotificationSend.innerHTML = original;
    }
  }

  function toast(message, isError = false) {
    const node = document.createElement("div");
    node.className = "toast" + (isError ? " toast-error" : "");
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function openNotificationModal() {
    if (state.dirty.size) {
      toast("Enregistre d'abord les rendez-vous modifiés avant d'envoyer les notifications.", true);
      return;
    }
    if (el.notificationModal) el.notificationModal.hidden = false;
  }

  function closeNotificationModal() {
    if (el.notificationModal) el.notificationModal.hidden = true;
  }

  async function sendNotifications() {
    if (!el.notificationConfirm) return;

    const original = el.notificationConfirm.innerHTML;
    el.notificationConfirm.disabled = true;
    el.notificationConfirm.innerHTML = '<span class="spinner"></span> Envoi…';

    try {
      const result = await API.sendNotifications(state.adminToken);
      const suffix = result.mode_test ? " · MODE TEST" : "";
      toast(
        `${Number(result.envoyes || 0)} envoyés · ${Number(result.incomplets || 0)} incomplets · ${Number(result.deja || 0)} déjà avertis · ${Number(result.sans_mail || 0)} sans mail · ${Number(result.erreurs || 0)} erreurs${suffix}`,
        Number(result.erreurs || 0) > 0
      );
      closeNotificationModal();
    } catch (error) {
      toast(error.message || "Envoi des notifications impossible.", true);
    } finally {
      el.notificationConfirm.disabled = false;
      el.notificationConfirm.innerHTML = original;
    }
  }


  /* ═══ RDV RAPIDE — CRÉATION ADMIN SANS FORMULAIRE ════════════════════ */
  function quickOption(value, label, selected = false) {
    return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function quickOrganisationLabel(org) {
    return exactId(org?.nom) || exactId(org?.id);
  }

  function quickContactList(organisationId) {
    return (state.contactsByOrganisation.get(exactId(organisationId)) || [])
      .filter(contact => exactId(contact.email) && contactRdvStatus(contact) !== "hidden");
  }

  function quickDefaultContact(organisationId, preferForm = false) {
    const contacts = quickContactList(organisationId);
    if (!contacts.length) return null;

    const form = preferForm ? state.formsByPartner.get(exactId(organisationId)) : null;
    const formEmail = exactId(form?.contact_email).toLowerCase();
    const formName = exactId(form?.contact_nom).toLowerCase();

    return contacts.find(contact => formEmail && exactId(contact.email).toLowerCase() === formEmail)
      || contacts.find(contact => formName && exactId(contact.nom).toLowerCase() === formName)
      || contacts.find(contact => String(contact.source || "").trim() === "Formulaire partenaire")
      || contacts.find(contact => contact.principal === true || String(contact.principal || "").toUpperCase() === "TRUE")
      || contacts[0];
  }

  function fillQuickContactSelect(select, organisationId, preferForm = false) {
    if (!select) return;
    const contacts = quickContactList(organisationId);
    const preferred = quickDefaultContact(organisationId, preferForm);
    select.innerHTML = quickOption("", contacts.length ? "— Choisir —" : "— Aucun contact —")
      + contacts.map(contact =>
          quickOption(
            exactId(contact.contact_id),
            [exactId(contact.nom), exactId(contact.email)].filter(Boolean).join(" — "),
            preferred && exactId(preferred.contact_id) === exactId(contact.contact_id)
          )
        ).join("");
  }

  function refreshQuickContacts() {
    fillQuickContactSelect(el.quickPartnerContact, el.quickPartner?.value, true);
    fillQuickContactSelect(el.quickOrganisationContact, el.quickOrganisation?.value, true);
  }

  async function openQuickMeetingModal() {
    if (!el.quickModal) return;

    try {
      API.resetCache?.();
      state.vivier = await API.loadVivier();
    } catch (error) {
      showConciergerieToast(error.message || "Impossible de rafraîchir le vivier.", "error");
      return;
    }

    const partners = [...(state.vivier.partenaires || [])]
      .filter(item => exactId(item?.id))
      .sort((a,b) => nomAffiche(a).localeCompare(nomAffiche(b), "fr", { sensitivity:"base" }));

    const organisations = [...(state.vivier.organisations || [])]
      .filter(item => exactId(item?.id))
      .sort((a,b) => quickOrganisationLabel(a).localeCompare(quickOrganisationLabel(b), "fr", { sensitivity:"base" }));

    el.quickPartner.innerHTML = quickOption("", "— Choisir un partenaire —")
      + partners.map(item => quickOption(exactId(item.id), nomAffiche(item))).join("");
    el.quickOrganisation.innerHTML = quickOption("", "— Choisir une organisation —")
      + organisations.map(item => quickOption(exactId(item.id), quickOrganisationLabel(item))).join("");
    el.quickDate.innerHTML = quickOption("", "—")
      + EVENT_DATES.map(item => quickOption(item.value, item.label)).join("");
    el.quickTime.innerHTML = quickOption("", "—")
      + TIME_SLOTS.map(value => quickOption(value, value)).join("");
    el.quickRoom.innerHTML = quickOption("", "—")
      + state.rooms.map(value => {
        const label = /^Salle Conciergerie\s+/i.test(value)
          ? value.replace(/^Salle Conciergerie\s+/i, "Salle ")
          : value;
        return quickOption(value, label);
      }).join("");

    el.quickPartnerContact.innerHTML = quickOption("", "— Choisir d’abord le partenaire —");
    el.quickOrganisationContact.innerHTML = quickOption("", "— Choisir d’abord l’organisation —");
    if (el.quickStatus) el.quickStatus.textContent = "";
    el.quickModal.hidden = false;
  }

  function closeQuickMeetingModal() {
    if (!el.quickModal) return;
    el.quickModal.hidden = true;
    if (el.quickStatus) el.quickStatus.textContent = "";
  }

  async function createQuickMeeting() {
    const partenaireId = exactId(el.quickPartner?.value);
    const organisationId = exactId(el.quickOrganisation?.value);
    const date = exactId(el.quickDate?.value);
    const heure = exactId(el.quickTime?.value);
    const salle = exactId(el.quickRoom?.value);

    if (!partenaireId || !organisationId || !date || !heure || !salle) {
      if (el.quickStatus) el.quickStatus.textContent = "Choisis le partenaire, l’organisation, la date, l’heure et la salle.";
      return;
    }
    if (partenaireId === organisationId) {
      if (el.quickStatus) el.quickStatus.textContent = "Le partenaire et l’organisation rencontrée doivent être différents.";
      return;
    }

    const partnerContact = quickContactList(partenaireId).find(item =>
      exactId(item.contact_id) === exactId(el.quickPartnerContact?.value)
    ) || null;
    const organisationContact = quickContactList(organisationId).find(item =>
      exactId(item.contact_id) === exactId(el.quickOrganisationContact?.value)
    ) || null;

    const original = el.quickCreate?.innerHTML || "";
    if (el.quickCreate) {
      el.quickCreate.disabled = true;
      el.quickCreate.innerHTML = '<span class="spinner"></span> Création…';
    }
    if (el.quickStatus) el.quickStatus.textContent = "Création du rendez-vous…";

    try {
      const selections = await API.getSelectionsAdmin(partenaireId, state.adminToken);
      const nextSelections = [...new Set([...(Array.isArray(selections) ? selections : []), organisationId])];
      if (!selections.includes(organisationId)) {
        await API.saveSelectionsAdmin(partenaireId, state.adminToken, nextSelections);
      }

      await API.saveRencontresAdmin(state.adminToken, [{
        partenaire_id: partenaireId,
        organisation_id: organisationId,
        date,
        heure,
        salle,
        email_rdv: exactId(organisationContact?.email),
        participant_partenaire_contact_id: exactId(partnerContact?.contact_id),
        participant_partenaire_nom: exactId(partnerContact?.nom),
        participant_partenaire_email: exactId(partnerContact?.email),
        participant_organisation_contact_id: exactId(organisationContact?.contact_id),
        participant_organisation_nom: exactId(organisationContact?.nom),
        participant_organisation_email: exactId(organisationContact?.email)
      }]);

      closeQuickMeetingModal();
      await loadAndRender();
      updateSavebar("RDV rapide créé et ajouté à la conciergerie.");
      showConciergerieToast("✓ RDV créé avec succès.");
    } catch (error) {
      if (el.quickStatus) {
        const message = String(error?.message || "Création impossible.").trim();
        const details = String(error?.details || "").trim();
        el.quickStatus.textContent = details && !message.includes(details)
          ? `${message} — ${details}`
          : message;
      }
    } finally {
      if (el.quickCreate) {
        el.quickCreate.disabled = false;
        el.quickCreate.innerHTML = original;
      }
    }
  }

  function openRoomForm() {
    if (!el.roomAddForm) return;

    el.roomAddForm.hidden = false;
    el.addRoomBtn.hidden = true;

    if (el.newRoomInput) {
      el.newRoomInput.value = "";
      el.newRoomInput.focus();
    }
  }

  function closeRoomForm() {
    if (!el.roomAddForm) return;

    el.roomAddForm.hidden = true;
    el.addRoomBtn.hidden = false;

    if (el.newRoomInput) {
      el.newRoomInput.value = "";
    }
  }

  async function addRoom() {
    const value = exactId(el.newRoomInput?.value);

    if (!value) {
      el.newRoomInput?.focus();
      return;
    }

    // Si elle existe déjà dans le référentiel, rien à réécrire.
    if (state.calendarRooms.includes(value)) {
      closeRoomForm();
      renderCurrentView();
      return;
    }

    try {
      if (el.confirmRoomBtn) {
        el.confirmRoomBtn.disabled = true;
      }

      await API.addReferentiel(
        state.adminToken,
        "salle",
        value
      );

      state.calendarRooms = uniqueSorted([
        ...state.calendarRooms,
        value
      ]);

      state.rooms = uniqueSorted([
        ...state.rooms,
        value
      ]);

      closeRoomForm();
      renderCurrentView();
    } catch (error) {
      updateSavebar(
        `Erreur salle : ${
          error.message
          || "ajout impossible"
        }`
      );
    } finally {
      if (el.confirmRoomBtn) {
        el.confirmRoomBtn.disabled = false;
      }
    }
  }

  function buildTimeSlots(
    start,
    end,
    duration
  ) {
    const toMinutes = value => {
      const [h, m] = value
        .split(":")
        .map(Number);

      return h * 60 + m;
    };

    const format = minutes =>
      `${String(
        Math.floor(minutes / 60)
      ).padStart(2, "0")}:${String(
        minutes % 60
      ).padStart(2, "0")}`;

    const startMin =
      toMinutes(start);

    const endMin =
      toMinutes(end);

    const slots = [];

    for (
      let value = startMin;
      value + duration <= endMin;
      value += duration
    ) {
      slots.push(format(value));
    }

    return slots;
  }

  function uniqueSorted(values) {
    return [...new Set(
      values
        .map(value => exactId(value))
        .filter(Boolean)
    )].sort((a, b) =>
      a.localeCompare(
        b,
        "fr",
        { sensitivity: "base" }
      )
    );
  }

  if (typeof document !== "undefined") {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  }

  if (
    typeof module !== "undefined"
    && module.exports
  ) {
    module.exports = {
      relationKey,
      buildRelations,
      isCompleteMeeting,
      buildTimeSlots,
      uniqueOrganisationCount,
      uniquePartnerCount,
      isRoomSlotTaken,
      timeOptions,
      buildCalendarOccupancy,
      calendarCellKey,
      availabilityLabelFor,
      parseAvailabilityValues
    };
  }
})();
