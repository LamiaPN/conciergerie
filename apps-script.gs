/* ════════════════════════════════════════════════════════════════════════
   FICHIER : Code.gs
   RÔLE    : Backend Google Apps Script de la conciergerie MTLC 2026.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Lecture GET                                                     │
   │  2 — Écriture POST                                                   │
   │  3 — Vérification des jetons                                         │
   │  4 — Lecture des sélections                                          │
   │  5 — Lecture / écriture des propositions                             │
   │  6 — Écriture des sélections                                         │
   │  7 — Formulaire, disponibilités et historique                        │
   │  8 — Planification des rendez-vous                                   │
   │  9 — Vivier modifiable (lecture / écriture)                          │
   │ 10 — Référentiels administrables                                     │
   │ 11 — Génération / rotation des jetons                                │
   │ 12 — Utilitaires                                                     │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */

const SPREADSHEET_ID = "1XPBIFw_0AZQEQIlAxCiDXEh4eybZHT4SbihiLdLxp0c";
const SHEET_PARTENAIRES = "Partenaires";
const SHEET_SELECTIONS = "Selections";
const SHEET_FORMULAIRES = "Formulaires";
const SHEET_FORMULAIRES_HISTORIQUE = "Formulaires_historique";
const SHEET_PROPOSITIONS = "Propositions";
const SHEET_VIVIER = "Vivier_modifs";
const SHEET_REFERENTIELS = "Referentiels";
const SHEET_RENCONTRES = "Rencontres";

/* ═══ SECTION 1 — LECTURE GET ═══════════════════════════════════════════ */
function doGet(e) {
  try {
    const action = (e.parameter.action || "").toString();
    const p = (e.parameter.p || "").toString().trim();
    const token = (e.parameter.token || "").toString().trim();

    if (action === "get") {
      requirePartnerToken_(p, token);
      return json_({ selections: readSelections_(p) });
    }
    if (action === "get_propositions") {
      requirePartnerToken_(p, token);
      return json_({ propositions: readPropositions_(p) });
    }
    if (action === "get_formulaire") {
      requirePartnerToken_(p, token);
      return json_({ formulaire: readFormulaire_(p) });
    }
    if (action === "get_formulaire_jsonp") {
      const callback = (e.parameter.callback || "").toString().trim();
      try {
        requirePartnerToken_(p, token);
        return jsonp_(callback, { formulaire: readFormulaire_(p) });
      } catch (err) {
        return jsonp_(callback, { error: err.message });
      }
    }
    if (action === "get_rencontres") {
      requirePartnerToken_(p, token);
      return json_({ rencontres: readRencontresForPartner_(p) });
    }

    if (action === "admin_get") {
      requireAdminToken_(token);
      return json_({ selections: readSelections_(p) });
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
    if (action === "get_vivier_modifs") {
      return json_({ organisations: readVivierModifs_() });
    }
    if (action === "get_referentiels") {
      return json_({ referentiels: readReferentiels_() });
    }
    if (action === "build_info") {
      return json_({
        build: "2026-08-24-beta-form-notif-v10",
        delete_referentiel: true,
        get_formulaire: true,
        admin_get_formulaire: true,
        admin_get_form_history: true,
        admin_get_form_notifications: true,
        mark_form_notifications_read: true,
        disponibilites_conciergerie: true,
        admin_get_rencontres: true,
        save_rencontres: true,
        get_rencontres: true,
        rdv_conflict_lock: true,
        admin_token_rotation_helper: true
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
      writeSelections_(p, selections);
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

    return json_({ error: "Action inconnue." });
  } catch (err) {
    if (err && err.code === "RDV_CONFLICT") {
      return json_({
        error: "Conflit de rendez-vous",
        code: "RDV_CONFLICT",
        details: String(err.details || err.message || "")
      });
    }

    return json_({
      error: err && err.message
        ? err.message
        : "Erreur serveur."
    });
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

  return rows
    .filter(row => String(row[iP]).trim() === partenaireId)
    .map(row => String(row[iO]).trim())
    .filter(Boolean);
}

/* ═══ SECTION 5 — LECTURE / ÉCRITURE DES PROPOSITIONS ═══════════════════ */
function readPropositions_(partenaireId) {
  const sh = ss_().getSheetByName(SHEET_PROPOSITIONS);
  if (!sh) throw new Error("Feuille Propositions introuvable.");

  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];

  const header = rows.shift();
  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  if (iP === -1 || iO === -1) throw new Error("Colonnes partenaire_id ou organisation_id introuvables.");

  return rows
    .filter(row => String(row[iP]).trim() === partenaireId)
    .map(row => String(row[iO]).trim())
    .filter(Boolean);
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

  for (let r = rows.length - 1; r >= 1; r--) {
    if (String(rows[r][iP]).trim() === partenaireId) sh.deleteRow(r + 1);
  }

  const ids = [...new Set(orgIds.map(id => String(id).trim()).filter(Boolean))];
  if (!ids.length) return;

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const nouvellesLignes = ids.map(id => {
    const row = new Array(header.length).fill("");
    row[iP] = partenaireId;
    row[iO] = id;
    row[iD] = stamp;
    return row;
  });

  sh.getRange(sh.getLastRow() + 1, 1, nouvellesLignes.length, header.length).setValues(nouvellesLignes);
}
/* ═══ SECTION 6 — ÉCRITURE DES SÉLECTIONS ═══════════════════════════════ */
function writeSelections_(partenaireId, orgIds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = ss_().getSheetByName(SHEET_SELECTIONS);
    if (!sh) throw new Error("Feuille Selections introuvable.");
    const rows = sh.getDataRange().getValues();
    if (!rows.length) throw new Error("La feuille Selections ne contient pas d'en-têtes.");

    const header = rows[0].map(v => String(v).trim());
    const iP = header.indexOf("partenaire_id");
    if (iP === -1) throw new Error("Colonne partenaire_id introuvable.");

    for (let r = rows.length - 1; r >= 1; r--) {
      if (String(rows[r][iP]).trim() === partenaireId) sh.deleteRow(r + 1);
    }

    const ids = [...new Set(orgIds.map(id => String(id).trim()).filter(Boolean))];
    if (!ids.length) return;

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const nouvellesLignes = ids.map(id => [partenaireId, id, stamp]);
    sh.getRange(sh.getLastRow() + 1, 1, nouvellesLignes.length, 3).setValues(nouvellesLignes);
  } finally {
    lock.releaseLock();
  }
}

/* ═══ SECTION 7 — FORMULAIRE, DISPONIBILITÉS ET HISTORIQUE ═════════════ */
function ensureFormulaireSchema_() {
  const sh = ss_().getSheetByName(SHEET_FORMULAIRES);
  if (!sh) throw new Error("Feuille Formulaires introuvable.");

  const lastColumn = sh.getLastColumn();
  if (!lastColumn) throw new Error("La feuille Formulaires ne contient pas d'en-têtes.");

  const header = sh.getRange(1, 1, 1, lastColumn).getValues()[0].map(v => String(v).trim());
  if (!header.includes("disponibilites_conciergerie")) {
    sh.getRange(1, lastColumn + 1).setValue("disponibilites_conciergerie");
  }

  return sh;
}

function ensureFormHistorySheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_FORMULAIRES_HISTORIQUE);

  if (!sh) {
    sh = ss.insertSheet(SHEET_FORMULAIRES_HISTORIQUE);
    sh.getRange(1, 1, 1, 5).setValues([[
      "partenaire_id",
      "date_modification",
      "type_evenement",
      "changements_json",
      "lu_admin"
    ]]);
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
    formulaire[cle] = valeur instanceof Date
      ? Utilities.formatDate(valeur, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
      : valeur ?? "";
  });

  return formulaire;
}

function normaliseFormValue_(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item ?? "").trim()).filter(Boolean).join(", ");
  }
  return String(value ?? "").trim();
}

function compareFormulaires_(ancien, reponses, header) {
  const changements = {};
  const ignore = new Set(["partenaire_id", "date_modification"]);

  header.forEach(cle => {
    if (!cle || ignore.has(cle)) return;

    const avant = normaliseFormValue_(ancien ? ancien[cle] : "");
    const apres = normaliseFormValue_(
      Object.prototype.hasOwnProperty.call(reponses, cle) ? reponses[cle] : ""
    );

    if (avant !== apres) {
      changements[cle] = { avant, apres };
    }
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
    return {
      changed: false,
      type_evenement: "inchangé",
      date_modification: ancien?.date_modification || ""
    };
  }

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  writeFormulaire_(partenaireId, reponses, stamp);

  appendFormHistory_(
    partenaireId,
    stamp,
    premierEnvoi ? "creation" : "modification",
    premierEnvoi ? {} : changements
  );

  return {
    changed: true,
    type_evenement: premierEnvoi ? "creation" : "modification",
    date_modification: stamp,
    changements: premierEnvoi ? {} : changements
  };
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
    return Object.prototype.hasOwnProperty.call(reponses, nomColonne)
      ? normaliseFormValue_(reponses[nomColonne])
      : "";
  });

  sh.getRange(targetRow, 1, 1, lastColumn).setValues([values]);
}

function appendFormHistory_(partenaireId, stamp, typeEvenement, changements) {
  const sh = ensureFormHistorySheet_();
  sh.appendRow([
    partenaireId,
    stamp,
    typeEvenement,
    JSON.stringify(changements || {}),
    false
  ]);
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

  if ([iP, iD, iT, iC, iL].some(index => index === -1)) {
    throw new Error("Colonnes Formulaires_historique introuvables.");
  }

  return rows
    .slice(1)
    .map((row, index) => ({ row, index }))
    .filter(item => String(item.row[iP] ?? "").trim() === partenaireId)
    .reverse()
    .slice(0, 20)
    .map(item => {
      let changements = {};
      try {
        changements = JSON.parse(String(item.row[iC] || "{}"));
      } catch (_) {}

      return {
        date_modification: item.row[iD] instanceof Date
          ? Utilities.formatDate(item.row[iD], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
          : String(item.row[iD] ?? "").trim(),
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

  if ([iP, iD, iT, iL].some(index => index === -1)) {
    throw new Error("Colonnes Formulaires_historique introuvables.");
  }

  const parPartenaire = new Map();

  rows.slice(1).forEach(row => {
    const lu = row[iL] === true || String(row[iL]).toUpperCase() === "TRUE";
    if (lu) return;

    const partenaireId = String(row[iP] ?? "").trim();
    if (!partenaireId) return;

    const date = row[iD] instanceof Date
      ? Utilities.formatDate(row[iD], Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
      : String(row[iD] ?? "").trim();

    const precedent = parPartenaire.get(partenaireId);
    parPartenaire.set(partenaireId, {
      partenaire_id: partenaireId,
      date_modification: date,
      type_evenement: String(row[iT] ?? "").trim(),
      non_lus: (precedent?.non_lus || 0) + 1
    });
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

  if (iP === -1 || iL === -1) {
    throw new Error("Colonnes partenaire_id ou lu_admin introuvables dans Formulaires_historique.");
  }

  const values = rows.slice(1).map(row => [row[iL]]);
  let count = 0;

  rows.slice(1).forEach((row, index) => {
    const id = String(row[iP] ?? "").trim();
    const lu = row[iL] === true || String(row[iL]).toUpperCase() === "TRUE";

    if (id === partenaireId && !lu) {
      values[index][0] = true;
      count += 1;
    }
  });

  if (count) {
    sh.getRange(2, iL + 1, values.length, 1).setValues(values);
  }

  return count;
}


/* ═══ SECTION 8 — PLANIFICATION DES RENDEZ-VOUS ═════════════════════════ */
function readRencontres_() {
  const sh = ss_().getSheetByName(SHEET_RENCONTRES);
  if (!sh) return [];

  ensureRencontresHeaders_(sh);

  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];

  const header = rows.shift().map(v => String(v).trim());
  const required = [
    "partenaire_id",
    "organisation_id",
    "date",
    "heure",
    "salle",
    "email_rdv",
    "date_modification"
  ];

  const indexes = Object.fromEntries(
    required.map(name => [name, header.indexOf(name)])
  );

  if (indexes.partenaire_id === -1 || indexes.organisation_id === -1) {
    throw new Error(
      "Colonnes partenaire_id ou organisation_id introuvables dans Rencontres."
    );
  }

  return rows
    .filter(row =>
      String(row[indexes.partenaire_id] ?? "").trim() &&
      String(row[indexes.organisation_id] ?? "").trim()
    )
    .map(row => ({
      partenaire_id: String(row[indexes.partenaire_id] ?? "").trim(),
      organisation_id: String(row[indexes.organisation_id] ?? "").trim(),
      date: formatSheetDate_(row[indexes.date], "yyyy-MM-dd"),
      heure: formatSheetTime_(row[indexes.heure]),
      salle: String(row[indexes.salle] ?? "").trim(),
      email_rdv: String(row[indexes.email_rdv] ?? "").trim(),
      date_modification: formatSheetDate_(
        row[indexes.date_modification],
        "yyyy-MM-dd HH:mm"
      )
    }));
}


function readRencontresForPartner_(partenaireId) {
  return readRencontres_()
    .filter(item =>
      String(item.partenaire_id || "").trim() === partenaireId &&
      String(item.date || "").trim() &&
      String(item.heure || "").trim() &&
      String(item.salle || "").trim()
    )
    .map(item => ({
      organisation_id: String(item.organisation_id || "").trim(),
      date: String(item.date || "").trim(),
      heure: String(item.heure || "").trim(),
      salle: String(item.salle || "").trim()
    }));
}

function writeRencontres_(rencontres) {
  /*
   * IMPORTANT MULTI-ADMIN :
   * Cette fonction est appelée depuis doPost(save_rencontres) APRÈS
   * acquisition du ScriptLock. Le verrou couvre donc :
   * lecture existante -> état final -> contrôle -> écriture.
   *
   * Ne pas déplacer le lock après cette fonction.
   */
  const sh = ensureRencontresSheet_();
  ensureRencontresHeaders_(sh);

  const lastColumn = sh.getLastColumn();
  const header = sh
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(v => String(v).trim());

  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  const iDate = header.indexOf("date");
  const iHeure = header.indexOf("heure");
  const iSalle = header.indexOf("salle");
  const iEmail = header.indexOf("email_rdv");
  const iModif = header.indexOf("date_modification");

  if ([iP, iO, iDate, iHeure, iSalle, iEmail, iModif].some(i => i === -1)) {
    throw new Error("Colonnes requises introuvables dans Rencontres.");
  }

  const lastRow = sh.getLastRow();
  const existingRows = lastRow >= 2
    ? sh.getRange(2, 1, lastRow - 1, lastColumn).getValues()
    : [];

  const rowByKey = new Map();

  const existingRecords = existingRows
    .map((row, index) => {
      const record = normalizeRencontre_({
        partenaire_id: row[iP],
        organisation_id: row[iO],
        date: row[iDate],
        heure: row[iHeure],
        salle: row[iSalle],
        email_rdv: row[iEmail]
      });

      if (record.partenaire_id && record.organisation_id) {
        rowByKey.set(record.key, index + 2);
        return record;
      }

      return null;
    })
    .filter(Boolean);

  const incomingRecords = (Array.isArray(rencontres) ? rencontres : [])
    .map(normalizeRencontre_);

  validateIncomingRencontres_(incomingRecords);

  /*
   * On construit d'abord l'état FINAL théorique de Rencontres.
   * Aucune écriture n'a encore eu lieu.
   *
   * Cela évite notamment le faux conflit suivant :
   * - RDV A quitte 14:00 pour 14:30
   * - RDV B entre à 14:00 dans le même lot
   * Le contrôle voit bien A à 14:30, pas son ancienne valeur.
   */
  const finalByKey = buildFinalRencontresMap_(
    existingRecords,
    incomingRecords
  );

  /*
   * REJET GLOBAL :
   * si un seul conflit existe, cette fonction throw AVANT la première
   * écriture dans les lignes de Rencontres.
   */
  checkRencontresConflicts_(
    incomingRecords,
    finalByKey
  );

  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm"
  );

  const toDelete = [];

  incomingRecords.forEach(record => {
    const existingRow = rowByKey.get(record.key);

    // Tout vide = suppression de la ligne existante.
    // Un email seul reste conservé comme préparation non planifiée.
    if (isEmptyRencontre_(record)) {
      if (existingRow) toDelete.push(existingRow);
      return;
    }

    const row = new Array(lastColumn).fill("");

    row[iP] = record.partenaire_id;
    row[iO] = record.organisation_id;
    row[iDate] = record.date;
    row[iHeure] = record.heure;
    row[iSalle] = record.salle;
    row[iEmail] = record.email_rdv;
    row[iModif] = stamp;

    if (existingRow) {
      sh.getRange(
        existingRow,
        1,
        1,
        lastColumn
      ).setValues([row]);
    } else {
      sh.appendRow(row);
      rowByKey.set(
        record.key,
        sh.getLastRow()
      );
    }
  });

  [...new Set(toDelete)]
    .sort((a, b) => b - a)
    .forEach(rowNumber => sh.deleteRow(rowNumber));
}


/* ═══ SÉCURITÉ RDV — NORMALISATION + CONFLITS ══════════════════════════ */

function normalizeRencontre_(item) {
  const partenaireId =
    String(item?.partenaire_id ?? "").trim();

  const organisationId =
    String(item?.organisation_id ?? "").trim();

  return {
    partenaire_id: partenaireId,
    organisation_id: organisationId,
    key: `${partenaireId}::${organisationId}`,
    date: formatSheetDate_(
      item?.date,
      "yyyy-MM-dd"
    ),
    heure: formatSheetTime_(
      item?.heure
    ),
    salle: String(
      item?.salle ?? ""
    ).trim(),
    email_rdv: String(
      item?.email_rdv ?? ""
    ).trim()
  };
}


function validateIncomingRencontres_(records) {
  const keys = new Set();

  records.forEach(record => {
    if (
      !record.partenaire_id
      || !record.organisation_id
    ) {
      throw new Error(
        "Chaque rendez-vous doit contenir partenaire_id et organisation_id."
      );
    }

    if (keys.has(record.key)) {
      throw new Error(
        `Lot de rendez-vous invalide : la rencontre ${record.key} est présente plusieurs fois.`
      );
    }

    keys.add(record.key);
  });
}


function isEmptyRencontre_(record) {
  return !record.date
    && !record.heure
    && !record.salle
    && !record.email_rdv;
}


function isPlannedRencontre_(record) {
  return Boolean(
    record?.date
    && record?.heure
    && record?.salle
  );
}


function buildFinalRencontresMap_(
  existingRecords,
  incomingRecords
) {
  const finalByKey = new Map();

  (existingRecords || []).forEach(record => {
    finalByKey.set(
      record.key,
      { ...record }
    );
  });

  (incomingRecords || []).forEach(record => {
    if (isEmptyRencontre_(record)) {
      finalByKey.delete(record.key);
    } else {
      finalByKey.set(
        record.key,
        { ...record }
      );
    }
  });

  return finalByKey;
}


function checkRencontresConflicts_(
  incomingRecords,
  finalByKey
) {
  /*
   * On ne bloque pas un save à cause d'un ancien conflit qui ne concerne
   * aucune rencontre entrante. On contrôle chaque clé entrante dans
   * l'état FINAL, contre toutes les AUTRES clés.
   *
   * L'exclusion otherKey === current.key est le point critique :
   * une rencontre ne peut jamais être en conflit avec elle-même.
   */
  (incomingRecords || []).forEach(incoming => {
    const current =
      finalByKey.get(incoming.key);

    if (
      !current
      || !isPlannedRencontre_(current)
    ) {
      return;
    }

    for (
      const [otherKey, other]
      of finalByKey.entries()
    ) {
      if (otherKey === current.key) {
        continue;
      }

      if (!isPlannedRencontre_(other)) {
        continue;
      }

      if (
        current.date !== other.date
        || current.heure !== other.heure
      ) {
        continue;
      }

      if (current.salle === other.salle) {
        throwRencontreConflict_(
          "salle",
          current,
          other
        );
      }

      if (
        current.partenaire_id
        === other.partenaire_id
      ) {
        throwRencontreConflict_(
          "partenaire",
          current,
          other
        );
      }

      if (
        current.organisation_id
        === other.organisation_id
      ) {
        throwRencontreConflict_(
          "organisation",
          current,
          other
        );
      }
    }
  });
}


function throwRencontreConflict_(
  type,
  current,
  other
) {
  let details = "";

  if (type === "salle") {
    details =
      `${current.salle} déjà occupée le ${current.date} à ${current.heure}.`;
  } else if (type === "partenaire") {
    details =
      `Le partenaire ${current.partenaire_id} a déjà un rendez-vous le ${current.date} à ${current.heure}.`;
  } else if (type === "organisation") {
    details =
      `L'organisation ${current.organisation_id} a déjà un rendez-vous le ${current.date} à ${current.heure}.`;
  } else {
    details =
      `Conflit détecté le ${current.date} à ${current.heure}.`;
  }

  const err =
    new Error("Conflit de rendez-vous");

  err.code = "RDV_CONFLICT";
  err.details = details;
  err.conflict_type = type;
  err.current_key = current.key;
  err.other_key = other?.key || "";

  throw err;
}


function ensureRencontresSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET_RENCONTRES);

  if (!sh) {
    sh = ss.insertSheet(SHEET_RENCONTRES);
    sh.getRange(1, 1, 1, 7).setValues([[
      "partenaire_id",
      "organisation_id",
      "date",
      "heure",
      "salle",
      "email_rdv",
      "date_modification"
    ]]);
    sh.setFrozenRows(1);
  }

  return sh;
}

function ensureRencontresHeaders_(sh) {
  const required = [
    "partenaire_id",
    "organisation_id",
    "date",
    "heure",
    "salle",
    "email_rdv",
    "date_modification"
  ];

  const lastColumn = Math.max(sh.getLastColumn(), 1);
  const current = sh
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(v => String(v).trim());

  required.forEach(name => {
    if (!current.includes(name)) {
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col).setValue(name);
      current.push(name);
    }
  });

  sh.setFrozenRows(1);
}

function formatSheetDate_(value, pattern) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      pattern
    );
  }

  return String(value ?? "").trim();
}

function formatSheetTime_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "HH:mm"
    );
  }

  const text = String(value ?? "").trim();
  if (!text) return "";

  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}


/* ═══ SECTION 9 — VIVIER MODIFIABLE ═════════════════════════════════════ */
function readVivierModifs_() {
  const sh = ss_().getSheetByName(SHEET_VIVIER);
  if (!sh) throw new Error("Feuille Vivier_modifs introuvable.");

  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];

  const header = rows.shift().map(v => String(v).trim());
  const champs = ["id", "nom", "secteur", "type", "taille", "localisation", "description", "site_web", "theme", "expertise", "date_modification"];
  const indexes = Object.fromEntries(champs.map(champ => [champ, header.indexOf(champ)]));
  if (indexes.id === -1) throw new Error("Colonne id introuvable dans Vivier_modifs.");

  return rows
    .filter(row => String(row[indexes.id] ?? "").trim())
    .map(row => {
      const org = {};
      champs.forEach(champ => {
        const i = indexes[champ];
        if (i !== -1) {
          const raw = row[i] instanceof Date ? row[i].toISOString() : String(row[i] ?? "").trim();
          if (champ === "expertise") {
            if (!raw) org[champ] = [];
            else {
              try {
                const parsed = JSON.parse(raw);
                org[champ] = Array.isArray(parsed) ? parsed.map(v => String(v).trim()).filter(Boolean) : raw.split(",").map(v => v.trim()).filter(Boolean);
              } catch (_) {
                org[champ] = raw.split(",").map(v => v.trim()).filter(Boolean);
              }
            }
          } else {
            org[champ] = raw;
          }
        }
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
      ids.forEach(existingId => {
        const match = /^loc-(\d+)$/.exec(existingId);
        if (match) maxLocal = Math.max(maxLocal, Number(match[1]));
      });
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
        const source = Array.isArray(organisation.expertise)
          ? organisation.expertise
          : String(organisation.expertise ?? "").split(",");
        const valeurs = [...new Set(source.map(v => String(v).trim()).filter(Boolean))];
        return valeurs.length ? JSON.stringify(valeurs) : "";
      }
      return String(organisation[colonne] ?? "").trim();
    });

    sh.getRange(targetRow, 1, 1, lastColumn).setValues([values]);
    return id;
  } finally {
    lock.releaseLock();
  }
}



function deleteOrganisation_(id) {
  if (!id) throw new Error("Identifiant organisation requis.");
  if (!/^loc-\d+$/.test(id)) {
    throw new Error("Suppression directe réservée aux organisations locales créées dans l’admin.");
  }

  const usagesPropositions = countOrganisationUsage_(SHEET_PROPOSITIONS, id);
  const usagesSelections = countOrganisationUsage_(SHEET_SELECTIONS, id);
  if (usagesPropositions > 0 || usagesSelections > 0) {
    throw new Error(`Suppression refusée : organisation encore utilisée (${usagesPropositions} proposition(s), ${usagesSelections} sélection(s)).`);
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
  } finally {
    lock.releaseLock();
  }
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

/* ═══ SECTION 10 — RÉFÉRENTIELS ADMINISTRABLES ═══════════════════════════ */
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

  Object.keys(result).forEach(categorie => {
    result[categorie].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  });
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
    if (iCategorie === -1 || iValeur === -1 || iDate === -1) {
      throw new Error("Colonnes categorie, valeur ou date_modification introuvables dans Referentiels.");
    }

    const existe = rows.slice(1).some(row =>
      String(row[iCategorie] ?? "").trim() === categorie &&
      String(row[iValeur] ?? "").trim() === valeur
    );
    if (existe) return;

    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const nouvelleLigne = new Array(header.length).fill("");
    nouvelleLigne[iCategorie] = categorie;
    nouvelleLigne[iValeur] = valeur;
    nouvelleLigne[iDate] = stamp;
    sh.getRange(sh.getLastRow() + 1, 1, 1, header.length).setValues([nouvelleLigne]);
  } finally {
    lock.releaseLock();
  }
}


function deleteReferentiel_(categorie, valeur, usageCount) {
  if (!categorie) throw new Error("La catégorie du référentiel est requise.");
  if (!valeur) throw new Error("La valeur du référentiel est requise.");
  if (Number(usageCount || 0) > 0) {
    throw new Error("Suppression refusée : cette appellation est encore utilisée.");
  }

  const categoriesAutorisees = new Set(["secteur", "type", "taille", "theme", "expertise"]);
  if (!categoriesAutorisees.has(categorie)) throw new Error("Catégorie de référentiel non autorisée.");

  // Vérification serveur supplémentaire sur les modifications persistées.
  // Le front vérifie le vivier fusionné complet (data.json + Vivier_modifs).
  const usagesSheet = countReferentielUsageInVivierModifs_(categorie, valeur);
  if (usagesSheet > 0) {
    throw new Error(`Suppression refusée : ${usagesSheet} organisation(s) modifiée(s) utilisent encore cette appellation.`);
  }

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
    if (iCategorie === -1 || iValeur === -1) {
      throw new Error("Colonnes categorie ou valeur introuvables dans Referentiels.");
    }

    for (let i = rows.length - 1; i >= 1; i--) {
      const cat = String(rows[i][iCategorie] ?? "").trim();
      const val = String(rows[i][iValeur] ?? "").trim();
      if (cat === categorie && val === valeur) sh.deleteRow(i + 1);
    }
  } finally {
    lock.releaseLock();
  }
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
      try {
        const parsed = JSON.parse(raw);
        values = Array.isArray(parsed) ? parsed.map(v => String(v).trim()) : [];
      } catch (_) {
        values = raw.split(",").map(v => v.trim()).filter(Boolean);
      }
      if (values.includes(valeur)) count++;
      return;
    }

    if (raw === valeur) count++;
  });

  return count;
}

/* ═══ SECTION 11 — GÉNÉRATION / ROTATION DES JETONS ═════════════════════ */

/**
 * Complète uniquement les jetons partenaires manquants.
 * La ligne "Token admin" est explicitement exclue.
 */
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


/**
 * À exécuter MANUELLEMENT depuis l'éditeur Apps Script avant diffusion BETA.
 *
 * Cette fonction :
 * 1. génère un nouveau ADMIN_TOKEN ;
 * 2. remplace la Script Property ADMIN_TOKEN ;
 * 3. remplace le token de la ligne "Token admin" dans Partenaires ;
 * 4. régénère le lien admin GitHub en colonne D ;
 * 5. ne logge et ne retourne JAMAIS le token.
 *
 * IMPORTANT :
 * - ne pas appeler cette fonction depuis doGet/doPost ;
 * - ne pas ajouter le token en dur dans le code ;
 * - après rotation, l'ancien lien admin cesse immédiatement d'être valide.
 */
function rotateAdminBetaToken_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sh = ss_().getSheetByName(SHEET_PARTENAIRES);
    if (!sh) throw new Error("Feuille Partenaires introuvable.");

    const lastRow = sh.getLastRow();
    if (lastRow < 2) throw new Error("Ligne Token admin introuvable.");

    const ids = sh
      .getRange(2, 1, lastRow - 1, 1)
      .getValues()
      .map(row => String(row[0]).trim());

    const index = ids.findIndex(value => value === "Token admin");

    if (index === -1) {
      throw new Error('Ligne "Token admin" introuvable dans Partenaires.');
    }

    const rowNumber = index + 2;
    const newToken = generateSecureToken_();

    // Source d'autorité backend.
    PropertiesService
      .getScriptProperties()
      .setProperty("ADMIN_TOKEN", newToken);

    // Copie opérationnelle réservée aux administrateurs autorisés du Sheet.
    sh.getRange(rowNumber, 2).setValue(newToken);

    // Lien BETA admin. La formule référence la cellule B de la même ligne,
    // donc aucune valeur secrète n'est écrite en dur dans le code.
    sh.getRange(rowNumber, 4).setFormula(
      '="https://lamiapn.github.io/conciergerie/admin-partenaire.html?p=recvQz81k0WoIDxZB&token="&B'
      + rowNumber
      + '&"#conciergerie"'
    );

    return {
      ok: true,
      message: "ADMIN_TOKEN BETA renouvelé. Utiliser le nouveau lien de la feuille Partenaires."
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * Génération de 64 caractères hexadécimaux environ à partir de deux UUID.
 * Utilisé pour les jetons partenaires et le jeton admin.
 */
function generateSecureToken_() {
  return Utilities.getUuid().replace(/-/g, "")
    + Utilities.getUuid().replace(/-/g, "");
}

/* ═══ SECTION 12 — UTILITAIRES ══════════════════════════════════════════ */
function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(callback, obj) {
  const cb = String(callback || "").trim();
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(cb)) {
    return ContentService
      .createTextOutput('throw new Error("Callback JSONP invalide.");')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(`${cb}(${JSON.stringify(obj)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
