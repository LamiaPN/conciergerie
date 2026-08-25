/* ════════════════════════════════════════════════════════════════════════
   FICHIER : api.js
   RÔLE    : Couche d'accès aux données de la Conciergerie MTLC 2026.

   SOURCES :
   - data.json : vivier public en lecture seule
   - Google Sheet via Apps Script : propositions, sélections et formulaires

   SÉCURITÉ :
   - Accès partenaire : partenaire_id + token partenaire
   - Accès admin      : partenaire_id + ADMIN_TOKEN
   - Aucun token n'est stocké dans ce fichier
   - Les IDs Airtable sont sensibles à la casse : jamais de toLowerCase()

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Chargement + fusion du vivier                                   │
   │  2 — Utilitaires du vivier                                           │
   │  3 — Sélections partenaire / admin                                   │
   │  4 — Formulaire, historique et notifications                          │
   │  5 — Propositions partenaire / admin                                 │
   │  6 — Vivier modifiable                                               │
   │  7 — Référentiels                                                  │
   │  8 — Requêtes HTTP                                                   │
   │  9 — Repli local                                                     │
   │ 10 — API publique                                                    │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */

const API = (() => {
  let _vivier = null;

  /* ═══ SECTION 1 — CHARGEMENT + FUSION DU VIVIER ═══════════════════════ */
  async function loadVivier() {
    if (_vivier) return _vivier;

    const res = await fetch(CONFIG.DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Impossible de charger le vivier (" + res.status + ").");
    const base = await res.json();

    const organisationsBase = Array.isArray(base.organisations)
      ? base.organisations.map(o => ({ ...o }))
      : [];

    let organisations = organisationsBase;

    try {
      const modifs = await getVivierModifs();
      organisations = mergeVivierOrganisations_(organisationsBase, modifs);
    } catch (err) {
      console.warn("Vivier_modifs indisponible : data.json utilisé seul.", err);
    }

    _vivier = { ...base, organisations };
    return _vivier;
  }


  /**
   * Fusion data.json + Vivier_modifs.
   *
   * RÈGLE MÉTIER :
   * - une organisation Airtable (id non "loc-*") n'existe que si son id
   *   est encore présent dans data.json ;
   * - une organisation locale (id "loc-*") peut exister uniquement dans
   *   Vivier_modifs et doit survivre aux prochains imports Airtable.
   *
   * Les IDs restent sensibles à la casse : aucun toLowerCase().
   */
  function mergeVivierOrganisations_(baseOrganisations, modifs) {
    const base = Array.isArray(baseOrganisations)
      ? baseOrganisations.map(org => ({ ...org }))
      : [];

    const baseIds = new Set(
      base
        .map(org => String(org?.id ?? "").trim())
        .filter(Boolean)
    );

    const parId = new Map(
      base
        .filter(org => String(org?.id ?? "").trim())
        .map(org => [String(org.id).trim(), org])
    );

    (Array.isArray(modifs) ? modifs : []).forEach(modif => {
      const propre = cleanOrg(modif);
      const id = String(propre.id || "").trim();

      if (!id) return;

      const estLocale = id.startsWith("loc-");
      const existeDansBase = baseIds.has(id);

      // Orphelin Airtable : on l'ignore volontairement.
      if (!estLocale && !existeDansBase) return;

      const existante = parId.get(id);

      parId.set(
        id,
        existante
          ? { ...existante, ...propre }
          : propre
      );
    });

    return [...parId.values()];
  }

  /* ═══ SECTION 2 — UTILITAIRES DU VIVIER ════════════════════════════════ */
  function getPartenaire(vivier, partenaireId) {
    return vivier.partenaires.find(partenaire => partenaire.id === partenaireId) || null;
  }

  /* ═══ SECTION 3 — SÉLECTIONS PARTENAIRE / ADMIN ═════════════════════════ */
  async function getSelections(partenaireId, token) {
    if (!CONFIG.SHEET_API_URL) return _local.get(partenaireId);
    const url = `${CONFIG.SHEET_API_URL}?action=get&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(token)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.selections || [];
  }

  async function saveSelections(partenaireId, token, organisationIds) {
    if (!CONFIG.SHEET_API_URL) {
      _local.set(partenaireId, organisationIds);
      return { ok: true, demo: true };
    }
    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "save", p: partenaireId, token, selections: organisationIds })
    });
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function getSelectionsAdmin(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return _local.get(partenaireId);
    const url = `${CONFIG.SHEET_API_URL}?action=admin_get&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(adminToken)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.selections || [];
  }


  /* ═══ RENDEZ-VOUS PARTENAIRE ══════════════════════════════════════════ */
  async function getRencontres(partenaireId, token) {
    if (!CONFIG.SHEET_API_URL) return [];
    const url = `${CONFIG.SHEET_API_URL}?action=get_rencontres&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(token)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return Array.isArray(data.rencontres) ? data.rencontres : [];
  }

  /* ═══ SECTION 4 — FORMULAIRE, HISTORIQUE ET NOTIFICATIONS ═══════════════ */
  async function getFormulaire(partenaireId, token) {
    if (!CONFIG.SHEET_API_URL) return null;
    const url = `${CONFIG.SHEET_API_URL}?action=get_formulaire&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(token)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.formulaire || null;
  }

  async function saveFormulaire(partenaireId, token, reponses) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true };

    // Écriture opaque : Apps Script peut rediriger la réponse POST vers une page HTML.
    // On ne tente donc pas de parser cette réponse.
    await fetch(CONFIG.SHEET_API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "save_formulaire", p: partenaireId, token, reponses })
    });

    // Vérification indépendante en JSONP : évite les problèmes CORS/redirect de ContentService.
    const verificationUrl = `${CONFIG.SHEET_API_URL}?action=get_formulaire_jsonp&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(token)}&_=${Date.now()}`;
    const verification = await _fetchJSONP(verificationUrl);
    if (verification.error) throw new Error(verification.error);

    const formulaire = verification.formulaire || null;
    if (!formulaire) throw new Error("Le serveur n'a pas confirmé l'enregistrement du formulaire.");

    const normalize = value => String(value ?? "").trim();
    const nonConfirmes = Object.keys(reponses || {}).filter(cle => normalize(formulaire[cle]) !== normalize(reponses[cle]));
    if (nonConfirmes.length) throw new Error("L'enregistrement n'a pas été confirmé pour certains champs. Réessayez.");

    return { ok: true, changed: true, verified: true };
  }

  async function getFormulaireAdmin(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return null;
    const url = `${CONFIG.SHEET_API_URL}?action=admin_get_formulaire&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(adminToken)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.formulaire || null;
  }

  async function getFormHistoryAdmin(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return [];
    const url = `${CONFIG.SHEET_API_URL}?action=admin_get_form_history&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(adminToken)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return Array.isArray(data.historique) ? data.historique : [];
  }

  async function getFormNotificationsAdmin(adminToken) {
    if (!CONFIG.SHEET_API_URL) return [];
    const url = `${CONFIG.SHEET_API_URL}?action=admin_get_form_notifications&token=${encodeURIComponent(adminToken)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return Array.isArray(data.notifications) ? data.notifications : [];
  }

  async function markFormNotificationsRead(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true, count: 0 };
    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "mark_form_notifications_read",
        p: partenaireId,
        token: adminToken
      })
    });
    if (data.error) throw new Error(data.error);
    return data;
  }

  /* ═══ SECTION 5 — PROPOSITIONS PARTENAIRE / ADMIN ═══════════════════════ */
  async function getPropositions(partenaireId, token) {
    if (!CONFIG.SHEET_API_URL) return [];
    const url = `${CONFIG.SHEET_API_URL}?action=get_propositions&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(token)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.propositions || [];
  }

  async function getPropositionsAdmin(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return [];
    const url = `${CONFIG.SHEET_API_URL}?action=admin_get_propositions&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(adminToken)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.propositions || [];
  }

  async function savePropositions(partenaireId, adminToken, organisationIds) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true };
    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "save_propositions", p: partenaireId, token: adminToken, propositions: organisationIds })
    });
    if (data.error) throw new Error(data.error);
    return data;
  }


  /* ═══ SECTION 6 — VIVIER MODIFIABLE ════════════════════════════════════ */
  async function getVivierModifs() {
    if (!CONFIG.SHEET_API_URL) return [];
    const url = `${CONFIG.SHEET_API_URL}?action=get_vivier_modifs`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return Array.isArray(data.organisations) ? data.organisations : [];
  }

  async function saveOrganisation(adminToken, organisation) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true, id: organisation.id || "loc-demo" };
    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "save_organisation", token: adminToken, organisation })
    });
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function deleteOrganisation(adminToken, id) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true, id };
    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete_organisation", token: adminToken, id })
    });
    if (data.error) throw new Error(data.error);
    return data;
  }

  function resetCache() {
    _vivier = null;
  }

  function cleanOrg(modif) {
    const champs = ["id", "nom", "secteur", "type", "taille", "localisation", "description", "site_web", "theme"];
    const propre = {};

    champs.forEach(champ => {
      const valeur = String(modif?.[champ] ?? "").trim();
      if (champ === "id" || champ === "nom" || valeur !== "") propre[champ] = valeur;
    });

    const expertise = parseExpertise_(modif?.expertise);
    if (expertise.length) propre.expertise = expertise;
    return propre;
  }

  function parseExpertise_(value) {
    if (Array.isArray(value)) return [...new Set(value.map(v => String(v || "").trim()).filter(Boolean))];
    const text = String(value ?? "").trim();
    if (!text) return [];
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parseExpertise_(parsed);
      } catch (_) {}
    }
    return [...new Set(text.split(",").map(v => v.trim()).filter(Boolean))];
  }

  /* ═══ SECTION 7 — RÉFÉRENTIELS ═════════════════════════════════════════ */
  async function getReferentiels() {
    if (!CONFIG.SHEET_API_URL) return {};
    const url = `${CONFIG.SHEET_API_URL}?action=get_referentiels`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.referentiels || {};
  }

  async function addReferentiel(adminToken, categorie, valeur) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true, categorie, valeur };
    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "add_referentiel",
        token: adminToken,
        categorie,
        valeur
      })
    });
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function deleteReferentiel(adminToken, categorie, valeur, usageCount = 0) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true, categorie, valeur };
    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "delete_referentiel",
        token: adminToken,
        categorie,
        valeur,
        usage_count: Number(usageCount || 0)
      })
    });
    if (data.error) throw new Error(data.error);
    return data;
  }


  /* ═══ SECTION 7 — PLANIFICATION DES RENDEZ-VOUS ADMIN ══════════════════ */
  async function getRencontresAdmin(adminToken) {
    if (!CONFIG.SHEET_API_URL) return [];
    const url = `${CONFIG.SHEET_API_URL}?action=admin_get_rencontres&token=${encodeURIComponent(adminToken)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return Array.isArray(data.rencontres) ? data.rencontres : [];
  }

  async function saveRencontresAdmin(adminToken, rencontres) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true, count: rencontres.length };

    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "save_rencontres",
        token: adminToken,
        rencontres
      })
    });

    if (data.error) {
      const message = data.details
        ? `${data.error} — ${data.details}`
        : data.error;

      const error = new Error(message);
      error.code = data.code || "";
      error.details = data.details || "";

      throw error;
    }

    return data;
  }

  /* ═══ SECTION 7 — REQUÊTES HTTP ═════════════════════════════════════════ */
  function _fetchJSONP(url) {
    return new Promise((resolve, reject) => {
      const callback = `__conciergerie_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => finish(new Error("La vérification de l'enregistrement a dépassé le délai autorisé.")), CONFIG.TIMEOUT_MS);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove();
      }

      function finish(error, data) {
        cleanup();
        if (error) reject(error);
        else resolve(data);
      }

      window[callback] = data => finish(null, data);
      script.onerror = () => finish(new Error("Impossible de vérifier l'enregistrement auprès du serveur."));
      script.src = `${url}&callback=${encodeURIComponent(callback)}`;
      document.head.appendChild(script);
    });
  }

  async function _fetchJSON(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur HTTP " + res.status + ".");
      return data;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("La requête a dépassé le délai autorisé.");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /* ═══ SECTION 8 — REPLI LOCAL ═══════════════════════════════════════════ */
  const _local = {
    _m: {},
    get(partenaireId) { return this._m[partenaireId] ? [...this._m[partenaireId]] : []; },
    set(partenaireId, organisationIds) { this._m[partenaireId] = [...organisationIds]; }
  };

  /* ═══ SECTION 9 — API PUBLIQUE ══════════════════════════════════════════ */
  return {
    loadVivier,
    getPartenaire,
    getSelections,
    saveSelections,
    getRencontres,
    getSelectionsAdmin,
    getFormulaire,
    saveFormulaire,
    getFormulaireAdmin,
    getFormHistoryAdmin,
    getFormNotificationsAdmin,
    markFormNotificationsRead,
    getPropositions,
    getPropositionsAdmin,
    savePropositions,
    getVivierModifs,
    saveOrganisation,
    deleteOrganisation,
    getReferentiels,
    addReferentiel,
    deleteReferentiel,
    getRencontresAdmin,
    saveRencontresAdmin,
    resetCache,
    __test_mergeVivierOrganisations_: mergeVivierOrganisations_
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    mergeVivierOrganisations_: API.__test_mergeVivierOrganisations_
  };
}
