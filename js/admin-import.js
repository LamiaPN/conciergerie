/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-import.js
   RÔLE    : Convertisseur CSV Airtable → data.json pour le vivier admin.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Ouverture / fermeture de la modale                            │
   │  2 — Réception du fichier CSV                                      │
   │  3 — Parseur CSV robuste                                           │
   │  4 — Résolution tolérante des colonnes Airtable                    │
   │  5 — Transformation CSV → data.json + snapshot formulaire           │
   │  6 — Nettoyage / confidentialité                                   │
   │  7 — Rapport + téléchargement                                      │
   └──────────────────────────────────────────────────────────────────────┘

   IMPORTANT
   - IDs sensibles à la casse : jamais de toLowerCase() sur un ID.
   - Secteur / Type / Taille / Thème sont conservés tels qu'Airtable.
   - Expertise est un tableau de tags.
   - Les colonnes personnelles ne vont jamais dans data.json.
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  let generated = null;
  const $ = selector => document.querySelector(selector);

  /* ═══ SECTION 1 — OUVERTURE / FERMETURE ═══════════════════════════════ */
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
  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });

  /* ═══ SECTION 2 — RÉCEPTION DU FICHIER ════════════════════════════════ */
  const drop = $("#importDrop");
  const fileInput = $("#importFile");

  fileInput.addEventListener("change", event => {
    if (event.target.files[0]) handleFile(event.target.files[0]);
  });

  ["dragover", "dragenter"].forEach(eventName => {
    drop.addEventListener(eventName, event => {
      event.preventDefault();
      drop.classList.add("over");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    drop.addEventListener(eventName, event => {
      event.preventDefault();
      drop.classList.remove("over");
    });
  });

  drop.addEventListener("drop", event => {
    const file = event.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    if (!/\.csv$/i.test(file.name)) {
      report("⚠️ Merci de déposer un fichier .csv", true);
      return;
    }

    $("#importDropText").textContent = file.name;
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const rows = parseCSV(reader.result);
        const data = buildData(rows);

        try {
          const currentRes = await fetch(CONFIG.DATA_URL, { cache: "no-store" });
          if (currentRes.ok) {
            const currentData = await currentRes.json();
            data.propositions = Array.isArray(currentData.propositions)
              ? currentData.propositions
              : [];
          }
        } catch (_) {
          data.propositions = [];
        }

        generated = data;

        report(
          `✅ <b>${data.organisations.length}</b> organisations · ` +
          `<b>${data.partenaires.length}</b> partenaires conciergerie · ` +
          `<b>${data.propositions.length}</b> propositions.<br>` +
          `<span class="import-muted">Les référentiels du formulaire sont intégrés automatiquement à ce data.json. ` +
          `Cliquez « Télécharger data.json », puis déposez le fichier dans le dossier <code>js/</code>.</span>`,
          false
        );

        $("#importDownload").disabled = false;
      } catch (error) {
        generated = null;
        report("❌ " + (error.message || "Fichier illisible."), true);
        $("#importDownload").disabled = true;
      }
    };

    reader.readAsText(file, "utf-8");
  }

  /* ═══ SECTION 3 — PARSEUR CSV ROBUSTE ═════════════════════════════════ */
  function parseCSV(text) {
    text = String(text || "").replace(/^\uFEFF/, "");

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') inQuotes = true;
        else if (char === ",") { row.push(field); field = ""; }
        else if (char === "\r") { /* ignore */ }
        else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += char;
      }
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    if (!rows.length) return [];

    const header = rows.shift().map(value => String(value || "").trim());

    return rows
      .filter(currentRow => currentRow.some(cell => String(cell || "").trim() !== ""))
      .map(currentRow =>
        Object.fromEntries(
          header.map((name, index) => [name, String(currentRow[index] || "").trim()])
        )
      );
  }

  /* ═══ SECTION 4 — RÉSOLUTION TOLÉRANTE DES COLONNES ═══════════════════ */
  function resolveColumn(headers, aliases, required = false) {
    const exact = new Map(headers.map(header => [normalizeHeader(header), header]));

    for (const alias of aliases) {
      const found = exact.get(normalizeHeader(alias));
      if (found) return found;
    }

    if (required) {
      throw new Error(`Colonne obligatoire introuvable : ${aliases[0]}`);
    }

    return "";
  }

  function normalizeHeader(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  /* ═══ SECTION 5 — TRANSFORMATION CSV → data.json ══════════════════════ */
  function buildData(rows) {
    if (!rows.length) throw new Error("Le CSV ne contient aucune donnée.");

    const headers = Object.keys(rows[0]);

    const COL = {
      nom: resolveColumn(headers, [
        "Nom de l'organisation",
        "Nom de l'organisation / Délégation / F",
        "Nom de l'organisation / Délégation/F"
      ], true),

      cid: resolveColumn(headers, [
        "Conciergerie _ID",
        "Conciergerie_ID",
        "Conciergerie ID"
      ], true),

      nb: resolveColumn(headers, ["Nombre contact conciergerie"]),
      site: resolveColumn(headers, [
        "Site web de l'organisation /F",
        "Site web de l'organisation"
      ]),
      secteur: resolveColumn(headers, [
        "Secteur d'activité /F",
        "Secteur d'activité"
      ]),
      type: resolveColumn(headers, [
        "Type d'organisation /F",
        "Type d'organisation"
      ]),
      pays: resolveColumn(headers, ["Pays /F", "Pays"]),
      taille: resolveColumn(headers, ["Taille de l'organisation"]),
      ville: resolveColumn(headers, ["Ville"]),
      statut: resolveColumn(headers, [
        "Statut_Conciergerie",
        "Statut Conciergerie"
      ]),
      theme: resolveColumn(headers, ["Thème", "Theme"]),
      expertise: resolveColumn(headers, ["Expertise"]),
      description: headers.find(header =>
        normalizeHeader(header).startsWith("description")
      ) || ""
    };

    const keyColumns = new Set(Object.values(COL).filter(Boolean));
    const organisations = [];
    const partenaires = [];
    const seenOrganisationIds = new Set();
    const seenPartnerIds = new Set();

    for (const row of rows) {
      const id = getValue(row, COL.cid);
      const nom = getValue(row, COL.nom);

      if (!id || !nom) continue;

      if (!seenOrganisationIds.has(id)) {
        const extra = {};

        headers.forEach(header => {
          if (keyColumns.has(header) || isPersonalColumn(header)) return;
          extra[header] = getValue(row, header);
        });

        organisations.push({
          id,
          nom,
          secteur: getValue(row, COL.secteur),
          type: getValue(row, COL.type),
          taille: getValue(row, COL.taille),
          localisation: cleanLocation(getValue(row, COL.pays)) || getValue(row, COL.ville),
          description: getValue(row, COL.description),
          site_web: getValue(row, COL.site),
          theme: getValue(row, COL.theme),
          expertise: splitMultiValue(getValue(row, COL.expertise)),
          extra
        });

        seenOrganisationIds.add(id);
      }

      const meetingQuota = quota(getValue(row, COL.nb));

      if (meetingQuota > 0 && !seenPartnerIds.has(id)) {
        partenaires.push({ id, nom, meeting_quota: meetingQuota });
        seenPartnerIds.add(id);
      }
    }

    if (!organisations.length) {
      throw new Error(
        `Aucune organisation reconnue. Colonne nom détectée : « ${COL.nom} » ; colonne ID : « ${COL.cid} ».`
      );
    }

    const data = {
      _comment: "Vivier MTLC conciergerie généré depuis Airtable. id = Conciergerie _ID. Tokens et relations gérés dans le Google Sheet.",
      partenaires,
      organisations,
      propositions: []
    };

    // Snapshot léger utilisé uniquement par le formulaire partenaire.
    // Il est régénéré à chaque nouvel import CSV : le formulaire n'a plus
    // besoin de recalculer les secteurs / types / tailles à chaque ouverture.
    data._formulaire = buildFormSnapshot(organisations, partenaires);

    return data;
  }

  function buildFormSnapshot(organisations, partenaires) {
    const orgById = new Map(
      organisations
        .filter(org => String(org?.id || "").trim())
        .map(org => [String(org.id).trim(), org])
    );

    const unique = key => [...new Set(
      organisations
        .map(org => String(org?.[key] || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    const profiles = {};

    partenaires.forEach(partenaire => {
      const id = String(partenaire?.id || "").trim();
      if (!id) return;

      const org = orgById.get(id) || {};
      profiles[id] = {
        nom: String(org.nom || partenaire.nom || "").trim(),
        secteur: String(org.secteur || "").trim(),
        type: String(org.type || "").trim(),
        taille: String(org.taille || "").trim(),
        localisation: String(org.localisation || "").trim(),
        description: String(org.description || "").trim(),
        site_web: String(org.site_web || "").trim()
      };
    });

    const contenu = {
      referentiels: {
        secteurs: unique("secteur"),
        types: unique("type"),
        tailles: unique("taille")
      },
      partenaires: profiles
    };

    return {
      version: formSnapshotSignature(contenu),
      generated_at: new Date().toISOString(),
      ...contenu
    };
  }

  // Signature déterministe : si les valeurs utiles au formulaire ne changent
  // pas, la signature reste identique même lors d'un nouvel export Airtable.
  function formSnapshotSignature(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;

    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function getValue(row, column) {
    if (!column) return "";
    return String(row[column] || "").trim();
  }

  /* ═══ SECTION 6 — NETTOYAGE / CONFIDENTIALITÉ ═════════════════════════ */
  function splitMultiValue(value) {
    return String(value || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  function cleanLocation(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (raw.includes(" / ")) {
      const left = raw.split(" / ")[0].trim();
      if (left) return left;
    }

    return raw;
  }

  function quota(value) {
    const match = String(value || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  function isPersonalColumn(header) {
    const normalized = normalizeHeader(header);

    return normalized.startsWith("courriel") ||
      normalized.startsWith("email") ||
      normalized.startsWith("telephone") ||
      normalized.startsWith("fonction") ||
      normalized.startsWith("contact principal");
  }

  /* ═══ SECTION 7 — RAPPORT + TÉLÉCHARGEMENT ════════════════════════════ */
  function report(html, isError) {
    const element = $("#importReport");
    element.hidden = false;
    element.className = "import-report" + (isError ? " error" : " ok");
    element.innerHTML = html;
  }

  $("#importDownload").addEventListener("click", () => {
    if (!generated) return;

    const blob = new Blob(
      [JSON.stringify(generated, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "data.json";
    link.click();
    URL.revokeObjectURL(url);
  });
})();
