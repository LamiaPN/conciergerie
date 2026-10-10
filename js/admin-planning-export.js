/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-planning-export.js
   VERSION : v60 — nom PDF simplifié
   RÔLE    : Export imprimable/PDF du planning Conciergerie complet.
   FORMAT  : 3 pages A4 paysage — 1 jour par page × toutes les salles.
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
    "Salle Conciergerie 2",
    "Salle UM6P"
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
    const uniqueIds = [...new Set(ids.map(exact).filter(Boolean))];
    const batchSize = 5;

    for (let index = 0; index < uniqueIds.length; index += batchSize) {
      const batch = uniqueIds.slice(index, index + batchSize);

      const results = await Promise.all(
        batch.map(async id => {
          try {
            const form = await API.getFormulaireAdmin(id, adminToken);
            return [id, form || null];
          } catch (_) {
            return [id, null];
          }
        })
      );

      results.forEach(([id, form]) => forms.set(id, form));
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
      if (result.length >= 3) break;
      if (!result.includes(room)) result.push(room);
    }

    return result.slice(0, 3);
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
    size: A4 landscape;
    margin: 5mm 7mm;
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
    font-size: 8.5px;
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
    font-size: 8px;
    color: #555;
  }

  .days {
    display: block;
    width: 100%;
  }

  .day {
    width: 100%;
    min-width: 0;
    height: 188mm;
    overflow: hidden;
    break-inside: avoid-page;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
  }

  .day:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  .day h2 {
    margin: 0 0 2mm;
    padding: 2mm 2mm;
    text-align: left;
    font-size: 15px;
    line-height: 1.1;
    border-bottom: 2px solid #2f7d50;
    background: #fff;
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
    font-size: 8.5px;
    padding: 4px 3px;
    text-align: center;
  }

  thead th:nth-child(2) {
    background: #2f7d50;
    color: #fff;
  }

  thead th:nth-child(3) {
    background: #2b68a6;
    color: #fff;
  }

  .time {
    width: 42px;
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
    height: 34px;
    max-height: 34px;
    padding: 2px 3px;
    vertical-align: top;
    overflow: hidden;
  }

  .slot.empty {
    background: #fff;
  }

  .meeting {
    height: 29px;
    max-height: 29px;
    padding: 2px 4px;
    background: #f7f7f7;
    border-left: 3px solid #555;
    overflow: hidden;
  }

  td:nth-child(2) .meeting {
    background: #eef7f1;
    border-left-color: #2f8a58;
  }

  td:nth-child(3) .meeting {
    background: #eef4fb;
    border-left-color: #2f73b7;
  }

  .meeting + .meeting {
    margin-top: 2px;
    border-top: 1px dashed #999;
  }

  .company {
    font-size: 8px;
    line-height: 1.12;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .contact {
    display: block;
    margin-top: 1px;
    font-size: 7px;
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
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
    }

    .day,
    table,
    tr,
    th,
    td {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .no-print {
      display: none !important;
    }
  }
</style>
</head>
<body>
  <main class="page">
    <div class="days">${days}</div>
  </main>
</body>
</html>`;
  }

  function showExportMessage(message, isError = false) {
    let toast = document.querySelector("#conciergerieExportToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "conciergerieExportToast";
      Object.assign(toast.style, {
        position: "fixed",
        right: "24px",
        bottom: "24px",
        zIndex: "99999",
        maxWidth: "420px",
        padding: "12px 16px",
        borderRadius: "10px",
        font: "600 13px Arial, sans-serif",
        boxShadow: "0 8px 24px rgba(0,0,0,.18)"
      });
      document.body.appendChild(toast);
    }

    toast.style.background = isError ? "#fff0f0" : "#edf8e8";
    toast.style.color = isError ? "#b42318" : "#347022";
    toast.textContent = message;
    toast.hidden = false;

    clearTimeout(showExportMessage._timer);
    showExportMessage._timer = setTimeout(() => {
      toast.hidden = true;
    }, 5000);
  }

  function ensureJsPdf() {
    if (window.jspdf?.jsPDF) {
      return Promise.resolve(window.jspdf.jsPDF);
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-conciergerie-jspdf]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.jspdf.jsPDF), { once: true });
        existing.addEventListener("error", () => reject(new Error("Impossible de charger le moteur PDF.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
      script.defer = true;
      script.dataset.conciergerieJspdf = "true";
      script.onload = () => resolve(window.jspdf.jsPDF);
      script.onerror = () => reject(new Error("Impossible de charger le moteur PDF."));
      document.head.appendChild(script);
    });
  }

  function pdfShortName(value) {
    let text = exact(value);
    if (!text) return "";

    const paren = text.indexOf("(");
    if (paren > 0) text = text.slice(0, paren).trim();

    const dash = text.match(/\s[-–—]\s/);
    if (dash && Number.isInteger(dash.index) && dash.index > 0) {
      text = text.slice(0, dash.index).trim();
    }

    return text;
  }

  function buildPdfContact(contact) {
    const name = exact(contact?.name);
    const email = exact(contact?.email);
    return [name, email].filter(Boolean).join(" · ");
  }

  async function generatePlanningPdf(
    rooms,
    meetings,
    vivier,
    forms
  ) {
    const JsPDF = await ensureJsPdf();
    const doc = new JsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 7;
    const titleH = 18;
    const footerH = 7;
    const gridTop = margin + titleH;
    const gridBottom = pageH - margin - footerH;
    const dayTitleH = 9;
    const roomHeadH = 8;
    const slots = buildTimeSlots();
    const slotH = (gridBottom - gridTop - dayTitleH - roomHeadH) / slots.length;
    const timeW = 13;
    const contentW = pageW - margin * 2 - timeW;
    const roomW = contentW / Math.max(1, rooms.length);

    const partners = Array.isArray(vivier?.partenaires) ? vivier.partenaires : [];
    const organisations = Array.isArray(vivier?.organisations) ? vivier.organisations : [];
    const partnerById = new Map(partners.map(item => [exact(item.id), item]));
    const organisationById = new Map(organisations.map(item => [exact(item.id), item]));
    const meetingMap = buildMeetingMap(meetings);

    const generated = new Intl.DateTimeFormat("fr-CA", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date());

    function getMeetingData(meeting) {
      const partnerId = exact(meeting.partenaire_id);
      const organisationId = exact(meeting.organisation_id);
      const partner = partnerById.get(partnerId) || {};
      const organisation = organisationById.get(organisationId) || {};

      const partnerContact = contactFromForm(forms.get(partnerId));
      let organisationContact = contactFromOrganisation(organisation);

      if (forms.has(organisationId)) {
        const formContact = contactFromForm(forms.get(organisationId));
        if (formContact.name || formContact.email) {
          organisationContact = formContact;
        }
      }

      const meetingEmail = exact(meeting.email_rdv);
      if (
        !organisationContact.email &&
        meetingEmail &&
        meetingEmail !== partnerContact.email
      ) {
        organisationContact.email = meetingEmail;
      }

      return {
        partnerName: pdfShortName(
          partnerDisplayName(partner) || partnerId || "Partenaire"
        ),
        organisationName: pdfShortName(
          exact(organisation.nom) || organisationId || "Organisation"
        ),
        partnerContact: buildPdfContact(partnerContact),
        organisationContact: buildPdfContact(organisationContact)
      };
    }

    function drawDayPage(date, pageIndex) {
      if (pageIndex > 0) doc.addPage("a4", "landscape");

      const dayMeetings = meetings.filter(item => exact(item.date) === date.value);

      doc.setTextColor(17, 17, 17);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("MTL connecte 2026 - Planning Conciergerie", margin, margin + 6);

      doc.setFontSize(13);
      doc.setTextColor(47, 125, 80);
      doc.text(date.label, margin, margin + 13);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.8);
      doc.setTextColor(85, 85, 85);
      doc.text(
        `${dayMeetings.length} rendez-vous · ${rooms.join(" · ")}`,
        pageW - margin,
        margin + 6,
        { align: "right" }
      );
      doc.text(
        `Page ${pageIndex + 1}/${EVENT_DATES.length} · Généré le ${generated}`,
        pageW - margin,
        margin + 12.5,
        { align: "right" }
      );

      const x0 = margin;
      const headY = gridTop + dayTitleH;

      doc.setDrawColor(155, 155, 155);
      doc.setLineWidth(0.18);
      doc.setFillColor(242, 242, 242);
      doc.rect(x0, gridTop, pageW - margin * 2, dayTitleH, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(date.label, x0 + (pageW - margin * 2) / 2, gridTop + 6.1, { align: "center" });

      doc.setFillColor(37, 50, 68);
      doc.rect(x0, headY, timeW, roomHeadH, "FD");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.2);
      doc.text("Heure", x0 + timeW / 2, headY + 5.2, { align: "center" });

      rooms.forEach((room, roomIndex) => {
        const rx = x0 + timeW + roomIndex * roomW;
        const isFirst = roomIndex === 0;

        if (isFirst) {
          doc.setFillColor(47, 125, 80);
        } else if (roomIndex === 1) {
          doc.setFillColor(43, 104, 166);
        } else if (roomIndex === 2) {
          doc.setFillColor(154, 74, 166);
        } else {
          doc.setFillColor(100, 100, 100);
        }

        doc.rect(rx, headY, roomW, roomHeadH, "FD");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.4);
        doc.text(
          pdfShortName(room),
          rx + roomW / 2,
          headY + 5.2,
          { align: "center", maxWidth: roomW - 3 }
        );
      });

      slots.forEach((time, slotIndex) => {
        const y = headY + roomHeadH + slotIndex * slotH;

        doc.setFillColor(248, 249, 250);
        doc.setDrawColor(205, 210, 214);
        doc.rect(x0, y, timeW, slotH, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.8);
        doc.setTextColor(70, 76, 82);
        doc.text(time, x0 + timeW / 2, y + slotH / 2 + 1.1, { align: "center" });

        rooms.forEach((room, roomIndex) => {
          const rx = x0 + timeW + roomIndex * roomW;

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(205, 210, 214);
          doc.rect(rx, y, roomW, slotH, "FD");

          const cellMeetings = meetingMap.get(
            meetingKey(date.value, room, time)
          ) || [];

          if (!cellMeetings.length) return;

          const perMeetingH = slotH / cellMeetings.length;

          cellMeetings.forEach((meeting, meetingIndex) => {
            const data = getMeetingData(meeting);
            const cy = y + meetingIndex * perMeetingH;
            const padX = 1.5;
            const textW = roomW - padX * 2 - 1.2;

            if (roomIndex === 0) {
              doc.setFillColor(238, 247, 241);
              doc.setDrawColor(47, 138, 88);
            } else if (roomIndex === 1) {
              doc.setFillColor(238, 244, 251);
              doc.setDrawColor(47, 115, 183);
            } else if (roomIndex === 2) {
              doc.setFillColor(248, 239, 250);
              doc.setDrawColor(154, 74, 166);
            } else {
              doc.setFillColor(247, 247, 247);
              doc.setDrawColor(110, 110, 110);
            }

            doc.rect(rx, cy, roomW, perMeetingH, "F");
            doc.setLineWidth(0.65);
            doc.line(rx + 0.9, cy + 0.7, rx + 0.9, cy + perMeetingH - 0.7);

            let ty = cy + 3.2;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.6);
            doc.setTextColor(18, 18, 18);
            doc.text(
              doc.splitTextToSize(
                `${data.partnerName} ↔ ${data.organisationName}`,
                textW
              ).slice(0, 1),
              rx + padX + 0.7,
              ty
            );

            const contacts = [data.partnerContact, data.organisationContact]
              .filter(Boolean)
              .join(" · ");

            if (contacts && perMeetingH >= 6.2) {
              ty += 2.7;
              doc.setFont("helvetica", "normal");
              doc.setFontSize(5.2);
              doc.setTextColor(88, 88, 88);
              doc.text(
                doc.splitTextToSize(contacts, textW).slice(0, 1),
                rx + padX + 0.7,
                ty
              );
            }
          });
        });
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.3);
      doc.setTextColor(100, 100, 100);
      doc.text("Une ligne = un créneau de 30 minutes.", margin, pageH - margin + 1);
      doc.text(
        "Planning interne - Conciergerie MTL connecte 2026",
        pageW - margin,
        pageH - margin + 1,
        { align: "right" }
      );
    }

    EVENT_DATES.forEach((date, index) => drawDayPage(date, index));

    doc.save("Planning_Conciergerie_MTL_connecte_2026.pdf");
  }

  async function exportPlanningPdf() {
    const button = document.querySelector("#conciergerieExportPdfBtn");
    const originalHtml = button?.innerHTML || "";

    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création du PDF…';
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
        throw new Error("Aucun rendez-vous complet à exporter.");
      }

      const rooms = chooseRooms(referentiels, meetings);
      if (!rooms.length) {
        throw new Error("Aucune salle disponible pour générer le planning.");
      }

      const partnerIds = new Set(
        meetings.map(item => exact(item.partenaire_id)).filter(Boolean)
      );

      const allPartners = Array.isArray(vivier?.partenaires)
        ? vivier.partenaires
        : [];

      const partnerIdSet = new Set(
        allPartners.map(item => exact(item.id)).filter(Boolean)
      );

      meetings.forEach(item => {
        const organisationId = exact(item.organisation_id);
        if (partnerIdSet.has(organisationId)) {
          partnerIds.add(organisationId);
        }
      });

      const forms = await loadFormsSequential([...partnerIds], adminToken);

      await generatePlanningPdf(
        rooms,
        meetings,
        vivier,
        forms
      );

      showExportMessage("PDF créé et téléchargé.");
    } catch (error) {
      console.error("Export PDF Conciergerie :", error);
      showExportMessage(
        error.message || "Une erreur est survenue pendant l’export PDF.",
        true
      );
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
