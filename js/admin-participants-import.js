/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-participants-import.js
   VERSION : v4 — tous les profils conservés, exclusions visibles dans Écartés
   RÔLE    : Ajouter uniquement les personnes dans Contacts privés.

   RÈGLES :
   - Le vivier reste la source de vérité : aucune organisation n'est modifiée.
   - Tous les participants pertinents sont conservés dans Contacts, même hors vivier.
   - Les billets en ligne, étudiants/stagiaires/doctorants et sans emploi sont exclus.
   - Les partenaires sont prioritaires lors du rapprochement.
   - Un email déjà présent dans Contacts n'est jamais recréé.
   - Les nouveaux participants sont secondaires (principal = false).
   - Le contact issu du formulaire partenaire reste donc affiché par défaut.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — État et utilitaires                                            │
   │  2 — Lecture Excel / CSV                                            │
   │  3 — Rapprochement avec le vivier                                  │
   │  4 — Prévisualisation                                               │
   │  5 — Enregistrement dans Contacts                                  │
   │  6 — Événements interface                                          │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const modal = $("#participantsImportModal");
  const openBtn = $("#btnImportParticipants");
  if (!modal || !openBtn || typeof API === "undefined") return;

  const fileInput = $("#participantsImportFile");
  const drop = $("#participantsImportDrop");
  const dropText = $("#participantsImportDropText");
  const report = $("#participantsImportReport");
  const confirmBtn = $("#participantsImportConfirm");
  const closeBtn = $("#participantsImportClose");
  const cancelBtn = $("#participantsImportCancel");

  const state = { pending: [], stats: null, fileName: "" };
  const GENERIC_DOMAINS = new Set([
    "gmail.com","hotmail.com","outlook.com","live.com","icloud.com","yahoo.com",
    "proton.me","protonmail.com","mail.com","gmx.com","aol.com"
  ]);

  /* ═══ SECTION 1 — ÉTAT ET UTILITAIRES ═════════════════════════════════ */
  function adminToken() {
    const urlToken = new URL(location.href).searchParams.get("token");
    return String(urlToken || sessionStorage.getItem("conciergerie_admin_token_session") || "").trim();
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " et ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(inc|incorporee|incorporated|ltee|ltd|llc|corp|corporation|sarl|sa)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clean(value) { return String(value ?? "").trim(); }
  function emailKey(value) { return clean(value).toLowerCase(); }
  function domainFromEmail(value) {
    const email = emailKey(value);
    const at = email.lastIndexOf("@");
    return at > 0 ? email.slice(at + 1) : "";
  }
  function domainFromSite(value) {
    let site = clean(value).toLowerCase();
    if (!site) return "";
    site = site.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#]/)[0];
    return site;
  }
  function esc(value) {
    return clean(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
  }

  function setReport(html, error = false) {
    report.hidden = false;
    report.innerHTML = html;
    report.classList.toggle("is-error", Boolean(error));
  }

  function reset() {
    state.pending = [];
    state.stats = null;
    state.fileName = "";
    fileInput.value = "";
    dropText.textContent = "Cliquez ou glissez votre fichier participants ici";
    report.hidden = true;
    report.innerHTML = "";
    confirmBtn.disabled = true;
  }

  /* ═══ SECTION 2 — LECTURE EXCEL / CSV ═════════════════════════════════ */
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i], next = text[i + 1];
      if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === "," && !quoted) { row.push(cell); cell = ""; continue; }
      if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && next === "\n") i += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
        continue;
      }
      cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => clean(v)));
  }

  function rowsToObjects(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) return [];
    const headers = matrix[0].map(h => clean(h));
    return matrix.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, index) => { if (header) obj[header] = row[index] ?? ""; });
      return obj;
    });
  }

  function findField(row, aliases) {
    const entries = Object.entries(row || {});
    for (const alias of aliases) {
      const wanted = normalize(alias);
      const exact = entries.find(([key]) => normalize(key) === wanted);
      if (exact) return clean(exact[1]);

      const prefix = entries.find(([key]) => {
        const normalizedKey = normalize(key);
        return wanted.length >= 8
          && (normalizedKey.startsWith(wanted) || wanted.startsWith(normalizedKey));
      });
      if (prefix) return clean(prefix[1]);
    }
    return "";
  }

  function sheetRowsFromWorkbook(workbook, sheetName, category = "") {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
    if (!Array.isArray(matrix) || !matrix.length) return [];

    const headerIndex = matrix.findIndex(row =>
      Array.isArray(row)
      && row.some(cell => normalize(cell) === "nom")
      && row.some(cell => normalize(cell) === "courriel")
    );
    if (headerIndex === -1) return [];
    return rowsToObjects(matrix.slice(headerIndex)).map(row => ({
      ...row,
      __import_category: category || normalize(sheetName)
    }));
  }

  async function readParticipantsFile(file) {
    if (/\.csv$/i.test(file.name)) {
      return rowsToObjects(parseCSV(await file.text()));
    }
    if (typeof XLSX === "undefined") throw new Error("Le lecteur Excel n'est pas chargé. Rechargez la page puis réessayez.");

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });

    const pertinents = workbook.SheetNames.find(name => normalize(name) === "pertinents");
    const nonPertinents = workbook.SheetNames.find(name => normalize(name).startsWith("non pertinents"));
    const elimines = workbook.SheetNames.find(name => normalize(name).startsWith("elimines d office"));

    if (pertinents || nonPertinents || elimines) {
      return [
        ...(pertinents ? sheetRowsFromWorkbook(workbook, pertinents, "pertinent") : []),
        ...(nonPertinents ? sheetRowsFromWorkbook(workbook, nonPertinents, "ecarte_historique") : []),
        ...(elimines ? sheetRowsFromWorkbook(workbook, elimines, "ecarte_office") : [])
      ];
    }

    const table1 = workbook.SheetNames.find(name => normalize(name) === "table 1");
    const preferred = table1 || workbook.SheetNames[0];
    if (!preferred) throw new Error("Aucune feuille lisible trouvée dans le fichier.");
    return sheetRowsFromWorkbook(workbook, preferred, "brut");
  }

  function participantFromRow(row) {
    const nom = findField(row, ["Nom"]);
    const prenom = findField(row, ["Prénom", "Prenom"]);
    const email = findField(row, ["Courriel", "Email", "E-mail"]);
    const compagnie = findField(row, ["Compagnie", "Organisation", "Entreprise"]);
    const fonction = findField(row, ["Fonction", "Poste"]);
    const roleEvenement = findField(row, ["Rôle", "Role"]);
    const participation = findField(row, [
      "Participation", "Mode de participation", "Type de participation",
      "Présence", "Presence", "Format", "Type de billet", "Billet"
    ]);
    const statutEmploi = findField(row, [
      "Statut d'emploi", "Statut emploi", "Employment status", "Situation professionnelle",
      "Quel type d'emploi occupez-vous dans votre organisation/entreprise?"
    ]);
    const secteur = findField(row, [
      "Quel est votre secteur d'activité",
      "Secteur d'activité",
      "Secteur"
    ]);
    const pays = findField(row, [
      "Quel est votre pays de résidence",
      "Pays de résidence",
      "Pays"
    ]);
    const objectif = findField(row, [
      "Quel est votre objectif principal de participation à MTL connecte",
      "Quel est votre objectif principal",
      "Objectif principal",
      "Objectif"
    ]);
    const typeOrganisation = findField(row, [
      "Quel est le type de votre organisation",
      "Quel est le type de votre organisation/entreprise",
      "Type d'organisation",
      "Type organisation"
    ]);

    return {
      nom: [prenom, nom].filter(Boolean).join(" ").trim() || email,
      email,
      compagnie,
      fonction,
      roleEvenement,
      participation,
      statutEmploi,
      secteur,
      pays,
      objectif,
      typeOrganisation,
      importCategory: clean(row.__import_category)
    };
  }

  function isOnlineParticipant(participant) {
    const text = normalize([participant.participation, participant.roleEvenement].filter(Boolean).join(" "));
    return /\b(en ligne|online|virtuel|virtuelle|virtual|a distance|distance)\b/.test(text);
  }

  function isBlockedProfile(participant) {
    const text = normalize([participant.fonction, participant.statutEmploi].filter(Boolean).join(" "));
    return /\b(etudiant|etudiante|student|stagiaire|intern|doctorant|doctorante|phd|sans emploi|chercheur d emploi|chercheuse d emploi|job seeker|unemployed)\b/.test(text);
  }

  function cleanCountry(value) {
    const text = clean(value);
    if (!text) return "";
    const parts = text.split(" - ").map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : text;
  }

  function contactOnlyOrganisationId(company) {
    return "contact-only::" + clean(company);
  }

  /* ═══ SECTION 3 — RAPPROCHEMENT AVEC LE VIVIER ════════════════════════ */
  function partnerIdSet(vivier) {
    return new Set((Array.isArray(vivier?.partenaires) ? vivier.partenaires : []).map(item =>
      clean(typeof item === "string" ? item : (item?.id || item?.partenaire_id))
    ).filter(Boolean));
  }

  function buildOrgIndexes(vivier, existingContacts = []) {
    const partnerIds = partnerIdSet(vivier);
    const byName = new Map();
    const byDomain = new Map();
    const orgIds = new Set((Array.isArray(vivier?.organisations) ? vivier.organisations : []).map(org => clean(org?.id)).filter(Boolean));

    (Array.isArray(vivier?.organisations) ? vivier.organisations : []).forEach(org => {
      const id = clean(org?.id);
      if (!id) return;
      const item = { org, id, isPartner: partnerIds.has(id) };

      const nameKey = normalize(org?.nom || org?.organisation || org?.name);
      if (nameKey) {
        if (!byName.has(nameKey)) byName.set(nameKey, []);
        byName.get(nameKey).push(item);
      }

      const domain = domainFromSite(org?.site || org?.site_web || org?.website);
      if (domain && !GENERIC_DOMAINS.has(domain)) {
        if (!byDomain.has(domain)) byDomain.set(domain, []);
        byDomain.get(domain).push(item);
      }
    });

    (Array.isArray(existingContacts) ? existingContacts : []).forEach(contact => {
      const orgId = clean(contact?.organisation_id);
      if (!orgIds.has(orgId)) return;
      const domain = domainFromEmail(contact?.email);
      if (!domain || GENERIC_DOMAINS.has(domain)) return;

      const org = (vivier.organisations || []).find(item => clean(item?.id) === orgId);
      if (!org) return;

      if (!byDomain.has(domain)) byDomain.set(domain, []);
      const list = byDomain.get(domain);
      if (!list.some(item => item.id === orgId)) {
        list.push({ org, id: orgId, isPartner: partnerIds.has(orgId) });
      }
    });

    const prioritize = list => [...(list || [])].sort((a, b) => Number(b.isPartner) - Number(a.isPartner));
    return { byName, byDomain, prioritize, partnerIds };
  }

  function matchOrganisation(participant, indexes) {
    const nameKey = normalize(participant.compagnie);
    const byName = nameKey ? indexes.prioritize(indexes.byName.get(nameKey)) : [];
    if (byName.length) return { match: byName[0], mode: "nom" };

    if (nameKey) {
      const fuzzyPartners = [];
      indexes.byName.forEach((items, orgNameKey) => {
        const partner = indexes.prioritize(items).find(item => item.isPartner);
        if (!partner || orgNameKey.length < 4) return;
        if (nameKey.includes(orgNameKey) || orgNameKey.includes(nameKey)) fuzzyPartners.push(partner);
      });
      if (fuzzyPartners.length === 1) return { match: fuzzyPartners[0], mode: "nom-proche" };
    }

    const domain = domainFromEmail(participant.email);
    if (domain && !GENERIC_DOMAINS.has(domain)) {
      const byDomain = indexes.prioritize(indexes.byDomain.get(domain));
      if (byDomain.length === 1) return { match: byDomain[0], mode: "domaine" };
      if (byDomain.length > 1 && byDomain[0].isPartner && !byDomain[1].isPartner) return { match: byDomain[0], mode: "domaine" };
    }
    return { match: null, mode: "" };
  }

  /* ═══ SECTION 4 — PRÉVISUALISATION ════════════════════════════════════ */
  async function analyse(file) {
    const token = adminToken();
    if (!token) throw new Error("Jeton administrateur introuvable.");

    const [rows, vivier, existing] = await Promise.all([
      readParticipantsFile(file),
      API.loadVivier(),
      API.getContactsAdmin(token)
    ]);

    const indexes = buildOrgIndexes(vivier, existing);
    const existingByEmail = new Map(
      (existing || [])
        .map(contact => [emailKey(contact?.email), contact])
        .filter(([email]) => Boolean(email))
    );
    const seenIncoming = new Set();

    const stats = {
      lignes: rows.length, candidats: 0, aImporter: 0, partenaires: 0,
      doublons: 0, rattachesExistants: 0, sansEmail: 0, sansOrganisation: 0, horsParticipants: 0,
      ecartesImportes: 0, exclusEnLigne: 0, exclusProfil: 0, horsVivier: 0, domaines: 0
    };
    const missingCompanies = new Map();
    const pending = [];

    rows.forEach(row => {
      const p = participantFromRow(row);
      if (p.roleEvenement && !/participant/i.test(p.roleEvenement)) { stats.horsParticipants += 1; return; }

      const excludedOnline = isOnlineParticipant(p);
      const excludedProfile = isBlockedProfile(p);
      const excludedHistorical = p.importCategory === "ecarte_historique" || p.importCategory === "ecarte_office";
      const shouldBeHidden = excludedOnline || excludedProfile || excludedHistorical;

      if (excludedOnline) stats.exclusEnLigne += 1;
      if (excludedProfile) stats.exclusProfil += 1;
      if (shouldBeHidden) stats.ecartesImportes += 1;
      stats.candidats += 1;

      const eKey = emailKey(p.email);
      if (!eKey) { stats.sansEmail += 1; return; }
      if (!p.compagnie) { stats.sansOrganisation += 1; return; }
      if (seenIncoming.has(eKey)) { stats.doublons += 1; return; }

      const result = matchOrganisation(p, indexes);
      const company = clean(p.compagnie);
      const existingContact = existingByEmail.get(eKey);
      const isExistingParticipant = Boolean(
        existingContact
        && clean(existingContact.source) === "Participants MTL connecte 2026"
      );
      const canRelinkExisting = Boolean(
        isExistingParticipant
        && clean(existingContact.organisation_id).startsWith("contact-only::")
        && result.match
      );

      if (existingContact && !isExistingParticipant) {
        stats.doublons += 1;
        return;
      }

      const organisationId = result.match ? result.match.id : contactOnlyOrganisationId(company);
      const organisationNom = result.match
        ? clean(result.match.org?.nom || result.match.org?.organisation || result.match.id)
        : company;

      if (!result.match) {
        stats.horsVivier += 1;
        missingCompanies.set(company, (missingCompanies.get(company) || 0) + 1);
      }

      seenIncoming.add(eKey);
      if (result.mode === "domaine") stats.domaines += 1;
      if (result.match?.isPartner) stats.partenaires += 1;
      if (canRelinkExisting) stats.rattachesExistants += 1;

      pending.push({
        contact_id: isExistingParticipant ? clean(existingContact.contact_id) : "",
        organisation_id: organisationId,
        organisation_nom: organisationNom,
        nom: p.nom,
        fonction: p.fonction,
        email: p.email,
        telephone: clean(existingContact?.telephone),
        role: (() => {
          const existingRole = clean(existingContact?.role);
          if (existingRole.includes("||RDV_ACTIVE")) return existingRole;
          if (existingRole.includes("||RDV_HIDDEN")) return existingRole;
          const base = existingRole || "Participant MTL connecte 2026";
          return shouldBeHidden ? `${base} ||RDV_HIDDEN` : base;
        })(),
        principal: false,
        source: "Participants MTL connecte 2026",
        secteur: p.secteur,
        pays: cleanCountry(p.pays),
        objectif: p.objectif,
        type_organisation: p.typeOrganisation,
        emploi: p.statutEmploi,
        isPartner: Boolean(result.match?.isPartner),
        horsVivier: !result.match,
        relink: canRelinkExisting,
        updateExisting: isExistingParticipant
      });
    });

    pending.sort((a, b) =>
      Number(b.isPartner) - Number(a.isPartner)
      || a.organisation_nom.localeCompare(b.organisation_nom, "fr", { sensitivity: "base" })
      || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })
    );

    stats.aImporter = pending.length;
    state.pending = pending;
    state.stats = stats;
    state.fileName = file.name;

    const missingPreview = [...missingCompanies.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => `<li>${esc(name)}${count > 1 ? ` × ${count}` : ""}</li>`)
      .join("");

    setReport(
      `<b>${esc(file.name)}</b><br>
       ✅ <b>${stats.aImporter}</b> contact(s) prêt(s) à importer ou mettre à jour, dont <b>${stats.partenaires}</b> rattaché(s) à des partenaires.<br>
       ↩️ <b>${stats.doublons}</b> déjà connu(s) / doublon(s) email ·
       🔗 <b>${stats.rattachesExistants}</b> contact(s) hors vivier à rattacher à une organisation existante ·
       📇 <b>${stats.horsVivier}</b> contact(s) hors vivier conservé(s) ·
       🗂️ <b>${stats.ecartesImportes}</b> contact(s) classé(s) dans Écartés ·
       🚫 <b>${stats.exclusEnLigne}</b> en ligne ·
       <b>${stats.exclusProfil}</b> étudiant(s)/stagiaire(s)/doctorant(s)/sans emploi
       ${stats.sansEmail ? ` · <b>${stats.sansEmail}</b> sans email` : ""}.
       ${missingPreview ? `<details style="margin-top:8px"><summary>Entreprises hors vivier conservées dans Contacts</summary><ul>${missingPreview}</ul></details>` : ""}
       <div class="import-muted" style="margin-top:8px">Aucune organisation du vivier ne sera créée ou modifiée.</div>`
    );

    confirmBtn.disabled = pending.length === 0;
  }

  /* ═══ SECTION 5 — ENREGISTREMENT DANS CONTACTS ════════════════════════ */
  async function saveContact(token, contact) {
    const response = await fetch(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "save_contact", token, contact })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Impossible d'enregistrer le contact.");
    return data;
  }

  async function importPending() {
    const token = adminToken();
    if (!token) throw new Error("Jeton administrateur introuvable.");
    if (!state.pending.length) return;

    const original = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    let saved = 0, errors = 0;

    try {
      for (const item of state.pending) {
        try {
          await saveContact(token, {
            contact_id: item.contact_id || "",
            organisation_id: item.organisation_id,
            nom: item.nom,
            fonction: item.fonction,
            email: item.email,
            telephone: item.telephone,
            role: item.role,
            principal: false,
            source: item.source,
            secteur: item.secteur,
            pays: item.pays,
            objectif: item.objectif,
            type_organisation: item.type_organisation,
            emploi: item.emploi
          });
          saved += 1;
        } catch (error) {
          console.error("Import participant impossible", item, error);
          errors += 1;
        }

        confirmBtn.innerHTML = `<span class="spinner"></span> ${saved + errors}/${state.pending.length}`;
      }

      setReport(
        `✅ <b>${saved}</b> participant(s) ajouté(s) dans Contacts.
         ${errors ? `<br>❌ <b>${errors}</b> erreur(s).` : ""}
         <br><span class="import-muted">Les nouveaux contacts arrivent dans Contacts / À valider. Seuls les contacts activés et rattachés à une organisation du vivier peuvent apparaître dans les menus RDV.</span>`,
        errors > 0
      );

      state.pending = [];
    } finally {
      confirmBtn.innerHTML = original;
      confirmBtn.disabled = true;
    }
  }

  /* ═══ SECTION 6 — ÉVÉNEMENTS INTERFACE ════════════════════════════════ */
  function open() { reset(); modal.hidden = false; }
  function close() { modal.hidden = true; reset(); }

  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", event => { if (event.target === modal) close(); });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    dropText.textContent = file.name;
    confirmBtn.disabled = true;
    setReport("⏳ Analyse du fichier…");
    try { await analyse(file); }
    catch (error) { state.pending = []; setReport(`❌ ${esc(error.message || "Import impossible.")}`, true); }
  });

  ["dragenter","dragover"].forEach(type => drop.addEventListener(type, event => {
    event.preventDefault(); drop.classList.add("is-dragover");
  }));
  ["dragleave","drop"].forEach(type => drop.addEventListener(type, event => {
    event.preventDefault(); drop.classList.remove("is-dragover");
  }));
  drop.addEventListener("drop", event => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("change"));
  });

  confirmBtn.addEventListener("click", () => importPending().catch(error => {
    setReport(`❌ ${esc(error.message || "Import impossible.")}`, true);
    confirmBtn.disabled = false;
  }));
})();