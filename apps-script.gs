/* ════════════════════════════════════════════════════════════════════════
   FICHIER : Code.gs
   RÔLE    : Backend Google Apps Script de la conciergerie MTLC 2026.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Lecture GET                                                    │
   │  2 — Écriture POST                                                  │
   │  3 — Vérification des jetons                                        │
   │  4 — Lecture des sélections                                         │
   │  5 — Lecture / écriture des propositions                            │
   │  6 — Écriture des sélections                                        │
   │  7 — Formulaire, disponibilités et historique                       │
   │  8 — Planification des rendez-vous                                  │
   │ 8B — Notifications des rendez-vous                                  │
   │  9 — Vivier modifiable (lecture / écriture)                         │
   │ 10 — Synchronisation Airtable / conflits                             │
   │ 11 — Contacts privés                                                │
   │ 11B — Synchronisation Participants_import → Contacts                 │
   │ 12 — Référentiels administrables                                    │
   │ 13 — Génération / rotation des jetons                               │
   │ 14 — Utilitaires                                                    │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */

const SPREADSHEET_ID = "1XPBIFw_0AZQEQIlAxCiDXEh4eybZHT4SbihiLdLxp0c";
const SHEET_PARTENAIRES = "Partenaires";
const SHEET_SELECTIONS = "Selections";
const SHEET_SELECTION_STATUS = "Selections_statut";
const SHEET_FORMULAIRES = "Formulaires";
const SHEET_FORMULAIRES_HISTORIQUE = "Formulaires_historique";
const SHEET_PROPOSITIONS = "Propositions";
const SHEET_VIVIER = "Vivier_modifs";
const SHEET_CONTACTS = "Contacts";
const SHEET_PARTICIPANTS_IMPORT = "Participants_import";
const SHEET_VIVIER_CONFLICTS = "Vivier_conflits";
const SHEET_REFERENTIELS = "Referentiels";
const SHEET_RENCONTRES = "Rencontres";

/* ═══ SECTION 1 — LECTURE GET ═══════════════════════════════════════════ */
function doGet(e) {
  try {
    const action = (e.parameter.action || "").toString();
    const p = (e.parameter.p || "").toString().trim();
    const token = (e.parameter.token || "").toString().trim();
    const organisationId = (e.parameter.organisation_id || "").toString().trim();

    if (action === "get") {
      requirePartnerToken_(p, token);
      return json_({ selections: readSelections_(p) });
    }
    if (action === "get_selection_status") {
      requirePartnerToken_(p, token);
      return json_({ status: readSelectionStatus_(p) });
    }
    if (action === "get_propositions") {
      requirePartnerToken_(p, token);
      return json_({ propositions: readPropositions_(p) });
    }
    if (action === "get_formulaire") {
      requirePartnerToken_(p, token);
      return json_({ formulaire: readFormulaire_(p) });
    }
    if (action === "get_rencontres") {
      requirePartnerToken_(p, token);
      return json_({ rencontres: readRencontresForPartner_(p) });
    }

    if (action === "admin_check") {
      requireAdminToken_(token);
      return json_({ ok: true });
    }

    if (action === "admin_get") {
      requireAdminToken_(token);
      return json_({ selections: readSelections_(p) });
    }
    if (action === "admin_get_selection_status") {
      requireAdminToken_(token);
      return json_({ status: readSelectionStatus_(p) });
    }
    if (action === "admin_get_propositions") {
      requireAdminToken_(token);
      return json_({ propositions: readPropositions_(p) });
    }
    if (action === "admin_get_formulaire") {
      requireAdminToken_(token);
      return json_({ formulaire: readFormulaire_(p) });
    }
    if (action === "admin_get_form_history") {
      requireAdminToken_(token);
      return json_({ historique: readFormHistory_(p) });
    }
    if (action === "admin_get_form_notifications") {
      requireAdminToken_(token);
      return json_({ notifications: readFormNotifications_() });
    }
    if (action === "admin_get_rencontres") {
      requireAdminToken_(token);
      return json_({ rencontres: readRencontres_() });
    }
    if (action === "admin_get_contacts") {
      requireAdminToken_(token);
      return json_({ contacts: readContacts_(organisationId) });
    }
    if (action === "admin_get_vivier_conflicts") {
      requireAdminToken_(token);
      return json_({ conflits: readVivierConflicts_() });
    }
    if (action === "get_vivier_modifs") {
      return json_({ organisations: readVivierModifs_() });
    }
    if (action === "get_referentiels") {
      return json_({ referentiels: readReferentiels_() });
    }
    if (action === "build_info") {
      return json_({
        build: "2026-10-08-contact-default-rdv-test-v5",
        delete_referentiel: true,
        get_formulaire: true,
        admin_get_formulaire: true,
        admin_get_form_history: true,
        admin_check: true,
        admin_get_form_notifications: true,
        mark_form_notifications_read: true,
        disponibilites_conciergerie: true,
        admin_get_rencontres: true,
        save_rencontres: true,
        get_rencontres: true,
        send_notification: true,
        send_notifications: true,
        calendar_links: true,
        notification_mode_test: notificationModeTest_(),
        rdv_conflict_lock: true,
        selection_lock: true,
        admin_unlock_selections: true,
        admin_save_selections: true,
        admin_token_rotation_helper: true,
        admin_contacts_private: true,
        admin_sync_contacts_from_forms: true,
        airtable_sync_conflicts: true
      });
    }
    return json_({ error: "Action inconnue." });
  } catch (err) {
    return json_({ error: err.message });
  }
}

/* ═══ SECTION 2 — ÉCRITURE POST ═════════════════════════════════════════ */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = (body.action || "").toString();
    const p = (body.p || "").toString().trim();
    const token = (body.token || "").toString().trim();

    if (action === "save") {
      requirePartnerToken_(p, token);
      const selections = Array.isArray(body.selections) ? body.selections : [];
      saveSelectionsIfUnlocked_(p, selections);
      return json_({ ok: true, count: selections.length });
    }

    if (action === "finalize_selections") {
      requirePartnerToken_(p, token);
      const selections = Array.isArray(body.selections) ? body.selections : [];
      const status = finalizeSelections_(p, selections);
      return json_({ ok: true, count: selections.length, locked: true, status });
    }

    if (action === "admin_unlock_selections") {
      requireAdminToken_(token);
      const status = unlockSelections_(p);
      return json_({ ok: true, locked: false, status });
    }

    if (action === "admin_save_selections") {
      requireAdminToken_(token);
      const selections = Array.isArray(body.selections) ? body.selections : [];
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        writeSelectionsSansLock_(p, selections);
      } finally {
        lock.releaseLock();
      }
      return json_({ ok: true, count: selections.length });
    }

    if (action === "save_formulaire") {
      requirePartnerToken_(p, token);
      const reponses = body.reponses && typeof body.reponses === "object" ? body.reponses : {};
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const result = saveFormulaireAvecHistorique_(p, reponses);
        return json_({ ok: true, ...result });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "mark_form_notifications_read") {
      requireAdminToken_(token);
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const count = markFormNotificationsRead_(p);
        return json_({ ok: true, count });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "save_propositions") {
      requireAdminToken_(token);
      const orgIds = Array.isArray(body.propositions) ? body.propositions : [];
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        writePropositions_(p, orgIds);
      } finally {
        lock.releaseLock();
      }
      return json_({ ok: true, count: orgIds.length });
    }

    if (action === "admin_apply_airtable_sync") {
      requireAdminToken_(token);
      const overrides = Array.isArray(body.overrides) ? body.overrides : [];
      const conflits = Array.isArray(body.conflits) ? body.conflits : [];
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const overrideCount = replaceVivierOverridesSansLock_(overrides);
        const conflictCount = replaceVivierConflictsSansLock_(conflits);
        return json_({ ok: true, overrides: overrideCount, conflits: conflictCount });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "admin_resolve_vivier_conflict") {
      requireAdminToken_(token);
      const conflictId = String(body.conflict_id || "").trim();
      const decision = String(body.decision || "").trim();
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const result = resolveVivierConflictSansLock_(conflictId, decision);
        return json_({ ok: true, ...result });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "save_organisation") {
      requireAdminToken_(token);
      const organisation = body.organisation && typeof body.organisation === "object" ? body.organisation : {};
      const id = writeOrganisation_(organisation);
      return json_({ ok: true, id });
    }

    if (action === "delete_organisation") {
      requireAdminToken_(token);
      const id = String(body.id || "").trim();
      deleteOrganisation_(id);
      return json_({ ok: true, id });
    }

    if (action === "save_contact") {
      requireAdminToken_(token);
      const contact = body.contact && typeof body.contact === "object" ? body.contact : {};
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const saved = writeContactSansLock_(contact);
        return json_({ ok: true, contact: saved });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "delete_contact") {
      requireAdminToken_(token);
      const contactId = String(body.contact_id || "").trim();
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        deleteContactSansLock_(contactId);
        return json_({ ok: true, contact_id: contactId });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "admin_sync_contacts_from_forms") {
      requireAdminToken_(token);
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const count = syncContactsFromAllFormsSansLock_();
        return json_({ ok: true, count });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "add_referentiel") {
      requireAdminToken_(token);
      const categorie = String(body.categorie || "").trim();
      const valeur = String(body.valeur || "").trim();
      addReferentiel_(categorie, valeur);
      return json_({ ok: true, categorie, valeur });
    }

    if (action === "delete_referentiel") {
      requireAdminToken_(token);
      const categorie = String(body.categorie || "").trim();
      const valeur = String(body.valeur || "").trim();
      const usageCount = Number(body.usage_count || 0);
      deleteReferentiel_(categorie, valeur, usageCount);
      return json_({ ok: true, categorie, valeur });
    }

    if (action === "save_rencontres") {
      requireAdminToken_(token);
      const rencontres = Array.isArray(body.rencontres) ? body.rencontres : [];
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        writeRencontres_(rencontres);
      } finally {
        lock.releaseLock();
      }
      return json_({ ok: true, count: rencontres.length });
    }

    if (action === "send_notification") {
      requireAdminToken_(token);
      const rencontre = body.rencontre && typeof body.rencontre === "object" ? body.rencontre : {};
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        return json_({ ok: true, ...sendSingleNotificationSansLock_(rencontre) });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "send_notifications") {
      requireAdminToken_(token);
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        return json_({ ok: true, ...sendNotificationsSansLock_() });
      } finally {
        lock.releaseLock();
      }
    }

    return json_({ error: "Action inconnue." });
  } catch (err) {
    if (err && err.code === "RDV_CONFLICT") {
      return json_({ error: "Conflit de rendez-vous", code: "RDV_CONFLICT", details: String(err.details || err.message || "") });
    }
    return json_({ error: err && err.message ? err.message : "Erreur serveur." });
  }
}

/* ═══ SECTION 3 — VÉRIFICATION DES JETONS ═══════════════════════════════ */
function requirePartnerToken_(partenaireId, token) {
  if (!partenaireId || !token) throw new Error("Lien invalide : identifiant ou jeton manquant.");
  const sh = ss_().getSheetByName(SHEET_PARTENAIRES);
  if (!sh) throw new Error("Feuille Partenaires introuvable.");
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) throw new Error("Aucun partenaire configuré.");

  const header = rows.shift();
  const iId = header.indexOf("partenaire_id");
  const iTok = header.indexOf("token");
  if (iId === -1 || iTok === -1) throw new Error("Colonnes partenaire_id ou token introuvables.");

  const match = rows.find(row => String(row[iId]).trim() === partenaireId);
  if (!match) throw new Error("Partenaire inconnu.");
  const tokenEnregistre = String(match[iTok]).trim();
  if (!tokenEnregistre || tokenEnregistre !== token) throw new Error("Jeton invalide.");
}

function requireAdminToken_(token) {
  const adminToken = PropertiesService.getScriptProperties().getProperty("ADMIN_TOKEN");
  if (!adminToken) throw new Error("ADMIN_TOKEN non configuré.");
  if (!token || token !== adminToken) throw new Error("Accès administrateur refusé.");
}

/* ═══ SECTION 4 — LECTURE DES SÉLECTIONS ════════════════════════════════ */
function readSelections_(partenaireId) {
  const sh = ss_().getSheetByName(SHEET_SELECTIONS);
  if (!sh) throw new Error("Feuille Selections introuvable.");
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];

  const header = rows.shift().map(v => String(v).trim());
  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  if (iP === -1 || iO === -1) throw new Error("Colonnes partenaire_id ou organisation_id introuvables.");

  return rows.filter(row => String(row[iP]).trim() === partenaireId).map(row => String(row[iO]).trim()).filter(Boolean);
}

/* ═══ SECTION 4B — STATUT DE VALIDATION DES SÉLECTIONS ═════════════════ */
function ensureSelectionStatusSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_SELECTION_STATUS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SELECTION_STATUS);
    sh.getRange(1, 1, 1, 4).setValues([["partenaire_id", "statut", "date_validation", "date_modification"]]);
  }
  return sh;
}

function readSelectionStatus_(partenaireId) {
  const sh = ensureSelectionStatusSheet_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return { locked: false, statut: "modifiable", date_validation: "", date_modification: "" };

  const header = rows[0].map(value => String(value).trim());
  const iP = header.indexOf("partenaire_id");
  const iS = header.indexOf("statut");
  const iV = header.indexOf("date_validation");
  const iM = header.indexOf("date_modification");
  if (iP === -1 || iS === -1) throw new Error("Colonnes Selections_statut introuvables.");

  const row = rows.slice(1).find(item => String(item[iP] || "").trim() === partenaireId);
  if (!row) return { locked: false, statut: "modifiable", date_validation: "", date_modification: "" };

  const formatValue = value => value instanceof Date
    ? Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
    : String(value || "").trim();
  const statut = String(row[iS] || "modifiable").trim() || "modifiable";
  return { locked: statut === "verrouille", statut, date_validation: iV === -1 ? "" : formatValue(row[iV]), date_modification: iM === -1 ? "" : formatValue(row[iM]) };
}

function writeSelectionStatusSansLock_(partenaireId, locked) {
  const sh = ensureSelectionStatusSheet_();
  const rows = sh.getDataRange().getValues();
  const header = rows[0].map(value => String(value).trim());
  const iP = header.indexOf("partenaire_id");
  const iS = header.indexOf("statut");
  const iV = header.indexOf("date_validation");
  const iM = header.indexOf("date_modification");
  if (iP === -1 || iS === -1 || iV === -1 || iM === -1) throw new Error("Colonnes Selections_statut introuvables.");

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][iP] || "").trim() === partenaireId) { rowIndex = i + 1; break; }
  }

  const row = new Array(header.length).fill("");
  row[iP] = partenaireId;
  row[iS] = locked ? "verrouille" : "modifiable";
  row[iV] = locked ? stamp : "";
  row[iM] = stamp;

  if (rowIndex === -1) sh.getRange(sh.getLastRow() + 1, 1, 1, header.length).setValues([row]);
  else sh.getRange(rowIndex, 1, 1, header.length).setValues([row]);

  return { locked: Boolean(locked), statut: locked ? "verrouille" : "modifiable", date_validation: locked ? stamp : "", date_modification: stamp };
}

function saveSelectionsIfUnlocked_(partenaireId, orgIds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const status = readSelectionStatus_(partenaireId);
    if (status.locked) throw new Error("Vos choix ont été validés et sont maintenant en lecture seule. Contactez l'équipe de MTL connecte pour demander une modification.");
    writeSelectionsSansLock_(partenaireId, orgIds);
  } finally { lock.releaseLock(); }
}

function finalizeSelections_(partenaireId, orgIds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const status = readSelectionStatus_(partenaireId);
    if (status.locked) return status;
    writeSelectionsSansLock_(partenaireId, orgIds);
    return writeSelectionStatusSansLock_(partenaireId, true);
  } finally { lock.releaseLock(); }
}

function unlockSelections_(partenaireId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return writeSelectionStatusSansLock_(partenaireId, false); }
  finally { lock.releaseLock(); }
}

/* ═══ SECTION 5 — LECTURE / ÉCRITURE DES PROPOSITIONS ══════════════════ */
function readPropositions_(partenaireId) {
  const sh = ss_().getSheetByName(SHEET_PROPOSITIONS);
  if (!sh) throw new Error("Feuille Propositions introuvable.");
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows.shift();
  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  if (iP === -1 || iO === -1) throw new Error("Colonnes partenaire_id ou organisation_id introuvables.");
  return rows.filter(row => String(row[iP]).trim() === partenaireId).map(row => String(row[iO]).trim()).filter(Boolean);
}

function writePropositions_(partenaireId, orgIds) {
  const sh = ss_().getSheetByName(SHEET_PROPOSITIONS);
  if (!sh) throw new Error("Feuille Propositions introuvable.");
  const rows = sh.getDataRange().getValues();
  if (!rows.length) throw new Error("La feuille Propositions ne contient pas d'en-têtes.");
  const header = rows[0];
  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  const iD = header.indexOf("date_modification");
  if (iP === -1 || iO === -1 || iD === -1) throw new Error("Colonnes Propositions introuvables.");

  for (let r = rows.length - 1; r >= 1; r--) if (String(rows[r][iP]).trim() === partenaireId) sh.deleteRow(r + 1);
  const ids = [...new Set(orgIds.map(id => String(id).trim()).filter(Boolean))];
  if (!ids.length) return;
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const nouvellesLignes = ids.map(id => {
    const row = new Array(header.length).fill("");
    row[iP] = partenaireId; row[iO] = id; row[iD] = stamp;
    return row;
  });
  sh.getRange(sh.getLastRow() + 1, 1, nouvellesLignes.length, header.length).setValues(nouvellesLignes);
}

/* ═══ SECTION 6 — ÉCRITURE DES SÉLECTIONS ══════════════════════════════ */
function writeSelections_(partenaireId, orgIds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { writeSelectionsSansLock_(partenaireId, orgIds); }
  finally { lock.releaseLock(); }
}

function writeSelectionsSansLock_(partenaireId, orgIds) {
  const sh = ss_().getSheetByName(SHEET_SELECTIONS);
  if (!sh) throw new Error("Feuille Selections introuvable.");
  const rows = sh.getDataRange().getValues();
  if (!rows.length) throw new Error("La feuille Selections ne contient pas d'en-têtes.");
  const header = rows[0].map(v => String(v).trim());
  const iP = header.indexOf("partenaire_id");
  if (iP === -1) throw new Error("Colonne partenaire_id introuvable.");

  for (let r = rows.length - 1; r >= 1; r--) if (String(rows[r][iP]).trim() === partenaireId) sh.deleteRow(r + 1);
  const ids = [...new Set(orgIds.map(id => String(id).trim()).filter(Boolean))];
  if (!ids.length) return;
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const nouvellesLignes = ids.map(id => [partenaireId, id, stamp]);
  sh.getRange(sh.getLastRow() + 1, 1, nouvellesLignes.length, 3).setValues(nouvellesLignes);
}

/* ═══ SECTION 7 — FORMULAIRE, DISPONIBILITÉS ET HISTORIQUE ═════════════ */
function ensureFormulaireSchema_() {
  const sh = ss_().getSheetByName(SHEET_FORMULAIRES);
  if (!sh) throw new Error("Feuille Formulaires introuvable.");
  const lastColumn = sh.getLastColumn();
  if (!lastColumn) throw new Error("La feuille Formulaires ne contient pas d'en-têtes.");
  const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  if (!header.includes("disponibilites_conciergerie")) sh.getRange(1, lastColumn + 1).setValue("disponibilites_conciergerie");
  return sh;
}

function ensureFormHistorySheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_FORMULAIRES_HISTORIQUE);
  if (!sh) {
    sh = ss.insertSheet(SHEET_FORMULAIRES_HISTORIQUE);
    sh.getRange(1, 1, 1, 5).setValues([["partenaire_id", "date_modification", "type_evenement", "changements_json", "lu_admin"]]);
  }
  return sh;
}

function readFormulaire_(partenaireId) {
  const sh = ensureFormulaireSchema_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return null;
  const header = rows[0].map(v => String(v).trim());
  const iPartenaire = header.indexOf("partenaire_id");
  if (iPartenaire === -1) throw new Error("Colonne partenaire_id introuvable dans Formulaires.");
  const row = rows.slice(1).find(r => String(r[iPartenaire] ?? "").trim() === partenaireId);
  if (!row) return null;

  const formulaire = {};
  header.forEach((cle, index) => {
    if (!cle) return;
    const valeur = row[index];
    formulaire[cle] = valeur instanceof Date ? Utilities.formatDate(valeur, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : valeur ?? "";
  });
  return formulaire;
}

function normaliseFormValue_(value) {
  if (Array.isArray(value)) return value.map(item => String(item ?? "").trim()).filter(Boolean).join(", ");
  return String(value ?? "").trim();
}

function compareFormulaires_(ancien, reponses, header) {
  const changements = {};
  const ignore = new Set(["partenaire_id", "date_modification"]);
  header.forEach(cle => {
    if (!cle || ignore.has(cle)) return;
    const avant = normaliseFormValue_(ancien ? ancien[cle] : "");
    const apres = normaliseFormValue_(Object.prototype.hasOwnProperty.call(reponses, cle) ? reponses[cle] : "");
    if (avant !== apres) changements[cle] = { avant, apres };
  });
  return changements;
}

function saveFormulaireAvecHistorique_(partenaireId, reponses) {
  const sh = ensureFormulaireSchema_();
  const ancien = readFormulaire_(partenaireId);
  const lastColumn = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  const changements = compareFormulaires_(ancien, reponses, header);
  const premierEnvoi = !ancien;
  const aChange = premierEnvoi || Object.keys(changements).length > 0;

  if (!aChange) {
    return { changed: false, type_evenement: "inchangé", date_modification: ancien?.date_modification || "" };
  }

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  writeFormulaire_(partenaireId, reponses, stamp);
  appendFormHistory_(partenaireId, stamp, premierEnvoi ? "creation" : "modification", premierEnvoi ? {} : changements);

  // Le participant renseigné dans le formulaire alimente automatiquement
  // le répertoire privé Contacts, sans exposer ses données dans data.json.
  upsertContactFromFormSansLock_(partenaireId, reponses, stamp);

  return { changed: true, type_evenement: premierEnvoi ? "creation" : "modification", date_modification: stamp, changements: premierEnvoi ? {} : changements };
}

function writeFormulaire_(partenaireId, reponses, stamp) {
  const sh = ensureFormulaireSchema_();
  const lastColumn = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  const iPartenaire = header.indexOf("partenaire_id");
  const iDate = header.indexOf("date_modification");
  if (iPartenaire === -1) throw new Error("Colonne partenaire_id introuvable dans Formulaires.");
  if (iDate === -1) throw new Error("Colonne date_modification introuvable dans Formulaires.");

  const lastRow = sh.getLastRow();
  let targetRow = lastRow + 1;
  if (lastRow >= 2) {
    const ids = sh.getRange(2, iPartenaire + 1, lastRow - 1, 1).getValues();
    const found = ids.findIndex(row => String(row[0]).trim() === partenaireId);
    if (found !== -1) targetRow = found + 2;
  }

  const values = header.map(nomColonne => {
    if (nomColonne === "partenaire_id") return partenaireId;
    if (nomColonne === "date_modification") return stamp;
    return Object.prototype.hasOwnProperty.call(reponses, nomColonne) ? normaliseFormValue_(reponses[nomColonne]) : "";
  });
  sh.getRange(targetRow, 1, 1, lastColumn).setValues([values]);
}

function appendFormHistory_(partenaireId, stamp, typeEvenement, changements) {
  const sh = ensureFormHistorySheet_();
  sh.appendRow([partenaireId, stamp, typeEvenement, JSON.stringify(changements || {}), false]);
}

function readFormHistory_(partenaireId) {
  const sh = ensureFormHistorySheet_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows[0].map(v => String(v).trim());
  const iP = header.indexOf("partenaire_id");
  const iD = header.indexOf("date_modification");
  const iT = header.indexOf("type_evenement");
  const iC = header.indexOf("changements_json");
  const iL = header.indexOf("lu_admin");
  if ([iP, iD, iT, iC, iL].some(index => index === -1)) throw new Error("Colonnes Formulaires_historique introuvables.");

  return rows.slice(1).map((row, index) => ({ row, index }))
    .filter(item => String(item.row[iP] ?? "").trim() === partenaireId)
    .reverse().slice(0, 20)
    .map(item => {
      let changements = {};
      try { changements = JSON.parse(String(item.row[iC] || "{}")); } catch (_) {}
      return {
        date_modification: item.row[iD] instanceof Date ? Utilities.formatDate(item.row[iD], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(item.row[iD] ?? "").trim(),
        type_evenement: String(item.row[iT] ?? "").trim(),
        changements,
        lu_admin: item.row[iL] === true || String(item.row[iL]).toUpperCase() === "TRUE"
      };
    });
}

function readFormNotifications_() {
  const sh = ensureFormHistorySheet_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows[0].map(v => String(v).trim());
  const iP = header.indexOf("partenaire_id");
  const iD = header.indexOf("date_modification");
  const iT = header.indexOf("type_evenement");
  const iL = header.indexOf("lu_admin");
  if ([iP, iD, iT, iL].some(index => index === -1)) throw new Error("Colonnes Formulaires_historique introuvables.");

  const parPartenaire = new Map();
  rows.slice(1).forEach(row => {
    const lu = row[iL] === true || String(row[iL]).toUpperCase() === "TRUE";
    if (lu) return;
    const partenaireId = String(row[iP] ?? "").trim();
    if (!partenaireId) return;
    const date = row[iD] instanceof Date ? Utilities.formatDate(row[iD], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(row[iD] ?? "").trim();
    const precedent = parPartenaire.get(partenaireId);
    parPartenaire.set(partenaireId, { partenaire_id: partenaireId, date_modification: date, type_evenement: String(row[iT] ?? "").trim(), non_lus: (precedent?.non_lus || 0) + 1 });
  });
  return [...parPartenaire.values()];
}

function markFormNotificationsRead_(partenaireId) {
  const sh = ensureFormHistorySheet_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return 0;
  const header = rows[0].map(v => String(v).trim());
  const iP = header.indexOf("partenaire_id");
  const iL = header.indexOf("lu_admin");
  if (iP === -1 || iL === -1) throw new Error("Colonnes partenaire_id ou lu_admin introuvables dans Formulaires_historique.");

  const values = rows.slice(1).map(row => [row[iL]]);
  let count = 0;
  rows.slice(1).forEach((row, index) => {
    const id = String(row[iP] ?? "").trim();
    const lu = row[iL] === true || String(row[iL]).toUpperCase() === "TRUE";
    if (id === partenaireId && !lu) { values[index][0] = true; count += 1; }
  });
  if (count) sh.getRange(2, iL + 1, values.length, 1).setValues(values);
  return count;
}

/* ═══ SECTION 8 — PLANIFICATION DES RENDEZ-VOUS ════════════════════════ */
function readRencontres_() {
  const sh = ss_().getSheetByName(SHEET_RENCONTRES);
  if (!sh) return [];
  ensureRencontresHeaders_(sh);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows.shift().map(v => String(v).trim());
  const required = ["partenaire_id", "organisation_id", "date", "heure", "salle", "email_rdv", "date_modification", "notifie", "participant_partenaire_contact_id", "participant_partenaire_nom", "participant_partenaire_email", "participant_organisation_contact_id", "participant_organisation_nom", "participant_organisation_email"];
  const indexes = Object.fromEntries(required.map(name => [name, header.indexOf(name)]));
  if (indexes.partenaire_id === -1 || indexes.organisation_id === -1) throw new Error("Colonnes partenaire_id ou organisation_id introuvables dans Rencontres.");

  return rows.filter(row => String(row[indexes.partenaire_id] ?? "").trim() && String(row[indexes.organisation_id] ?? "").trim()).map(row => ({
    partenaire_id: String(row[indexes.partenaire_id] ?? "").trim(),
    organisation_id: String(row[indexes.organisation_id] ?? "").trim(),
    date: formatSheetDate_(row[indexes.date], "yyyy-MM-dd"),
    heure: formatSheetTime_(row[indexes.heure]),
    salle: String(row[indexes.salle] ?? "").trim(),
    email_rdv: String(row[indexes.email_rdv] ?? "").trim(),
    date_modification: formatSheetDate_(row[indexes.date_modification], "yyyy-MM-dd HH:mm"),
    notifie: indexes.notifie === -1 ? "" : formatSheetDate_(row[indexes.notifie], "yyyy-MM-dd HH:mm"),
    participant_partenaire_contact_id: indexes.participant_partenaire_contact_id === -1 ? "" : String(row[indexes.participant_partenaire_contact_id] ?? "").trim(),
    participant_partenaire_nom: indexes.participant_partenaire_nom === -1 ? "" : String(row[indexes.participant_partenaire_nom] ?? "").trim(),
    participant_partenaire_email: indexes.participant_partenaire_email === -1 ? "" : String(row[indexes.participant_partenaire_email] ?? "").trim(),
    participant_organisation_contact_id: indexes.participant_organisation_contact_id === -1 ? "" : String(row[indexes.participant_organisation_contact_id] ?? "").trim(),
    participant_organisation_nom: indexes.participant_organisation_nom === -1 ? "" : String(row[indexes.participant_organisation_nom] ?? "").trim(),
    participant_organisation_email: indexes.participant_organisation_email === -1 ? "" : String(row[indexes.participant_organisation_email] ?? "").trim()
  }));
}

function readRencontresForPartner_(partenaireId) {
  return readRencontres_().filter(item => String(item.partenaire_id || "").trim() === partenaireId && String(item.date || "").trim() && String(item.heure || "").trim() && String(item.salle || "").trim()).map(item => ({
    organisation_id: String(item.organisation_id || "").trim(), date: String(item.date || "").trim(), heure: String(item.heure || "").trim(), salle: String(item.salle || "").trim()
  }));
}

function writeRencontres_(rencontres) {
  const sh = ensureRencontresSheet_();
  ensureRencontresHeaders_(sh);
  const lastColumn = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  const iDate = header.indexOf("date");
  const iHeure = header.indexOf("heure");
  const iSalle = header.indexOf("salle");
  const iEmail = header.indexOf("email_rdv");
  const iModif = header.indexOf("date_modification");
  const iNotifie = header.indexOf("notifie");
  const iPContact = header.indexOf("participant_partenaire_contact_id");
  const iPNom = header.indexOf("participant_partenaire_nom");
  const iPEmail = header.indexOf("participant_partenaire_email");
  const iOContact = header.indexOf("participant_organisation_contact_id");
  const iONom = header.indexOf("participant_organisation_nom");
  const iOEmail = header.indexOf("participant_organisation_email");
  if ([iP, iO, iDate, iHeure, iSalle, iEmail, iModif, iNotifie, iPContact, iPNom, iPEmail, iOContact, iONom, iOEmail].some(i => i === -1)) throw new Error("Colonnes requises introuvables dans Rencontres.");

  const lastRow = sh.getLastRow();
  const existingRows = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
  const rowByKey = new Map();
  const existingRecords = existingRows.map((row, index) => {
    const record = normalizeRencontre_({ partenaire_id: row[iP], organisation_id: row[iO], date: row[iDate], heure: row[iHeure], salle: row[iSalle], email_rdv: row[iEmail] });
    if (record.partenaire_id && record.organisation_id) { rowByKey.set(record.key, index + 2); return record; }
    return null;
  }).filter(Boolean);

  const incomingRecords = (Array.isArray(rencontres) ? rencontres : []).map(normalizeRencontre_);
  validateIncomingRencontres_(incomingRecords);
  const finalByKey = buildFinalRencontresMap_(existingRecords, incomingRecords);
  checkRencontresConflicts_(incomingRecords, finalByKey);

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const toDelete = [];
  incomingRecords.forEach(record => {
    const existingRow = rowByKey.get(record.key);
    if (isEmptyRencontre_(record)) { if (existingRow) toDelete.push(existingRow); return; }
    const row = new Array(lastColumn).fill("");
    row[iP] = record.partenaire_id; row[iO] = record.organisation_id; row[iDate] = record.date; row[iHeure] = record.heure; row[iSalle] = record.salle; row[iEmail] = record.email_rdv; row[iModif] = stamp;
    row[iPContact] = record.participant_partenaire_contact_id; row[iPNom] = record.participant_partenaire_nom; row[iPEmail] = record.participant_partenaire_email;
    row[iOContact] = record.participant_organisation_contact_id; row[iONom] = record.participant_organisation_nom; row[iOEmail] = record.participant_organisation_email;
    if (existingRow) {
      row[iNotifie] = sh.getRange(existingRow, iNotifie + 1).getValue();
      sh.getRange(existingRow, 1, 1, lastColumn).setValues([row]);
    }
    else { row[iNotifie] = ""; sh.appendRow(row); rowByKey.set(record.key, sh.getLastRow()); }
  });
  [...new Set(toDelete)].sort((a, b) => b - a).forEach(rowNumber => sh.deleteRow(rowNumber));
}

function normalizeRencontre_(item) {
  const partenaireId = String(item?.partenaire_id ?? "").trim();
  const organisationId = String(item?.organisation_id ?? "").trim();
  return {
    partenaire_id: partenaireId, organisation_id: organisationId, key: `${partenaireId}::${organisationId}`,
    date: formatSheetDate_(item?.date, "yyyy-MM-dd"), heure: formatSheetTime_(item?.heure), salle: String(item?.salle ?? "").trim(), email_rdv: String(item?.email_rdv ?? "").trim(),
    participant_partenaire_contact_id: String(item?.participant_partenaire_contact_id ?? "").trim(),
    participant_partenaire_nom: String(item?.participant_partenaire_nom ?? "").trim(),
    participant_partenaire_email: String(item?.participant_partenaire_email ?? "").trim(),
    participant_organisation_contact_id: String(item?.participant_organisation_contact_id ?? "").trim(),
    participant_organisation_nom: String(item?.participant_organisation_nom ?? "").trim(),
    participant_organisation_email: String(item?.participant_organisation_email ?? "").trim()
  };
}

function validateIncomingRencontres_(records) {
  const keys = new Set();
  records.forEach(record => {
    if (!record.partenaire_id || !record.organisation_id) throw new Error("Chaque rendez-vous doit contenir partenaire_id et organisation_id.");
    if (keys.has(record.key)) throw new Error(`Lot de rendez-vous invalide : la rencontre ${record.key} est présente plusieurs fois.`);
    keys.add(record.key);
  });
}

function isEmptyRencontre_(record) { return !record.date && !record.heure && !record.salle && !record.email_rdv && !record.participant_partenaire_contact_id && !record.participant_organisation_contact_id; }
function isPlannedRencontre_(record) { return Boolean(record?.date && record?.heure && record?.salle); }

function buildFinalRencontresMap_(existingRecords, incomingRecords) {
  const finalByKey = new Map();
  (existingRecords || []).forEach(record => finalByKey.set(record.key, { ...record }));
  (incomingRecords || []).forEach(record => {
    if (isEmptyRencontre_(record)) finalByKey.delete(record.key);
    else finalByKey.set(record.key, { ...record });
  });
  return finalByKey;
}

function checkRencontresConflicts_(incomingRecords, finalByKey) {
  (incomingRecords || []).forEach(incoming => {
    const current = finalByKey.get(incoming.key);
    if (!current || !isPlannedRencontre_(current)) return;
    for (const [otherKey, other] of finalByKey.entries()) {
      if (otherKey === current.key || !isPlannedRencontre_(other)) continue;
      if (current.date !== other.date || current.heure !== other.heure) continue;
      if (current.salle === other.salle) throwRencontreConflict_("salle", current, other);
      if (current.partenaire_id === other.partenaire_id) throwRencontreConflict_("partenaire", current, other);
      if (current.organisation_id === other.organisation_id) throwRencontreConflict_("organisation", current, other);
    }
  });
}

function throwRencontreConflict_(type, current, other) {
  let details = "";
  if (type === "salle") details = `${current.salle} déjà occupée le ${current.date} à ${current.heure}.`;
  else if (type === "partenaire") details = `Le partenaire ${current.partenaire_id} a déjà un rendez-vous le ${current.date} à ${current.heure}.`;
  else if (type === "organisation") details = `L'organisation ${current.organisation_id} a déjà un rendez-vous le ${current.date} à ${current.heure}.`;
  else details = `Conflit détecté le ${current.date} à ${current.heure}.`;
  const err = new Error("Conflit de rendez-vous");
  err.code = "RDV_CONFLICT"; err.details = details; err.conflict_type = type; err.current_key = current.key; err.other_key = other?.key || "";
  throw err;
}

function ensureRencontresSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_RENCONTRES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_RENCONTRES);
    sh.getRange(1, 1, 1, 14).setValues([["partenaire_id", "organisation_id", "date", "heure", "salle", "email_rdv", "date_modification", "notifie", "participant_partenaire_contact_id", "participant_partenaire_nom", "participant_partenaire_email", "participant_organisation_contact_id", "participant_organisation_nom", "participant_organisation_email"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureRencontresHeaders_(sh) {
  const required = ["partenaire_id", "organisation_id", "date", "heure", "salle", "email_rdv", "date_modification", "notifie", "participant_partenaire_contact_id", "participant_partenaire_nom", "participant_partenaire_email", "participant_organisation_contact_id", "participant_organisation_nom", "participant_organisation_email"];
  const lastColumn = Math.max(sh.getLastColumn(), 1);
  const current = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  required.forEach(name => {
    if (!current.includes(name)) { const col = sh.getLastColumn() + 1; sh.getRange(1, col).setValue(name); current.push(name); }
  });
  sh.setFrozenRows(1);
}

/* ═══ SECTION 8B — NOTIFICATIONS DES RENDEZ-VOUS ═══════════════════════ */
function notificationModeTest_() {
  const raw = PropertiesService.getScriptProperties().getProperty("MODE_TEST");
  if (raw === null || raw === "") return true;
  return String(raw).trim().toLowerCase() !== "false";
}

function notificationTestEmail_() {
  const props = PropertiesService.getScriptProperties();
  const raw = String(props.getProperty("TEST_EMAILS") || props.getProperty("TEST_EMAIL") || "").trim();
  const emails = raw.split(/[;,\n]+/).map(value => value.trim()).filter(Boolean);
  if (notificationModeTest_() && !emails.length) {
    throw new Error("TEST_EMAILS ou TEST_EMAIL non configuré dans les propriétés du script.");
  }
  return emails.join(",");
}

function readNotificationPartnerEmails_() {
  const sh = ensureFormulaireSchema_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return new Map();

  const header = rows[0].map(value => String(value).trim());
  const iP = header.indexOf("partenaire_id");
  const iEmail = header.indexOf("contact_email");
  if (iP === -1 || iEmail === -1) throw new Error("Colonnes partenaire_id ou contact_email introuvables dans Formulaires.");

  const result = new Map();
  rows.slice(1).forEach(row => {
    const id = String(row[iP] ?? "").trim();
    const email = String(row[iEmail] ?? "").trim();
    if (id && email) result.set(id, email);
  });
  return result;
}

function notificationCalendarLinks_(date, heure, salle, title, details) {
  const dateText = String(date || "").trim();
  const timeText = String(heure || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(timeText);
  if (!match || !timeMatch) return { google: "", outlook: "" };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const start = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const pad = value => String(value).padStart(2, "0");
  const googleStamp = value =>
    `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}00`;
  const isoLocal = value =>
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:00`;

  const googleParams = [
    "action=TEMPLATE",
    "text=" + encodeURIComponent(title),
    "dates=" + encodeURIComponent(googleStamp(start) + "/" + googleStamp(end)),
    "details=" + encodeURIComponent(details),
    "location=" + encodeURIComponent(salle),
    "ctz=" + encodeURIComponent("America/Toronto")
  ].join("&");

  const outlookParams = [
    "path=" + encodeURIComponent("/calendar/action/compose"),
    "rru=addevent",
    "subject=" + encodeURIComponent(title),
    "startdt=" + encodeURIComponent(isoLocal(start)),
    "enddt=" + encodeURIComponent(isoLocal(end)),
    "body=" + encodeURIComponent(details),
    "location=" + encodeURIComponent(salle)
  ].join("&");

  return {
    google: "https://calendar.google.com/calendar/render?" + googleParams,
    outlook: "https://outlook.office.com/calendar/0/deeplink/compose?" + outlookParams
  };
}

function escapeNotificationHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendNotificationEmail_(intendedEmail, subject, body, roleLabel, testMode, testEmail, calendarInfo) {
  const recipient = testMode ? testEmail : intendedEmail;
  const prefix = testMode
    ? `[MODE TEST — destinataire prévu : ${roleLabel} <${intendedEmail}>]\n\n`
    : "";

  const info = calendarInfo && typeof calendarInfo === "object" ? calendarInfo : {};
  const title = String(info.title || "MTL connecte 2026 — Rendez-vous Conciergerie").trim();
  const details = String(info.details || body || "").trim();
  const links = notificationCalendarLinks_(info.date, info.heure, info.salle, title, details);

  const plainLinks = links.google || links.outlook
    ? [
        "",
        "Ajouter ce rendez-vous à votre calendrier :",
        links.google ? "Google Calendar : " + links.google : "",
        links.outlook ? "Outlook : " + links.outlook : ""
      ].filter(Boolean).join("\n")
    : "";

  const htmlPrefix = testMode
    ? `<p style="padding:10px 12px;background:#fff4d6;border:1px solid #f0c45c;border-radius:8px;"><strong>MODE TEST</strong> — destinataire prévu : ${escapeNotificationHtml_(roleLabel)} &lt;${escapeNotificationHtml_(intendedEmail)}&gt;</p>`
    : "";

  const htmlBody = [
    htmlPrefix,
    '<div style="font-family:Arial,sans-serif;color:#0B0D0C;line-height:1.55;">',
    '<p>Bonjour,</p>',
    '<p>Votre rendez-vous dans le cadre du service de conciergerie de <strong>MTL connecte 2026</strong> est confirmé :</p>',
    '<div style="padding:14px 16px;background:#F4F5F4;border-left:4px solid #6FBF4A;border-radius:8px;">',
    `<div><strong>${escapeNotificationHtml_(info.rendezvous || title)}</strong></div>`,
    `<div style="margin-top:6px;">📅 ${escapeNotificationHtml_(info.date || "")} à ${escapeNotificationHtml_(info.heure || "")}</div>`,
    `<div>📍 ${escapeNotificationHtml_(info.salle || "")}</div>`,
    '</div>',
    links.google || links.outlook ? '<p style="margin-top:18px;"><strong>Ajouter à votre calendrier :</strong></p>' : '',
    '<p>',
    links.google ? `<a href="${links.google}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;background:#6FBF4A;color:#fff;text-decoration:none;border-radius:7px;font-weight:700;">Google Calendar</a>` : '',
    links.outlook ? `<a href="${links.outlook}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;background:#0B0D0C;color:#fff;text-decoration:none;border-radius:7px;font-weight:700;">Outlook</a>` : '',
    '</p>',
    '<p style="font-size:13px;color:#667066;">Le rendez-vous n’est pas ajouté automatiquement à votre agenda : cliquez sur le bouton correspondant, puis enregistrez-le dans votre calendrier.</p>',
    '<p>Au plaisir de vous y retrouver.<br>L’équipe MTL connecte</p>',
    '</div>'
  ].join("");

  MailApp.sendEmail({
    to: recipient,
    subject,
    body: prefix + body + plainLinks,
    htmlBody
  });
}

function sendSingleNotificationSansLock_(meeting) {
  const partenaireId = String(meeting.partenaire_id || "").trim();
  const organisationId = String(meeting.organisation_id || "").trim();
  const date = String(meeting.date || "").trim();
  const heure = String(meeting.heure || "").trim();
  const salle = String(meeting.salle || "").trim();
  const partenaireEmail = String(meeting.participant_partenaire_email || "").trim();
  const organisationEmail = String(meeting.participant_organisation_email || meeting.email_rdv || "").trim();
  if (!partenaireId || !organisationId) throw new Error("Partenaire ou organisation manquant.");
  if (!date || !heure || !salle || !partenaireEmail || !organisationEmail) throw new Error("Le RDV doit contenir date, heure, salle et les deux participants.");

  const sh = ensureRencontresSheet_();
  ensureRencontresHeaders_(sh);
  const existing = readRencontres_().find(item =>
    String(item.partenaire_id || "").trim() === partenaireId &&
    String(item.organisation_id || "").trim() === organisationId
  );
  if (existing && existing.notifie && !notificationModeTest_()) throw new Error("Ce rendez-vous a déjà été notifié.");

  writeRencontres_([{
    partenaire_id: partenaireId,
    organisation_id: organisationId,
    date, heure, salle,
    email_rdv: organisationEmail,
    participant_partenaire_contact_id: String(meeting.participant_partenaire_contact_id || "").trim(),
    participant_partenaire_nom: String(meeting.participant_partenaire_nom || "").trim(),
    participant_partenaire_email: partenaireEmail,
    participant_organisation_contact_id: String(meeting.participant_organisation_contact_id || "").trim(),
    participant_organisation_nom: String(meeting.participant_organisation_nom || "").trim(),
    participant_organisation_email: organisationEmail
  }]);

  const testMode = notificationModeTest_();
  const testEmail = testMode ? notificationTestEmail_() : "";
  const partenaireNom = String(meeting.partenaire_nom || partenaireId).trim();
  const organisationNom = String(meeting.organisation_nom || organisationId).trim();
  const subject = "MTL connecte 2026 — Votre rendez-vous conciergerie du " + date;
  const body = [
    "Bonjour,",
    "",
    "Votre rendez-vous dans le cadre du service de conciergerie de MTL connecte 2026 est confirmé :",
    "",
    "• Rendez-vous : " + partenaireNom + " ↔ " + organisationNom,
    "• Date : " + date + " à " + heure,
    "• Lieu : " + salle,
    "",
    "Au plaisir de vous y retrouver.",
    "Equipe MTL connecte"
  ].join("\n");

  const calendarInfo = {
    date,
    heure,
    salle,
    title: "MTL connecte 2026 — Rendez-vous Conciergerie",
    rendezvous: partenaireNom + " ↔ " + organisationNom,
    details: "Rendez-vous Conciergerie MTL connecte 2026 : " + partenaireNom + " ↔ " + organisationNom + ". Lieu : " + salle + "."
  };

  sendNotificationEmail_(partenaireEmail, subject, body, "participant partenaire", testMode, testEmail, calendarInfo);
  sendNotificationEmail_(organisationEmail, subject, body, "participant organisation", testMode, testEmail, calendarInfo);

  if (!testMode) {
    const lastColumn = sh.getLastColumn();
    const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
    const iP = header.indexOf("partenaire_id");
    const iO = header.indexOf("organisation_id");
    const iNotifie = header.indexOf("notifie");
    const count = Math.max(0, sh.getLastRow() - 1);
    if (count) {
      const rows = sh.getRange(2, 1, count, lastColumn).getValues();
      const match = rows.findIndex(row => String(row[iP] || "").trim() === partenaireId && String(row[iO] || "").trim() === organisationId);
      if (match !== -1) {
        const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
        sh.getRange(match + 2, iNotifie + 1).setValue(stamp);
      }
    }
  }

  return { sent: true, mode_test: testMode, participant_partenaire_email: partenaireEmail, participant_organisation_email: organisationEmail };
}
function sendNotificationsSansLock_() {
  const sh = ensureRencontresSheet_();
  ensureRencontresHeaders_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { envoyes: 0, incomplets: 0, deja: 0, sans_mail: 0, erreurs: 0, mode_test: notificationModeTest_() };

  const lastColumn = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(value => String(value).trim());
  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  const iDate = header.indexOf("date");
  const iHeure = header.indexOf("heure");
  const iSalle = header.indexOf("salle");
  const iEmailRdv = header.indexOf("email_rdv");
  const iNotifie = header.indexOf("notifie");
  if ([iP, iO, iDate, iHeure, iSalle, iEmailRdv, iNotifie].some(index => index === -1)) {
    throw new Error("Colonnes requises introuvables dans Rencontres pour les notifications.");
  }

  const testMode = notificationModeTest_();
  const testEmail = testMode ? notificationTestEmail_() : "";
  const partnerEmails = readNotificationPartnerEmails_();
  const rows = sh.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

  let envoyes = 0;
  let incomplets = 0;
  let deja = 0;
  let sansMail = 0;
  let erreurs = 0;

  rows.forEach((row, index) => {
    const partenaireId = String(row[iP] ?? "").trim();
    const organisationId = String(row[iO] ?? "").trim();
    const date = formatSheetDate_(row[iDate], "yyyy-MM-dd");
    const heure = formatSheetTime_(row[iHeure]);
    const salle = String(row[iSalle] ?? "").trim();
    const participantEmail = String(row[iEmailRdv] ?? "").trim();
    const notifie = String(row[iNotifie] ?? "").trim();

    if (notifie) { deja += 1; return; }
    if (!date || !heure || !salle || !participantEmail) { incomplets += 1; return; }

    const partnerEmail = String(partnerEmails.get(partenaireId) || "").trim();
    if (!partnerEmail) { sansMail += 1; return; }

    const subject = `MTL connecte 2026 — Votre rendez-vous conciergerie du ${date}`;
    const body = [
      "Bonjour,",
      "",
      "Votre rendez-vous dans le cadre du service de conciergerie de MTL connecte 2026 est confirmé :",
      "",
      `• Référence : ${partenaireId} ↔ ${organisationId}`,
      `• Date : ${date} à ${heure}`,
      `• Lieu : ${salle}`,
      "",
      "Au plaisir de vous y retrouver.",
      "L'équipe MTL connecte"
    ].join("\n");

    try {
      const calendarInfo = {
        date,
        heure,
        salle,
        title: "MTL connecte 2026 — Rendez-vous Conciergerie",
        rendezvous: partenaireId + " ↔ " + organisationId,
        details: "Rendez-vous Conciergerie MTL connecte 2026. Référence : " + partenaireId + " ↔ " + organisationId + ". Lieu : " + salle + "."
      };
      sendNotificationEmail_(participantEmail, subject, body, "participant", testMode, testEmail, calendarInfo);
      sendNotificationEmail_(partnerEmail, subject, body, "partenaire", testMode, testEmail, calendarInfo);
      envoyes += 1;
      if (!testMode) sh.getRange(index + 2, iNotifie + 1).setValue(stamp);
    } catch (error) {
      erreurs += 1;
      console.error(`Notification RDV impossible pour ${partenaireId} / ${organisationId} :`, error);
    }
  });

  return { envoyes, incomplets, deja, sans_mail: sansMail, erreurs, mode_test: testMode };
}

function formatSheetDate_(value, pattern) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), pattern);
  return String(value ?? "").trim();
}

function formatSheetTime_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  const text = String(value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

/* ═══ SECTION 9 — VIVIER MODIFIABLE ════════════════════════════════════ */
function readVivierModifs_() {
  const sh = ss_().getSheetByName(SHEET_VIVIER);
  if (!sh) throw new Error("Feuille Vivier_modifs introuvable.");
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows.shift().map(v => String(v).trim());
  const champs = ["id", "nom", "secteur", "type", "taille", "localisation", "description", "site_web", "theme", "expertise", "date_modification"];
  const indexes = Object.fromEntries(champs.map(champ => [champ, header.indexOf(champ)]));
  if (indexes.id === -1) throw new Error("Colonne id introuvable dans Vivier_modifs.");

  return rows.filter(row => String(row[indexes.id] ?? "").trim()).map(row => {
    const org = {};
    champs.forEach(champ => {
      const i = indexes[champ];
      if (i === -1) return;
      const raw = row[i] instanceof Date ? row[i].toISOString() : String(row[i] ?? "").trim();
      if (champ === "expertise") {
        if (!raw) org[champ] = [];
        else {
          try {
            const parsed = JSON.parse(raw);
            org[champ] = Array.isArray(parsed) ? parsed.map(v => String(v).trim()).filter(Boolean) : raw.split(",").map(v => v.trim()).filter(Boolean);
          } catch (_) { org[champ] = raw.split(",").map(v => v.trim()).filter(Boolean); }
        }
      } else org[champ] = raw;
    });
    return org;
  });
}

function writeOrganisation_(organisation) {
  const sh = ss_().getSheetByName(SHEET_VIVIER);
  if (!sh) throw new Error("Feuille Vivier_modifs introuvable.");
  if (!organisation || typeof organisation !== "object") throw new Error("Organisation invalide.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastColumn = sh.getLastColumn();
    if (!lastColumn) throw new Error("La feuille Vivier_modifs ne contient pas d'en-têtes.");
    const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
    const iId = header.indexOf("id");
    const iNom = header.indexOf("nom");
    const iDate = header.indexOf("date_modification");
    if (iId === -1 || iNom === -1 || iDate === -1) throw new Error("Colonnes id, nom ou date_modification introuvables dans Vivier_modifs.");

    const nom = String(organisation.nom ?? "").trim();
    if (!nom) throw new Error("Le nom de l'organisation est requis.");
    let id = String(organisation.id ?? "").trim();
    const lastRow = sh.getLastRow();
    let ids = [];
    if (lastRow >= 2) ids = sh.getRange(2, iId + 1, lastRow - 1, 1).getValues().map(row => String(row[0] ?? "").trim());

    if (!id) {
      let maxLocal = 0;
      ids.forEach(existingId => { const match = /^loc-(\d+)$/.exec(existingId); if (match) maxLocal = Math.max(maxLocal, Number(match[1])); });
      id = `loc-${String(maxLocal + 1).padStart(3, "0")}`;
    }

    let targetRow = lastRow + 1;
    const found = ids.findIndex(existingId => existingId === id);
    if (found !== -1) targetRow = found + 2;

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const allowed = new Set(["id", "nom", "secteur", "type", "taille", "localisation", "description", "site_web", "theme", "expertise"]);
    const values = header.map(colonne => {
      if (colonne === "id") return id;
      if (colonne === "date_modification") return stamp;
      if (!allowed.has(colonne)) return "";
      if (colonne === "expertise") {
        const source = Array.isArray(organisation.expertise) ? organisation.expertise : String(organisation.expertise ?? "").split(",");
        const valeurs = [...new Set(source.map(v => String(v).trim()).filter(Boolean))];
        return valeurs.length ? JSON.stringify(valeurs) : "";
      }
      return String(organisation[colonne] ?? "").trim();
    });

    sh.getRange(targetRow, 1, 1, lastColumn).setValues([values]);
    return id;
  } finally { lock.releaseLock(); }
}

function deleteOrganisation_(id) {
  if (!id) throw new Error("Identifiant organisation requis.");
  if (!/^loc-\d+$/.test(id)) throw new Error("Suppression directe réservée aux organisations locales créées dans l’admin.");

  const usagesPropositions = countOrganisationUsage_(SHEET_PROPOSITIONS, id);
  const usagesSelections = countOrganisationUsage_(SHEET_SELECTIONS, id);
  const usagesContacts = readContacts_(id).length;
  if (usagesPropositions > 0 || usagesSelections > 0 || usagesContacts > 0) {
    throw new Error(`Suppression refusée : organisation encore utilisée (${usagesPropositions} proposition(s), ${usagesSelections} sélection(s), ${usagesContacts} contact(s)).`);
  }

  const sh = ss_().getSheetByName(SHEET_VIVIER);
  if (!sh) throw new Error("Feuille Vivier_modifs introuvable.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lastRow = sh.getLastRow();
    const lastColumn = sh.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) throw new Error("Organisation locale introuvable.");
    const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
    const iId = header.indexOf("id");
    if (iId === -1) throw new Error("Colonne id introuvable dans Vivier_modifs.");
    const ids = sh.getRange(2, iId + 1, lastRow - 1, 1).getValues().map(row => String(row[0] ?? "").trim());
    const found = ids.findIndex(existingId => existingId === id);
    if (found === -1) throw new Error("Organisation locale introuvable.");
    sh.deleteRow(found + 2);
  } finally { lock.releaseLock(); }
}

function countOrganisationUsage_(sheetName, id) {
  const sh = ss_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return 0;
  const rows = sh.getDataRange().getValues();
  const header = rows[0].map(v => String(v).trim());
  const iOrg = header.indexOf("organisation_id");
  if (iOrg === -1) return 0;
  return rows.slice(1).filter(row => String(row[iOrg] ?? "").trim() === id).length;
}


/* ═══ SECTION 10 — SYNCHRONISATION AIRTABLE / CONFLITS ════════════════ */
function ensureVivierConflictsSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_VIVIER_CONFLICTS);
  const headers = ["conflict_id", "organisation_id", "organisation_nom", "champ", "valeur_locale", "valeur_airtable", "date_import", "statut"];
  if (!sh) {
    sh = ss.insertSheet(SHEET_VIVIER_CONFLICTS);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(v => String(v).trim());
  headers.forEach(name => {
    if (!current.includes(name)) {
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(name);
      current.push(name);
    }
  });
  sh.setFrozenRows(1);
  return sh;
}

function readVivierConflicts_() {
  const sh = ensureVivierConflictsSheet_();
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getDataRange().getValues();
  const header = rows.shift().map(v => String(v).trim());
  return rows.map(row => Object.fromEntries(header.map((key, i) => [key, row[i] instanceof Date ? row[i].toISOString() : String(row[i] ?? "").trim()])))
    .filter(item => item.conflict_id && item.statut !== "resolu");
}

function replaceVivierOverridesSansLock_(overrides) {
  const sh = ss_().getSheetByName(SHEET_VIVIER);
  if (!sh) throw new Error("Feuille Vivier_modifs introuvable.");
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim());
  const existing = readVivierModifs_();
  const locals = existing.filter(item => /^loc-\d+$/.test(String(item.id || "").trim()));
  const allowed = new Set(["id", "nom", "secteur", "type", "taille", "localisation", "description", "site_web", "theme", "expertise"]);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const rows = [...locals, ...overrides.filter(item => item && !/^loc-\d+$/.test(String(item.id || "").trim()))]
    .filter(item => String(item.id || "").trim())
    .map(item => header.map(col => {
      if (col === "date_modification") return stamp;
      if (!allowed.has(col)) return "";
      if (col === "expertise") {
        const source = Array.isArray(item.expertise) ? item.expertise : String(item.expertise ?? "").split(",");
        const values = [...new Set(source.map(v => String(v).trim()).filter(Boolean))];
        return values.length ? JSON.stringify(values) : "";
      }
      return String(item[col] ?? "").trim();
    }));
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  return rows.length;
}

function replaceVivierConflictsSansLock_(conflits) {
  const sh = ensureVivierConflictsSheet_();
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim());
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const clean = conflits.filter(item => item && String(item.organisation_id || "").trim() && String(item.champ || "").trim());
  const rows = clean.map(item => {
    const conflictId = String(item.conflict_id || Utilities.getUuid()).trim();
    return header.map(col => {
      if (col === "conflict_id") return conflictId;
      if (col === "date_import") return String(item.date_import || stamp).trim();
      if (col === "statut") return "a_valider";
      return String(item[col] ?? "").trim();
    });
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  return rows.length;
}

function resolveVivierConflictSansLock_(conflictId, decision) {
  if (!conflictId) throw new Error("Conflit introuvable.");
  if (!["local", "airtable"].includes(decision)) throw new Error("Décision invalide.");
  const sh = ensureVivierConflictsSheet_();
  if (sh.getLastRow() < 2) throw new Error("Conflit introuvable.");
  const rows = sh.getDataRange().getValues();
  const header = rows[0].map(v => String(v).trim());
  const iId = header.indexOf("conflict_id"), iOrg = header.indexOf("organisation_id"), iChamp = header.indexOf("champ");
  const found = rows.slice(1).findIndex(row => String(row[iId] ?? "").trim() === conflictId);
  if (found === -1) throw new Error("Conflit introuvable.");
  const row = rows[found + 1];
  const organisationId = String(row[iOrg] ?? "").trim();
  const champ = String(row[iChamp] ?? "").trim();

  if (decision === "airtable") removeVivierOverrideFieldSansLock_(organisationId, champ);
  sh.deleteRow(found + 2);
  return { conflict_id: conflictId, decision, organisation_id: organisationId, champ };
}

function removeVivierOverrideFieldSansLock_(organisationId, champ) {
  const sh = ss_().getSheetByName(SHEET_VIVIER);
  if (!sh || sh.getLastRow() < 2) return;
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim());
  const iId = header.indexOf("id"), iField = header.indexOf(champ);
  if (iId === -1 || iField === -1) return;
  const ids = sh.getRange(2, iId + 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0] ?? "").trim());
  const found = ids.findIndex(id => id === organisationId);
  if (found === -1) return;
  const rowNumber = found + 2;
  sh.getRange(rowNumber, iField + 1).clearContent();
  const row = sh.getRange(rowNumber, 1, 1, sh.getLastColumn()).getValues()[0];
  const meaningful = header.some((col, i) => col !== "id" && col !== "date_modification" && String(row[i] ?? "").trim() !== "");
  if (!meaningful && !/^loc-\d+$/.test(organisationId)) sh.deleteRow(rowNumber);
}

/* ═══ SECTION 11 — CONTACTS PRIVÉS ═════════════════════════════════════ */
function ensureContactsSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_CONTACTS);
  const headers = ["contact_id", "organisation_id", "nom", "fonction", "email", "telephone", "role", "principal", "source", "date_modification", "secteur", "pays", "objectif", "type_organisation", "emploi"];

  if (!sh) {
    sh = ss.insertSheet(SHEET_CONTACTS);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }

  const lastColumn = Math.max(sh.getLastColumn(), 1);
  const current = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  headers.forEach(name => {
    if (!current.includes(name)) {
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(name);
      current.push(name);
    }
  });
  sh.setFrozenRows(1);
  return sh;
}

function readContacts_(organisationId) {
  const sh = ensureContactsSheet_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows[0].map(v => String(v).trim());
  const fields = ["contact_id", "organisation_id", "nom", "fonction", "email", "telephone", "role", "principal", "source", "date_modification", "secteur", "pays", "objectif", "type_organisation", "emploi"];
  const idx = Object.fromEntries(fields.map(name => [name, header.indexOf(name)]));
  if (idx.contact_id === -1 || idx.organisation_id === -1) throw new Error("Colonnes Contacts introuvables.");
  const wanted = String(organisationId || "").trim();

  return rows.slice(1)
    .filter(row => String(row[idx.contact_id] ?? "").trim())
    .filter(row => !wanted || String(row[idx.organisation_id] ?? "").trim() === wanted)
    .map(row => {
      const result = {};
      fields.forEach(name => {
        const i = idx[name];
        if (i === -1) return;
        if (name === "principal") result[name] = row[i] === true || String(row[i]).toUpperCase() === "TRUE";
        else if (row[i] instanceof Date) result[name] = Utilities.formatDate(row[i], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
        else result[name] = String(row[i] ?? "").trim();
      });
      return result;
    });
}

function writeContactSansLock_(contact) {
  if (!contact || typeof contact !== "object") throw new Error("Contact invalide.");
  const organisationId = String(contact.organisation_id || "").trim();
  const nom = String(contact.nom || "").trim();
  if (!organisationId) throw new Error("L'organisation du contact est requise.");
  if (!nom) throw new Error("Le nom du contact est requis.");

  const sh = ensureContactsSheet_();
  const lastColumn = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  const idx = Object.fromEntries(header.map((name, index) => [name, index]));
  const required = ["contact_id", "organisation_id", "nom", "principal", "date_modification"];
  if (required.some(name => idx[name] === undefined)) throw new Error("Colonnes requises introuvables dans Contacts.");

  const rows = sh.getDataRange().getValues();
  let contactId = String(contact.contact_id || "").trim();
  if (!contactId) contactId = `ctc-${Utilities.getUuid().replace(/-/g, "")}`;

  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idx.contact_id] || "").trim() === contactId) { targetRow = i + 1; break; }
  }

  const principal = contact.principal === true || String(contact.principal || "").toUpperCase() === "TRUE";
  if (principal && rows.length > 1) {
    const principalValues = rows.slice(1).map(row => [row[idx.principal]]);
    let changed = false;
    rows.slice(1).forEach((row, index) => {
      const sameOrg = String(row[idx.organisation_id] || "").trim() === organisationId;
      const sameContact = String(row[idx.contact_id] || "").trim() === contactId;
      if (sameOrg && !sameContact && (row[idx.principal] === true || String(row[idx.principal]).toUpperCase() === "TRUE")) {
        principalValues[index][0] = false;
        changed = true;
      }
    });
    if (changed) sh.getRange(2, idx.principal + 1, principalValues.length, 1).setValues(principalValues);
  }

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const values = header.map(name => {
    if (name === "contact_id") return contactId;
    if (name === "organisation_id") return organisationId;
    if (name === "nom") return nom;
    if (name === "principal") return principal;
    if (name === "date_modification") return stamp;
    if (name === "source") return String(contact.source || "Admin").trim();
    if (["fonction", "email", "telephone", "role", "secteur", "pays", "objectif", "type_organisation", "emploi"].includes(name)) return String(contact[name] || "").trim();
    return "";
  });

  if (targetRow === -1) sh.getRange(sh.getLastRow() + 1, 1, 1, lastColumn).setValues([values]);
  else sh.getRange(targetRow, 1, 1, lastColumn).setValues([values]);

  return { contact_id: contactId, organisation_id: organisationId, nom, fonction: String(contact.fonction || "").trim(), email: String(contact.email || "").trim(), telephone: String(contact.telephone || "").trim(), role: String(contact.role || "").trim(), principal, source: String(contact.source || "Admin").trim(), date_modification: stamp };
}

function deleteContactSansLock_(contactId) {
  const id = String(contactId || "").trim();
  if (!id) throw new Error("Identifiant du contact requis.");
  const sh = ensureContactsSheet_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) throw new Error("Contact introuvable.");
  const header = rows[0].map(v => String(v).trim());
  const iId = header.indexOf("contact_id");
  if (iId === -1) throw new Error("Colonne contact_id introuvable dans Contacts.");
  const found = rows.slice(1).findIndex(row => String(row[iId] || "").trim() === id);
  if (found === -1) throw new Error("Contact introuvable.");
  sh.deleteRow(found + 2);
}

function upsertContactFromFormSansLock_(partenaireId, reponses, stamp) {
  const nom = String(reponses?.contact_nom || "").trim();
  const fonction = String(reponses?.contact_poste || "").trim();
  const email = String(reponses?.contact_email || "").trim();
  const telephone = String(reponses?.contact_tel || "").trim();
  if (!nom && !fonction && !email && !telephone) return null;

  const organisationId = String(partenaireId || "").trim();
  if (!organisationId) return null;
  const contacts = readContacts_(organisationId);
  const emailKey = email.toLowerCase();
  let existing = null;

  if (emailKey) existing = contacts.find(item => String(item.email || "").trim().toLowerCase() === emailKey) || null;
  if (!existing && nom) {
    existing = contacts.find(item => String(item.nom || "").trim() === nom && String(item.source || "").trim() === "Formulaire partenaire") || null;
  }

  const hasPrincipal = contacts.some(item => item.principal && (!existing || item.contact_id !== existing.contact_id));
  return writeContactSansLock_({
    contact_id: existing?.contact_id || "",
    organisation_id: organisationId,
    nom: nom || existing?.nom || email || "Participant",
    fonction: fonction || existing?.fonction || "",
    email: email || existing?.email || "",
    telephone: telephone || existing?.telephone || "",
    role: "Participant aux rendez-vous",
    principal: existing ? (Boolean(existing.principal) || !hasPrincipal) : !hasPrincipal,
    source: existing?.source || "Formulaire partenaire",
    date_modification: stamp
  });
}

function syncContactsFromAllFormsSansLock_() {
  const sh = ensureFormulaireSchema_();
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return 0;
  const header = rows[0].map(v => String(v).trim());
  const iP = header.indexOf("partenaire_id");
  if (iP === -1) throw new Error("Colonne partenaire_id introuvable dans Formulaires.");

  let count = 0;
  rows.slice(1).forEach(row => {
    const partenaireId = String(row[iP] || "").trim();
    if (!partenaireId) return;
    const reponses = {};
    header.forEach((name, index) => { if (name) reponses[name] = row[index] ?? ""; });
    const before = readContacts_(partenaireId).length;
    const result = upsertContactFromFormSansLock_(partenaireId, reponses, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
    if (result) {
      const after = readContacts_(partenaireId).length;
      count += after >= before ? 1 : 0;
    }
  });
  return count;
}


/* ═══ SECTION 11B — SYNCHRONISATION PARTICIPANTS_IMPORT → CONTACTS ═════ */
function normalizeParticipantText_(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function participantCountryOnly_(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  const parts = text.split(" - ").map(part => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : text;
}

function participantField_(row, headerMap, names) {
  for (const name of names) {
    const index = headerMap[normalizeParticipantText_(name)];
    if (index !== undefined) return String(row[index] == null ? "" : row[index]).trim();
  }
  return "";
}

function participantIsExcluded_(participant) {
  const role = normalizeParticipantText_(participant.role_evenement);
  const groupe = normalizeParticipantText_(participant.groupe);
  const fonction = normalizeParticipantText_(participant.fonction);
  const emploi = normalizeParticipantText_(participant.emploi);

  const online = /\b(en ligne|online|virtuel|virtuelle|virtual|a distance)\b/.test(role + " " + groupe);
  const student = /\b(etudiant|etudiante|student|stagiaire|intern|doctorant|doctorante|phd)\b/.test(fonction + " " + emploi + " " + groupe);
  const unemployed = /\b(sans emploi|en recherche d emploi|chercheur d emploi|chercheuse d emploi|job seeker|unemployed)\b/.test(emploi + " " + fonction);

  return { excluded: online || student || unemployed, online, student, unemployed };
}

function participantPartnerIndex_() {
  const sh = ss_().getSheetByName(SHEET_PARTENAIRES);
  if (!sh) return [];
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows.shift().map(v => String(v).trim());
  const iId = header.indexOf("partenaire_id");
  const iNom = header.indexOf("nom");
  if (iId === -1 || iNom === -1) return [];

  return rows.map(row => ({
    id: String(row[iId] == null ? "" : row[iId]).trim(),
    nom: String(row[iNom] == null ? "" : row[iNom]).trim()
  })).filter(item => item.id && item.nom);
}

function matchParticipantPartner_(company, partners) {
  const key = normalizeParticipantText_(company);
  if (!key) return "";

  const exact = partners.find(item => normalizeParticipantText_(item.nom) === key);
  if (exact) return exact.id;

  const fuzzy = partners.filter(item => {
    const partnerKey = normalizeParticipantText_(item.nom);
    if (!partnerKey || partnerKey.length < 5 || key.length < 5) return false;
    return partnerKey.includes(key) || key.includes(partnerKey);
  });
  return fuzzy.length === 1 ? fuzzy[0].id : "";
}


function syncParticipantsImportToContacts() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return syncParticipantsImportToContactsSansLock_();
  } finally {
    lock.releaseLock();
  }
}

function syncParticipantsImportToContactsSansLock_() {
  const ss = ss_();
  const source = ss.getSheetByName(SHEET_PARTICIPANTS_IMPORT);
  if (!source) throw new Error("Feuille Participants_import introuvable.");

  const sourceRows = source.getDataRange().getValues();
  if (sourceRows.length < 2) throw new Error("Participants_import ne contient aucune donnée.");

  const sourceHeader = sourceRows[0].map(v => String(v).trim());
  const sourceMap = {};
  sourceHeader.forEach((name, index) => {
    sourceMap[normalizeParticipantText_(name)] = index;
  });

  const contactsSheet = ensureContactsSheet_();
  const contactRows = contactsSheet.getDataRange().getValues();
  const contactHeader = contactRows[0].map(v => String(v).trim());
  const contactIdx = Object.fromEntries(contactHeader.map((name, index) => [name, index]));

  const existingByEmail = new Map();
  for (let i = 1; i < contactRows.length; i++) {
    const email = String(contactRows[i][contactIdx.email] == null ? "" : contactRows[i][contactIdx.email]).trim().toLowerCase();
    if (email && !existingByEmail.has(email)) existingByEmail.set(email, { rowIndex:i, row:contactRows[i] });
  }

  const partners = participantPartnerIndex_();
  const seen = new Set();
  let added = 0;
  let updated = 0;
  let excluded = 0;
  let partnersMatched = 0;
  let skippedNoEmail = 0;

  for (let r = 1; r < sourceRows.length; r++) {
    const row = sourceRows[r];
    const email = participantField_(row, sourceMap, ["Courriel", "Email", "E-mail"]).toLowerCase();
    if (!email) { skippedNoEmail += 1; continue; }
    if (seen.has(email)) continue;
    seen.add(email);

    const nom = participantField_(row, sourceMap, ["Nom"]);
    const prenom = participantField_(row, sourceMap, ["Prénom", "Prenom"]);
    const compagnie = participantField_(row, sourceMap, ["Compagnie", "Organisation", "Entreprise"]);
    const fonction = participantField_(row, sourceMap, ["Fonction", "Poste"]);
    const roleEvenement = participantField_(row, sourceMap, ["Rôle", "Role"]);
    const groupe = participantField_(row, sourceMap, ["Groupe"]);
    const telephone = participantField_(row, sourceMap, ["Téléphone", "Telephone"]);
    const secteur = participantField_(row, sourceMap, ["Quel est votre secteur d'activité?"]);
    const pays = participantCountryOnly_(participantField_(row, sourceMap, ["Quel est votre pays de résidence?"]));
    const objectif = participantField_(row, sourceMap, ["Quel est votre objectif principal de participation à MTL connecte?"]);
    const typeOrganisation = participantField_(row, sourceMap, ["Quel est le type de votre organisation/entreprise?"]);
    const emploi = participantField_(row, sourceMap, ["Quel type d'emploi occupez-vous dans votre organisation/entreprise?"]);

    const exclusion = participantIsExcluded_({
      fonction,
      emploi,
      role_evenement:roleEvenement,
      groupe
    });
    if (exclusion.excluded) excluded += 1;

    const existing = existingByEmail.get(email);
    const existingRow = existing ? existing.row : null;
    const existingRole = existingRow ? String(existingRow[contactIdx.role] == null ? "" : existingRow[contactIdx.role]).trim() : "";
    const existingOrgId = existingRow ? String(existingRow[contactIdx.organisation_id] == null ? "" : existingRow[contactIdx.organisation_id]).trim() : "";

    let organisationId = existingOrgId;
    if (!organisationId || organisationId.indexOf("contact-only::") === 0) {
      const partnerId = matchParticipantPartner_(compagnie, partners);
      if (partnerId) {
        organisationId = partnerId;
        partnersMatched += 1;
      } else {
        organisationId = "contact-only::" + (compagnie || "Organisation inconnue");
      }
    }

    let role = existingRole || "Participant MTL connecte 2026";
    const hasActive = role.indexOf("||RDV_ACTIVE") !== -1;
    const hasHidden = role.indexOf("||RDV_HIDDEN") !== -1;
    if (!hasActive && !hasHidden && exclusion.excluded) role += " ||RDV_HIDDEN";

    const contactId = existingRow
      ? String(existingRow[contactIdx.contact_id] == null ? "" : existingRow[contactIdx.contact_id]).trim()
      : "ctc-" + Utilities.getUuid().replace(/-/g, "");

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const values = contactHeader.map(name => {
      if (name === "contact_id") return contactId;
      if (name === "organisation_id") return organisationId;
      if (name === "nom") return [prenom, nom].filter(Boolean).join(" ").trim() || email;
      if (name === "fonction") return fonction;
      if (name === "email") return email;
      if (name === "telephone") return telephone;
      if (name === "role") return role;
      if (name === "principal") return existingRow ? existingRow[contactIdx.principal] : false;
      if (name === "source") return existingRow ? existingRow[contactIdx.source] : "Participants MTL connecte 2026";
      if (name === "date_modification") return stamp;
      if (name === "secteur") return secteur;
      if (name === "pays") return pays;
      if (name === "objectif") return objectif;
      if (name === "type_organisation") return typeOrganisation;
      if (name === "emploi") return emploi;
      return existingRow && contactIdx[name] !== undefined ? existingRow[contactIdx[name]] : "";
    });

    if (existing) {
      contactRows[existing.rowIndex] = values;
      existingByEmail.set(email, { rowIndex:existing.rowIndex, row:values });
      updated += 1;
    } else {
      contactRows.push(values);
      existingByEmail.set(email, { rowIndex:contactRows.length - 1, row:values });
      added += 1;
    }
  }

  contactsSheet.clearContents();
  contactsSheet.getRange(1, 1, contactRows.length, contactHeader.length).setValues(contactRows);
  contactsSheet.setFrozenRows(1);

  return {
    ok:true,
    source_rows:sourceRows.length - 1,
    added,
    updated,
    excluded,
    partners_matched:partnersMatched,
    skipped_no_email:skippedNoEmail,
    contacts_total:contactRows.length - 1
  };
}


/* ═══ SECTION 11 — RÉFÉRENTIELS ADMINISTRABLES ═════════════════════════ */
function readReferentiels_() {
  const sh = ss_().getSheetByName(SHEET_REFERENTIELS);
  if (!sh) throw new Error("Feuille Referentiels introuvable.");
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return {};
  const header = rows.shift().map(v => String(v).trim());
  const iCategorie = header.indexOf("categorie");
  const iValeur = header.indexOf("valeur");
  if (iCategorie === -1 || iValeur === -1) throw new Error("Colonnes categorie ou valeur introuvables dans Referentiels.");

  const result = {};
  rows.forEach(row => {
    const categorie = String(row[iCategorie] ?? "").trim();
    const valeur = String(row[iValeur] ?? "").trim();
    if (!categorie || !valeur) return;
    if (!result[categorie]) result[categorie] = [];
    if (!result[categorie].includes(valeur)) result[categorie].push(valeur);
  });
  Object.keys(result).forEach(categorie => result[categorie].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })));
  return result;
}

function addReferentiel_(categorie, valeur) {
  if (!categorie) throw new Error("La catégorie du référentiel est requise.");
  if (!valeur) throw new Error("La valeur du référentiel est requise.");
  const categoriesAutorisees = new Set(["secteur", "type", "taille", "theme", "expertise", "salle"]);
  if (!categoriesAutorisees.has(categorie)) throw new Error("Catégorie de référentiel non autorisée.");
  const sh = ss_().getSheetByName(SHEET_REFERENTIELS);
  if (!sh) throw new Error("Feuille Referentiels introuvable.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rows = sh.getDataRange().getValues();
    if (!rows.length) throw new Error("La feuille Referentiels ne contient pas d'en-têtes.");
    const header = rows[0].map(v => String(v).trim());
    const iCategorie = header.indexOf("categorie");
    const iValeur = header.indexOf("valeur");
    const iDate = header.indexOf("date_modification");
    if (iCategorie === -1 || iValeur === -1 || iDate === -1) throw new Error("Colonnes categorie, valeur ou date_modification introuvables dans Referentiels.");
    const existe = rows.slice(1).some(row => String(row[iCategorie] ?? "").trim() === categorie && String(row[iValeur] ?? "").trim() === valeur);
    if (existe) return;
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const nouvelleLigne = new Array(header.length).fill("");
    nouvelleLigne[iCategorie] = categorie; nouvelleLigne[iValeur] = valeur; nouvelleLigne[iDate] = stamp;
    sh.getRange(sh.getLastRow() + 1, 1, 1, header.length).setValues([nouvelleLigne]);
  } finally { lock.releaseLock(); }
}

function deleteReferentiel_(categorie, valeur, usageCount) {
  if (!categorie) throw new Error("La catégorie du référentiel est requise.");
  if (!valeur) throw new Error("La valeur du référentiel est requise.");
  if (Number(usageCount || 0) > 0) throw new Error("Suppression refusée : cette appellation est encore utilisée.");
  const categoriesAutorisees = new Set(["secteur", "type", "taille", "theme", "expertise"]);
  if (!categoriesAutorisees.has(categorie)) throw new Error("Catégorie de référentiel non autorisée.");
  const usagesSheet = countReferentielUsageInVivierModifs_(categorie, valeur);
  if (usagesSheet > 0) throw new Error(`Suppression refusée : ${usagesSheet} organisation(s) modifiée(s) utilisent encore cette appellation.`);

  const sh = ss_().getSheetByName(SHEET_REFERENTIELS);
  if (!sh) throw new Error("Feuille Referentiels introuvable.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rows = sh.getDataRange().getValues();
    if (rows.length < 2) return;
    const header = rows[0].map(v => String(v).trim());
    const iCategorie = header.indexOf("categorie");
    const iValeur = header.indexOf("valeur");
    if (iCategorie === -1 || iValeur === -1) throw new Error("Colonnes categorie ou valeur introuvables dans Referentiels.");
    for (let i = rows.length - 1; i >= 1; i--) {
      const cat = String(rows[i][iCategorie] ?? "").trim();
      const val = String(rows[i][iValeur] ?? "").trim();
      if (cat === categorie && val === valeur) sh.deleteRow(i + 1);
    }
  } finally { lock.releaseLock(); }
}

function countReferentielUsageInVivierModifs_(categorie, valeur) {
  const sh = ss_().getSheetByName(SHEET_VIVIER);
  if (!sh || sh.getLastRow() < 2) return 0;
  const rows = sh.getDataRange().getValues();
  const header = rows[0].map(v => String(v).trim());
  const idx = header.indexOf(categorie);
  if (idx === -1) return 0;
  let count = 0;
  rows.slice(1).forEach(row => {
    const raw = String(row[idx] ?? "").trim();
    if (!raw) return;
    if (categorie === "expertise") {
      let values = [];
      try { const parsed = JSON.parse(raw); values = Array.isArray(parsed) ? parsed.map(v => String(v).trim()) : []; }
      catch (_) { values = raw.split(",").map(v => v.trim()).filter(Boolean); }
      if (values.includes(valeur)) count++;
      return;
    }
    if (raw === valeur) count++;
  });
  return count;
}

/* ═══ SECTION 12 — GÉNÉRATION / ROTATION DES JETONS ════════════════════ */
function genererTokens() {
  const sh = ss_().getSheetByName(SHEET_PARTENAIRES);
  if (!sh) throw new Error("Feuille Partenaires introuvable.");
  const lastRow = sh.getLastRow();
  if (lastRow < 2) throw new Error("Aucun partenaire à traiter.");
  const data = sh.getRange(2, 1, lastRow - 1, 3).getValues();
  const tokens = data.map(row => {
    const partenaireId = String(row[0]).trim();
    const tokenExistant = String(row[1]).trim();
    if (!partenaireId) return [""];
    if (partenaireId === "Token admin") return [tokenExistant];
    if (tokenExistant) return [tokenExistant];
    return [generateSecureToken_()];
  });
  sh.getRange(2, 2, tokens.length, 1).setValues(tokens);
}

function rotateAdminBetaToken_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = ss_().getSheetByName(SHEET_PARTENAIRES);
    if (!sh) throw new Error("Feuille Partenaires introuvable.");
    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error("Ligne Token admin introuvable.");
    const ids = sh.getRange(2, 1, lastRow - 1, 1).getValues().map(row => String(row[0]).trim());
    const index = ids.findIndex(value => value === "Token admin");
    if (index === -1) throw new Error('Ligne "Token admin" introuvable dans Partenaires.');
    const rowNumber = index + 2;
    const newToken = generateSecureToken_();
    PropertiesService.getScriptProperties().setProperty("ADMIN_TOKEN", newToken);
    sh.getRange(rowNumber, 2).setValue(newToken);
    sh.getRange(rowNumber, 4).setFormula('="https://lamiapn.github.io/conciergerie/admin-partenaire.html?p=recvQz81k0WoIDxZB&token="&B' + rowNumber + '&"#conciergerie"');
    return { ok: true, message: "ADMIN_TOKEN BETA renouvelé. Utiliser le nouveau lien de la feuille Partenaires." };
  } finally { lock.releaseLock(); }
}

function generateSecureToken_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

/* ═══ SECTION 13 — UTILITAIRES ═════════════════════════════════════════ */
function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
