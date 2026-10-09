/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-contacts.js
   VERSION : v2 — répertoire complet avec contacts hors vivier
   RÔLE    : Vue Contacts privée de la Conciergerie MTLC 2026.

   RÈGLES :
   - Les contacts importés depuis "Pertinents" arrivent À VALIDER.
   - Ils n'apparaissent pas dans les menus RDV avant activation.
   - "Activer comme contact" les rend disponibles dans les menus RDV.
   - "Ne pas afficher" les exclut des menus RDV.
   - Les contacts Airtable / formulaire restent actifs par défaut.
   - Le contact principal reste prioritaire et visible comme tel.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — État et utilitaires                                            │
   │  2 — Navigation et vue                                              │
   │  3 — Chargement et contrôles                                        │
   │  4 — Rendu groupé par organisation                                  │
   │  5 — Activation / exclusion                                         │
   │  6 — Événements                                                     │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const IMPORT_SOURCE = "Participants MTL connecte 2026";
  const ACTIVE_MARKER = "||RDV_ACTIVE";
  const HIDDEN_MARKER = "||RDV_HIDDEN";
  const GENERIC_DOMAINS = new Set([
    "gmail.com","hotmail.com","outlook.com","live.com","icloud.com","yahoo.com",
    "proton.me","protonmail.com","mail.com","gmx.com","aol.com"
  ]);

  const state = {
    contacts: [],
    vivier: null,
    filter: "all",
    search: "",
    secteur: "",
    pays: "",
    objectif: "",
    typeOrganisation: "",
    fonction: "",
    sortKey: "organisation",
    sortDir: "asc",
    adminToken: ""
  };

  function clean(value) { return String(value ?? "").trim(); }
  function lower(value) { return clean(value).toLowerCase(); }
  function normalize(value) {
    return clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function esc(value) {
    return clean(value).replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[char]));
  }
  function bool(value) { return value === true || String(value).toUpperCase() === "TRUE"; }
  function emailDomain(email) {
    const value = lower(email);
    const at = value.lastIndexOf("@");
    return at > 0 ? value.slice(at + 1) : "";
  }
  function siteDomain(site) {
    return lower(site).replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#]/)[0];
  }

  function cleanCountry(value) {
    const text = clean(value);
    if (!text) return "";
    const parts = text.split(" - ").map(part => part.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : text;
  }

  function contactDisplayValue(contact, field, organisations) {
    const org = organisations.get(clean(contact.organisation_id));
    if (field === "secteur") return clean(contact.secteur || org?.secteur);
    if (field === "pays") return cleanCountry(contact.pays || org?.localisation);
    if (field === "type_organisation") return clean(contact.type_organisation || org?.type);
    if (field === "objectif") return clean(contact.objectif);
    if (field === "fonction") return clean(contact.fonction);
    return clean(contact?.[field]);
  }
  function baseRole(role) {
    return clean(role).replace(/\s*\|\|RDV_(ACTIVE|HIDDEN)\b/g, "").trim();
  }
  function statusOf(contact) {
    if (clean(contact?.source) !== IMPORT_SOURCE) return "active";
    const role = clean(contact?.role);
    if (role.includes(ACTIVE_MARKER)) return "active";
    if (role.includes(HIDDEN_MARKER)) return "hidden";
    return "pending";
  }
  function statusLabel(status) {
    if (status === "active") return "Actif";
    if (status === "hidden") return "Ne pas afficher";
    return "À valider";
  }

  /* ═══ SECTION 2 — NAVIGATION ET VUE ═══════════════════════════════════ */
  function injectStyles() {
    if ($("#adminContactsStyles")) return;
    const style = document.createElement("style");
    style.id = "adminContactsStyles";
    style.textContent = `
      #contactsView{display:none}
      #contactsView.active{display:block}
      .contacts-head{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:10px}
      .contacts-head h2{margin:0;font-family:var(--font-title);font-size:1.3rem}
      .contacts-head p{margin:2px 0 0;color:#747a74;font-size:.78rem}
      .contacts-kicker{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:#58A038;font-weight:700}
      .contacts-stats{display:flex;gap:6px;flex-wrap:nowrap;margin:0 0 0 auto}
      .contacts-stat{min-width:82px;background:#fff;border:1px solid var(--gris-border);border-radius:8px;padding:6px 9px}
      .contacts-stat strong{display:inline;font-family:var(--font-title);font-size:.95rem;margin-right:4px}
      .contacts-stat span{font-size:.68rem;color:#7a807a}
      .contacts-toolbar{display:grid;grid-template-columns:minmax(240px,1.6fr) repeat(5,minmax(120px,1fr));gap:7px;align-items:end;margin-bottom:8px}
      .contacts-toolbar .search{min-width:0}
      .contacts-toolbar label{display:block;font-size:.66rem;font-weight:700;color:#6d746d;margin-bottom:3px}
      .contacts-toolbar input,.contacts-toolbar select{width:100%;border:1px solid var(--gris-border);border-radius:7px;padding:7px 8px;font-size:.76rem;background:#fff}
      .contacts-segments{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
      .contacts-segments button{border:1px solid var(--gris-border);background:#fff;border-radius:999px;padding:7px 12px;font-weight:650;cursor:pointer}
      .contacts-segments button.on{background:#E9F7E3;border-color:#6FBF4A;color:#347022}
      .contacts-table-card{background:#fff;border:1px solid var(--gris-border);border-radius:12px;overflow:hidden}
      .contacts-table-scroll{overflow:auto;max-height:calc(100vh - 225px)}
      #contactsTable{width:100%;border-collapse:collapse;font-size:.74rem}
      #contactsTable th{position:sticky;top:0;z-index:3;background:#F4F5F4;text-align:left;padding:7px 8px;border-bottom:1px solid var(--gris-border);white-space:nowrap}
      #contactsTable th[data-sort]{cursor:pointer;user-select:none}
      #contactsTable th[data-sort]:hover{background:#e9ece8}
      .contacts-sort-indicator{margin-left:4px;font-size:.64rem;color:#58A038}
      #contactsTable td{padding:5px 8px;border-bottom:1px solid #eceeec;vertical-align:middle}
      #contactsTable .contacts-group td{background:#f8faf7;font-family:var(--font-title);font-weight:700;color:#0B0D0C;border-top:1px solid var(--gris-border)}
      .contacts-group-count{margin-left:8px;background:#E9F7E3;color:#347022;border-radius:999px;padding:2px 7px;font-size:.7rem}
      .contacts-principal{font-weight:800}
      .contacts-email{white-space:nowrap}
      .contacts-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:.7rem;font-weight:700;white-space:nowrap}
      .contacts-badge.pending{background:#FFF3CD;color:#745900}
      .contacts-badge.active{background:#E9F7E3;color:#347022}
      .contacts-badge.hidden{background:#F1F2F1;color:#666}
      .contacts-control{font-size:.74rem;line-height:1.35}
      .contacts-control.ok{color:#4f7047}
      .contacts-control.warn{color:#9a6500;font-weight:650}
      .contacts-control.danger{color:#b43131;font-weight:700}
      .contacts-actions{display:flex;gap:4px;min-width:190px}
      .contacts-actions .btn{white-space:nowrap;padding:5px 8px;font-size:.7rem}
      @media(max-width:1250px){.contacts-toolbar{grid-template-columns:repeat(3,1fr)}.contacts-stats{flex-wrap:wrap}}
      .contacts-status{margin-left:auto;font-size:.78rem;color:#687068}
      .contacts-status.error{color:#b43131}
      .contacts-status.ok{color:#347022}
    `;
    document.head.appendChild(style);
  }

  function injectNavigation() {
    if ($("#navContacts")) return;
    const navVivier = $("#navVivier");
    const navConciergerie = $("#navConciergerie");
    if (!navConciergerie) return;

    const link = document.createElement("a");
    link.href = "#contacts";
    link.className = "nav-item";
    link.id = "navContacts";
    link.innerHTML = '<i class="fas fa-address-card"></i> Contacts';

    if (navVivier) navVivier.insertAdjacentElement("beforebegin", link);
    else navConciergerie.insertAdjacentElement("afterend", link);
  }

  function injectView() {
    if ($("#contactsView")) return;
    const main = $(".admin-main");
    if (!main) return;

    const section = document.createElement("section");
    section.className = "admin-section contacts-view";
    section.id = "contactsView";
    section.innerHTML = `
      <div class="contacts-head">
        <div>
          <span class="contacts-kicker">Répertoire privé</span>
          <h2>Contacts</h2>
          <p>Répertoire des participants pertinents et contacts utilisables pour la conciergerie.</p>
        </div>
        <div class="contacts-stats">
          <div class="contacts-stat"><strong id="contactsPendingCount">—</strong><span>à traiter</span></div>
          <div class="contacts-stat"><strong id="contactsActiveCount">—</strong><span>RDV actifs</span></div>
          <div class="contacts-stat"><strong id="contactsHiddenCount">—</strong><span>écartés</span></div>
          <div class="contacts-stat"><strong id="contactsTotalCount">—</strong><span>total</span></div>
        </div>
      </div>

      <div class="contacts-segments" id="contactsSegments">
        <button class="on" type="button" data-contacts-filter="all">Tous</button>
        <button type="button" data-contacts-filter="pending">À traiter</button>
        <button type="button" data-contacts-filter="active">RDV actifs</button>
        <button type="button" data-contacts-filter="hidden">Écartés</button>
      </div>

      <div class="contacts-toolbar">
        <div class="search"><label>Recherche</label><input type="search" id="contactsSearch" placeholder="Entreprise, nom, email…"></div>
        <div><label>Secteur</label><select id="contactsSecteur"><option value="">Tous</option></select></div>
        <div><label>Pays</label><select id="contactsPays"><option value="">Tous</option></select></div>
        <div><label>Objectif</label><select id="contactsObjectif"><option value="">Tous</option></select></div>
        <div><label>Type d'organisation</label><select id="contactsTypeOrg"><option value="">Tous</option></select></div>
        <div><label>Fonction</label><select id="contactsFonction"><option value="">Toutes</option></select></div>
      </div>
      <div class="contacts-status" id="contactsStatus" style="margin:0 0 7px"></div>

      <div class="contacts-table-card">
        <div class="contacts-table-scroll">
          <table id="contactsTable">
            <thead><tr>
              <th data-sort="organisation">Entreprise<span class="contacts-sort-indicator"></span></th>
              <th data-sort="nom">Nom<span class="contacts-sort-indicator"></span></th>
              <th data-sort="fonction">Fonction<span class="contacts-sort-indicator"></span></th>
              <th data-sort="email">Email<span class="contacts-sort-indicator"></span></th>
              <th data-sort="secteur">Secteur<span class="contacts-sort-indicator"></span></th>
              <th data-sort="pays">Pays<span class="contacts-sort-indicator"></span></th>
              <th data-sort="objectif">Objectif<span class="contacts-sort-indicator"></span></th>
              <th data-sort="type_organisation">Type<span class="contacts-sort-indicator"></span></th>
              <th data-sort="controle">Contrôle<span class="contacts-sort-indicator"></span></th>
              <th>Action</th>
            </tr></thead>
            <tbody id="contactsTbody"></tbody>
          </table>
        </div>
      </div>`;
    main.appendChild(section);
  }

  function hideOtherViews() {
    $("#partnerAdminView")?.classList.remove("active");
    $("#conciergerieView")?.classList.remove("active");
    $("#vivierView")?.classList.remove("active");
    $("#navConciergerie")?.classList.remove("active");
    $("#navVivier")?.classList.remove("active");
    document.querySelectorAll("#sidebarNav .nav-item").forEach(link => link.classList.remove("active"));
  }

  async function showContacts(pushHistory = true) {
    hideOtherViews();
    $("#contactsView")?.classList.add("active");
    $("#navContacts")?.classList.add("active");
    const title = $("#adminTitle");
    if (title) title.textContent = "Contacts";

    if (pushHistory && location.hash !== "#contacts") {
      history.pushState({ view:"contacts" }, "", `${location.pathname}${location.search}#contacts`);
    }

    await loadData();
  }

  function hideContacts() {
    $("#contactsView")?.classList.remove("active");
    $("#navContacts")?.classList.remove("active");
  }

  /* ═══ SECTION 3 — CHARGEMENT ET CONTRÔLES ═════════════════════════════ */
  function isContactOnly(contact) {
    return clean(contact?.organisation_id).startsWith("contact-only::");
  }

  function contactOnlyOrganisationName(contact) {
    const id = clean(contact?.organisation_id);
    return id.startsWith("contact-only::") ? id.slice("contact-only::".length).trim() : "";
  }

  function partnerIdSet() {
    return new Set((state.vivier?.partenaires || []).map(item =>
      clean(typeof item === "string" ? item : (item?.id || item?.partenaire_id))
    ).filter(Boolean));
  }

  function orgMap() {
    return new Map((state.vivier?.organisations || []).map(org => [clean(org.id), org]));
  }

  function allSiteDomains() {
    const map = new Map();
    (state.vivier?.organisations || []).forEach(org => {
      const domain = siteDomain(org?.site_web || org?.site || org?.website);
      if (!domain) return;
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain).push(org);
    });
    return map;
  }

  function duplicateNameSet() {
    const counts = new Map();
    state.contacts.forEach(contact => {
      const key = `${clean(contact.organisation_id)}::${normalize(contact.nom)}`;
      if (!normalize(contact.nom)) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([,count]) => count > 1).map(([key]) => key));
  }

  function controlFor(contact, maps) {
    const organisationId = clean(contact.organisation_id);
    if (isContactOnly(contact)) return { level:"ok", text:"Contact" };

    const org = maps.organisations.get(organisationId);
    if (!org) return { level:"ok", text:"Contact" };

    const conciergeValue = lower(org?.extra?.Conciergerie || org?.extra?.conciergerie);
    const hasConcierge = ["checked","true","1","oui","yes"].includes(conciergeValue);
    if (hasConcierge) return { level:"ok", text:"Conciergerie" };

    return { level:"ok", text:"Partenaire" };
  }

  async function loadData() {
    const status = $("#contactsStatus");
    if (status) { status.textContent = "Chargement…"; status.className = "contacts-status"; }

    try {
      state.adminToken = clean(new URLSearchParams(location.search).get("token"))
        || clean(sessionStorage.getItem("conciergerie_admin_token_session"));
      if (!state.adminToken) throw new Error("Jeton administrateur introuvable.");

      const [vivier, contacts] = await Promise.all([
        API.loadVivier(),
        API.getContactsAdmin(state.adminToken)
      ]);
      state.vivier = vivier;
      state.contacts = Array.isArray(contacts) ? contacts : [];

      if (status) { status.textContent = ""; status.className = "contacts-status"; }
      render();
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Chargement impossible.";
        status.className = "contacts-status error";
      }
    }
  }

  /* ═══ SECTION 4 — RENDU GROUPÉ PAR ORGANISATION ═══════════════════════ */
  function uniqueValues(field) {
    const organisations = orgMap();
    return [...new Set(
      state.contacts.map(contact => contactDisplayValue(contact, field, organisations)).filter(Boolean)
    )].sort((a,b) => a.localeCompare(b, "fr", { sensitivity:"base" }));
  }

  function fillFilterOptions() {
    const defs = [
      ["#contactsSecteur", "secteur", "Tous"],
      ["#contactsPays", "pays", "Tous"],
      ["#contactsObjectif", "objectif", "Tous"],
      ["#contactsTypeOrg", "type_organisation", "Tous"],
      ["#contactsFonction", "fonction", "Toutes"]
    ];
    defs.forEach(([selector, field, emptyLabel]) => {
      const el = $(selector);
      if (!el) return;
      const current = el.value;
      el.innerHTML = `<option value="">${emptyLabel}</option>` +
        uniqueValues(field).map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("");
      if ([...el.options].some(option => option.value === current)) el.value = current;
    });
  }

  function sortValueForContact(contact, key, organisations, maps) {
    const org = organisations.get(clean(contact.organisation_id));
    if (key === "organisation") return clean(org?.nom || contactOnlyOrganisationName(contact) || contact.organisation_id);
    if (key === "nom") return clean(contact.nom);
    if (key === "email") return clean(contact.email);
    if (key === "fonction") return contactDisplayValue(contact, "fonction", organisations);
    if (key === "secteur") return contactDisplayValue(contact, "secteur", organisations);
    if (key === "pays") return contactDisplayValue(contact, "pays", organisations);
    if (key === "objectif") return contactDisplayValue(contact, "objectif", organisations);
    if (key === "type_organisation") return contactDisplayValue(contact, "type_organisation", organisations);
    if (key === "controle") return controlFor(contact, maps).text;
    return "";
  }

  function render() {
    const organisations = orgMap();
    const maps = {
      organisations,
      domains: allSiteDomains(),
      duplicates: duplicateNameSet()
    };

    const counts = { pending:0, active:0, hidden:0 };
    state.contacts.forEach(contact => { counts[statusOf(contact)] += 1; });
    $("#contactsPendingCount").textContent = counts.pending;
    $("#contactsActiveCount").textContent = counts.active;
    $("#contactsHiddenCount").textContent = counts.hidden;
    $("#contactsTotalCount").textContent = state.contacts.length;

    fillFilterOptions();

    document.querySelectorAll("#contactsSegments [data-contacts-filter]").forEach(button => {
      button.classList.toggle("on", button.dataset.contactsFilter === state.filter);
    });

    const search = lower(state.search);
    const filtered = state.contacts.filter(contact => {
      const status = statusOf(contact);
      if (state.filter !== "all" && status !== state.filter) return false;
      if (state.secteur && contactDisplayValue(contact, "secteur", organisations) !== state.secteur) return false;
      if (state.pays && contactDisplayValue(contact, "pays", organisations) !== state.pays) return false;
      if (state.objectif && contactDisplayValue(contact, "objectif", organisations) !== state.objectif) return false;
      if (state.typeOrganisation && contactDisplayValue(contact, "type_organisation", organisations) !== state.typeOrganisation) return false;
      if (state.fonction && contactDisplayValue(contact, "fonction", organisations) !== state.fonction) return false;

      const org = organisations.get(clean(contact.organisation_id));
      const hay = lower([
        org?.nom,
        contactOnlyOrganisationName(contact),
        contact.nom,
        contact.email,
        contactDisplayValue(contact, "fonction", organisations),
        contactDisplayValue(contact, "secteur", organisations),
        contactDisplayValue(contact, "pays", organisations),
        contactDisplayValue(contact, "objectif", organisations),
        contactDisplayValue(contact, "type_organisation", organisations)
      ].filter(Boolean).join(" "));
      return !search || hay.includes(search);
    });

    const direction = state.sortDir === "desc" ? -1 : 1;
    filtered.sort((a,b) => {
      const valueA = sortValueForContact(a, state.sortKey, organisations, maps);
      const valueB = sortValueForContact(b, state.sortKey, organisations, maps);
      const compared = clean(valueA).localeCompare(clean(valueB), "fr", { sensitivity:"base", numeric:true });
      if (compared) return compared * direction;
      return clean(a.nom).localeCompare(clean(b.nom), "fr", { sensitivity:"base" });
    });

    document.querySelectorAll("#contactsTable th[data-sort]").forEach(th => {
      const indicator = th.querySelector(".contacts-sort-indicator");
      if (!indicator) return;
      indicator.textContent = th.dataset.sort === state.sortKey ? (state.sortDir === "asc" ? "▲" : "▼") : "";
      th.setAttribute("aria-sort", th.dataset.sort === state.sortKey ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
    });

    const tbody = $("#contactsTbody");
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="padding:18px;text-align:center;color:#777">Aucun contact dans cette vue.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(contact => {
      const org = organisations.get(clean(contact.organisation_id));
      const orgName = clean(org?.nom || contactOnlyOrganisationName(contact) || contact.organisation_id || "Organisation inconnue");
      const status = statusOf(contact);
      const control = controlFor(contact, maps);
      const principal = bool(contact.principal);
      const imported = clean(contact.source) === IMPORT_SOURCE;
      const outside = isContactOnly(contact);

      let actions = '<span style="color:#818681;font-size:.7rem">Contact existant</span>';
      if (imported) {
        if (outside) {
          actions = status === "hidden"
            ? `<div class="contacts-actions">
                <button type="button" class="btn btn-primary btn-sm" data-contact-action="pending" data-contact-id="${esc(contact.contact_id)}">Réintégrer</button>
              </div>`
            : `<div class="contacts-actions">
                <button type="button" class="btn btn-primary btn-sm" data-contact-action="integrate" data-contact-id="${esc(contact.contact_id)}">Intégrer</button>
                <button type="button" class="btn btn-outline btn-sm" data-contact-action="hidden" data-contact-id="${esc(contact.contact_id)}">Écarter</button>
              </div>`;
        } else {
          actions = status === "hidden"
            ? `<div class="contacts-actions">
                <button type="button" class="btn btn-primary btn-sm" data-contact-action="pending" data-contact-id="${esc(contact.contact_id)}">Réintégrer</button>
              </div>`
            : `<div class="contacts-actions">
                <button type="button" class="btn btn-primary btn-sm" data-contact-action="active" data-contact-id="${esc(contact.contact_id)}">${status === "active" ? "RDV actif" : "Activer RDV"}</button>
                <button type="button" class="btn btn-outline btn-sm" data-contact-action="hidden" data-contact-id="${esc(contact.contact_id)}">Écarter</button>
              </div>`;
        }
      }

      return `
        <tr data-contact-row="${esc(contact.contact_id)}">
          <td>${esc(orgName || "—")}</td>
          <td class="${principal ? "contacts-principal" : ""}">${principal ? "★ " : ""}${esc(contact.nom || "—")}</td>
          <td>${esc(contactDisplayValue(contact, "fonction", organisations) || "—")}</td>
          <td class="contacts-email">${esc(contact.email || "—")}</td>
          <td>${esc(contactDisplayValue(contact, "secteur", organisations) || "—")}</td>
          <td>${esc(contactDisplayValue(contact, "pays", organisations) || "—")}</td>
          <td title="${esc(contactDisplayValue(contact, "objectif", organisations) || "")}">${esc(contactDisplayValue(contact, "objectif", organisations) || "—")}</td>
          <td>${esc(contactDisplayValue(contact, "type_organisation", organisations) || "—")}</td>
          <td><span class="contacts-control ${control.level}">${esc(control.text)}</span></td>
          <td>${actions}</td>
        </tr>`;
    }).join("");
  }

  /* ═══ SECTION 5 — ACTIVATION / EXCLUSION ══════════════════════════════ */
  async function saveContactStatus(contact, nextStatus, button) {
    const original = button?.innerHTML || "";
    if (button) { button.disabled = true; button.innerHTML = '<span class="spinner"></span>'; }

    const roleBase = baseRole(contact.role) || "Participant MTL connecte 2026";
    const role = nextStatus === "active"
      ? `${roleBase} ${ACTIVE_MARKER}`
      : nextStatus === "pending"
        ? roleBase
        : `${roleBase} ${HIDDEN_MARKER}`;

    try {
      const response = await fetch(CONFIG.SHEET_API_URL, {
        method:"POST",
        headers:{ "Content-Type":"text/plain;charset=utf-8" },
        body:JSON.stringify({
          action:"save_contact",
          token:state.adminToken,
          contact:{
            contact_id:contact.contact_id,
            organisation_id:contact.organisation_id,
            nom:contact.nom,
            fonction:contact.fonction,
            email:contact.email,
            telephone:contact.telephone,
            role,
            principal:bool(contact.principal),
            source:contact.source,
            secteur:contact.secteur,
            pays:contact.pays,
            objectif:contact.objectif,
            type_organisation:contact.type_organisation,
            emploi:contact.emploi
          }
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Enregistrement impossible.");

      contact.role = role;
      const status = $("#contactsStatus");
      if (status) {
        status.textContent = nextStatus === "active"
          ? `${contact.nom} est maintenant disponible dans les menus RDV.`
          : nextStatus === "pending"
            ? `${contact.nom} a été réintégré dans Contacts / À traiter.`
            : `${contact.nom} a été placé dans Écartés.`;
        status.className = "contacts-status ok";
      }
      render();
    } catch (error) {
      const status = $("#contactsStatus");
      if (status) {
        status.textContent = error.message || "Enregistrement impossible.";
        status.className = "contacts-status error";
      }
      if (button) { button.disabled = false; button.innerHTML = original; }
    }
  }

  async function integrateContactToConciergerie(contact, button) {
    const company = contactOnlyOrganisationName(contact);
    if (!company) return;

    const original = button?.innerHTML || "";
    if (button) { button.disabled = true; button.innerHTML = '<span class="spinner"></span>'; }

    const status = $("#contactsStatus");
    try {
      const existing = (state.vivier?.organisations || []).find(org => normalize(org?.nom) === normalize(company));
      let organisationId = clean(existing?.id);

      if (!organisationId) {
        const result = await API.saveOrganisation(state.adminToken, {
          nom: company,
          secteur: clean(contact.secteur),
          type: clean(contact.type_organisation),
          taille: "",
          localisation: clean(contact.pays),
          description: "",
          site_web: "",
          theme: "",
          expertise: []
        });
        organisationId = clean(result?.id);
        if (!organisationId) throw new Error("L'organisation n'a pas pu être créée dans le vivier.");
      }

      const sameCompany = state.contacts.filter(item =>
        clean(item.organisation_id) === clean(contact.organisation_id)
      );

      for (const item of sameCompany) {
        const roleBase = baseRole(item.role) || "Participant MTL connecte 2026";
        const makeActive = clean(item.contact_id) === clean(contact.contact_id);
        const role = makeActive ? `${roleBase} ${ACTIVE_MARKER}` : roleBase;

        const response = await fetch(CONFIG.SHEET_API_URL, {
          method:"POST",
          headers:{ "Content-Type":"text/plain;charset=utf-8" },
          body:JSON.stringify({
            action:"save_contact",
            token:state.adminToken,
            contact:{
              contact_id:item.contact_id,
              organisation_id:organisationId,
              nom:item.nom,
              fonction:item.fonction,
              email:item.email,
              telephone:item.telephone,
              role,
              principal:bool(item.principal),
              source:item.source,
              secteur:item.secteur,
              pays:item.pays,
              objectif:item.objectif,
              type_organisation:item.type_organisation,
              emploi:item.emploi
            }
          })
        });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || "Rattachement du contact impossible.");
      }

      API.resetCache?.();
      state.vivier = await API.loadVivier();
      state.contacts = await API.getContactsAdmin(state.adminToken);

      if (status) {
        status.textContent = `${company} a été intégré au vivier. ${contact.nom} est maintenant disponible pour les RDV.`;
        status.className = "contacts-status ok";
      }
      render();
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Intégration impossible.";
        status.className = "contacts-status error";
      }
      if (button) { button.disabled = false; button.innerHTML = original; }
    }
  }

  /* ═══ SECTION 6 — ÉVÉNEMENTS ══════════════════════════════════════════ */
  function bindEvents() {
    $("#navContacts")?.addEventListener("click", event => {
      event.preventDefault();
      showContacts(true);
    });

    $("#contactsSegments")?.addEventListener("click", event => {
      const button = event.target.closest("[data-contacts-filter]");
      if (!button) return;
      state.filter = button.dataset.contactsFilter || "all";
      render();
    });

    $("#contactsSearch")?.addEventListener("input", event => {
      state.search = event.target.value || "";
      render();
    });

    [
      ["#contactsSecteur", "secteur"],
      ["#contactsPays", "pays"],
      ["#contactsObjectif", "objectif"],
      ["#contactsTypeOrg", "typeOrganisation"],
      ["#contactsFonction", "fonction"]
    ].forEach(([selector, key]) => {
      $(selector)?.addEventListener("change", event => {
        state[key] = event.target.value || "";
        render();
      });
    });

    $("#contactsTable thead")?.addEventListener("click", event => {
      const th = event.target.closest("th[data-sort]");
      if (!th) return;
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      render();
    });

    $("#contactsTbody")?.addEventListener("click", event => {
      const button = event.target.closest("[data-contact-action]");
      if (!button) return;
      const contact = state.contacts.find(item => clean(item.contact_id) === clean(button.dataset.contactId));
      if (!contact) return;
      if (button.dataset.contactAction === "integrate") {
        integrateContactToConciergerie(contact, button);
        return;
      }
      const action = button.dataset.contactAction;
      saveContactStatus(contact, action === "hidden" ? "hidden" : action === "pending" ? "pending" : "active", button);
    });

    document.addEventListener("click", event => {
      if (
        event.target.closest("#navConciergerie")
        || event.target.closest("#navVivier")
        || event.target.closest("#sidebarNav [data-partner-id]")
      ) hideContacts();
    }, true);

    const restore = () => window.setTimeout(() => {
      if (location.hash === "#contacts") showContacts(false);
      else hideContacts();
    }, 0);

    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
  }

  function init() {
    injectStyles();
    injectNavigation();
    injectView();
    bindEvents();
    if (location.hash === "#contacts") window.setTimeout(() => showContacts(false), 0);
  }

  init();
})();