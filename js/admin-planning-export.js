/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-planning-export.js
   RÔLE    : Export imprimable/PDF du planning Conciergerie complet.
   FORMAT  : 1 page A2 paysage — 3 jours × 2 salles.
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  if (!document.querySelector("#admin-dashboard")) return;

  const EVENT_DATES = [
    { value: "2026-10-13", label: "Mardi 13 octobre 2026" },
    { value: "2026-10-14", label: "Mercredi 14 octobre 2026" },
    { value: "2026-10-15", label: "Jeudi 15 octobre 2026" }
  ];

  const DEFAULT_ROOMS = [
    "Salle Conciergerie 1",
    "Salle Conciergerie 2"
  ];

  const exact = value => String(value ?? "").trim();

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function buildTimeSlots() {
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
      slots.push(`${String(hour).padStart(2, "0")}:30`);
    }
    return slots;
  }

  function isCompleteMeeting(item) {
    return Boolean(
      exact(item?.date) &&
      exact(item?.heure) &&
      exact(item?.salle)
    );
  }

  function getAdminToken() {
    return exact(new URLSearchParams(location.search).get("token"));
  }

  function injectButton() {
    if (document.querySelector("#conciergerieExportPdfBtn")) return;

    const filterbar = document.querySelector(".conciergerie-filterbar");
    if (!filterbar) {
      setTimeout(injectButton, 500);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "conciergerie-export-wrap";
    wrap.style.marginLeft = "auto";
    wrap.style.alignSelf = "end";

    const button = document.createElement("button");
    button.type = "button";
    button.id = "conciergerieExportPdfBtn";
    button.className = "btn btn-outline btn-sm";
    button.innerHTML = '<i class="fas fa-file-pdf"></i> Exporter le planning PDF';
    button.addEventListener("click", exportPlanningPdf);

    wrap.appendChild(button);
    filterbar.appendChild(wrap);
  }

  function partnerDisplayName(partner) {
    if (!partner) return "";
    if (
      typeof NOMS_COURTS !== "undefined" &&
      NOMS_COURTS[partner.id]
    ) {
      return NOMS_COURTS[partner.id];
    }
    return exact(partner.nom) || exact(partner.id);
  }

  function contactFromForm(form) {
    return {
      name: exact(form?.contact_nom),
      email: exact(form?.contact_email)
    };
  }

  function contactFromOrganisation(org) {
    return {
      name:
        exact(org?.contact_nom) ||
        exact(org?.contact) ||
        exact(org?.participant_rdv),
      email:
        exact(org?.contact_email) ||
        exact(org?.email) ||
        exact(org?.mail)
    };
  }

  async function loadFormsSequential(ids, adminToken) {
    const forms = new Map();

    for (const id of ids) {
      try {
        const form = await API.getFormulaireAdmin(id, adminToken);
        forms.set(id, form || null);
      } catch (_) {
        forms.set(id, null);
      }
    }

    return forms;
  }

  function chooseRooms(referentiels, meetings) {
    const refs = Array.isArray(referentiels?.salle)
      ? referentiels.salle.map(exact).filter(Boolean)
      : [];

    const used = meetings
      .map(item => exact(item.salle))
      .filter(Boolean);

    const all = [...new Set([
      ...DEFAULT_ROOMS,
      ...refs,
      ...used
    ])];

    const preferred = DEFAULT_ROOMS.filter(room => all.includes(room));
    const result = [...preferred];

    for (const room of all) {
      if (result.length >= 2) break;
      if (!result.includes(room)) result.push(room);
    }

    return result.slice(0, 2);
  }

  function meetingKey(date, room, time) {
    return `${exact(date)}\u0000${exact(room)}\u0000${exact(time)}`;
  }

  function buildMeetingMap(meetings) {
    const map = new Map();

    for (const meeting of meetings) {
      const key = meetingKey(
        meeting.date,
        meeting.salle,
        meeting.heure
      );

      if (!map.has(key)) map.set(key, []);
      map.get(key).push(meeting);
    }

    return map;
  }

  function contactLine(contact) {
    const name = exact(contact?.name);
    const email = exact(contact?.email);

    if (!name && !email) {
      return '<span class="contact missing">Contact non renseigné</span>';
    }

    const parts = [];
    if (name) parts.push(`<span class="contact-name">${escapeHtml(name)}</span>`);
    if (email) parts.push(`<span class="contact-email">${escapeHtml(email)}</span>`);

    return `<span class="contact">${parts.join(" · ")}</span>`;
  }

  function meetingCard(
    meeting,
    partnerById,
    organisationById,
    partnerFormById
  ) {
    const partnerId = exact(meeting.partenaire_id);
    const organisationId = exact(meeting.organisation_id);

    const partner = partnerById.get(partnerId) || {};
    const organisation = organisationById.get(organisationId) || {};

    const partnerContact = contactFromForm(
      partnerFormById.get(partnerId)
    );

    let organisationContact = contactFromOrganisation(organisation);

    // Si l'organisation rencontrée est elle-même partenaire,
    // son propre formulaire fournit son contact.
    if (partnerFormById.has(organisationId)) {
      const formContact = contactFromForm(
        partnerFormById.get(organisationId)
      );

      if (formContact.name || formContact.email) {
        organisationContact = formContact;
      }
    }

    // Le champ email_rdv peut servir de dernier recours uniquement
    // s'il ne duplique pas l'email du partenaire.
    const meetingEmail = exact(meeting.email_rdv);
    if (
      !organisationContact.email &&
      meetingEmail &&
      meetingEmail !== partnerContact.email
    ) {
      organisationContact.email = meetingEmail;
    }

    const partnerName =
      partnerDisplayName(partner) ||
      partnerId ||
      "Partenaire";

    const organisationName =
      exact(organisation.nom) ||
      organisationId ||
      "Organisation";

    return `
      <div class="meeting">
        <div class="company">${escapeHtml(partnerName)}</div>
        ${contactLine(partnerContact)}
        <div class="separator">↕</div>
        <div class="company">${escapeHtml(organisationName)}</div>
        ${contactLine(organisationContact)}
      </div>
    `;
  }

  function buildDayTable(
    date,
    rooms,
    meetingMap,
    partnerById,
    organisationById,
    partnerFormById
  ) {
    const slots = buildTimeSlots();

    const rows = slots.map(time => {
      const cells = rooms.map(room => {
        const meetings =
          meetingMap.get(meetingKey(date.value, room, time)) || [];

        if (!meetings.length) {
          return '<td class="slot empty"></td>';
        }

        return `
          <td class="slot">
            ${meetings.map(meeting =>
              meetingCard(
                meeting,
                partnerById,
                organisationById,
                partnerFormById
              )
            ).join("")}
          </td>
        `;
      }).join("");

      return `
        <tr>
          <th class="time">${escapeHtml(time)}</th>
          ${cells}
        </tr>
      `;
    }).join("");

    return `
      <section class="day">
        <h2>${escapeHtml(date.label)}</h2>
        <table>
          <thead>
            <tr>
              <th class="time">Heure</th>
              ${rooms.map(room =>
                `<th class="room">${escapeHtml(room)}</th>`
              ).join("")}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  function buildPrintHtml(
    rooms,
    meetings,
    vivier,
    forms
  ) {
    const partners = Array.isArray(vivier?.partenaires)
      ? vivier.partenaires
      : [];

    const organisations = Array.isArray(vivier?.organisations)
      ? vivier.organisations
      : [];

    const partnerById = new Map(
      partners.map(item => [exact(item.id), item])
    );

    const organisationById = new Map(
      organisations.map(item => [exact(item.id), item])
    );

    const meetingMap = buildMeetingMap(meetings);

    const days = EVENT_DATES.map(date =>
      buildDayTable(
        date,
        rooms,
        meetingMap,
        partnerById,
        organisationById,
        forms
      )
    ).join("");

    const generated = new Intl.DateTimeFormat("fr-CA", {
      dateStyle: "long",
      timeStyle: "short"
    }).format(new Date());

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Planning Conciergerie - MTL connecte 2026</title>
<style>
  @page {
    size: A2 landscape;
    margin: 7mm;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
  }

  body {
    width: 100%;
    font-size: 8px;
  }

  .page {
    width: 100%;
  }

  .header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 7px;
    padding-bottom: 5px;
    border-bottom: 2px solid #111;
  }

  .header h1 {
    margin: 0;
    font-size: 17px;
    line-height: 1.1;
  }

  .header p {
    margin: 2px 0 0;
    font-size: 8px;
    color: #555;
  }

  .header-meta {
    text-align: right;
    font-size: 7px;
    color: #555;
  }

  .days {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    align-items: start;
  }

  .day {
    min-width: 0;
    break-inside: avoid;
  }

  .day h2 {
    margin: 0;
    padding: 5px 4px;
    text-align: center;
    font-size: 10px;
    line-height: 1.1;
    border: 1px solid #999;
    border-bottom: 0;
    background: #f2f2f2;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  th, td {
    border: 1px solid #aaa;
  }

  thead th {
    background: #e8e8e8;
    font-size: 7.5px;
    padding: 3px 2px;
    text-align: center;
  }

  .time {
    width: 29px;
    text-align: center;
    vertical-align: top;
    padding: 3px 1px;
    background: #fafafa;
    font-size: 7px;
    font-weight: 700;
  }

  .room {
    width: auto;
  }

  .slot {
    height: 39px;
    padding: 2px;
    vertical-align: top;
  }

  .slot.empty {
    background: #fff;
  }

  .meeting {
    min-height: 34px;
    padding: 2px 3px;
    background: #f7f7f7;
    border-left: 2px solid #555;
    overflow: hidden;
  }

  .meeting + .meeting {
    margin-top: 2px;
    border-top: 1px dashed #999;
  }

  .company {
    font-size: 7.3px;
    line-height: 1.12;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .contact {
    display: block;
    margin-top: 1px;
    font-size: 6.4px;
    line-height: 1.08;
    color: #333;
    overflow-wrap: anywhere;
  }

  .contact-email {
    color: #555;
  }

  .missing {
    color: #999;
    font-style: italic;
  }

  .separator {
    margin: 1px 0;
    color: #999;
    font-size: 6px;
    line-height: 1;
  }

  .footer {
    margin-top: 5px;
    display: flex;
    justify-content: space-between;
    font-size: 6.5px;
    color: #666;
  }

  @media print {
    .no-print {
      display: none !important;
    }
  }
</style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div>
        <h1>MTL connecte 2026 - Planning Conciergerie</h1>
        <p>13, 14 et 15 octobre 2026 · ${rooms.map(escapeHtml).join(" · ")}</p>
      </div>
      <div class="header-meta">
        ${meetings.length} rendez-vous planifiés<br>
        Généré le ${escapeHtml(generated)}
      </div>
    </header>

    <div class="days">${days}</div>

    <footer class="footer">
      <span>Une case = un créneau de 30 minutes.</span>
      <span>Planning interne - Conciergerie MTL connecte 2026</span>
    </footer>
  </main>
</body>
</html>`;
  }

  async function exportPlanningPdf() {
    const button = document.querySelector("#conciergerieExportPdfBtn");
    const originalHtml = button?.innerHTML || "";

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert(
        "Le navigateur a bloqué la fenêtre d’export. Autorisez les fenêtres contextuelles pour localhost puis réessayez."
      );
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="fr">
      <head><meta charset="utf-8"><title>Préparation du planning</title></head>
      <body style="font-family:Arial,sans-serif;padding:32px">
        Préparation du planning PDF…
      </body>
      </html>
    `);
    printWindow.document.close();

    try {
      if (button) {
        button.disabled = true;
        button.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Préparation…';
      }

      const adminToken = getAdminToken();
      if (!adminToken) {
        throw new Error("Jeton admin absent.");
      }

      const [vivier, rencontres, referentiels] = await Promise.all([
        API.loadVivier(),
        API.getRencontresAdmin(adminToken),
        API.getReferentiels()
      ]);

      const meetings = (Array.isArray(rencontres) ? rencontres : [])
        .filter(isCompleteMeeting)
        .filter(item =>
          EVENT_DATES.some(date => date.value === exact(item.date))
        );

      if (!meetings.length) {
        throw new Error(
          "Aucun rendez-vous complet à exporter."
        );
      }

      const rooms = chooseRooms(referentiels, meetings);

      if (rooms.length < 2) {
        throw new Error(
          "Deux salles sont nécessaires pour générer ce planning."
        );
      }

      const partnerIds = new Set(
        meetings
          .map(item => exact(item.partenaire_id))
          .filter(Boolean)
      );

      const allPartners = Array.isArray(vivier?.partenaires)
        ? vivier.partenaires
        : [];

      const partnerIdSet = new Set(
        allPartners.map(item => exact(item.id)).filter(Boolean)
      );

      // Si une organisation rencontrée est aussi partenaire,
      // on récupère également son formulaire.
      meetings.forEach(item => {
        const organisationId = exact(item.organisation_id);
        if (partnerIdSet.has(organisationId)) {
          partnerIds.add(organisationId);
        }
      });

      const forms = await loadFormsSequential(
        [...partnerIds],
        adminToken
      );

      const html = buildPrintHtml(
        rooms,
        meetings,
        vivier,
        forms
      );

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 350);
    } catch (error) {
      printWindow.document.open();
      printWindow.document.write(`
        <!doctype html>
        <html lang="fr">
        <head><meta charset="utf-8"><title>Erreur d’export</title></head>
        <body style="font-family:Arial,sans-serif;padding:32px">
          <h2>Export impossible</h2>
          <p>${escapeHtml(error.message || "Une erreur est survenue.")}</p>
        </body>
        </html>
      `);
      printWindow.document.close();
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    }
  }

  injectButton();
  window.addEventListener("load", injectButton);
  window.addEventListener("hashchange", () => {
    if (location.hash === "#conciergerie") {
      setTimeout(injectButton, 100);
    }
  });
})();
