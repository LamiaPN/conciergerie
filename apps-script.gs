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
   │  7 — Écriture du formulaire                                          │
   │  8 — Génération des tokens partenaires                               │
   │  9 — Utilitaires                                                     │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */

const SPREADSHEET_ID = "1XPBIFw_0AZQEQIlAxCiDXEh4eybZHT4SbihiLdLxp0c";
const SHEET_PARTENAIRES = "Partenaires";
const SHEET_SELECTIONS = "Selections";
const SHEET_FORMULAIRES = "Formulaires";
const SHEET_PROPOSITIONS = "Propositions";

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

    if (action === "admin_get") {
      requireAdminToken_(token);
      return json_({ selections: readSelections_(p) });
    }
    if (action === "admin_get_propositions") {
      requireAdminToken_(token);
      return json_({ propositions: readPropositions_(p) });
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
        writeFormulaire_(p, reponses);
      } finally {
        lock.releaseLock();
      }
      return json_({ ok: true });
    }
    if (body.action === "save_propositions") {
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
    return json_({ error: "Action inconnue." });
  } catch (err) {
    return json_({ error: err.message });
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

  const header = rows.shift();
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

    const header = rows[0];
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

/* ═══ SECTION 7 — ÉCRITURE DU FORMULAIRE ════════════════════════════════ */
function writeFormulaire_(partenaireId, reponses) {
  const sh = ss_().getSheetByName(SHEET_FORMULAIRES);
  if (!sh) throw new Error("Feuille Formulaires introuvable.");

  const lastColumn = sh.getLastColumn();
  if (!lastColumn) throw new Error("La feuille Formulaires ne contient pas d'en-têtes.");

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

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const values = header.map(nomColonne => {
    if (nomColonne === "partenaire_id") return partenaireId;
    if (nomColonne === "date_modification") return stamp;
    return Object.prototype.hasOwnProperty.call(reponses, nomColonne) ? reponses[nomColonne] : "";
  });

  sh.getRange(targetRow, 1, 1, lastColumn).setValues([values]);
}

/* ═══ SECTION 8 — GÉNÉRATION DES TOKENS PARTENAIRES ═════════════════════ */
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
    if (tokenExistant) return [tokenExistant];
    return [Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "")];
  });

  sh.getRange(2, 2, tokens.length, 1).setValues(tokens);
}

/* ═══ SECTION 9 — UTILITAIRES ═══════════════════════════════════════════ */
function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
