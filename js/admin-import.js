/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-import.js
   RÔLE    : Convertisseur "Importer le vivier". Lit l'export CSV Airtable,
             génère un data.json (89 orgs, 18 partenaires, propositions vides)
             et le propose au téléchargement. AUCUNE écriture serveur (statique).

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Ouverture / fermeture de la modale                               │
   │  2 — Réception du fichier (clic + glisser-déposer)                    │
   │  3 — Parseur CSV (gère les virgules dans les champs entre guillemets) │
   │  4 — Transformation CSV → structure data.json                        │
   │  5 — Nettoyage des valeurs                                            │
   │  6 — Rapport + téléchargement                                         │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  let generated = null; // le data.json prêt, en attente de téléchargement

  const $ = s => document.querySelector(s);

  /* ═══ SECTION 1 — OUVERTURE / FERMETURE DE LA MODALE ════════════════════ */
  const modal = $("#importModal");
  function open() { modal.hidden = false; }
  function close() {
    modal.hidden = true;
    resetUI();
  }
  function resetUI() {
    generated = null;
    $("#importReport").hidden = true;
    $("#importReport").innerHTML = "";
    $("#importDownload").disabled = true;
    $("#importDropText").textContent = "Cliquez ou glissez votre fichier CSV ici";
    $("#importFile").value = "";
  }
  $("#btnImporter").addEventListener("click", open);
  $("#importClose").addEventListener("click", close);
  $("#importCancel").addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  /* ═══ SECTION 2 — RÉCEPTION DU FICHIER (clic + glisser-déposer) ═════════ */
  const drop = $("#importDrop");
  const fileInput = $("#importFile");

  fileInput.addEventListener("change", e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
  ["dragover", "dragenter"].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  function handleFile(file) {
    if (!/\.csv$/i.test(file.name)) { report("⚠️ Merci de déposer un fichier .csv", true); return; }
    $("#importDropText").textContent = file.name;
    const reader = new FileReader();
    reader.onload = async () => {
  try {
    const rows = parseCSV(reader.result);
    const data = buildData(rows);

    const currentRes = await fetch(CONFIG.DATA_URL, { cache: "no-store" });
    if (!currentRes.ok) throw new Error("Impossible de lire le data.json actuel.");

    const currentData = await currentRes.json();
    data.propositions = Array.isArray(currentData.propositions) ? currentData.propositions : [];

    generated = data;
        report(
          `✅ <b>${data.organisations.length}</b> organisations · ` +
          `<b>${data.partenaires.length}</b> partenaires conciergerie · ` +
          `<b>${data.propositions.length}</b> propositions.<br>` +
          `<span class="import-muted">Cliquez « Télécharger data.json », puis déposez le fichier dans le dossier <code>js/</code>.</span>`,
          false
        );
        $("#importDownload").disabled = false;
      } catch (err) {
        report("❌ " + (err.message || "Fichier illisible."), true);
        $("#importDownload").disabled = true;
      }
    };
    reader.readAsText(file, "utf-8");
  }

  /* ═══ SECTION 3 — PARSEUR CSV ═══════════════════════════════════════════
     Gère les virgules et retours à la ligne à l'intérieur des champs
     entre guillemets (indispensable pour un export Airtable). */
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, ""); // retire le BOM éventuel
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], next = text[i + 1];
      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\r") { /* ignore */ }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    // → tableau d'objets basé sur la ligne d'en-têtes
    const header = rows.shift().map(h => h.trim());
    return rows
      .filter(r => r.some(c => c.trim() !== ""))
      .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || "").trim()])));
  }

  /* ═══ SECTION 4 — TRANSFORMATION CSV → data.json ════════════════════════
     Règles validées : id = Conciergerie_ID ; partenaire = "Nombre contact
     conciergerie" non vide (quota = ce nombre) ; propositions vides. */
  function buildData(rows) {
  const COL = {
    nom: "Nom de l'organisation / Délégation / F",
    nb: "Nombre contact conciergerie",
    site: "Site web de l'organisation /F",
    secteur: "Secteur d'activité /F",
    type: "Type d'organisation /F",
    pays: "Pays /F",
    taille: "Taille de l'organisation",
    ville: "Ville",
    statut: "Statut_Conciergerie",
    cid: "Conciergerie _ID",

    contactNom: "Contact principal",
    contactPoste: "Fonction (from Contact principal)",
    contactTel: "Téléphone (from Contact principal)",
    contactEmail: "Courriel (from Contact principal)"
  };

  if (!rows.length || !(COL.cid in rows[0])) {
    throw new Error("Colonne « Conciergerie _ID » introuvable — vérifiez l'export.");
  }

  // Recherche automatiquement la colonne Description ajoutée dans Airtable.
  const descriptionCol = Object.keys(rows[0]).find(
    h => h.trim().toLowerCase().startsWith("description")
  );

  const organisations = [];
  const partenaires = [];

  for (const r of rows) {
    const cid = (r[COL.cid] || "").trim();
    const nom = (r[COL.nom] || "").trim();

    if (!cid || !nom) continue;

    organisations.push({
      id: cid,
      nom,
      secteur: clean(r[COL.secteur]),
      type: clean(r[COL.type]),
      taille: clean(r[COL.taille]),
      localisation: clean(r[COL.pays]) || clean(r[COL.ville]),
      description: descriptionCol ? (r[descriptionCol] || "").trim() : "",
      site_web: (r[COL.site] || "").trim(),

      contact_nom: (r[COL.contactNom] || "").trim(),
      contact_poste: (r[COL.contactPoste] || "").trim(),
      contact_email: (r[COL.contactEmail] || "").trim(),
      contact_tel: (r[COL.contactTel] || "").trim()
    });

    const nb = (r[COL.nb] || "").trim();
    const statut = (r[COL.statut] || "").trim();
    const meetingQuota = quota(nb);

    if (statut === "Partenaire Conciergerie" && meetingQuota > 0) {
      partenaires.push({
        id: cid,
        nom,
        meeting_quota: meetingQuota
      });
    }
  }

  return {
    _comment: "Vivier MTLC conciergerie généré depuis Airtable. id = Conciergerie_ID. Tokens gérés dans le Google Sheet.",
    partenaires,
    organisations,
    propositions: []
  };
}

  /* ═══ SECTION 5 — NETTOYAGE DES VALEURS ═════════════════════════════════ */
  function clean(s) {
    s = (s || "").trim();
    if (s.includes(" / ")) {           // "Canada / Canada" → "Canada", "PME / SME" → "PME"
      const left = s.split(" / ")[0].trim();
      if (left) s = left;
    }
    return s;
  }
  function quota(s) {
    const m = String(s).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  /* ═══ SECTION 6 — RAPPORT + TÉLÉCHARGEMENT ══════════════════════════════ */
  function report(html, isError) {
    const el = $("#importReport");
    el.hidden = false;
    el.className = "import-report" + (isError ? " error" : " ok");
    el.innerHTML = html;
  }
  $("#importDownload").addEventListener("click", () => {
    if (!generated) return;
    const blob = new Blob([JSON.stringify(generated, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "data.json";
    a.click();
    URL.revokeObjectURL(url);
  });
})();
