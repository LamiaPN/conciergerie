/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-conciergerie.js
   VERSION : v56 — calendrier PN avec vues par date, salle et partenaire
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
    calendarView: "date",
    calendarRoom: DEFAULT_ROOMS[0],
    calendarPartnerId: "",
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

  function nomAffiche(partenaire) {
    if (!partenaire) return "";

    return (
      typeof NOMS_COURTS !== "undefined" &&
      NOMS_COURTS[partenaire.id]
    )
      || partenaire.nom
      || partenaire.id;
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

    el.savebar = $("#conciergerieSavebar");
    el.saveStatus = $("#conciergerieSaveStatus");
    el.saveBtn = $("#conciergerieSaveBtn");

    el.addRoomBtn = $("#conciergerieAddRoomBtn");
    el.roomAddForm = $("#conciergerieRoomAddForm");
    el.newRoomInput = $("#conciergerieNewRoomInput");
    el.confirmRoomBtn = $("#conciergerieConfirmRoomBtn");
    el.cancelRoomBtn = $("#conciergerieCancelRoomBtn");
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

    el.saveBtn?.addEventListener("click", saveDirtyMeetings);
    el.addRoomBtn?.addEventListener("click", openRoomForm);
    el.confirmRoomBtn?.addEventListener("click", addRoom);
    el.cancelRoomBtn?.addEventListener("click", closeRoomForm);

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

      const [rencontres, referentiels, raw] = await Promise.all([
        API.getRencontresAdmin(state.adminToken),
        API.getReferentiels(),
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
          email_rdv: exactId(item.email_rdv)
        }
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

        relations.push({
          key,
          partenaire: entry.partenaire,
          organisation,
          formulaire: entry.formulaire || null,
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
      const formMail = exactId(
        relation.formulaire?.contact_email
      );

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
        email_rdv:
          exactId(relation.rdv?.email_rdv)
          || formMail
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

  function filteredRelations(relations, filter) {
    if (filter === "with") {
      return relations.filter(hasRdv);
    }

    if (filter === "without") {
      return relations.filter(
        relation => !hasRdv(relation)
      );
    }

    return [...relations];
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
    const withRdv = all.filter(hasRdv);
    const withoutRdv = all.filter(
      relation => !hasRdv(relation)
    );

    if (el.orgCount) {
      el.orgCount.textContent = `${withRdv.length} / ${all.length}`;
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
        String(all.length);
    }

    if (el.rdvWithCount) {
      el.rdvWithCount.textContent =
        String(withRdv.length);
    }

    if (el.rdvWithoutCount) {
      el.rdvWithoutCount.textContent =
        String(withoutRdv.length);
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

    if (state.mode === "partenaire") {
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
        label: nomAffiche(relation.partenaire)
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
      if (["date", "salle", "partenaire"].includes(view)) {
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
      const rdv = relation?.rdv || {};

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
      isCompleteMeeting(relation?.rdv || {})
    );
  }

  function calendarMeetingCard(relation) {
    return `
      <div class="pn-calendar-meeting">
        <strong>${escapeHtml(nomAffiche(relation.partenaire))}</strong>
        <span>${escapeHtml(
          relation.organisation?.nom
          || relation.organisation?.id
          || "Organisation"
        )}</span>
      </div>`;
  }

  function renderCalendarDateView(rooms) {
    const selectedDate = EVENT_DATES.some(
      item => item.value === state.calendarDate
    )
      ? state.calendarDate
      : EVENT_DATES[0].value;

    state.calendarDate = selectedDate;

    const occupancy = buildCalendarOccupancy(
      completeCalendarRelations(),
      selectedDate,
      rooms
    );

    const header = rooms.map(room => `
      <th>${escapeHtml(room)}</th>
    `).join("");

    const body = TIME_SLOTS.map(time => `
      <tr>
        <td class="pn-calendar-time"><strong>${escapeHtml(time)}</strong></td>
        ${rooms.map(room => {
          const meetings = occupancy.get(calendarCellKey(room, time)) || [];
          if (!meetings.length) {
            return `<td><div class="pn-calendar-free"></div></td>`;
          }

          const conflict = meetings.length > 1;
          return `
            <td>
              <div class="pn-calendar-cell${conflict ? " is-conflict" : ""}">
                ${conflict
                  ? `<div class="pn-calendar-conflict">
                       <i class="fas fa-triangle-exclamation"></i>
                       Conflit ×${meetings.length}
                     </div>`
                  : ""}
                ${meetings.map(calendarMeetingCard).join("")}
              </div>
            </td>`;
        }).join("")}
      </tr>
    `).join("");

    return `
      <div class="pn-calendar-toolbar">
        <span class="pn-calendar-label">Date :</span>
        <div class="pn-calendar-pills">
          ${EVENT_DATES.map(item => `
            <button type="button"
                    data-calendar-date="${escapeHtml(item.value)}"
                    class="${item.value === selectedDate ? "active" : ""}">
              ${escapeHtml(item.label)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="pn-calendar-table-wrap">
        <table class="pn-calendar-table">
          <thead>
            <tr>
              <th class="pn-calendar-time-head">Heure</th>
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

    const sections = EVENT_DATES.map(dateItem => {
      const byDate = complete.filter(relation =>
        exactId(relation.rdv?.date) === dateItem.value
        && exactId(relation.rdv?.salle) === selectedRoom
      );

      const byTime = new Map();
      byDate.forEach(relation => {
        const time = exactId(relation.rdv?.heure);
        if (!byTime.has(time)) byTime.set(time, []);
        byTime.get(time).push(relation);
      });

      return `
        <section class="pn-room-day">
          <div class="pn-room-day-title">${escapeHtml(dateItem.label)}</div>
          <table class="pn-room-table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Partenaire</th>
                <th>Organisation rencontrée</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              ${TIME_SLOTS.map(time => {
                const meetings = byTime.get(time) || [];
                if (!meetings.length) {
                  return `
                    <tr class="is-free">
                      <td><strong>${escapeHtml(time)}</strong></td>
                      <td colspan="2">Libre</td>
                      <td><span class="pn-free-badge">Disponible</span></td>
                    </tr>`;
                }

                return meetings.map((relation, index) => `
                  <tr>
                    <td><strong>${index === 0 ? escapeHtml(time) : ""}</strong></td>
                    <td>${escapeHtml(nomAffiche(relation.partenaire))}</td>
                    <td>${escapeHtml(
                      relation.organisation?.nom
                      || relation.organisation?.id
                      || "Organisation"
                    )}</td>
                    <td><span class="pn-rdv-badge">RDV</span></td>
                  </tr>
                `).join("");
              }).join("")}
            </tbody>
          </table>
        </section>`;
    }).join("");

    return `
      <div class="pn-calendar-toolbar">
        <span class="pn-calendar-label">Salle :</span>
        <div class="pn-calendar-pills">
          ${rooms.map(room => `
            <button type="button"
                    data-calendar-room="${escapeHtml(room)}"
                    class="${room === selectedRoom ? "active" : ""}">
              ${escapeHtml(room)}
            </button>
          `).join("")}
        </div>
      </div>

      <div class="pn-room-view">${sections}</div>`;
  }

  function renderCalendarPartnerView() {
    const complete = completeCalendarRelations();
    const partners = calendarPartnerOptions().filter(item =>
      complete.some(relation =>
        exactId(relation.partenaire?.id) === item.id
      )
    );

    const selectedPartnerId = partners.some(
      item => item.id === state.calendarPartnerId
    )
      ? state.calendarPartnerId
      : (partners[0]?.id || "");

    state.calendarPartnerId = selectedPartnerId;

    const meetings = complete
      .filter(relation =>
        exactId(relation.partenaire?.id) === selectedPartnerId
      )
      .sort((a, b) =>
        exactId(a.rdv?.date).localeCompare(exactId(b.rdv?.date))
        || exactId(a.rdv?.heure).localeCompare(exactId(b.rdv?.heure))
      );

    const selectedPartner = partners.find(
      item => item.id === selectedPartnerId
    );

    const dayCount = new Set(
      meetings.map(relation => exactId(relation.rdv?.date))
    ).size;

    const roomCount = new Set(
      meetings.map(relation => exactId(relation.rdv?.salle))
    ).size;

    return `
      <div class="pn-calendar-toolbar">
        <span class="pn-calendar-label">Partenaire :</span>
        <select id="calendarPartnerFilter"
                class="pn-calendar-select"
                aria-label="Choisir un partenaire">
          ${partners.map(item => `
            <option value="${escapeHtml(item.id)}"
                    ${item.id === selectedPartnerId ? "selected" : ""}>
              ${escapeHtml(item.label)}
            </option>
          `).join("")}
        </select>
        <span class="pn-calendar-note">
          Tous ses rendez-vous sur les 3 jours, dans une seule vue.
        </span>
      </div>

      ${selectedPartnerId
        ? `
          <div class="pn-partner-sheet">
            <div class="pn-partner-head">
              <h3>${escapeHtml(selectedPartner?.label || "Partenaire")}</h3>
              <div class="pn-partner-summary">
                <span>${meetings.length} RDV</span>
                <span>${dayCount} jour${dayCount > 1 ? "s" : ""}</span>
                <span>${roomCount} salle${roomCount > 1 ? "s" : ""}</span>
              </div>
            </div>

            <div class="pn-calendar-table-wrap">
              <table class="pn-partner-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Heure</th>
                    <th>Salle</th>
                    <th>Organisation rencontrée</th>
                  </tr>
                </thead>
                <tbody>
                  ${meetings.length
                    ? meetings.map(relation => {
                        const dateLabel = EVENT_DATES.find(
                          item => item.value === exactId(relation.rdv?.date)
                        )?.label || relation.rdv?.date || "—";

                        return `
                          <tr>
                            <td><strong>${escapeHtml(dateLabel)}</strong></td>
                            <td>${escapeHtml(relation.rdv?.heure || "—")}</td>
                            <td>${escapeHtml(relation.rdv?.salle || "—")}</td>
                            <td>${escapeHtml(
                              relation.organisation?.nom
                              || relation.organisation?.id
                              || "Organisation"
                            )}</td>
                          </tr>`;
                      }).join("")
                    : `<tr><td colspan="4" class="pn-empty-row">Aucun rendez-vous planifié.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>`
        : `<div class="pn-calendar-empty">Aucun partenaire avec rendez-vous planifié.</div>`}`;
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

    const view = ["date", "salle", "partenaire"].includes(state.calendarView)
      ? state.calendarView
      : "date";

    state.calendarView = view;

    const complete = completeCalendarRelations();
    const totalRdv = complete.length;

    const content = view === "salle"
      ? renderCalendarRoomView(rooms)
      : view === "partenaire"
        ? renderCalendarPartnerView()
        : renderCalendarDateView(rooms);

    el.content.innerHTML = `
      <section class="pn-rdv-calendar" aria-label="Calendrier des rendez-vous">
        <div class="pn-calendar-top">
          <div class="pn-calendar-tabs">
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
      title = "Aucun rendez-vous à préparer";
      text =
        "Toutes les relations sélectionnées ont un rendez-vous complet.";
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
          (a, b) =>
            nomAffiche(a.partenaire)
              .localeCompare(
                nomAffiche(b.partenaire),
                "fr",
                { sensitivity: "base" }
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
              <h3>${escapeHtml(
                group.organisation.nom
                || group.organisation.id
              )}</h3>
              <span>${count} partenaire${count > 1 ? "s" : ""}</span>
            </header>

            <div class="table-scroll">
              <table class="conciergerie-table">
                <thead>
                  <tr>
                    <th>Partenaire</th>
                    <th>Participant RDV</th>
                    <th>Mail RDV</th>
                    <th>Date</th>
                    <th>Heure</th>
                    <th>Salle</th>
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
          (a, b) =>
            String(
              a.organisation?.nom || ""
            ).localeCompare(
              String(
                b.organisation?.nom || ""
              ),
              "fr",
              { sensitivity: "base" }
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
              <h3>${escapeHtml(
                nomAffiche(group.partenaire)
              )}</h3>
              <span>${count} organisation${count > 1 ? "s" : ""}</span>
            </header>

            <div class="table-scroll">
              <table class="conciergerie-table">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th>Participant RDV</th>
                    <th>Mail RDV</th>
                    <th>Date</th>
                    <th>Heure</th>
                    <th>Salle</th>
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
    const contact =
      contactData(relation.formulaire);

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
          ${escapeHtml(firstColumn)}
        </td>

        <td class="${contact.participant ? "" : "conciergerie-empty-cell"}">
          ${contact.participant
            ? escapeHtml(contact.participant)
            : "—"}
        </td>

        <td>
          <input
            class="conciergerie-rdv-input conciergerie-email"
            type="email"
            data-field="email_rdv"
            value="${escapeHtml(draft.email_rdv)}"
            placeholder="Ajouter un email"
            aria-label="Email du rendez-vous">
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
      </tr>`;
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
      ...values.map(value =>
        `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`
      )
    ].join("");
  }

  function contactData(formulaire) {
    const data = formulaire || {};

    return {
      participant:
        exactId(data.contact_nom),
      mail:
        exactId(data.contact_email)
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
        "email_rdv"
      ].includes(field)
    ) {
      return;
    }

    draft[field] = input.value.trim();
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
