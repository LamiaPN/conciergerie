/* =====================================================
   PILOTE - UI.JS

   Rôle :
   Gérer les interactions de la maquette locale sans
   modifier le moteur de stockage.

   SOMMAIRE
   1. Initialisation et constantes
   2. Notifications
   3. File d’actions
   4. Pense-bêtes
   5. Organisations
   6. Navigation principale
   7. Vues du pipeline
   8. Onglets Organisation
   9. Fenêtres modales
   10. Création d’un pense-bête
   11. Transformation en tâche
   12. Capture de rencontre
   13. Prévisualisation import Airtable

   RÈGLE DE MAINTENANCE
   - Mettre à jour ce sommaire si une section est ajoutée.
   - Ne pas mélanger ici la logique IndexedDB de storage.js.
===================================================== */

(function () {
  "use strict";

  window.PiloteUI = {
    init
  };

  function init() {

    /* =====================================================
       1. INITIALISATION ET CONSTANTES
    ===================================================== */

    const pages = {
      today: "Aujourd’hui",
      organisations: "Organisations",
      pipeline: "Pipeline CRM",
      activations: "Activations",
      emails: "Courriels",
      transcription: "Transcription"
    };

    const actions = [
      { id: 1, title: "Envoyer le plan de commandite à Spak", meta: "Spak · Proposition / entente", kind: "overdue", date: "En retard · 13 août" },
      { id: 2, title: "Valider l’élément de communication", meta: "R2i · Activation", kind: "today", date: "Aujourd’hui" },
      { id: 3, title: "Préparer la sélection conciergerie", meta: "VO2 Group · Conciergerie", kind: "today", date: "Aujourd’hui" },
      { id: 4, title: "Suivre le dossier billetterie", meta: "UM6P · Activation", kind: "today", date: "Aujourd’hui" },
      { id: 5, title: "Relancer une collègue sur la visibilité", meta: "Dossier partenaire · Visibilité", kind: "overdue", date: "En retard · 21 août" },
      { id: 6, title: "Vérifier une entente à contre-signer", meta: "Organisation D · Signature", kind: "today", date: "Aujourd’hui" },
      { id: 7, title: "Préparer la rencontre de 11:30", meta: "Dialog Insight · Rencontre", kind: "today", date: "Aujourd’hui" }
    ];

    const organisations = [
      {
        nom: "R2i",
        meta: "Partenaire · Activation",
        statut: "Actif",
        prochaineAction: "Valider l’élément de communication",
        prochaineDate: "Échéance : aujourd’hui",
        projet: "MTL connecte 2026",
        projetMeta: "Partenariat en activation",
        contact: "Kim Boisseau-Chin",
        contactMeta: "R2i",
        etat: "Activation et suivi",
        etatMeta: "3 éléments en cours"
      },
      {
        nom: "UM6P",
        meta: "Partenaire · Activation",
        statut: "Actif",
        prochaineAction: "Suivre le dossier billetterie",
        prochaineDate: "Échéance : aujourd’hui",
        projet: "MTL connecte 2026",
        projetMeta: "Partenariat en activation",
        contact: "À renseigner",
        contactMeta: "Contact principal",
        etat: "Activation et suivi",
        etatMeta: "Suivi en cours"
      },
      {
        nom: "VO2 Group",
        meta: "Partenaire · Conciergerie",
        statut: "Actif",
        prochaineAction: "Préparer la sélection conciergerie",
        prochaineDate: "Échéance : aujourd’hui",
        projet: "Conciergerie",
        projetMeta: "MTL connecte 2026",
        contact: "À renseigner",
        contactMeta: "Contact principal",
        etat: "Activation et suivi",
        etatMeta: "Conciergerie en préparation"
      },
      {
        nom: "Spak",
        meta: "Partenaire · Proposition",
        statut: "Actif",
        prochaineAction: "Envoyer le plan de commandite",
        prochaineDate: "Échéance : en retard",
        projet: "MTL connecte 2026",
        projetMeta: "Proposition / entente",
        contact: "Pierrot Ferland",
        contactMeta: "Spak",
        etat: "Proposition / entente",
        etatMeta: "Suivi commercial"
      },
      {
        nom: "Dialog Insight",
        meta: "Partenaire · Suivi",
        statut: "Actif",
        prochaineAction: "Suivre l’entente et les éléments de visibilité",
        prochaineDate: "Prochaine action à confirmer",
        projet: "MTL connecte 2026",
        projetMeta: "Suivi partenaire",
        contact: "À renseigner",
        contactMeta: "Contact principal",
        etat: "Suivi partenaire",
        etatMeta: "Éléments à consolider"
      },
      {
        nom: "Organisation D",
        meta: "Prospect · Signature",
        statut: "Actif",
        prochaineAction: "Vérifier l’entente à contre-signer",
        prochaineDate: "Échéance : aujourd’hui",
        projet: "MTL connecte 2026",
        projetMeta: "Signature",
        contact: "À renseigner",
        contactMeta: "Contact principal",
        etat: "Signature",
        etatMeta: "Contresignature attendue"
      }
    ];

    let notes = window.PiloteState.notes;
    let activeNoteId = null;
    let selectedOrgName = "R2i";


    /* =====================================================
       2. NOTIFICATIONS
    ===================================================== */

    function showToast(message) {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    }


    /* =====================================================
       3. FILE D’ACTIONS
    ===================================================== */

    function renderActions(filter = "all") {
      const box = document.getElementById("actionList");
      const filtered = actions.filter(action => filter === "all" || action.kind === filter);

      box.innerHTML = filtered.map(action => `
        <div class="action ${action.kind}" data-action="${action.id}">
          <button class="check" title="Marquer comme fait"></button>
          <div>
            <b>${action.title}</b>
            <div class="meta">${action.meta}</div>
          </div>
          <span class="chip ${action.kind === "overdue" ? "red" : "green"}">${action.date}</span>
        </div>
      `).join("");

      box.querySelectorAll(".check").forEach(button => {
        button.addEventListener("click", event => {
          event.target.closest(".action").remove();
          showToast("Action retirée de la file et conservée dans l’historique.");
        });
      });
    }

    renderActions();


    /* =====================================================
       4. PENSE-BÊTES
    ===================================================== */

    function renderNotes() {
      const box = document.getElementById("noteList");

      box.innerHTML = notes.length
        ? notes.map(note => `
            <div class="note" data-note="${note.id}">
              <p>${note.texte || note.text}</p>
              <div class="note-actions">
                <button class="btn small convert-note">Créer la tâche</button>
                <button class="btn small ghost delete-note">Classer</button>
              </div>
            </div>
          `).join("")
        : `<div class="subtle">Aucun pense-bête à traiter.</div>`;

      box.querySelectorAll(".convert-note").forEach(button => {
        button.addEventListener("click", event => {
          activeNoteId = event.target.closest(".note").dataset.note;
          const note = notes.find(item => item.id === activeNoteId);
          document.getElementById("taskText").value = note.texte || note.text || "";
          openModal("taskModal");
        });
      });

      box.querySelectorAll(".delete-note").forEach(button => {
        button.addEventListener("click", async event => {
          const id = event.target.closest(".note").dataset.note;
          notes = notes.filter(note => note.id !== id);
          window.PiloteState.notes = notes;

          try {
            await PiloteStorage.saveState(window.PiloteState);
            renderNotes();
            showToast("Pense-bête classé.");
          } catch (error) {
            console.error("Erreur classement pense-bête :", error);
            showToast("Échec de la sauvegarde.");
          }
        });
      });
    }

    renderNotes();


    /* =====================================================
       5. ORGANISATIONS
    ===================================================== */

    function updateOrganisationDetail(org) {
      document.getElementById("orgName").textContent = org.nom;
      document.getElementById("orgMeta").textContent = org.meta;
      document.getElementById("orgStatus").textContent = org.statut;
      document.getElementById("orgNextAction").textContent = org.prochaineAction;
      document.getElementById("orgNextDate").textContent = org.prochaineDate;
      document.getElementById("orgProject").textContent = org.projet;
      document.getElementById("orgProjectMeta").textContent = org.projetMeta;
      document.getElementById("orgContact").textContent = org.contact;
      document.getElementById("orgContactMeta").textContent = org.contactMeta;
      document.getElementById("orgState").textContent = org.etat;
      document.getElementById("orgStateMeta").textContent = org.etatMeta;
    }

    function renderOrgs(query = "") {
      const box = document.getElementById("orgDirectory");
      const normalizedQuery = query.trim().toLowerCase();

      const rows = organisations.filter(org =>
        org.nom.toLowerCase().includes(normalizedQuery)
      );

      box.innerHTML = rows.map(org => `
        <div class="org-item ${org.nom === selectedOrgName ? "active" : ""}" data-name="${org.nom}">
          <b>${org.nom}</b>
          <div class="subtle">${org.meta}</div>
        </div>
      `).join("");

      box.querySelectorAll(".org-item").forEach(item => {
        item.addEventListener("click", () => {
          selectedOrgName = item.dataset.name;
          const org = organisations.find(entry => entry.nom === selectedOrgName);
          renderOrgs(document.getElementById("orgSearch").value);
          updateOrganisationDetail(org);
        });
      });
    }

    renderOrgs();
    updateOrganisationDetail(organisations[0]);

    document.getElementById("orgSearch").addEventListener("input", event => {
      renderOrgs(event.target.value);
    });


    /* =====================================================
       6. NAVIGATION PRINCIPALE
    ===================================================== */

    document.getElementById("nav").addEventListener("click", event => {
      const button = event.target.closest("button[data-page]");
      if (!button) return;

      document.querySelectorAll(".nav button[data-page]").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
      });

      document.getElementById(`page-${button.dataset.page}`).classList.add("active");
      document.getElementById("pageTitle").textContent = pages[button.dataset.page];
      window.scrollTo({ top: 0, behavior: "smooth" });
    });


    /* =====================================================
       7. VUES DU PIPELINE
    ===================================================== */

    document.getElementById("viewToggle").addEventListener("click", event => {
      const button = event.target.closest("button[data-view]");
      if (!button) return;

      document.querySelectorAll("#viewToggle button").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      document.querySelectorAll(".crm-view").forEach(view => {
        view.classList.remove("active");
      });

      document.getElementById(`crm-${button.dataset.view}`).classList.add("active");
    });

    document.querySelectorAll(".toggle-details").forEach(button => {
      button.addEventListener("click", event => {
        event.target.closest(".list-row").classList.toggle("open");
      });
    });

    document.getElementById("actionFilter").addEventListener("change", event => {
      renderActions(event.target.value);
    });


    /* =====================================================
       8. ONGLETS ORGANISATION
    ===================================================== */

    document.getElementById("orgTabs").addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button) return;

      document.querySelectorAll("#orgTabs button").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");
      showToast("Dans la maquette, seule la vue générale est détaillée.");
    });


    /* =====================================================
       9. FENÊTRES MODALES
    ===================================================== */

    function openModal(id) {
      document.getElementById(id).classList.add("open");
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove("open");
    }

    ["quickNoteTop", "quickNoteSide", "quickNoteFab"].forEach(id => {
      document.getElementById(id).addEventListener("click", () => openModal("noteModal"));
    });

    document.getElementById("newMeetingBtn").addEventListener("click", () => {
      openModal("meetingModal");
    });

    document.querySelectorAll("[data-close]").forEach(button => {
      button.addEventListener("click", () => closeModal(button.dataset.close));
    });

    document.querySelectorAll(".modal").forEach(modal => {
      modal.addEventListener("click", event => {
        if (event.target === modal) closeModal(modal.id);
      });
    });


    /* =====================================================
       10. CRÉATION D’UN PENSE-BÊTE
    ===================================================== */

    document.getElementById("saveNote").addEventListener("click", async () => {
      const text = document.getElementById("noteText").value.trim();
      if (!text) return;

      notes.unshift({
        id: PiloteUtils.uuid(),
        modifieLe: PiloteUtils.nowIso(),
        texte: text,
        text,
        organisationId: null,
        roleId: null,
        cree: PiloteUtils.nowIso(),
        dernierSuivi: null
      });

      window.PiloteState.notes = notes;

      try {
        await PiloteStorage.saveState(window.PiloteState);
        document.getElementById("noteText").value = "";
        renderNotes();
        closeModal("noteModal");
        showToast("Pense-bête enregistré localement.");
      } catch (error) {
        console.error("Erreur sauvegarde pense-bête :", error);
        showToast("Échec de la sauvegarde du pense-bête.");
      }
    });


    /* =====================================================
       11. TRANSFORMATION EN TÂCHE
    ===================================================== */

    document.getElementById("saveTask").addEventListener("click", async () => {
      const title = document.getElementById("taskText").value.trim();
      if (!title) return;

      actions.unshift({
        id: Date.now(),
        title,
        meta: "Tâche créée depuis un pense-bête",
        kind: "today",
        date: "Aujourd’hui"
      });

      window.PiloteState.actions.unshift({
        id: PiloteUtils.uuid(),
        modifieLe: PiloteUtils.nowIso(),
        roleId: null,
        phase: null,
        titre: title,
        source: "tache",
        faite: false,
        faiteLe: null,
        prochaineDate: PiloteUtils.todayIso()
      });

      if (activeNoteId) {
        notes = notes.filter(note => note.id !== activeNoteId);
        window.PiloteState.notes = notes;
        activeNoteId = null;
        renderNotes();
      }

      try {
        await PiloteStorage.saveState(window.PiloteState);
        renderActions(document.getElementById("actionFilter").value);
        closeModal("taskModal");
        showToast("Tâche créée et enregistrée localement.");
      } catch (error) {
        console.error("Erreur sauvegarde tâche :", error);
        showToast("Échec de la sauvegarde de la tâche.");
      }
    });


    /* =====================================================
       12. CAPTURE DE RENCONTRE
    ===================================================== */

    document.getElementById("saveMeeting").addEventListener("click", () => {
      closeModal("meetingModal");
      showToast("Capture de rencontre simulée.");
    });


    /* =====================================================
       13. PRÉVISUALISATION IMPORT AIRTABLE
    ===================================================== */

    const importCsvBtn = document.getElementById("importCsvBtn");
    const importCsvInput = document.getElementById("importCsvInput");
    const changeCsvBtn = document.getElementById("changeCsvBtn");
    const importLoading = document.getElementById("csvImportLoading");
    const importResults = document.getElementById("csvImportResults");
    const importError = document.getElementById("csvImportError");

    function setText(id, value) {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    }

    function renderPartnerStatuses(counts) {
      const box = document.getElementById("importPartnerStatusCounts");
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      box.innerHTML = rows.map(([label, count]) => `
        <span class="import-status-chip"><b>${count}</b> ${label}</span>
      `).join("");
    }

    function renderObjectCounts(counts) {
      const box = document.getElementById("importObjectCounts");
      const labels = {
        organisations: "Organisations",
        contacts: "Contacts",
        rolesCommandite: "Dossiers 2026",
        actions: "Actions",
        activations: "Activations",
        rencontres: "Rencontres",
        notes: "Notes"
      };

      box.innerHTML = Object.entries(labels).map(([key, label]) => `
        <div><span>${label}</span><b>${counts[key] ?? 0}</b></div>
      `).join("");
    }

    function renderVerifyRows(rows) {
      const box = document.getElementById("importVerifyRows");
      box.innerHTML = rows.length
        ? rows.map(row => `
            <div class="import-review-row">
              <div>
                <b>${row.name}</b>
                <div class="subtle">${row.suivi || "Suivi vide"}</div>
              </div>
              <div class="import-review-meta">
                <span class="chip green">${row.etat === "actif" ? "Actif" : "Dormant"}</span>
                <span>${row.reason}</span>
              </div>
            </div>
          `).join("")
        : `<div class="import-empty">Aucune phase à vérifier.</div>`;
    }

    function renderDuplicateRows(rows) {
      const box = document.getElementById("importDuplicateRows");
      box.innerHTML = rows.length
        ? rows.map(group => `
            <div class="import-review-row">
              <div>
                <b>${group.name}</b>
                <div class="subtle">${group.count} lignes Airtable distinctes</div>
              </div>
              <div class="import-review-meta">${group.rows.map(row => `<span>${row.sourceId} · ${row.statut}</span>`).join("")}</div>
            </div>
          `).join("")
        : `<div class="import-empty">Aucun nom répété.</div>`;
    }

    function renderCsvPreview(preview, fileName) {
      setText("csvImportFileName", fileName);
      setText("csvImportSourceInfo", `${preview.sourceRows} lignes lues · filtre Privé appliqué`);
      setText("importPrivateCount", preview.privateRows);
      setText("importActiveCount", preview.stateCounts.actif);
      setText("importDormantCount", preview.stateCounts.dormant);
      setText("importVerifyCount", preview.phaseCounts.verifier);
      setText("importPhaseProspection", preview.phaseCounts.prospection);
      setText("importPhaseNegociation", preview.phaseCounts.negociation);
      setText("importPhaseSignature", preview.phaseCounts.signature);
      setText("importPhaseActivation", preview.phaseCounts.activation);
      renderPartnerStatuses(preview.partnerStatusCounts);
      renderObjectCounts(preview.objectCounts);
      renderVerifyRows(preview.verifyRows);
      renderDuplicateRows(preview.duplicateNames);
      importLoading.classList.add("hidden");
      importError.classList.add("hidden");
      importResults.classList.remove("hidden");
    }

    async function previewCsv(file) {
      if (!file) return;

      openModal("csvImportModal");
      importResults.classList.add("hidden");
      importError.classList.add("hidden");
      importLoading.classList.remove("hidden");
      setText("csvImportFileName", file.name);
      setText("csvImportSourceInfo", "Analyse locale en cours…");

      try {
        const preview = await PiloteImport.previewCsvFile(file);
        renderCsvPreview(preview, file.name);
      } catch (error) {
        console.error("Erreur prévisualisation CSV :", error);
        importLoading.classList.add("hidden");
        importResults.classList.add("hidden");
        importError.textContent = `Prévisualisation impossible : ${error.message}`;
        importError.classList.remove("hidden");
      } finally {
        importCsvInput.value = "";
      }
    }

    importCsvBtn.addEventListener("click", () => importCsvInput.click());
    changeCsvBtn.addEventListener("click", () => importCsvInput.click());
    importCsvInput.addEventListener("change", event => previewCsv(event.target.files?.[0]));

    document.getElementById("validateCsvImportBtn").addEventListener("click", () => {
      showToast("Écriture désactivée : prévisualisation à valider d’abord.");
    });
  }
})();
