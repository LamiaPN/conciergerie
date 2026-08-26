/* =====================================================
   PILOTE - APP.JS

   Rôle :
   Initialiser Pilote et gérer la prévisualisation de
   l’import Airtable sans écrire dans les données réelles.

   SOMMAIRE
   1. Configuration import Airtable
   2. Lecteur CSV réutilisé d’Email Analytics Studio
   3. Normalisation et mapping v4
   4. Construction de la prévisualisation
   5. API publique PiloteImport
   6. Statut du stockage
   7. Initialisation de l’application

   RÈGLE DE MAINTENANCE
   - Mettre à jour ce sommaire si une section est ajoutée.
   - L’import CSV reste non destructif tant que Lamia
     n’a pas validé la prévisualisation.
===================================================== */

(() => {
  "use strict";

  /* =====================================================
     1. CONFIGURATION IMPORT AIRTABLE
  ===================================================== */

  const PRIVATE_TYPE = "Privé";
  const IMPORT_EDITION = 2026;
  let lastPreview = null;

  const PHASE_RANK = {
    prospection: 1,
    negociation: 2,
    signature: 3,
    activation: 4
  };

  /* =====================================================
     2. LECTEUR CSV RÉUTILISÉ D’EMAIL ANALYTICS STUDIO
  ===================================================== */

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i++;
        row.push(cell);
        if (row.some(value => value.trim() !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);
    if (row.some(value => value.trim() !== "")) rows.push(row);
    return rows;
  }

  function recordsFromCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map((header, index) => {
      const clean = String(header || "").trim();
      return index === 0 ? clean.replace(/^\uFEFF/, "") : clean;
    });

    return rows.slice(1).map(row => {
      const record = {};
      headers.forEach((header, index) => record[header] = row[index] ?? "");
      return record;
    });
  }

  /* =====================================================
     3. NORMALISATION ET MAPPING V4
  ===================================================== */

  function clean(value) {
    return String(value ?? "").trim();
  }

  function firstValue(record, keys) {
    for (const key of keys) {
      const value = clean(record[key]);
      if (value) return value;
    }
    return "";
  }

  function normalizeKey(value) {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\s+/g, " ")
      .replace(/\s*-\s*/g, "-")
      .trim();
  }

  function normalizeOrgName(value) {
    return normalizeKey(value)
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitMulti(value) {
    return clean(value)
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  function parseAmount(value) {
    let text = clean(value).replace(/[$€£\s\u00A0]/g, "");
    if (!text) return 0;

    if (text.includes(",") && text.includes(".")) {
      if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
        text = text.replace(/\./g, "").replace(",", ".");
      } else {
        text = text.replace(/,/g, "");
      }
    } else if (text.includes(",")) {
      text = text.replace(",", ".");
    }

    const number = Number(text.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function parseDateToIso(value) {
    const text = clean(value);
    if (!text) return null;

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const frMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!frMatch) return null;

    const day = frMatch[1].padStart(2, "0");
    const month = frMatch[2].padStart(2, "0");
    return `${frMatch[3]}-${month}-${day}`;
  }

  function classifyStep(step) {
    const value = normalizeKey(step);

    if (
      value.startsWith("1-a contacter") ||
      value.startsWith("2-1er contact effectue") ||
      value.startsWith("3-relance 1") ||
      value.startsWith("5-1 ere rencontre planifiee") ||
      value.startsWith("7-documents envoyes") ||
      value.startsWith("11-suivi a faire") ||
      value.startsWith("12-a relancer")
    ) return { phase: "prospection", rank: PHASE_RANK.prospection };

    if (
      value.startsWith("10-negociation") ||
      value.startsWith("15-redaction entente") ||
      value.startsWith("19-reponse negative")
    ) return { phase: "negociation", rank: PHASE_RANK.negociation };

    if (
      value.startsWith("16-entente envoyee") ||
      value.startsWith("16-entente en attente de signature")
    ) return { phase: "signature", rank: PHASE_RANK.signature };

    if (value.startsWith("17-entente signee")) {
      return { phase: "activation", rank: PHASE_RANK.activation };
    }

    if (
      value.startsWith("21-suivi visibilite") ||
      value.startsWith("22-elements envoyes") ||
      value.startsWith("23-formulaire a remplir") ||
      value.startsWith("25-relance visibilite") ||
      value.startsWith("elements de visibilite a venir") ||
      value.startsWith("elements de visibilite recu") ||
      value.startsWith("elements de visbilite recu")
    ) return { phase: "activation", rank: PHASE_RANK.activation };

    if (value.startsWith("18-aucun suivi")) {
      return { phase: null, rank: 0, verify: true, reason: "Actif, phase à vérifier : 18-Aucun suivi" };
    }

    return { phase: null, rank: 0, verify: true, reason: `Étape Suivi non reconnue : ${step}` };
  }

  function mapSuivi(rawSuivi) {
    const suivi = clean(rawSuivi);
    const etat = suivi ? "actif" : "dormant";

    if (!suivi) {
      return { etat, phase: "prospection", steps: [], completedSteps: [], verify: false, reason: "" };
    }

    const steps = splitMulti(suivi);
    const classified = steps.map(step => ({ step, ...classifyStep(step) }));
    const unresolved = classified.filter(item => item.verify);

    if (unresolved.length) {
      return {
        etat,
        phase: null,
        steps,
        completedSteps: [],
        verify: true,
        reason: unresolved.map(item => item.reason).join(" · ")
      };
    }

    const highest = classified.reduce((best, item) => item.rank > best.rank ? item : best, classified[0]);
    const completedSteps = classified.filter(item => item.rank < highest.rank).map(item => item.step);
    return { etat, phase: highest.phase, steps, completedSteps, verify: false, reason: "" };
  }

  function mapPriority(value) {
    const priority = normalizeKey(value);
    if (priority === "primaire") return "principale";
    if (!priority) return null;
    return "secondaire";
  }

  function stableId(prefix, sourceId, suffix = "") {
    return `${prefix}:${sourceId}${suffix ? `:${suffix}` : ""}`;
  }

  function buildContacts(record, organisationId, sourceId, modifiedAt) {
    let names = splitMulti(record["Contact principal"]);
    let emails = splitMulti(record["Courriel (from Contact principal)"]);
    let functions = splitMulti(record["Fonction (from Contact principal)"]);
    let phones = splitMulti(record["Téléphone (from Contact principal)"]);

    if (!names.length && !emails.length) {
      const fallbackName = [clean(record["Prénom /F"]), clean(record["Nom /F"])].filter(Boolean).join(" ");
      names = fallbackName ? [fallbackName] : [];
      emails = splitMulti(record["Adresse courriel /F"]);
      functions = splitMulti(record["Fonction au sein de l’organisation /F"]);
      phones = splitMulti(record["Numéro de téléphone /F"]);
    }

    const count = Math.max(names.length, emails.length, functions.length, phones.length);
    const contacts = [];

    for (let index = 0; index < count; index++) {
      const name = names[index] || (count === 1 ? names[0] : "") || "";
      const email = emails[index] || (count === 1 ? emails[0] : "") || "";
      const fonction = functions[index] || (functions.length === 1 ? functions[0] : "") || "";
      const telephone = phones[index] || (phones.length === 1 ? phones[0] : "") || "";
      if (!name && !email && !fonction && !telephone) continue;

      contacts.push({
        id: stableId("contact", sourceId, index + 1),
        modifieLe: modifiedAt,
        organisationId,
        nom: name,
        courriel: email,
        courrielNormalise: PiloteUtils.normalizeEmail(email),
        fonction,
        telephone,
        principal: index === 0
      });
    }

    return contacts;
  }

  function buildActivations(record, roleId, sourceId, modifiedAt, suiviInfo) {
    const activations = [];
    const seen = new Set();

    function add(type, sourceValue) {
      if (!clean(sourceValue) || seen.has(type)) return;
      seen.add(type);
      activations.push({
        id: stableId("activation", sourceId, normalizeKey(type).replace(/[^a-z0-9]+/g, "-")),
        modifieLe: modifiedAt,
        roleId,
        type,
        responsableType: "moi",
        responsableNom: clean(record["Responsable PN"]),
        statut: "a_faire",
        termineeLe: null,
        prochaineDate: null
      });
    }

    const suivi = suiviInfo.steps.map(normalizeKey);
    if (suivi.some(step => step.includes("23-formulaire a remplir"))) add("Conciergerie", record["Suivi"]);
    if (suivi.some(step => step.includes("visibilite") || step.includes("elements envoyes") || step.includes("visbilite recu"))) add("Visibilité", record["Suivi"]);

    add("Conciergerie", firstValue(record, ["Conciergerie", "Statut_Conciergerie ", "Etat conciergerie"]));
    add("Kiosque", firstValue(record, ["Statut Kiosque salon ", "kiosque pairconnex"]));
    add("Vitrine", record["Vitrine"]);
    add("5@7", record["5@7"]);
    add("MTL Tech Award", firstValue(record, ["MTL Tech Award", "MTL tech Awards"]));

    return activations;
  }

  /* =====================================================
     4. CONSTRUCTION DE LA PRÉVISUALISATION
  ===================================================== */

  function buildPreview(records) {
    const privateRows = records.filter(record => clean(record["Type de partenaire"]) === PRIVATE_TYPE);
    const previewState = PiloteStorage.emptyState();
    const phaseCounts = { prospection: 0, negociation: 0, signature: 0, activation: 0, verifier: 0 };
    const stateCounts = { actif: 0, dormant: 0 };
    const partnerStatusCounts = {};
    const verifyRows = [];
    const names = new Map();

    privateRows.forEach((record, index) => {
      const sourceId = clean(record["Conciergerie _ID"]) || `ligne-${index + 2}`;
      const organisationId = stableId("organisation", sourceId);
      const roleId = stableId("role", sourceId, IMPORT_EDITION);
      const modifiedDate = parseDateToIso(record["modifié"]);
      const modifiedAt = modifiedDate ? `${modifiedDate}T12:00:00.000Z` : PiloteUtils.nowIso();
      const name = firstValue(record, ["Nom délégation / F", "Nom de l'organisation"]) || `Organisation sans nom ${index + 1}`;
      const suiviInfo = mapSuivi(record["Suivi"]);
      const normalizedName = normalizeOrgName(name);
      const partnerStatus = clean(record["Statut partenaires"]) || "(vide)";

      stateCounts[suiviInfo.etat]++;
      partnerStatusCounts[partnerStatus] = (partnerStatusCounts[partnerStatus] || 0) + 1;

      if (!names.has(normalizedName)) names.set(normalizedName, []);
      names.get(normalizedName).push({ name, sourceId, statut: partnerStatus, suivi: clean(record["Suivi"]) });

      if (suiviInfo.verify) {
        phaseCounts.verifier++;
        verifyRows.push({
          name,
          sourceId,
          etat: suiviInfo.etat,
          suivi: clean(record["Suivi"]),
          reason: suiviInfo.reason
        });
      } else {
        phaseCounts[suiviInfo.phase]++;
      }

      previewState.organisations.push({
        id: organisationId,
        modifieLe: modifiedAt,
        nom: name,
        taille: firstValue(record, ["Taille de l'organisation", "Taille d'organisation (from Nom de l'organisation/ Délégation)"]),
        secteur: firstValue(record, ["Secteur d'activité /F", "Secteur d'activité (from Nom de l'organisation/ Délégation)"]),
        expertise: splitMulti(record["Expertise"]),
        pays: firstValue(record, ["Pays /F", "Pays (from Nom de l'organisation/ Délégation) 2", "Pays (from Nom de l'organisation/ Délégation)"]),
        siteWeb: firstValue(record, ["Site web de l'organisation /F", "Site web (from Nom de l'organisation/ Délégation)"]),
        typeOrganisation: firstValue(record, ["Type d'organisation /F", "Type d'organisation (from Nom de l'organisation/ Délégation)"]),
        theme: clean(record["Thème"]),
        origineProspect: firstValue(record, ["Origine de prospect", "Provenance", "Provenance (from Nom de l'organisation/ Délégation)"])
      });

      previewState.contacts.push(...buildContacts(record, organisationId, sourceId, modifiedAt));

      previewState.rolesCommandite.push({
        id: roleId,
        modifieLe: modifiedAt,
        organisationId,
        edition: IMPORT_EDITION,
        phase: suiviInfo.phase,
        etat: suiviInfo.etat,
        dateCloture: null,
        renouvellement: null,
        priorite: mapPriority(record["Priorité"]),
        responsablePN: clean(record["Responsable PN"]),
        formule: firstValue(record, ["Niveau partenariat", "Niveau de partenariat "]),
        montantArgent: parseAmount(record["Montant en argent"]),
        montantServices: parseAmount(record["Montant total en services"]),
        montantTotal: parseAmount(firstValue(record, ["Montant total (argent+services)", "Revenu Total ( billetterie incluse)"])),
        statutEntente: clean(record["Statut de l'entente"]),
        lienEntente: clean(record["lien vers l'entente"])
      });

      previewState.activations.push(...buildActivations(record, roleId, sourceId, modifiedAt, suiviInfo));

      const noteText = clean(record["Note"]);
      const dernierSuivi = parseDateToIso(record["Dernier Suivi"]);
      if (noteText || dernierSuivi) {
        previewState.notes.push({
          id: stableId("note", sourceId),
          modifieLe: modifiedAt,
          texte: noteText,
          organisationId,
          cree: modifiedAt,
          dernierSuivi
        });
      }
    });

    const duplicateNames = [...names.values()]
      .filter(items => items.length > 1)
      .map(items => ({ name: items[0].name, count: items.length, rows: items }));

    lastPreview = {
      sourceRows: records.length,
      privateRows: privateRows.length,
      stateCounts,
      phaseCounts,
      partnerStatusCounts,
      duplicateNames,
      verifyRows,
      objectCounts: {
        organisations: previewState.organisations.length,
        contacts: previewState.contacts.length,
        rolesCommandite: previewState.rolesCommandite.length,
        actions: previewState.actions.length,
        activations: previewState.activations.length,
        rencontres: previewState.rencontres.length,
        notes: previewState.notes.length,
        total: PiloteStorage.countObjects(previewState)
      },
      previewState
    };

    return lastPreview;
  }

  /* =====================================================
     5. API PUBLIQUE PILOTEIMPORT
  ===================================================== */

  async function previewCsvFile(file) {
    const text = await file.text();
    const records = recordsFromCsv(text);
    if (!records.length) throw new Error("Le fichier CSV ne contient aucune donnée exploitable.");
    return buildPreview(records);
  }

  window.PiloteImport = {
    parseCsv,
    recordsFromCsv,
    buildPreview,
    previewCsvFile,
    getLastPreview: () => lastPreview
  };

  /* =====================================================
     6. STATUT DU STOCKAGE
  ===================================================== */

  function updateStorageStatus(mode) {
    const el = document.getElementById("storageStatus");
    if (!el) return;
    const count = PiloteStorage.countObjects();
    const label = mode === "localstorage" ? "localStorage (secours)" : "IndexedDB";
    el.className = `storage-status ${mode === "localstorage" ? "warn" : "ok"}`;
    el.innerHTML = `<strong>Stockage actif</strong><br>${label} · ${count} objet${count > 1 ? "s" : ""} enregistré${count > 1 ? "s" : ""}`;
  }

  /* =====================================================
     7. INITIALISATION DE L’APPLICATION
  ===================================================== */

  async function start() {
    try {
      window.PiloteState = await PiloteStorage.loadState(PiloteStorage.emptyState());
      PiloteUI.init();
      updateStorageStatus("indexeddb");

      const exportBtn = document.getElementById("exportJsonBtn");
      const importBtn = document.getElementById("importJsonBtn");
      const importInput = document.getElementById("importJsonInput");

      exportBtn?.addEventListener("click", () => PiloteStorage.exportJson());
      importBtn?.addEventListener("click", () => importInput?.click());

      importInput?.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        const ok = window.confirm("Importer ce JSON remplacera les données locales actuelles de Pilote. Continuer ?");
        if (!ok) {
          event.target.value = "";
          return;
        }

        try {
          await PiloteStorage.importJson(file);
          window.alert("Import terminé. La page va être rechargée.");
          window.location.reload();
        } catch (error) {
          console.error(error);
          window.alert(`Import impossible : ${error.message}`);
        } finally {
          event.target.value = "";
        }
      });

      window.addEventListener("pilote:state-saved", () => updateStorageStatus("indexeddb"));
      console.log("[Pilote] Étape 1bis initialisée en mode prévisualisation uniquement.");
    } catch (error) {
      console.error("[Pilote] Initialisation impossible.", error);
      window.alert("Pilote n'a pas pu initialiser son stockage local. Consultez la console pour le détail.");
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
