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
   │  1 — Chargement du vivier                                            │
   │  2 — Utilitaires du vivier                                           │
   │  3 — Sélections partenaire / admin                                   │
   │  4 — Formulaire partenaire                                           │
   │  5 — Propositions partenaire / admin                                 │
   │  6 — Requêtes HTTP                                                   │
   │  7 — Repli local                                                     │
   │  8 — API publique                                                    │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */

const API = (() => {

  let _vivier = null;


  /* ═══ SECTION 1 — CHARGEMENT DU VIVIER ═════════════════════════════════ */

  async function loadVivier() {
    if (_vivier) return _vivier;

    const res = await fetch(CONFIG.DATA_URL, { cache: "no-store" });

    if (!res.ok) {
      throw new Error("Impossible de charger le vivier (" + res.status + ").");
    }

    _vivier = await res.json();
    return _vivier;
  }


  /* ═══ SECTION 2 — UTILITAIRES DU VIVIER ════════════════════════════════ */

  function getPartenaire(vivier, partenaireId) {
    return vivier.partenaires.find(partenaire => partenaire.id === partenaireId) || null;
  }

  /*
   * Compatibilité temporaire avec l'ancienne interface.
   *
   * Historiquement, les propositions étaient présentes dans data.json.
   * Elles sont désormais enregistrées dans Google Sheet et doivent être
   * récupérées via getPropositions() ou getPropositionsAdmin().
   *
   * Cette fonction reste temporairement afin de ne pas casser les pages
   * existantes avant leur migration.
   */
  function organisationsProposees(vivier, partenaireId) {
    const propositions = Array.isArray(vivier.propositions) ? vivier.propositions : [];

    const ids = propositions
      .filter(proposition => proposition.partenaire_id === partenaireId)
      .map(proposition => proposition.organisation_id);

    return vivier.organisations.filter(organisation => ids.includes(organisation.id));
  }


  /* ═══ SECTION 3 — SÉLECTIONS PARTENAIRE / ADMIN ═════════════════════════ */

  // Lit les organisations sélectionnées par un partenaire.
  async function getSelections(partenaireId, token) {
    if (!CONFIG.SHEET_API_URL) return _local.get(partenaireId);

    const url =
      `${CONFIG.SHEET_API_URL}?action=get` +
      `&p=${encodeURIComponent(partenaireId)}` +
      `&token=${encodeURIComponent(token)}`;

    const data = await _fetchJSON(url);

    if (data.error) throw new Error(data.error);
    return data.selections || [];
  }

  // Remplace la sélection complète d'un partenaire.
  async function saveSelections(partenaireId, token, organisationIds) {
    if (!CONFIG.SHEET_API_URL) {
      _local.set(partenaireId, organisationIds);
      return { ok: true, demo: true };
    }

    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "save",
        p: partenaireId,
        token,
        selections: organisationIds
      })
    });

    if (data.error) throw new Error(data.error);
    return data;
  }

  // Lit les sélections d'un partenaire depuis l'administration.
  async function getSelectionsAdmin(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return _local.get(partenaireId);

    const url =
      `${CONFIG.SHEET_API_URL}?action=admin_get` +
      `&p=${encodeURIComponent(partenaireId)}` +
      `&token=${encodeURIComponent(adminToken)}`;

    const data = await _fetchJSON(url);

    if (data.error) throw new Error(data.error);
    return data.selections || [];
  }


  /* ═══ SECTION 4 — FORMULAIRE PARTENAIRE ═════════════════════════════════ */

  // Enregistre ou met à jour le formulaire de besoins d'un partenaire.
  async function saveFormulaire(partenaireId, token, reponses) {
    if (!CONFIG.SHEET_API_URL) {
      return { ok: true, demo: true };
    }

    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "save_formulaire",
        p: partenaireId,
        token,
        reponses
      })
    });

    if (data.error) throw new Error(data.error);
    return data;
  }


  /* ═══ SECTION 5 — PROPOSITIONS PARTENAIRE / ADMIN ═══════════════════════ */

  // Lit les organisations proposées à un partenaire.
  async function getPropositions(partenaireId, token) {
    if (!CONFIG.SHEET_API_URL) return [];

    const url =
      `${CONFIG.SHEET_API_URL}?action=get_propositions` +
      `&p=${encodeURIComponent(partenaireId)}` +
      `&token=${encodeURIComponent(token)}`;

    const data = await _fetchJSON(url);

    if (data.error) throw new Error(data.error);
    return data.propositions || [];
  }

  // Lit les propositions d'un partenaire depuis l'administration.
  async function getPropositionsAdmin(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return [];

    const url =
      `${CONFIG.SHEET_API_URL}?action=admin_get_propositions` +
      `&p=${encodeURIComponent(partenaireId)}` +
      `&token=${encodeURIComponent(adminToken)}`;

    const data = await _fetchJSON(url);

    if (data.error) throw new Error(data.error);
    return data.propositions || [];
  }

  // Remplace la liste complète des propositions d'un partenaire.
  async function savePropositions(partenaireId, adminToken, organisationIds) {
    if (!CONFIG.SHEET_API_URL) {
      return { ok: true, demo: true };
    }

    const data = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "save_propositions",
        p: partenaireId,
        token: adminToken,
        propositions: organisationIds
      })
    });

    if (data.error) throw new Error(data.error);
    return data;
  }


  /* ═══ SECTION 6 — REQUÊTES HTTP ═════════════════════════════════════════ */

  async function _fetchJSON(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erreur HTTP " + res.status + ".");
      }

      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("La requête a dépassé le délai autorisé.");
      }

      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }


  /* ═══ SECTION 7 — REPLI LOCAL ═══════════════════════════════════════════ */

  /*
   * Repli utilisé uniquement lorsque CONFIG.SHEET_API_URL est vide.
   * Il permet de conserver le fonctionnement historique des sélections
   * sans modifier l'architecture du backend réel.
   */
  const _local = {
    _m: {},

    get(partenaireId) {
      return this._m[partenaireId] ? [...this._m[partenaireId]] : [];
    },

    set(partenaireId, organisationIds) {
      this._m[partenaireId] = [...organisationIds];
    }
  };


  /* ═══ SECTION 8 — API PUBLIQUE ══════════════════════════════════════════ */

  return {
    loadVivier,
    getPartenaire,
    organisationsProposees,

    getSelections,
    saveSelections,
    getSelectionsAdmin,

    saveFormulaire,

    getPropositions,
    getPropositionsAdmin,
    savePropositions
  };

})();
