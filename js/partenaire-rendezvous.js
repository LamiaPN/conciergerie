(() => {
  "use strict";

  const params = typeof location !== "undefined"
    ? new URLSearchParams(location.search)
    : new URLSearchParams();

  const state = {
    partenaireId: String(params.get("p") || "").trim(),
    token: String(params.get("token") || "").trim(),
    partenaire: null,
    organisations: new Map(),
    rencontres: []
  };

  const $ = selector => document.querySelector(selector);

  const escapeHtml = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  async function init() {
    if (!state.partenaireId || !state.token) {
      showError("Lien invalide : identifiant ou jeton manquant.");
      return;
    }

    try {
      const [vivier, rencontres] = await Promise.all([
        API.loadVivier(),
        API.getRencontres(state.partenaireId, state.token)
      ]);

      state.partenaire = API.getPartenaire(vivier, state.partenaireId);
      if (!state.partenaire) throw new Error("Partenaire introuvable.");

      state.organisations = new Map(
        (vivier.organisations || []).map(org => [
          String(org.id || "").trim(),
          org
        ])
      );

      state.rencontres = sortMeetings(rencontres || []);

      const tag = $("#partnerTag");
      if (tag) {
        tag.textContent =
          `Espace ${state.partenaire.nom} · 13–15 octobre 2026`;
      }

      const count = $("#rdvCount");
      if (count) count.textContent = `${state.rencontres.length} RDV`;

      $("#rdvLoading").hidden = true;
      $("#rdvContent").hidden = false;
      $("#rdvContent").innerHTML = state.rencontres.length
        ? renderMeetings(state.rencontres)
        : renderEmpty();
    } catch (error) {
      showError(
        error.message || "Impossible de charger vos rendez-vous."
      );
    }
  }

  function sortMeetings(items) {
    return [...items].sort((a, b) => {
      const aKey = `${String(a.date || "")} ${String(a.heure || "")}`;
      const bKey = `${String(b.date || "")} ${String(b.heure || "")}`;
      return aKey.localeCompare(bKey);
    });
  }

  function groupByDate(items) {
    const groups = new Map();

    items.forEach(item => {
      const date = String(item.date || "").trim();
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(item);
    });

    return [...groups.entries()];
  }

  function renderMeetings(items) {
    return groupByDate(items).map(([date, meetings]) => `
      <section class="partner-rdv-day">
        <header class="partner-rdv-day-head">
          <span>${escapeHtml(formatDate(date))}</span>
          <strong>${meetings.length} RDV</strong>
        </header>

        <div class="partner-rdv-list">
          ${meetings.map(renderMeeting).join("")}
        </div>
      </section>
    `).join("");
  }

  function renderMeeting(meeting) {
    const organisationId =
      String(meeting.organisation_id || "").trim();

    const organisation = state.organisations.get(organisationId);
    const name = organisation?.nom || organisationId || "Organisation";

    return `
      <article class="partner-rdv-card">
        <div class="partner-rdv-time">${escapeHtml(meeting.heure || "—")}</div>

        <div class="partner-rdv-info">
          <strong>${escapeHtml(name)}</strong>
          <span>
            <i class="fas fa-location-dot"></i>
            ${escapeHtml(meeting.salle || "Salle à confirmer")}
          </span>
        </div>

        <span class="partner-rdv-status">
          <i class="fas fa-check"></i>
          Planifié
        </span>
      </article>
    `;
  }

  function renderEmpty() {
    return `
      <div class="partner-rdv-empty">
        <i class="fas fa-calendar-days"></i>
        <strong>Vos rendez-vous sont en cours de planification.</strong>
        <p>Ils apparaîtront ici dès qu'une date, une heure et une salle auront été attribuées.</p>
      </div>
    `;
  }

  function formatDate(value) {
    const labels = {
      "2026-10-13": "Mardi 13 octobre",
      "2026-10-14": "Mercredi 14 octobre",
      "2026-10-15": "Jeudi 15 octobre"
    };

    return labels[value] || value;
  }

  function showError(message) {
    const loading = $("#rdvLoading");
    const error = $("#rdvError");
    const content = $("#rdvContent");

    if (loading) loading.hidden = true;
    if (content) content.hidden = true;

    if (error) {
      error.hidden = false;
      error.textContent = message;
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { sortMeetings, groupByDate, formatDate };
  }
})();
