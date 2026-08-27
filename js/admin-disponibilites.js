/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-disponibilites.js
   RÔLE    : Normaliser les disponibilités du formulaire partenaire pour
             supprimer les faux avertissements dans le planning admin.

   EXEMPLES ÉQUIVALENTS :
   - "Mardi 13 oct. · matin"      = "Mardi matin"
   - "Mardi 13 oct. · après-midi" = "Mardi après-midi"
   - idem pour mercredi et jeudi.

   IMPORTANT :
   - L'avertissement reste non bloquant.
   - Aucun MutationObserver.
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  if (window.__conciergerieAdminDisponibilitesLoaded) return;
  window.__conciergerieAdminDisponibilitesLoaded = true;


  const helperStyle = document.createElement("style");
  helperStyle.textContent = `
    .partner-availability-summary{
      display:flex;align-items:center;gap:7px;flex-wrap:wrap;
      margin-left:auto;margin-right:8px;font-size:.78rem;
    }
    .partner-availability-label{
      color:#6d766d;font-weight:600;
    }
    .partner-availability-chip{
      display:inline-flex;align-items:center;gap:5px;
      padding:4px 8px;border-radius:999px;
      background:#e9f7e3;color:#3f842d;font-weight:700;
      white-space:nowrap;
    }
    .partner-availability-chip.is-empty{
      background:#f2f3f2;color:#7a817a;font-weight:600;
    }

    /* Code couleur du créneau choisi :
       vert = compatible avec les disponibilités connues
       orange = hors disponibilité d'au moins une partie
       rouge = laissé au moteur de conflits principal (bloquant) */
    #conciergerieContent [data-relation-key]:not(.has-conflict) [data-field="heure"].availability-ok{
      border-color:#6fbf4a !important;
      background:#eef9e9 !important;
      box-shadow:0 0 0 1px rgba(111,191,74,.10);
    }
    #conciergerieContent [data-relation-key]:not(.has-conflict) [data-field="heure"].availability-out{
      border-color:#e5a323 !important;
      background:#fff4dc !important;
      box-shadow:0 0 0 1px rgba(229,163,35,.10);
    }
  `;
  document.head.appendChild(helperStyle);

  const params = new URLSearchParams(location.search);
  const adminToken = String(
    params.get("token") ||
    sessionStorage.getItem("conciergerie_admin_token_session") ||
    ""
  ).trim();

  const formCache = new Map();
  const loadingCache = new Map();

  function canonicalAvailability(value) {
    const text = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[·•]/g, " ")
      .replace(/\s+/g, " ");

    const day = text.includes("mardi")
      ? "mardi"
      : text.includes("mercredi")
        ? "mercredi"
        : text.includes("jeudi")
          ? "jeudi"
          : "";

    const period = text.includes("apres-midi") || text.includes("apres midi")
      ? "apres-midi"
      : text.includes("matin")
        ? "matin"
        : "";

    return day && period ? `${day} ${period}` : "";
  }

  function splitAvailability(value) {
    if (Array.isArray(value)) return value;

    return String(value || "")
      .split(/\s*\|\s*|\s*,\s*|\n+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function requiredAvailability(date, time) {
    const day = {
      "2026-10-13": "mardi",
      "2026-10-14": "mercredi",
      "2026-10-15": "jeudi"
    }[String(date || "").trim()] || "";

    const match = String(time || "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!day || !match) return "";

    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return `${day} ${minutes < 13 * 60 ? "matin" : "apres-midi"}`;
  }

  async function getForm(partnerId) {
    if (!partnerId || !adminToken || typeof API === "undefined") return null;
    if (formCache.has(partnerId)) return formCache.get(partnerId);
    if (loadingCache.has(partnerId)) return loadingCache.get(partnerId);

    const promise = API.getFormulaireAdmin(partnerId, adminToken)
      .then(form => {
        formCache.set(partnerId, form || null);
        loadingCache.delete(partnerId);
        return form || null;
      })
      .catch(() => {
        loadingCache.delete(partnerId);
        return null;
      });

    loadingCache.set(partnerId, promise);
    return promise;
  }

  function availabilitySet(form) {
    return new Set(
      splitAvailability(form?.disponibilites_conciergerie)
        .map(canonicalAvailability)
        .filter(Boolean)
    );
  }

  function partnerIdsInPlanning() {
    const ids = new Set();
    document.querySelectorAll("#conciergerieContent [data-relation-key]").forEach(row => {
      const key = String(row.dataset.relationKey || "").trim();
      if (!key.includes("::")) return;
      const partnerId = key.split("::")[0];
      if (partnerId) ids.add(partnerId);
    });
    return ids;
  }

  async function refreshRow(row) {
    const key = String(row?.dataset?.relationKey || "").trim();
    if (!key || !key.includes("::")) return;

    const [partnerId, organisationId] = key.split("::");
    const date = row.querySelector('[data-field="date"]')?.value || "";
    const timeSelect = row.querySelector('[data-field="heure"]');
    const time = timeSelect?.value || "";
    const expected = requiredAvailability(date, time);
    const message = row.querySelector(".conciergerie-availability-message");

    if (message) message.textContent = "";
    row.classList.remove("has-availability-warning");
    if (!timeSelect) return;

    timeSelect.classList.remove(
      "availability-ok",
      "availability-out",
      "is-partner-available",
      "is-partner-unavailable"
    );

    // Pas encore de créneau complet : aucune couleur.
    if (!expected) return;

    // Le rouge est géré par le moteur principal : il reste prioritaire.
    if (row.classList.contains("has-conflict")) return;

    const partnerForm = await getForm(partnerId);
    const knownPartnerIds = partnerIdsInPlanning();

    // Si l'organisation rencontrée est elle-même un partenaire de la
    // conciergerie, on tient aussi compte de son formulaire.
    const organisationIsPartner =
      organisationId &&
      organisationId !== partnerId &&
      knownPartnerIds.has(organisationId);

    const organisationForm = organisationIsPartner
      ? await getForm(organisationId)
      : null;

    const partnerAvailability = availabilitySet(partnerForm);
    const organisationAvailability = availabilitySet(organisationForm);

    const hasPartnerAvailability = partnerAvailability.size > 0;
    const hasOrganisationAvailability = organisationAvailability.size > 0;
    const hasAnyKnownAvailability =
      hasPartnerAvailability || hasOrganisationAvailability;

    const outsidePartner =
      hasPartnerAvailability && !partnerAvailability.has(expected);

    const outsideOrganisation =
      hasOrganisationAvailability && !organisationAvailability.has(expected);

    if (outsidePartner || outsideOrganisation) {
      timeSelect.classList.add("availability-out");
      return;
    }

    if (hasAnyKnownAvailability) {
      timeSelect.classList.add("availability-ok");
    }
  }

  function availabilityDisplayLabel(value) {
    const canonical = canonicalAvailability(value);
    const labels = {
      "mardi matin": "Mar. matin",
      "mardi apres-midi": "Mar. après-midi",
      "mercredi matin": "Mer. matin",
      "mercredi apres-midi": "Mer. après-midi",
      "jeudi matin": "Jeu. matin",
      "jeudi apres-midi": "Jeu. après-midi"
    };
    return labels[canonical] || String(value || "").trim();
  }

  function availabilityForForm(form) {
    return splitAvailability(form?.disponibilites_conciergerie)
      .map(value => ({
        raw: String(value || "").trim(),
        canonical: canonicalAvailability(value),
        label: availabilityDisplayLabel(value)
      }))
      .filter(item => item.canonical);
  }

  async function decoratePartnerCard(card) {
    if (!card) return;

    const firstRow = card.querySelector("[data-relation-key]");
    const key = String(firstRow?.dataset?.relationKey || "").trim();
    if (!key || !key.includes("::")) return;

    const partnerId = key.split("::")[0];
    const header = card.querySelector(".conciergerie-org-head");
    if (!header) return;

    let summary = header.querySelector(".partner-availability-summary");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "partner-availability-summary";
      header.insertBefore(
        summary,
        header.querySelector(".partner-accordion-chevron")
      );
    }

    if (summary.dataset.partnerId === partnerId && summary.dataset.ready === "1") {
      return;
    }

    summary.dataset.partnerId = partnerId;
    if (!summary.dataset.ready) {
      summary.innerHTML = `
        <span class="partner-availability-label">Disponibilités :</span>
        <span class="partner-availability-chip is-empty">Chargement…</span>
      `;
    }

    const form = await getForm(partnerId);
    const items = availabilityForForm(form);

    summary.dataset.partnerId = partnerId;

    if (form === null && !formCache.has(partnerId)) {
      summary.dataset.ready = "";
      summary.innerHTML = `
        <span class="partner-availability-label">Disponibilités :</span>
        <span class="partner-availability-chip is-empty">Chargement…</span>
      `;
      return;
    }

    summary.dataset.ready = "1";

    if (!items.length) {
      summary.innerHTML = `
        <span class="partner-availability-label">Disponibilités :</span>
        <span class="partner-availability-chip is-empty">Non renseignées</span>
      `;
      return;
    }

    summary.innerHTML = `
      <span class="partner-availability-label">Disponibilités :</span>
      ${items.map(item => `
        <span class="partner-availability-chip">
          <i class="fas fa-check"></i>${item.label}
        </span>
      `).join("")}
    `;
  }

  async function decoratePlanningRow(row) {
    // Le code couleur est appliqué par refreshRow().
    // Aucun texte ni libellé n'est ajouté dans la liste des heures.
    await refreshRow(row);

    const help = row.querySelector(".conciergerie-time-help");
    if (help) help.remove();

    const timeSelect = row.querySelector('[data-field="heure"]');
    if (!timeSelect) return;

    const selectedValue = String(timeSelect.value || "").trim();

    [...timeSelect.options].forEach(option => {
      const value = String(option.value || "").trim();
      if (!value) return;

      // On enlève les anciens "✓ disponible" tout en conservant
      // l'indication "occupé" ajoutée par le moteur principal.
      if (!/occupé/i.test(option.textContent || "")) {
        option.textContent = value;
      }
      option.style.color = "";
      option.style.fontWeight = "";
    });

    timeSelect.value = selectedValue;
  }

  async function refreshVisibleRows() {
    if (location.hash !== "#conciergerie") return;

    document.querySelectorAll("#conciergerieContent [data-relation-key]")
      .forEach(row => decoratePlanningRow(row));

    const cards = [
      ...document.querySelectorAll(
        "#conciergerieContent .partner-accordion-card"
      )
    ];

    // Les formulaires sont chargés un par un pour éviter de saturer Apps Script.
    for (const card of cards) {
      await decoratePartnerCard(card);
    }
  }

  document.addEventListener("change", event => {
    if (event.target.closest('#conciergerieContent [data-field="date"], #conciergerieContent [data-field="heure"], #conciergerieContent [data-field="salle"]')) {
      setTimeout(refreshVisibleRows, 80);
      setTimeout(refreshVisibleRows, 260);
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest("#conciergerieModeSegment, #conciergerieRdvSegment")) {
      setTimeout(refreshVisibleRows, 100);
    }
  });

  window.addEventListener("hashchange", () => setTimeout(refreshVisibleRows, 100));
  window.addEventListener("focus", refreshVisibleRows);

  setTimeout(refreshVisibleRows, 3000);
  setInterval(refreshVisibleRows, 5000);
})();
