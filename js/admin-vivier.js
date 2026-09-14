/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-vivier.js
   VERSION : v52 — colonne rencontres à assurer par partenaire
   RÔLE    : Vue centrale du vivier et gestion privée des contacts.

   SÉCURITÉ :
   - les contacts sont lus/écrits uniquement via les routes ADMIN du backend ;
   - aucune donnée de contact n'est ajoutée à data.json ;
   - les IDs d'organisation restent sensibles à la casse.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — État, DOM et utilitaires                                       │
   │  2 — Requêtes privées Contacts                                      │
   │  3 — Construction de la vue Vivier                                  │
   │  4 — Chargement et fusion des données                               │
   │  5 — Filtres et tableau                                             │
   │  6 — Fiche organisation                                             │
   │  7 — Gestion des contacts                                           │
   │  8 — Suppressions avec modales intégrées                            │
   │  9 — Navigation et initialisation                                   │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  if (!document.querySelector("#admin-dashboard")) return;

  /* ═══ SECTION 1 — ÉTAT, DOM ET UTILITAIRES ════════════════════════════ */
  const params = new URLSearchParams(location.search);
  const adminToken = String(params.get("token") || "").trim();
  const exactId = value => String(value ?? "").trim();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escAttr = esc;

  const state = {
    loaded: false,
    loading: false,
    vivier: null,
    records: [],
    contacts: [],
    contactsByOrg: new Map(),
    partnerIds: new Set(),
    referentiels: null,
    segment: "all",
    search: "",
    secteur: "",
    type: "",
    taille: "",
    currentOrg: null,
    currentContact: null,
    pendingDelete: null
  };

  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function isVivierActive() {
    return document.querySelector("#vivierView")?.classList.contains("active");
  }

  function setStatus(message, kind = "") {
    const el = document.querySelector("#vivierStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = `vivier-status${kind ? ` ${kind}` : ""}`;
  }

  function toBool(value) {
    return value === true || String(value ?? "").toUpperCase() === "TRUE" || String(value ?? "") === "1";
  }

  function injectStyles() {
    if (document.querySelector("#adminVivierStyles")) return;
    const style = document.createElement("style");
    style.id = "adminVivierStyles";
    style.textContent = `
      .vivier-view{display:none}.vivier-view.active{display:block}
      .vivier-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}
      .vivier-head h2{font-family:var(--font-title);font-size:1.55rem;margin:3px 0 4px}.vivier-head p{margin:0;color:var(--gris-text);font-size:.9rem}
      .vivier-kicker{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--vert-dark)}
      .vivier-stats{display:grid;grid-template-columns:repeat(3,minmax(110px,1fr));gap:10px;margin-bottom:16px}
      .vivier-stat{background:var(--blanc);border:1px solid var(--gris-border);border-radius:var(--radius-md);padding:14px 16px}.vivier-stat strong{display:block;font-family:var(--font-title);font-size:1.35rem}.vivier-stat span{font-size:.76rem;color:var(--gris-text)}
      .vivier-toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap;background:var(--blanc);border:1px solid var(--gris-border);border-radius:var(--radius-md);padding:14px;margin-bottom:14px}
      .vivier-toolbar .filter-group{min-width:145px}.vivier-toolbar .filter-group.search{flex:1;min-width:220px}.vivier-toolbar input,.vivier-toolbar select{width:100%}
      .vivier-segments{display:inline-flex;background:var(--gris-light);border-radius:100px;padding:4px;gap:2px;margin-bottom:14px}.vivier-segments button{border:0;background:transparent;padding:7px 15px;border-radius:100px;cursor:pointer;font:600 .82rem var(--font-main);color:var(--gris-text)}.vivier-segments button.on{background:#fff;color:var(--noir);box-shadow:var(--shadow-sm)}
      .vivier-table-card{background:#fff;border:1px solid var(--gris-border);border-radius:var(--radius-md);overflow:hidden}.vivier-table-scroll{overflow:auto;max-height:calc(100vh - 380px)}
      #vivierTable{width:100%;border-collapse:collapse;font-size:.82rem}#vivierTable th{position:sticky;top:0;z-index:2;background:var(--gris-light);text-align:left;padding:11px 12px;white-space:nowrap;border-bottom:1px solid var(--gris-border)}#vivierTable td{padding:10px 12px;border-bottom:1px solid var(--gris-border);vertical-align:middle}#vivierTable tbody tr:hover{background:#fafcf9}
      .vivier-org-name{font-weight:700;color:var(--noir)}.vivier-org-id{display:block;margin-top:2px;color:var(--gris-text);font-size:.68rem}.vivier-contact-main{font-weight:600}.vivier-contact-sub{display:block;color:var(--gris-text);font-size:.72rem;margin-top:2px}
      .vivier-badge{display:inline-flex;align-items:center;border-radius:100px;padding:4px 9px;font-size:.7rem;font-weight:700;white-space:nowrap}.vivier-badge.partner{background:var(--vert-light);color:var(--vert-dark)}.vivier-badge.pool{background:var(--gris-light);color:var(--gris-text)}.vivier-badge.count{background:#f4f5f4;color:var(--noir)}
      .vivier-status{font-size:.78rem;color:var(--gris-text);margin-left:auto}.vivier-status.ok{color:var(--vert-dark)}.vivier-status.error{color:#b42318}
      .vivier-empty{padding:36px;text-align:center;color:var(--gris-text)}
      .vivier-modal[hidden],.vivier-confirm[hidden]{display:none!important}.vivier-modal,.vivier-confirm{position:fixed;inset:0;z-index:1600;background:rgba(11,13,12,.58);display:flex;align-items:center;justify-content:center;padding:24px}.vivier-modal-card{width:min(1050px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 22px 65px rgba(0,0,0,.2)}.vivier-modal-card.small{width:min(560px,94vw)}
      .vivier-modal-head{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--gris-border);position:sticky;top:0;background:#fff;z-index:3}.vivier-modal-head h3{font-family:var(--font-title);margin:0;font-size:1.15rem}.vivier-x{border:0;background:transparent;cursor:pointer;font-size:1.05rem;color:var(--gris-text)}
      .vivier-modal-body{padding:20px 22px}.vivier-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.vivier-field{display:flex;flex-direction:column;gap:6px}.vivier-field.full{grid-column:1/-1}.vivier-field label{font-size:.75rem;font-weight:700;color:var(--gris-text)}.vivier-field input,.vivier-field select,.vivier-field textarea{width:100%;border:1px solid var(--gris-border);border-radius:9px;padding:9px 10px;font:inherit;background:#fff}.vivier-field select[multiple]{min-height:118px}.vivier-field textarea{resize:vertical}
      .vivier-modal-actions{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:16px 22px;border-top:1px solid var(--gris-border);position:sticky;bottom:0;background:#fff}.vivier-actions-right{display:flex;gap:8px;margin-left:auto}
      .vivier-contacts-section{margin-top:24px;border-top:1px solid var(--gris-border);padding-top:20px}.vivier-contacts-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.vivier-contacts-head h4{font-family:var(--font-title);margin:0}.vivier-contact-list{display:flex;flex-direction:column;gap:8px}.vivier-contact-row{display:grid;grid-template-columns:1.4fr 1.1fr 1.4fr .9fr auto;gap:10px;align-items:center;border:1px solid var(--gris-border);border-radius:10px;padding:10px}.vivier-contact-row strong{font-size:.82rem}.vivier-contact-row span,.vivier-contact-row a{font-size:.75rem;color:var(--gris-text);overflow-wrap:anywhere}.vivier-contact-row .principal{color:var(--vert-dark);font-weight:700}.vivier-contact-actions{display:flex;gap:5px}
      .vivier-checkbox{display:flex;align-items:center;gap:8px;font-size:.82rem}.vivier-checkbox input{width:auto}
      .vivier-confirm-card{width:min(520px,92vw);background:#fff;border-radius:16px;padding:22px;box-shadow:0 22px 65px rgba(0,0,0,.2)}.vivier-confirm-card h3{font-family:var(--font-title);margin:0 0 8px}.vivier-confirm-card p{color:var(--gris-text);line-height:1.5}.vivier-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
      @media(max-width:900px){.vivier-form-grid{grid-template-columns:1fr}.vivier-contact-row{grid-template-columns:1fr 1fr}.vivier-contact-actions{grid-column:1/-1}.vivier-stats{grid-template-columns:1fr}.vivier-table-scroll{max-height:none}}
    `;
    document.head.appendChild(style);
  }

  /* ═══ SECTION 2 — REQUÊTES PRIVÉES CONTACTS ═══════════════════════════ */
  async function requestJson(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const maxAttempts = method === "GET" ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), Number(CONFIG.TIMEOUT_MS || 15000));
      try {
        const requestUrl = method === "GET" && attempt > 1
          ? `${url}${url.includes("?") ? "&" : "?"}_retry=${Date.now()}_${attempt}`
          : url;
        const response = await fetch(requestUrl, { ...options, cache: method === "GET" ? "no-store" : options.cache, signal: controller.signal });
        const text = await response.text();
        const trimmed = text.trim();
        if (trimmed.startsWith("<")) throw new Error("Réponse temporaire invalide du service de données.");
        const data = JSON.parse(text);
        if (!response.ok || data.error) throw new Error(data.error || `Erreur HTTP ${response.status}.`);
        return data;
      } catch (error) {
        if (attempt < maxAttempts && method === "GET") {
          await sleep(300 * attempt);
          continue;
        }
        if (error.name === "AbortError") throw new Error("La requête a dépassé le délai autorisé.");
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw new Error("Impossible de charger les données.");
  }

  function endpoint(action, extra = {}) {
    const url = new URL(CONFIG.SHEET_API_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("token", adminToken);
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
    });
    url.searchParams.set("_", Date.now());
    return url.toString();
  }

  async function getContacts() {
    if (!CONFIG.SHEET_API_URL) return [];
    const data = await requestJson(endpoint("admin_get_contacts"));
    return Array.isArray(data.contacts) ? data.contacts : [];
  }

  async function saveContact(contact) {
    const data = await requestJson(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "save_contact", token: adminToken, contact })
    });
    return data;
  }

  async function deleteContact(contactId) {
    return requestJson(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "delete_contact", token: adminToken, contact_id: contactId })
    });
  }

  async function syncForms() {
    return requestJson(CONFIG.SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "admin_sync_contacts_from_forms", token: adminToken })
    });
  }

  /* ═══ SECTION 3 — CONSTRUCTION DE LA VUE VIVIER ═══════════════════════ */
  function injectNavigation() {
    if (document.querySelector("#navVivier")) return;
    const navConciergerie = document.querySelector("#navConciergerie");
    if (!navConciergerie) return;
    const link = document.createElement("a");
    link.href = "#vivier";
    link.className = "nav-item";
    link.id = "navVivier";
    link.innerHTML = '<i class="fas fa-address-book"></i> Vivier';
    navConciergerie.insertAdjacentElement("afterend", link);
  }

  function injectView() {
    if (document.querySelector("#vivierView")) return;
    const main = document.querySelector(".admin-main");
    if (!main) return;

    const section = document.createElement("section");
    section.className = "admin-section vivier-view";
    section.id = "vivierView";
    section.innerHTML = `
      <div class="vivier-head">
        <div><span class="vivier-kicker">Base centrale</span><h2>Vivier</h2><p>Organisations et contacts privés de la Conciergerie.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-outline btn-sm" type="button" id="vivierSyncForms"><i class="fas fa-rotate"></i> Synchroniser les formulaires</button>
          <button class="btn btn-primary btn-sm" type="button" id="vivierAddOrg"><i class="fas fa-plus"></i> Ajouter une organisation</button>
        </div>
      </div>
      <div class="vivier-stats">
        <div class="vivier-stat"><strong id="vivierTotalOrgs">—</strong><span>Organisations</span></div>
        <div class="vivier-stat"><strong id="vivierTotalPartners">—</strong><span>Partenaires</span></div>
        <div class="vivier-stat"><strong id="vivierTotalContacts">—</strong><span>Contacts privés</span></div>
      </div>
      <div class="vivier-segments" id="vivierSegments">
        <button class="on" type="button" data-vivier-seg="all">Tous</button>
        <button type="button" data-vivier-seg="partners">Partenaires</button>
        <button type="button" data-vivier-seg="pool">Organisations du vivier</button>
      </div>
      <div class="vivier-toolbar">
        <div class="filter-group search"><label>Recherche</label><input id="vivierSearch" type="search" placeholder="Organisation, contact, email, secteur…"></div>
        <div class="filter-group"><label>Secteur</label><select id="vivierFilterSecteur"><option value="">Tous</option></select></div>
        <div class="filter-group"><label>Type</label><select id="vivierFilterType"><option value="">Tous</option></select></div>
        <div class="filter-group"><label>Taille</label><select id="vivierFilterTaille"><option value="">Toutes</option></select></div>
        <span class="vivier-status" id="vivierStatus"></span>
      </div>
      <div class="vivier-table-card"><div class="vivier-table-scroll">
        <table id="vivierTable"><thead><tr>
          <th>Organisation</th><th>Statut</th><th>Secteur</th><th>Expertise</th><th>Type</th><th>Taille</th><th>Contact principal</th><th>Email</th><th>Téléphone</th><th>Rencontres à assurer</th><th>Actions</th>
        </tr></thead><tbody id="vivierTbody"></tbody></table>
      </div></div>`;
    main.appendChild(section);

    injectModals();
  }

  function injectModals() {
    if (document.querySelector("#vivierOrgModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div class="vivier-modal" id="vivierOrgModal" hidden>
        <div class="vivier-modal-card" role="dialog" aria-modal="true" aria-labelledby="vivierOrgTitle">
          <div class="vivier-modal-head"><h3 id="vivierOrgTitle">Fiche organisation</h3><button class="vivier-x" type="button" data-close-vivier-org aria-label="Fermer"><i class="fas fa-times"></i></button></div>
          <div class="vivier-modal-body">
            <input id="vivierOrgId" type="hidden">
            <div class="vivier-form-grid">
              <div class="vivier-field full"><label>Nom *</label><input id="vivierOrgNom" type="text"></div>
              <div class="vivier-field"><label>Secteur</label><select id="vivierOrgSecteur"></select></div>
              <div class="vivier-field"><label>Type</label><select id="vivierOrgType"></select></div>
              <div class="vivier-field"><label>Taille</label><select id="vivierOrgTaille"></select></div>
              <div class="vivier-field"><label>Thème</label><select id="vivierOrgTheme"></select></div>
              <div class="vivier-field full"><label>Expertises</label><select id="vivierOrgExpertise" multiple></select></div>
              <div class="vivier-field full"><label>Localisation</label><input id="vivierOrgLocalisation" type="text"></div>
              <div class="vivier-field full"><label>Site web</label><input id="vivierOrgSite" type="url" placeholder="https://..."></div>
              <div class="vivier-field full"><label>Description</label><textarea id="vivierOrgDescription" rows="4"></textarea></div>
            </div>
            <section class="vivier-contacts-section">
              <div class="vivier-contacts-head"><div><h4>Contacts</h4><span class="vivier-contact-sub">Ces données restent privées côté administration.</span></div><button class="btn btn-outline btn-sm" type="button" id="vivierAddContact"><i class="fas fa-user-plus"></i> Ajouter un contact</button></div>
              <div id="vivierContactList" class="vivier-contact-list"></div>
            </section>
          </div>
          <div class="vivier-modal-actions"><button class="btn btn-danger btn-sm" type="button" id="vivierDeleteOrg" hidden><i class="fas fa-trash"></i> Supprimer</button><span class="vivier-status" id="vivierOrgStatus"></span><div class="vivier-actions-right"><button class="btn btn-outline btn-sm" type="button" data-close-vivier-org>Fermer</button><button class="btn btn-primary btn-sm" type="button" id="vivierSaveOrg"><i class="fas fa-floppy-disk"></i> Enregistrer l'organisation</button></div></div>
        </div>
      </div>

      <div class="vivier-modal" id="vivierContactModal" hidden>
        <div class="vivier-modal-card small" role="dialog" aria-modal="true" aria-labelledby="vivierContactTitle">
          <div class="vivier-modal-head"><h3 id="vivierContactTitle">Contact</h3><button class="vivier-x" type="button" data-close-vivier-contact aria-label="Fermer"><i class="fas fa-times"></i></button></div>
          <div class="vivier-modal-body"><input id="vivierContactId" type="hidden"><div class="vivier-form-grid">
            <div class="vivier-field full"><label>Nom *</label><input id="vivierContactNom" type="text"></div>
            <div class="vivier-field full"><label>Fonction</label><input id="vivierContactFonction" type="text"></div>
            <div class="vivier-field full"><label>Courriel</label><input id="vivierContactEmail" type="email"></div>
            <div class="vivier-field full"><label>Téléphone</label><input id="vivierContactTelephone" type="tel"></div>
            <div class="vivier-field full"><label>Rôle</label><input id="vivierContactRole" type="text" list="vivierContactRoles" placeholder="Participant aux rendez-vous"><datalist id="vivierContactRoles"><option value="Participant aux rendez-vous"><option value="Contact principal"><option value="Autre"></datalist></div>
            <div class="vivier-field full"><label class="vivier-checkbox"><input id="vivierContactPrincipal" type="checkbox"> Contact principal de l'organisation</label></div>
          </div><div class="vivier-status" id="vivierContactStatus"></div></div>
          <div class="vivier-modal-actions"><button class="btn btn-danger btn-sm" type="button" id="vivierDeleteContact" hidden><i class="fas fa-trash"></i> Supprimer</button><div class="vivier-actions-right"><button class="btn btn-outline btn-sm" type="button" data-close-vivier-contact>Annuler</button><button class="btn btn-primary btn-sm" type="button" id="vivierSaveContact"><i class="fas fa-floppy-disk"></i> Enregistrer</button></div></div>
        </div>
      </div>

      <div class="vivier-confirm" id="vivierConfirm" hidden><div class="vivier-confirm-card" role="dialog" aria-modal="true"><h3 id="vivierConfirmTitle">Confirmer</h3><p id="vivierConfirmText"></p><div class="vivier-status" id="vivierConfirmStatus"></div><div class="vivier-confirm-actions"><button class="btn btn-outline btn-sm" type="button" id="vivierConfirmCancel">Annuler</button><button class="btn btn-danger btn-sm" type="button" id="vivierConfirmOk">Supprimer</button></div></div></div>
    `);
  }

  /* ═══ SECTION 4 — CHARGEMENT ET FUSION DES DONNÉES ═══════════════════ */
  async function loadData(force = false) {
    if (state.loading) return;
    if (state.loaded && !force) { renderAll(); return; }
    if (!adminToken) { setStatus("Jeton administrateur manquant.", "error"); return; }

    state.loading = true;
    setStatus("Chargement des organisations…");

    try {
      /*
       * v36 — IMPORTANT : le vivier public est chargé et rendu AVANT les
       * contacts privés. La synchronisation des formulaires n'est plus
       * lancée automatiquement à l'ouverture : elle peut être coûteuse et
       * ne doit jamais bloquer l'affichage des organisations.
       */
      if (force) API.resetCache();
      const vivier = await API.loadVivier();
      state.vivier = vivier;
      state.contacts = [];
      buildRecords();
      state.loaded = true;
      renderAll();
      setStatus(`${state.records.length} organisation(s) chargée(s) · chargement des contacts…`);

      try {
        const contacts = await getContacts();
        state.contacts = contacts.map(c => ({ ...c, principal: toBool(c.principal) }));
        buildRecords();
        renderAll();
        setStatus(`${state.records.length} organisation(s) · ${state.contacts.length} contact(s).`, "ok");
      } catch (contactError) {
        console.warn("Contacts privés indisponibles :", contactError);
        setStatus(`Vivier chargé. Contacts privés indisponibles : ${contactError.message || "erreur de lecture"}`, "error");
      }
    } catch (error) {
      state.loaded = false;
      setStatus(error.message || "Impossible de charger les organisations du vivier.", "error");
    } finally {
      state.loading = false;
    }
  }

  function buildRecords() {
    const orgs = Array.isArray(state.vivier?.organisations) ? state.vivier.organisations : [];
    const partners = Array.isArray(state.vivier?.partenaires) ? state.vivier.partenaires : [];
    state.partnerIds = new Set(partners.map(p => exactId(p.id)).filter(Boolean));
    const map = new Map();

    orgs.forEach(org => {
      const id = exactId(org.id);
      if (id) map.set(id, { ...org, id, isPartner: state.partnerIds.has(id) });
    });

    partners.forEach(partner => {
      const id = exactId(partner.id);
      if (!id) return;
      const current = map.get(id) || {};
      map.set(id, {
        ...current,
        id,
        nom: String(current.nom || partner.nom || id).trim(),
        meeting_quota: partner.meeting_quota ?? current.meeting_quota ?? "",
        isPartner: true
      });
    });

    state.contactsByOrg = new Map();
    state.contacts.forEach(contact => {
      const orgId = exactId(contact.organisation_id);
      if (!orgId) return;
      if (!state.contactsByOrg.has(orgId)) state.contactsByOrg.set(orgId, []);
      state.contactsByOrg.get(orgId).push(contact);
    });

    state.records = [...map.values()].sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
  }

  /* ═══ SECTION 5 — FILTRES ET TABLEAU ══════════════════════════════════ */
  function contactFor(orgId) {
    const list = state.contactsByOrg.get(exactId(orgId)) || [];
    return list.find(c => c.principal) || list.find(c => /participant/i.test(String(c.role || ""))) || list[0] || null;
  }

  function fillFilters() {
    const unique = key => [...new Set(state.records.map(r => String(r[key] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    const fill = (id, values, label) => {
      const select = document.querySelector(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value="">${label}</option>${values.map(v => `<option value="${escAttr(v)}">${esc(v)}</option>`).join("")}`;
      select.value = values.includes(current) ? current : "";
    };
    fill("#vivierFilterSecteur", unique("secteur"), "Tous");
    fill("#vivierFilterType", unique("type"), "Tous");
    fill("#vivierFilterTaille", unique("taille"), "Toutes");
  }

  function filteredRecords() {
    return state.records.filter(org => {
      if (state.segment === "partners" && !org.isPartner) return false;
      if (state.segment === "pool" && org.isPartner) return false;
      if (state.secteur && String(org.secteur || "").trim() !== state.secteur) return false;
      if (state.type && String(org.type || "").trim() !== state.type) return false;
      if (state.taille && String(org.taille || "").trim() !== state.taille) return false;

      if (state.search) {
        const contacts = state.contactsByOrg.get(org.id) || [];
        const text = [org.nom, org.secteur, org.type, org.taille, org.localisation, ...(Array.isArray(org.expertise) ? org.expertise : [org.expertise]), ...contacts.flatMap(c => [c.nom, c.fonction, c.email, c.telephone, c.role])]
          .map(v => String(v ?? "").trim()).filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(state.search)) return false;
      }
      return true;
    });
  }

  function renderAll() {
    fillFilters();
    const partners = state.records.filter(r => r.isPartner).length;
    document.querySelector("#vivierTotalOrgs").textContent = state.records.length;
    document.querySelector("#vivierTotalPartners").textContent = partners;
    document.querySelector("#vivierTotalContacts").textContent = state.contacts.length;

    document.querySelectorAll("#vivierSegments [data-vivier-seg]").forEach(button => {
      button.classList.toggle("on", button.dataset.vivierSeg === state.segment);
      const count = button.dataset.vivierSeg === "all" ? state.records.length : button.dataset.vivierSeg === "partners" ? partners : state.records.length - partners;
      const base = button.dataset.vivierSeg === "all" ? "Tous" : button.dataset.vivierSeg === "partners" ? "Partenaires" : "Organisations du vivier";
      button.textContent = `${base} (${count})`;
    });
    renderTable();
  }

  function renderTable() {
    const tbody = document.querySelector("#vivierTbody");
    if (!tbody) return;
    const rows = filteredRecords();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="vivier-empty">Aucune organisation ne correspond aux filtres.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(org => {
      const contacts = state.contactsByOrg.get(org.id) || [];
      const main = contactFor(org.id);
      return `<tr>
        <td><span class="vivier-org-name">${esc(org.nom || "—")}</span><span class="vivier-org-id">${esc(org.id)}</span></td>
        <td><span class="vivier-badge ${/partenaire/i.test(String(org.statut || "")) ? "partner" : "pool"}">${esc(String(org.statut || "—"))}</span></td>
        <td>${esc(org.secteur || "—")}</td>
        <td>${esc(Array.isArray(org.expertise) ? org.expertise.filter(Boolean).join(", ") : (org.expertise || "—"))}</td>
        <td>${esc(org.type || "—")}</td>
        <td>${esc(org.taille || "—")}</td>
        <td>${main ? `<span class="vivier-contact-main">${esc(main.nom || "—")}</span><span class="vivier-contact-sub">${esc(main.fonction || main.role || "")}</span>` : "—"}</td>
        <td>${main?.email ? `<a href="mailto:${escAttr(main.email)}">${esc(main.email)}</a>` : "—"}</td>
        <td>${main?.telephone ? `<a href="tel:${escAttr(main.telephone)}">${esc(main.telephone)}</a>` : "—"}</td>
        <td>${org.isPartner && String(org.meeting_quota ?? "").trim() ? `<span class="vivier-badge count">${esc(org.meeting_quota)}</span>` : "—"}</td>
        <td><button class="btn btn-outline btn-sm" type="button" data-vivier-open="${escAttr(org.id)}"><i class="fas fa-pen-to-square"></i> Modifier</button></td>
      </tr>`;
    }).join("");
  }

  /* ═══ SECTION 6 — FICHE ORGANISATION ══════════════════════════════════ */
  async function ensureReferences() {
    if (state.referentiels) return state.referentiels;
    state.referentiels = await API.getReferentiels();
    return state.referentiels;
  }

  function setOptions(selectId, values, current, emptyLabel = "—") {
    const select = document.querySelector(selectId);
    if (!select) return;
    const list = [...new Set([...(Array.isArray(values) ? values : []), ...(current && !Array.isArray(current) ? [current] : [])].map(v => String(v || "").trim()).filter(Boolean))];
    select.innerHTML = `<option value="">${emptyLabel}</option>${list.map(v => `<option value="${escAttr(v)}">${esc(v)}</option>`).join("")}`;
    select.value = String(current || "").trim();
  }

  function setMultiOptions(selectId, values, currentValues) {
    const select = document.querySelector(selectId);
    if (!select) return;
    const current = Array.isArray(currentValues) ? currentValues.map(v => String(v || "").trim()).filter(Boolean) : String(currentValues || "").split(",").map(v => v.trim()).filter(Boolean);
    const list = [...new Set([...(Array.isArray(values) ? values : []), ...current].map(v => String(v || "").trim()).filter(Boolean))];
    select.innerHTML = list.map(v => `<option value="${escAttr(v)}"${current.includes(v) ? " selected" : ""}>${esc(v)}</option>`).join("");
  }

  async function openOrg(org = null) {
    const refs = await ensureReferences().catch(() => ({}));
    state.currentOrg = org ? { ...org } : { id: "", nom: "", expertise: [] };
    document.querySelector("#vivierOrgTitle").textContent = org ? `Fiche · ${org.nom || org.id}` : "Nouvelle organisation";
    document.querySelector("#vivierOrgId").value = state.currentOrg.id || "";
    document.querySelector("#vivierOrgNom").value = state.currentOrg.nom || "";
    setOptions("#vivierOrgSecteur", refs.secteur, state.currentOrg.secteur, "Aucun");
    setOptions("#vivierOrgType", refs.type, state.currentOrg.type, "Aucun");
    setOptions("#vivierOrgTaille", refs.taille, state.currentOrg.taille, "Aucune");
    setOptions("#vivierOrgTheme", refs.theme, state.currentOrg.theme || state.currentOrg.thematique, "Aucun");
    setMultiOptions("#vivierOrgExpertise", refs.expertise, state.currentOrg.expertise);
    document.querySelector("#vivierOrgLocalisation").value = state.currentOrg.localisation || "";
    document.querySelector("#vivierOrgSite").value = state.currentOrg.site_web || "";
    document.querySelector("#vivierOrgDescription").value = state.currentOrg.description || "";
    document.querySelector("#vivierDeleteOrg").hidden = !/^loc-\d+$/.test(state.currentOrg.id || "");
    document.querySelector("#vivierAddContact").disabled = !state.currentOrg.id;
    document.querySelector("#vivierOrgStatus").textContent = state.currentOrg.id ? "" : "Enregistrez d'abord l'organisation avant d'ajouter un contact.";
    renderContactList();
    document.querySelector("#vivierOrgModal").hidden = false;
  }

  function closeOrg() {
    document.querySelector("#vivierOrgModal").hidden = true;
    state.currentOrg = null;
  }

  async function saveOrg() {
    const status = document.querySelector("#vivierOrgStatus");
    const nom = document.querySelector("#vivierOrgNom").value.trim();
    if (!nom) { status.textContent = "Le nom de l'organisation est requis."; status.className = "vivier-status error"; return; }

    const expertise = [...document.querySelector("#vivierOrgExpertise").selectedOptions].map(option => option.value).filter(Boolean);
    const org = {
      id: document.querySelector("#vivierOrgId").value.trim(), nom,
      secteur: document.querySelector("#vivierOrgSecteur").value,
      type: document.querySelector("#vivierOrgType").value,
      taille: document.querySelector("#vivierOrgTaille").value,
      theme: document.querySelector("#vivierOrgTheme").value,
      expertise,
      localisation: document.querySelector("#vivierOrgLocalisation").value.trim(),
      site_web: document.querySelector("#vivierOrgSite").value.trim(),
      description: document.querySelector("#vivierOrgDescription").value.trim()
    };

    status.textContent = "Enregistrement…"; status.className = "vivier-status";
    try {
      const result = await API.saveOrganisation(adminToken, org);
      const id = exactId(result.id || org.id);
      document.querySelector("#vivierOrgId").value = id;
      state.currentOrg = { ...org, id, isPartner: state.partnerIds.has(id) };
      document.querySelector("#vivierAddContact").disabled = false;
      document.querySelector("#vivierDeleteOrg").hidden = !/^loc-\d+$/.test(id);
      status.textContent = "Organisation enregistrée."; status.className = "vivier-status ok";
      await loadData(true);
      const refreshed = state.records.find(item => item.id === id) || state.currentOrg;
      state.currentOrg = refreshed;
      document.querySelector("#vivierOrgTitle").textContent = `Fiche · ${refreshed.nom || id}`;
      renderContactList();
    } catch (error) {
      status.textContent = error.message || "Enregistrement impossible."; status.className = "vivier-status error";
    }
  }

  /* ═══ SECTION 7 — GESTION DES CONTACTS ════════════════════════════════ */
  function orgContacts() {
    return state.currentOrg ? (state.contactsByOrg.get(exactId(state.currentOrg.id)) || []) : [];
  }

  function renderContactList() {
    const listEl = document.querySelector("#vivierContactList");
    if (!listEl) return;
    if (!state.currentOrg?.id) {
      listEl.innerHTML = '<div class="vivier-empty">Enregistrez l’organisation pour gérer ses contacts.</div>';
      return;
    }
    const list = orgContacts();
    if (!list.length) {
      listEl.innerHTML = '<div class="vivier-empty">Aucun contact enregistré pour cette organisation.</div>';
      return;
    }
    listEl.innerHTML = list.map(contact => `
      <div class="vivier-contact-row">
        <div><strong>${esc(contact.nom || "—")}</strong>${contact.principal ? '<span class="vivier-contact-sub principal"><i class="fas fa-star"></i> Principal</span>' : ""}</div>
        <span>${esc(contact.fonction || contact.role || "—")}</span>
        <span>${contact.email ? `<a href="mailto:${escAttr(contact.email)}">${esc(contact.email)}</a>` : "—"}</span>
        <span>${esc(contact.telephone || "—")}</span>
        <div class="vivier-contact-actions"><button class="btn btn-outline btn-sm" type="button" data-edit-contact="${escAttr(contact.contact_id)}"><i class="fas fa-pen"></i></button></div>
      </div>`).join("");
  }

  function openContact(contact = null) {
    if (!state.currentOrg?.id) return;
    state.currentContact = contact ? { ...contact } : null;
    document.querySelector("#vivierContactTitle").textContent = contact ? "Modifier le contact" : "Ajouter un contact";
    document.querySelector("#vivierContactId").value = contact?.contact_id || "";
    document.querySelector("#vivierContactNom").value = contact?.nom || "";
    document.querySelector("#vivierContactFonction").value = contact?.fonction || "";
    document.querySelector("#vivierContactEmail").value = contact?.email || "";
    document.querySelector("#vivierContactTelephone").value = contact?.telephone || "";
    document.querySelector("#vivierContactRole").value = contact?.role || "";
    document.querySelector("#vivierContactPrincipal").checked = Boolean(contact?.principal);
    document.querySelector("#vivierDeleteContact").hidden = !contact?.contact_id;
    const status = document.querySelector("#vivierContactStatus"); status.textContent = ""; status.className = "vivier-status";
    document.querySelector("#vivierContactModal").hidden = false;
  }

  function closeContact() {
    document.querySelector("#vivierContactModal").hidden = true;
    state.currentContact = null;
  }

  async function persistContact() {
    const status = document.querySelector("#vivierContactStatus");
    const nom = document.querySelector("#vivierContactNom").value.trim();
    if (!nom) { status.textContent = "Le nom du contact est requis."; status.className = "vivier-status error"; return; }
    const contact = {
      contact_id: document.querySelector("#vivierContactId").value.trim(),
      organisation_id: state.currentOrg.id,
      nom,
      fonction: document.querySelector("#vivierContactFonction").value.trim(),
      email: document.querySelector("#vivierContactEmail").value.trim(),
      telephone: document.querySelector("#vivierContactTelephone").value.trim(),
      role: document.querySelector("#vivierContactRole").value.trim(),
      principal: document.querySelector("#vivierContactPrincipal").checked,
      source: state.currentContact?.source || "Admin"
    };
    status.textContent = "Enregistrement…"; status.className = "vivier-status";
    try {
      await saveContact(contact);
      state.contacts = await getContacts();
      state.contacts = state.contacts.map(c => ({ ...c, principal: toBool(c.principal) }));
      buildRecords();
      renderAll();
      const orgId = state.currentOrg.id;
      state.currentOrg = state.records.find(r => r.id === orgId) || state.currentOrg;
      renderContactList();
      closeContact();
      document.querySelector("#vivierOrgStatus").textContent = "Contact enregistré.";
      document.querySelector("#vivierOrgStatus").className = "vivier-status ok";
    } catch (error) {
      status.textContent = error.message || "Enregistrement impossible."; status.className = "vivier-status error";
    }
  }

  /* ═══ SECTION 8 — SUPPRESSIONS AVEC MODALES INTÉGRÉES ════════════════ */
  function askDelete(kind, item) {
    state.pendingDelete = { kind, item };
    document.querySelector("#vivierConfirmTitle").textContent = kind === "contact" ? "Supprimer le contact" : "Supprimer l'organisation";
    document.querySelector("#vivierConfirmText").textContent = kind === "contact"
      ? `Supprimer définitivement le contact « ${item.nom || item.contact_id} » ?`
      : `Supprimer définitivement l'organisation locale « ${item.nom || item.id} » ?`;
    document.querySelector("#vivierConfirmStatus").textContent = "";
    document.querySelector("#vivierConfirm").hidden = false;
  }

  function closeConfirm() {
    document.querySelector("#vivierConfirm").hidden = true;
    state.pendingDelete = null;
  }

  async function confirmDelete() {
    const pending = state.pendingDelete;
    if (!pending) return;
    const status = document.querySelector("#vivierConfirmStatus");
    status.textContent = "Suppression…"; status.className = "vivier-status";
    try {
      if (pending.kind === "contact") {
        await deleteContact(pending.item.contact_id);
        state.contacts = (await getContacts()).map(c => ({ ...c, principal: toBool(c.principal) }));
        buildRecords(); renderAll(); renderContactList(); closeContact();
        document.querySelector("#vivierOrgStatus").textContent = "Contact supprimé.";
        document.querySelector("#vivierOrgStatus").className = "vivier-status ok";
      } else {
        await API.deleteOrganisation(adminToken, pending.item.id);
        closeOrg();
        await loadData(true);
        setStatus("Organisation supprimée.", "ok");
      }
      closeConfirm();
    } catch (error) {
      status.textContent = error.message || "Suppression impossible."; status.className = "vivier-status error";
    }
  }

  /* ═══ SECTION 9 — NAVIGATION ET INITIALISATION ════════════════════════ */
  function showVivier(pushHistory = true) {
    const view = document.querySelector("#vivierView");
    if (!view) return;
    document.querySelector("#partnerAdminView")?.classList.remove("active");
    document.querySelector("#conciergerieView")?.classList.remove("active");
    view.classList.add("active");
    document.querySelector("#navConciergerie")?.classList.remove("active");
    document.querySelector("#navVivier")?.classList.add("active");
    document.querySelectorAll("#sidebarNav .nav-item").forEach(link => link.classList.remove("active"));
    const title = document.querySelector("#adminTitle"); if (title) title.textContent = "Vivier";

    if (pushHistory && location.hash !== "#vivier") {
      history.pushState({ view: "vivier" }, "", `${location.pathname}${location.search}#vivier`);
    }
    loadData();
  }

  function hideVivier() {
    document.querySelector("#vivierView")?.classList.remove("active");
    document.querySelector("#navVivier")?.classList.remove("active");
  }

  function bindEvents() {
    document.querySelector("#navVivier")?.addEventListener("click", event => { event.preventDefault(); showVivier(true); });
    document.querySelector("#vivierSegments")?.addEventListener("click", event => {
      const button = event.target.closest("[data-vivier-seg]"); if (!button) return;
      state.segment = button.dataset.vivierSeg || "all"; renderAll();
    });
    document.querySelector("#vivierSearch")?.addEventListener("input", event => { state.search = event.target.value.toLowerCase().trim(); renderTable(); });
    document.querySelector("#vivierFilterSecteur")?.addEventListener("change", event => { state.secteur = event.target.value; renderTable(); });
    document.querySelector("#vivierFilterType")?.addEventListener("change", event => { state.type = event.target.value; renderTable(); });
    document.querySelector("#vivierFilterTaille")?.addEventListener("change", event => { state.taille = event.target.value; renderTable(); });
    document.querySelector("#vivierTbody")?.addEventListener("click", event => {
      const button = event.target.closest("[data-vivier-open]"); if (!button) return;
      const org = state.records.find(item => item.id === button.dataset.vivierOpen); if (org) openOrg(org);
    });
    document.querySelector("#vivierAddOrg")?.addEventListener("click", () => openOrg());
    document.querySelector("#vivierSyncForms")?.addEventListener("click", async () => {
      setStatus("Synchronisation des formulaires…");
      try {
        const result = await syncForms();
        sessionStorage.setItem("conciergerie_contacts_synced_v35", "1");
        state.contacts = (await getContacts()).map(c => ({ ...c, principal: toBool(c.principal) }));
        buildRecords(); renderAll();
        setStatus(`${Number(result.count || 0)} contact(s) synchronisé(s).`, "ok");
      } catch (error) { setStatus(error.message || "Synchronisation impossible.", "error"); }
    });

    document.querySelectorAll("[data-close-vivier-org]").forEach(button => button.addEventListener("click", closeOrg));
    document.querySelector("#vivierSaveOrg")?.addEventListener("click", saveOrg);
    document.querySelector("#vivierDeleteOrg")?.addEventListener("click", () => state.currentOrg && askDelete("organisation", state.currentOrg));
    document.querySelector("#vivierAddContact")?.addEventListener("click", () => openContact());
    document.querySelector("#vivierContactList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-edit-contact]"); if (!button) return;
      const contact = orgContacts().find(item => item.contact_id === button.dataset.editContact); if (contact) openContact(contact);
    });
    document.querySelectorAll("[data-close-vivier-contact]").forEach(button => button.addEventListener("click", closeContact));
    document.querySelector("#vivierSaveContact")?.addEventListener("click", persistContact);
    document.querySelector("#vivierDeleteContact")?.addEventListener("click", () => state.currentContact && askDelete("contact", state.currentContact));
    document.querySelector("#vivierConfirmCancel")?.addEventListener("click", closeConfirm);
    document.querySelector("#vivierConfirmOk")?.addEventListener("click", confirmDelete);

    document.querySelector("#vivierOrgModal")?.addEventListener("click", event => { if (event.target.id === "vivierOrgModal") closeOrg(); });
    document.querySelector("#vivierContactModal")?.addEventListener("click", event => { if (event.target.id === "vivierContactModal") closeContact(); });
    document.querySelector("#vivierConfirm")?.addEventListener("click", event => { if (event.target.id === "vivierConfirm") closeConfirm(); });

    // Quand on quitte le Vivier vers une vue existante, le module ne doit pas
    // rester actif derrière la vue Conciergerie ou la fiche partenaire.
    document.addEventListener("click", event => {
      if (event.target.closest("#navConciergerie") || event.target.closest("#sidebarNav [data-partner-id]")) hideVivier();
    }, true);

    // Le bouton global "Ajouter une organisation" est réutilisé dans le Vivier
    // sans déclencher en parallèle l'ancienne modale de la vue partenaire.
    document.querySelector("#addOrganisation")?.addEventListener("click", event => {
      if (!isVivierActive()) return;
      event.preventDefault(); event.stopImmediatePropagation(); openOrg();
    }, true);

    const restoreFromHistory = () => window.setTimeout(() => {
      if (location.hash === "#vivier") showVivier(false); else hideVivier();
    }, 0);
    window.addEventListener("popstate", restoreFromHistory);
    window.addEventListener("hashchange", restoreFromHistory);
  }

  function init() {
    injectStyles(); injectNavigation(); injectView(); bindEvents();
    if (location.hash === "#vivier") window.setTimeout(() => showVivier(false), 0);
  }

  init();
})();
