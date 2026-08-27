/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-planning-ui.js
   RÔLE    : Feedback d'enregistrement + accordéon de la vue Par partenaire.

   IMPORTANT :
   - Aucun MutationObserver.
   - Les conflits métier existants restent bloquants.
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  if (window.__conciergeriePlanningUiLoaded) return;
  window.__conciergeriePlanningUiLoaded = true;



  /* ═══ ORDRE DES VUES : PARTENAIRE EN PREMIER ══════════════════════════ */
  function placePartnerFirst() {
    const segment = document.querySelector("#conciergerieModeSegment");
    if (!segment) return;

    const partnerButton = segment.querySelector('[data-mode="partenaire"]');
    const organisationButton = segment.querySelector('[data-mode="organisation"]');

    if (partnerButton && organisationButton && segment.firstElementChild !== partnerButton) {
      segment.insertBefore(partnerButton, organisationButton);
    }
  }

  /* ═══ VUE PAR PARTENAIRE PAR DÉFAUT ═══════════════════════════════════ */
  let defaultPartnerViewApplied = false;

  function applyDefaultPartnerView() {
    if (location.hash !== "#conciergerie") {
      defaultPartnerViewApplied = false;
      return;
    }

    placePartnerFirst();

    const partnerButton = document.querySelector(
      '#conciergerieModeSegment [data-mode="partenaire"]'
    );

    if (!partnerButton) return;

    if (partnerButton.classList.contains("on")) {
      defaultPartnerViewApplied = true;
      return;
    }

    if (!defaultPartnerViewApplied) {
      partnerButton.click();

      if (partnerButton.classList.contains("on")) {
        defaultPartnerViewApplied = true;
      }
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    #conciergerieSaveStatus.planning-status-error{
      display:inline-flex;align-items:center;gap:8px;padding:9px 12px;
      border-radius:10px;background:#fff0f0;color:#b42318;font-weight:600;
    }
    #conciergerieSaveStatus.planning-status-success{
      display:inline-flex;align-items:center;gap:8px;padding:9px 12px;
      border-radius:10px;background:#edf8e8;color:#3d7f2b;font-weight:600;
    }
    #conciergerieSaveStatus.planning-status-saving{
      display:inline-flex;align-items:center;gap:8px;padding:9px 12px;
      border-radius:10px;background:#f5f6f5;color:#505650;font-weight:600;
    }


    #partnerAccordionToolbar{
      display:flex;justify-content:flex-end;gap:8px;margin:0 0 12px 0;
    }
    #partnerAccordionToolbar .btn{
      min-width:120px;
    }

    #conciergerieContent .partner-accordion-card .conciergerie-org-head{
      cursor:pointer;user-select:none;transition:background .18s ease;
    }
    #conciergerieContent .partner-accordion-card .conciergerie-org-head:hover{
      background:#f7f8f7;
    }
    #conciergerieContent .partner-accordion-chevron{
      display:inline-flex;align-items:center;justify-content:center;
      width:30px;height:30px;margin-left:10px;border-radius:50%;
      color:#667066;transition:transform .2s ease;
    }
    #conciergerieContent .partner-accordion-card.is-open .partner-accordion-chevron{
      transform:rotate(180deg);
    }
    #conciergerieContent .partner-accordion-card .table-scroll{display:none;}
    #conciergerieContent .partner-accordion-card.is-open .table-scroll{display:block;}
  `;
  document.head.appendChild(style);

  function saveStatus() {
    return document.querySelector("#conciergerieSaveStatus");
  }

  function saveButton() {
    return document.querySelector("#conciergerieSaveBtn");
  }

  function visibleConflictRows() {
    return document.querySelectorAll(
      "#conciergerieContent .conciergerie-row-conflict"
    ).length;
  }

  function refreshSaveFeedback() {
    const status = saveStatus();
    const button = saveButton();
    if (!status || !button) return;

    const text = String(status.textContent || "").trim();
    const conflicts = visibleConflictRows();

    status.classList.remove(
      "planning-status-error",
      "planning-status-success",
      "planning-status-saving"
    );

    if (conflicts > 0) {
      status.classList.add("planning-status-error");

      // Le moteur existant désactive le bouton en cas de conflit.
      // On le rend cliquable uniquement pour afficher l'explication.
      if (button.disabled && /conflit/i.test(text)) {
        button.disabled = false;
        button.setAttribute("aria-disabled", "false");
      }
      return;
    }

    if (/enregistrement en cours/i.test(text)) {
      status.classList.add("planning-status-saving");
      return;
    }

    if (/rendez-vous enregistrés/i.test(text)) {
      status.classList.add("planning-status-success");
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("#conciergerieSaveBtn");
    if (!button) return;

    const conflicts = visibleConflictRows();
    if (!conflicts) return;

    setTimeout(() => {
      const status = saveStatus();
      if (!status) return;

      status.textContent =
        `Impossible d’enregistrer : ${conflicts} ligne${conflicts > 1 ? "s" : ""} en conflit. Corrigez les lignes rouges.`;
      status.classList.remove("planning-status-success", "planning-status-saving");
      status.classList.add("planning-status-error");

      const save = saveButton();
      if (save) save.disabled = false;
    }, 0);
  }, true);

  const openPartnerKeys = new Set();
  let accordionInitialized = false;

  function partnerModeActive() {
    return Boolean(
      document.querySelector(
        '#conciergerieModeSegment [data-mode="partenaire"].on'
      )
    );
  }

  function cardKey(card) {
    return String(
      card.querySelector(".conciergerie-org-head h3")?.textContent || ""
    ).trim();
  }

  function ensureAccordionToolbar() {
    const content = document.querySelector("#conciergerieContent");
    if (!content || !partnerModeActive()) return null;

    let toolbar = document.querySelector("#partnerAccordionToolbar");
    if (toolbar) return toolbar;

    toolbar = document.createElement("div");
    toolbar.id = "partnerAccordionToolbar";
    toolbar.className = "partner-accordion-toolbar";
    toolbar.innerHTML = `
      <button type="button" class="btn btn-outline btn-sm" data-accordion-action="open-all">
        <i class="fas fa-angles-down"></i> Ouvrir tout
      </button>
      <button type="button" class="btn btn-outline btn-sm" data-accordion-action="close-all">
        <i class="fas fa-angles-up"></i> Fermer tout
      </button>
    `;

    content.parentNode.insertBefore(toolbar, content);
    return toolbar;
  }

  function removeAccordionToolbar() {
    document.querySelector("#partnerAccordionToolbar")?.remove();
  }

  function removeAccordion() {
    removeAccordionToolbar();

    document.querySelectorAll(
      "#conciergerieContent .conciergerie-org-card.partner-accordion-card"
    ).forEach(card => {
      card.classList.remove("partner-accordion-card", "is-open");
      const table = card.querySelector(".table-scroll");
      if (table) table.style.display = "";
      card.querySelector(".partner-accordion-chevron")?.remove();
      card.querySelector(".conciergerie-org-head")
        ?.removeAttribute("aria-expanded");
    });
  }

  function applyAccordion() {
    const content = document.querySelector("#conciergerieContent");
    if (!content) return;

    if (!partnerModeActive()) {
      removeAccordion();
      accordionInitialized = false;
      return;
    }

    ensureAccordionToolbar();

    const cards = [
      ...content.querySelectorAll(":scope > .conciergerie-org-card")
    ];
    if (!cards.length) return;

    const availableKeys = new Set(cards.map(cardKey).filter(Boolean));

    // Nettoie les clés de partenaires qui ne sont plus dans la vue filtrée.
    [...openPartnerKeys].forEach(key => {
      if (!availableKeys.has(key)) openPartnerKeys.delete(key);
    });

    // Première arrivée sur "Par partenaire" : tout fermé pour une vue compacte.
    if (!accordionInitialized) {
      openPartnerKeys.clear();
      accordionInitialized = true;
    }

    cards.forEach(card => {
      const key = cardKey(card);
      const header = card.querySelector(".conciergerie-org-head");
      const table = card.querySelector(".table-scroll");
      if (!header || !table) return;

      card.classList.add("partner-accordion-card");

      let chevron = header.querySelector(".partner-accordion-chevron");
      if (!chevron) {
        chevron = document.createElement("span");
        chevron.className = "partner-accordion-chevron";
        chevron.innerHTML = '<i class="fas fa-chevron-down"></i>';
        chevron.setAttribute("aria-hidden", "true");
        header.appendChild(chevron);
      }

      const open = openPartnerKeys.has(key);
      card.classList.toggle("is-open", open);
      header.setAttribute("aria-expanded", open ? "true" : "false");
      table.style.display = open ? "block" : "none";
    });
  }

  function setCardOpen(card, open) {
    if (!card) return;

    const key = cardKey(card);
    if (!key) return;

    if (open) openPartnerKeys.add(key);
    else openPartnerKeys.delete(key);

    card.classList.toggle("is-open", open);
    card.querySelector(".conciergerie-org-head")
      ?.setAttribute("aria-expanded", open ? "true" : "false");

    const table = card.querySelector(".table-scroll");
    if (table) table.style.display = open ? "block" : "none";
  }

  document.addEventListener("click", event => {
    const actionButton = event.target.closest(
      "#partnerAccordionToolbar [data-accordion-action]"
    );

    if (actionButton && partnerModeActive()) {
      const cards = [
        ...document.querySelectorAll(
          "#conciergerieContent .partner-accordion-card"
        )
      ];

      if (actionButton.dataset.accordionAction === "open-all") {
        cards.forEach(card => setCardOpen(card, true));
      } else if (actionButton.dataset.accordionAction === "close-all") {
        cards.forEach(card => setCardOpen(card, false));
      }

      return;
    }

    const header = event.target.closest(
      "#conciergerieContent .partner-accordion-card .conciergerie-org-head"
    );
    if (!header || !partnerModeActive()) return;

    const card = header.closest(".conciergerie-org-card");
    if (!card) return;

    const key = cardKey(card);
    setCardOpen(card, !openPartnerKeys.has(key));
  });

  document.addEventListener("click", event => {
    if (event.target.closest("#conciergerieModeSegment, #conciergerieRdvSegment")) {
      setTimeout(applyAccordion, 50);
      setTimeout(applyAccordion, 250);
    }
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#conciergerie") {
      defaultPartnerViewApplied = false;
      [80, 250, 600, 1200].forEach(delay => {
        setTimeout(() => {
          applyDefaultPartnerView();
          applyAccordion();
        }, delay);
      });
    }
    setTimeout(refreshSaveFeedback, 120);
  });

  setInterval(() => {
    applyAccordion();
    refreshSaveFeedback();
  }, 500);

  [100, 300, 700, 1200, 2200].forEach(delay => {
    setTimeout(() => {
      applyDefaultPartnerView();
      applyAccordion();
    }, delay);
  });

  window.addEventListener("load", () => {
    setTimeout(() => {
      placePartnerFirst();
      applyDefaultPartnerView();
      applyAccordion();
    }, 180);
  });

  setTimeout(refreshSaveFeedback, 250);
})();
