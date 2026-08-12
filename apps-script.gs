/* ============================================================
   apps-script.gs — Backend du Google Sheet (à coller dans Extensions › Apps Script)
   Stocke les sélections des partenaires. Vérifie le jeton à chaque appel.

   ─ Mise en place ────────────────────────────────────────────
   1. Crée un Google Sheet avec DEUX feuilles :

      Feuille "Partenaires"  (colonnes en ligne 1) :
        partenaire_id | token | nom
        desjardins    | 9f3a… | Desjardins Caisse des Technologies
        um6p          | 2b7c… | UM6P

      Feuille "Selections" (colonnes en ligne 1) :
        partenaire_id | organisation_id | date_modification

   2. Mets un jeton admin dans les Propriétés du script :
        Projet › Paramètres du projet › Propriétés du script
        Clé : ADMIN_TOKEN   Valeur : <un long jeton aléatoire>

   3. Déploie : Déployer › Nouveau déploiement › Application Web
        Exécuter en tant que : Moi
        Accès : Tout le monde
      Copie l'URL /exec → colle-la dans js/config.js (SHEET_API_URL).
   ============================================================ */

const SHEET_PARTENAIRES = "Partenaires";
const SHEET_SELECTIONS  = "Selections";

/* ---- Lecture (GET) ---- */
function doGet(e) {
  try {
    const action = (e.parameter.action || "").toString();
    const p = (e.parameter.p || "").toString();
    const token = (e.parameter.token || "").toString();

    if (action === "get") {
      requirePartnerToken_(p, token);
      return json_({ selections: readSelections_(p) });
    }
    if (action === "admin_get") {
      requireAdminToken_(token);
      return json_({ selections: readSelections_(p) });
    }
    return json_({ error: "Action inconnue." });
  } catch (err) {
    return json_({ error: err.message });
  }
}

/* ---- Écriture (POST) ---- */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const p = (body.p || "").toString();
    const token = (body.token || "").toString();

    if (body.action === "save") {
      requirePartnerToken_(p, token);
      writeSelections_(p, Array.isArray(body.selections) ? body.selections : []);
      return json_({ ok: true, count: body.selections.length });
    }
    return json_({ error: "Action inconnue." });
  } catch (err) {
    return json_({ error: err.message });
  }
}

/* ---- Vérification des jetons ---- */
function requirePartnerToken_(partenaireId, token) {
  if (!partenaireId || !token) throw new Error("Lien invalide : identifiant ou jeton manquant.");
  const sh = ss_().getSheetByName(SHEET_PARTENAIRES);
  const rows = sh.getDataRange().getValues();
  const header = rows.shift();
  const iId = header.indexOf("partenaire_id");
  const iTok = header.indexOf("token");
  const match = rows.find(r => String(r[iId]).trim() === partenaireId);
  if (!match) throw new Error("Partenaire inconnu.");
  if (String(match[iTok]).trim() !== token) throw new Error("Jeton invalide.");
}

function requireAdminToken_(token) {
  const admin = PropertiesService.getScriptProperties().getProperty("ADMIN_TOKEN");
  if (!admin) throw new Error("ADMIN_TOKEN non configuré.");
  if (token !== admin) throw new Error("Accès administrateur refusé.");
}

/* ---- Lecture / écriture des sélections ---- */
function readSelections_(partenaireId) {
  const sh = ss_().getSheetByName(SHEET_SELECTIONS);
  const rows = sh.getDataRange().getValues();
  const header = rows.shift();
  const iP = header.indexOf("partenaire_id");
  const iO = header.indexOf("organisation_id");
  return rows.filter(r => String(r[iP]).trim() === partenaireId)
             .map(r => String(r[iO]).trim())
             .filter(Boolean);
}

// Remplace intégralement la sélection du partenaire (supprime ses lignes, réécrit).
function writeSelections_(partenaireId, orgIds) {
  const sh = ss_().getSheetByName(SHEET_SELECTIONS);
  const rows = sh.getDataRange().getValues();
  const header = rows[0];
  const iP = header.indexOf("partenaire_id");

  // Supprime de bas en haut les lignes de ce partenaire.
  for (let r = rows.length - 1; r >= 1; r--) {
    if (String(rows[r][iP]).trim() === partenaireId) sh.deleteRow(r + 1);
  }
  // Ajoute les nouvelles.
  const now = new Date();
  const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  orgIds.forEach(id => sh.appendRow([partenaireId, id, stamp]));
}

/* ---- Utilitaires ---- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
