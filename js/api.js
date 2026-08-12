/* ============================================================
   api.js — Couche d'accès aux données
   - Vivier (organisations, partenaires, propositions) : data.json, LECTURE SEULE
   - Sélections + formulaires partenaires : Google Sheet via Apps Script, LECTURE + ÉCRITURE
   Aucune clé Airtable n'apparaît ici : le vivier vient d'un JSON statique.
   ============================================================ */
const API = (() => {

  let _vivier = null; // cache mémoire du data.json

  /* ---- Vivier (data.json) ---- */
  async function loadVivier() {
    if (_vivier) return _vivier;
    const res = await fetch(CONFIG.DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Impossible de charger le vivier (" + res.status + ").");
    _vivier = await res.json();
    return _vivier;
  }

  function getPartenaire(v, id) {
    return v.partenaires.find(p => p.id === id) || null;
  }

  // Organisations proposées à un partenaire (jointure propositions × organisations).
  function organisationsProposees(v, partenaireId) {
    const ids = v.propositions
      .filter(p => p.partenaire_id === partenaireId)
      .map(p => p.organisation_id);
    return v.organisations.filter(o => ids.includes(o.id));
  }

  /* ---- Sélections (Google Sheet / Apps Script) ---- */

  // Lit les sélections d'un partenaire → renvoie un tableau d'organisation_id.
  async function getSelections(partenaireId, token) {
    if (!CONFIG.SHEET_API_URL) return _local.get(partenaireId); // mode démo
    const url = `${CONFIG.SHEET_API_URL}?action=get&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(token)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.selections || [];
  }

  // Enregistre la sélection complète (remplace l'existante) pour un partenaire.
  async function saveSelections(partenaireId, token, organisationIds) {
    if (!CONFIG.SHEET_API_URL) { _local.set(partenaireId, organisationIds); return { ok: true, demo: true }; }
    const res = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite le pre-flight CORS
      body: JSON.stringify({ action: "save", p: partenaireId, token, selections: organisationIds })
    });
    if (res.error) throw new Error(res.error);
    return res;
  }

  // Enregistre ou met à jour le formulaire de besoins d'un partenaire.
  async function saveFormulaire(partenaireId, token, reponses) {
    if (!CONFIG.SHEET_API_URL) return { ok: true, demo: true };
    const res = await _fetchJSON(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite le pre-flight CORS
      body: JSON.stringify({ action: "save_formulaire", p: partenaireId, token, reponses })
    });
    if (res.error) throw new Error(res.error);
    return res;
  }

  // Pour l'admin : toutes les sélections d'un partenaire (lecture, jeton admin).
  async function getSelectionsAdmin(partenaireId, adminToken) {
    if (!CONFIG.SHEET_API_URL) return _local.get(partenaireId);
    const url = `${CONFIG.SHEET_API_URL}?action=admin_get&p=${encodeURIComponent(partenaireId)}&token=${encodeURIComponent(adminToken)}`;
    const data = await _fetchJSON(url);
    if (data.error) throw new Error(data.error);
    return data.selections || [];
  }

  /* ---- Utilitaires ---- */
  async function _fetchJSON(url, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONFIG.TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      return await res.json();
    } finally { clearTimeout(t); }
  }

  // Repli en mémoire quand SHEET_API_URL est vide (pour tester l'UX sans backend).
  const _local = {
    _m: {},
    get(p) { return this._m[p] ? [...this._m[p]] : []; },
    set(p, arr) { this._m[p] = [...arr]; }
  };

  return { loadVivier, getPartenaire, organisationsProposees, getSelections, saveSelections, saveFormulaire, getSelectionsAdmin };
})();
