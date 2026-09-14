/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-vivier-sync.js
   VERSION : v39 — import Airtable direct avec conservation anti-vide
   RÔLE    : Met à jour directement le vivier depuis un export CSV Airtable.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — État et utilitaires                                            │
   │  2 — Interface de synchronisation                                   │
   │  3 — Parse CSV et transformation Airtable                           │
   │  4 — Comparaison ancien Airtable / local / nouvel Airtable          │
   │  5 — Application de la synchronisation                              │
   │  6 — Tableau « À valider »                                          │
   │  7 — Initialisation                                                  │
   └──────────────────────────────────────────────────────────────────────┘

   RÈGLE MÉTIER VALIDÉE
   - l'import Airtable est accepté pour tous les cas normaux ;
   - seul un champ modifié localement ET modifié aussi dans Airtable
     devient un conflit « À valider » ;
   - les conflits ne bloquent jamais le reste de l'import ;
   - décision ultérieure : « Garder local » ou « Prendre Airtable ».
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";
  if (!document.querySelector("#admin-dashboard")) return;

  /* ═══ SECTION 1 — ÉTAT ET UTILITAIRES ═════════════════════════════════ */
  const params = new URLSearchParams(location.search);
  const adminToken = String(params.get("token") || "").trim();
  const FIELDS = ["nom", "statut", "secteur", "type", "taille", "localisation", "description", "site_web", "theme", "expertise"];
  const LABELS = { nom:"Nom", statut:"Statut Conciergerie", secteur:"Secteur", type:"Type", taille:"Taille", localisation:"Localisation", description:"Description", site_web:"Site web", theme:"Thème", expertise:"Expertise" };
  const state = { generated:null, oldBase:null, merged:null, overrides:[], conflicts:[], existingConflicts:[] };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function valueOf(obj, field) {
    if (field === "expertise") {
      const a = Array.isArray(obj?.expertise) ? obj.expertise : String(obj?.expertise ?? "").split(",");
      return [...new Set(a.map(v => String(v).trim()).filter(Boolean))].sort((x,y)=>x.localeCompare(y,"fr",{sensitivity:"base"})).join(" | ");
    }
    return String(obj?.[field] ?? "").trim();
  }
  function endpoint(action) { return `${CONFIG.SHEET_API_URL}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(adminToken)}&_=${Date.now()}`; }
  async function request(url, options={}) {
    const r = await fetch(url, { cache:"no-store", ...options });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch (_) { throw new Error("Réponse Apps Script invalide."); }
    if (data.error) throw new Error(data.error);
    return data;
  }
  async function post(body) {
    return request(CONFIG.SHEET_API_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({ ...body, token:adminToken }) });
  }

  /* ═══ SECTION 2 — INTERFACE DE SYNCHRONISATION ════════════════════════ */
  function inject() {
    if (document.querySelector("#vivierAirtableSync")) return true;
    const view = document.querySelector("#vivierView");
    if (!view) return false;
    const head = view.querySelector(".vivier-head") || view.firstElementChild;
    if (!head) return false;

    const box = document.createElement("div");
    box.id = "vivierAirtableSync";
    box.innerHTML = `
      <input id="vivierAirtableFile" type="file" accept=".csv,text/csv" hidden>
      <button class="btn btn-outline btn-sm" type="button" id="vivierAirtableBtn"><i class="fas fa-arrows-rotate"></i> Mettre à jour depuis Airtable</button>`;
    const target = head.lastElementChild || head;
    target.appendChild(box);

    const style = document.createElement("style");
    style.textContent = `#vivierAirtableSync{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.vas-modal[hidden]{display:none!important}.vas-modal{position:fixed;inset:0;z-index:1700;background:rgba(11,13,12,.58);display:flex;align-items:center;justify-content:center;padding:24px}.vas-card{width:min(1080px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 22px 65px rgba(0,0,0,.2)}.vas-head,.vas-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--gris-border);background:#fff;position:sticky;top:0;z-index:2}.vas-foot{border-top:1px solid var(--gris-border);border-bottom:0;bottom:0;top:auto}.vas-body{padding:18px 20px}.vas-summary{padding:12px 14px;border-radius:10px;background:var(--gris-light);margin-bottom:14px}.vas-table{width:100%;border-collapse:collapse;font-size:.78rem}.vas-table th,.vas-table td{padding:9px 10px;border-bottom:1px solid var(--gris-border);text-align:left;vertical-align:top}.vas-table th{background:var(--gris-light);position:sticky;top:57px}.vas-value{max-width:300px;overflow-wrap:anywhere}.vas-actions{display:flex;gap:6px;white-space:nowrap}.vas-empty{padding:32px;text-align:center;color:var(--gris-text)}.vas-note{font-size:.76rem;color:var(--gris-text);line-height:1.5}`;
    document.head.appendChild(style);

    document.body.insertAdjacentHTML("beforeend", `
      <div class="vas-modal" id="vivierSyncModal" hidden><div class="vas-card"><div class="vas-head"><div><strong>Mise à jour Airtable</strong><div class="vas-note">Les valeurs Airtable remplacent les valeurs existantes. Une valeur vide conserve l’information déjà présente.</div></div><button class="btn btn-outline btn-sm" data-vas-close="sync">Fermer</button></div><div class="vas-body"><div id="vivierSyncSummary" class="vas-summary">Sélectionnez un export CSV Airtable.</div><div id="vivierSyncPreview"></div></div><div class="vas-foot"><span id="vivierSyncStatus" class="vas-note"></span><div><button class="btn btn-outline btn-sm" data-vas-close="sync">Annuler</button> <button class="btn btn-primary btn-sm" id="vivierSyncApply" disabled>Accepter l'import et télécharger data.json</button></div></div></div></div>
      `);

    document.querySelector("#vivierAirtableBtn").addEventListener("click", () => document.querySelector("#vivierAirtableFile").click());
    document.querySelector("#vivierAirtableFile").addEventListener("change", e => e.target.files[0] && prepareFile(e.target.files[0]));
    document.querySelector("#vivierSyncApply").addEventListener("click", applySync);
    document.querySelectorAll("[data-vas-close]").forEach(b => b.addEventListener("click", () => b.closest(".vas-modal").hidden = true));
    return true;
  }

  /* ═══ SECTION 3 — CSV ET TRANSFORMATION AIRTABLE ══════════════════════ */
  function parseCSV(text) {
    text=String(text||"").replace(/^\uFEFF/,""); const rows=[]; let row=[],field="",q=false;
    for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1]; if(q){if(c==='"'&&n==='"'){field+='"';i++;}else if(c==='"')q=false;else field+=c;}else{if(c==='"')q=true;else if(c===","){row.push(field);field="";}else if(c==="\r"){}else if(c==="\n"){row.push(field);rows.push(row);row=[];field="";}else field+=c;}}
    if(field.length||row.length){row.push(field);rows.push(row);} if(!rows.length)return[];
    const header=rows.shift().map(v=>String(v||"").trim()); return rows.filter(r=>r.some(c=>String(c||"").trim())).map(r=>Object.fromEntries(header.map((h,i)=>[h,String(r[i]||"").trim()])));
  }
  function norm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");}
  function col(headers, aliases, required=false){const m=new Map(headers.map(h=>[norm(h),h]));for(const a of aliases){const f=m.get(norm(a));if(f)return f;}if(required)throw new Error(`Colonne obligatoire introuvable : ${aliases[0]}`);return "";}
  function split(v){return String(v||"").split(",").map(x=>x.trim()).filter(Boolean);}
  function quota(v){const m=String(v||"").match(/\d+/);return m?parseInt(m[0],10):null;}
  function location(v){const s=String(v||"").trim();if(!s)return"";if(s.includes(" / "))return s.split(" / ")[0].trim()||s;return s;}
  function personal(h){const n=norm(h);return n.startsWith("courriel")||n.startsWith("email")||n.startsWith("telephone")||n.startsWith("fonction")||n.startsWith("contact principal");}
  function buildData(rows){
    if(!rows.length)throw new Error("Le CSV ne contient aucune donnée."); const headers=Object.keys(rows[0]);
    const C={nom:col(headers,["Nom de l'organisation","Nom de l'organisation / Délégation / F","Nom de l'organisation / Délégation/F"],true),cid:col(headers,["Conciergerie _ID","Conciergerie_ID","Conciergerie ID"],true),nb:col(headers,["Nombre contact conciergerie"]),statut:col(headers,["Statut_Conciergerie","Statut Conciergerie"]),site:col(headers,["Site web de l'organisation /F","Site web de l'organisation"]),secteur:col(headers,["Secteur d'activité /F","Secteur d'activité"]),type:col(headers,["Type d'organisation /F","Type d'organisation"]),pays:col(headers,["Pays /F","Pays"]),taille:col(headers,["Taille de l'organisation"]),ville:col(headers,["Ville"]),theme:col(headers,["Thème","Theme"]),expertise:col(headers,["Expertise"]),description:headers.find(h=>norm(h).startsWith("description"))||""};
    const keys=new Set(Object.values(C).filter(Boolean)), organisations=[],partenaires=[],seenO=new Set(),seenP=new Set();
    for(const row of rows){const id=String(row[C.cid]||"").trim(),nom=String(row[C.nom]||"").trim();if(!id||!nom)continue;if(!seenO.has(id)){const extra={};headers.forEach(h=>{if(!keys.has(h)&&!personal(h))extra[h]=String(row[h]||"").trim();});organisations.push({id,nom,statut:String(row[C.statut]||"").trim(),secteur:String(row[C.secteur]||"").trim(),type:String(row[C.type]||"").trim(),taille:String(row[C.taille]||"").trim(),localisation:location(row[C.pays])||String(row[C.ville]||"").trim(),description:String(row[C.description]||"").trim(),site_web:String(row[C.site]||"").trim(),theme:String(row[C.theme]||"").trim(),expertise:split(row[C.expertise]),extra});seenO.add(id);}const q=quota(row[C.nb]);if(q>0&&!seenP.has(id)){partenaires.push({id,nom,meeting_quota:q});seenP.add(id);}}
    if(!organisations.length)throw new Error("Aucune organisation reconnue dans le CSV.");
    const data={_comment:"Vivier MTLC conciergerie généré depuis Airtable. id = Conciergerie _ID. Tokens et relations gérés dans le Google Sheet.",partenaires,organisations,propositions:[]};data._formulaire=formSnapshot(organisations,partenaires);return data;
  }
  function formSnapshot(orgs,parts){const by=new Map(orgs.map(o=>[o.id,o]));const unique=k=>[...new Set(orgs.map(o=>String(o[k]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr",{sensitivity:"base"}));const profiles={};parts.forEach(p=>{const o=by.get(p.id)||{};profiles[p.id]={nom:String(o.nom||p.nom||"").trim(),secteur:String(o.secteur||"").trim(),type:String(o.type||"").trim(),taille:String(o.taille||"").trim(),localisation:String(o.localisation||"").trim(),description:String(o.description||"").trim(),site_web:String(o.site_web||"").trim()};});const content={referentiels:{secteurs:unique("secteur"),types:unique("type"),tailles:unique("taille")},partenaires:profiles};let hash=2166136261,t=JSON.stringify(content);for(let i=0;i<t.length;i++){hash^=t.charCodeAt(i);hash=Math.imul(hash,16777619);}return{version:(hash>>>0).toString(16).padStart(8,"0"),generated_at:new Date().toISOString(),...content};}

  /* ═══ SECTION 4 — FUSION AIRTABLE DIRECTE / ANTI-VIDE ═══════════════ */
  function isEmptyValue(value) {
    if (Array.isArray(value)) return value.length === 0;
    return String(value ?? "").trim() === "";
  }

  function mergeNonEmpty(currentOrg, airtableOrg) {
    const current = currentOrg || {};
    const incoming = airtableOrg || {};
    const merged = { ...current, id: incoming.id || current.id };

    for (const field of FIELDS) {
      const incomingValue = incoming[field];
      if (!isEmptyValue(incomingValue)) {
        merged[field] = Array.isArray(incomingValue) ? [...incomingValue] : incomingValue;
      } else if (current[field] !== undefined) {
        merged[field] = Array.isArray(current[field]) ? [...current[field]] : current[field];
      }
    }

    // Les données "extra" suivent la même règle : Airtable non vide écrase,
    // sinon on conserve la valeur déjà présente.
    const currentExtra = current.extra && typeof current.extra === "object" ? current.extra : {};
    const incomingExtra = incoming.extra && typeof incoming.extra === "object" ? incoming.extra : {};
    merged.extra = { ...currentExtra };
    Object.entries(incomingExtra).forEach(([key, value]) => {
      if (!isEmptyValue(value)) merged.extra[key] = value;
      else if (!(key in merged.extra)) merged.extra[key] = value;
    });

    return merged;
  }

  function mergeImport(currentData, generatedData) {
    const currentMap = new Map(
      (currentData.organisations || [])
        .map(org => [String(org.id || "").trim(), org])
        .filter(([id]) => id)
    );

    const organisations = (generatedData.organisations || []).map(incoming => {
      const id = String(incoming.id || "").trim();
      return mergeNonEmpty(currentMap.get(id), incoming);
    });

    // Airtable reste la source de la liste des organisations :
    // les organisations absentes du nouvel export ne sont pas réintroduites.
    const result = {
      ...generatedData,
      organisations,
      propositions: Array.isArray(currentData.propositions) ? currentData.propositions : []
    };

    result._formulaire = formSnapshot(result.organisations, result.partenaires || []);
    return result;
  }

  /* ═══ SECTION 5 — PRÉPARATION DE L'IMPORT ═════════════════════════════ */
  async function prepareFile(file) {
    const modal = document.querySelector("#vivierSyncModal");
    const summary = document.querySelector("#vivierSyncSummary");
    const preview = document.querySelector("#vivierSyncPreview");
    const apply = document.querySelector("#vivierSyncApply");
    const status = document.querySelector("#vivierSyncStatus");

    modal.hidden = false;
    apply.disabled = true;
    status.textContent = "Analyse en cours…";
    preview.innerHTML = "";

    try {
      const text = await file.text();
      const generatedRaw = buildData(parseCSV(text));

      const currentRes = await fetch(CONFIG.DATA_URL, { cache: "no-store" });
      if (!currentRes.ok) throw new Error("Impossible de lire le data.json actuel.");
      const currentData = await currentRes.json();

      const merged = mergeImport(currentData, generatedRaw);

      let changed = 0;
      const currentMap = new Map((currentData.organisations || []).map(o => [String(o.id || "").trim(), o]));
      merged.organisations.forEach(org => {
        const old = currentMap.get(String(org.id || "").trim());
        if (!old || JSON.stringify(old) !== JSON.stringify(org)) changed += 1;
      });

      state.generated = merged;
      state.oldBase = currentData;
      state.merged = merged;
      state.overrides = [];
      state.conflicts = [];
      state.existingConflicts = [];

      summary.innerHTML =
        `<b>${merged.organisations.length}</b> organisations · ` +
        `<b>${merged.partenaires.length}</b> partenaires · ` +
        `<b>${changed}</b> organisation(s) mise(s) à jour.`;

      preview.innerHTML =
        `<div class="vas-note">Airtable remplace directement les valeurs existantes. ` +
        `Si une valeur Airtable est vide, la valeur déjà présente est conservée.</div>`;

      apply.disabled = false;
      status.textContent = "Prêt.";
    } catch (err) {
      status.textContent = err.message || "Analyse impossible.";
      summary.textContent = "Échec de l'analyse.";
    }
  }

  /* ═══ SECTION 6 — APPLICATION DIRECTE ═════════════════════════════════ */
  async function applySync() {
    if (!state.generated) return;
    const btn = document.querySelector("#vivierSyncApply");
    const status = document.querySelector("#vivierSyncStatus");
    btn.disabled = true;
    status.textContent = "Préparation du nouveau data.json…";

    try {
      const blob = new Blob(
        [JSON.stringify(state.generated, null, 2) + "
"],
        { type: "application/json;charset=utf-8" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "data.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      status.textContent =
        "Import prêt. Remplace maintenant js/data.json par le fichier téléchargé.";
    } catch (err) {
      status.textContent = err.message || "Mise à jour impossible.";
      btn.disabled = false;
    }
  }

  /* ═══ SECTION 7 — INITIALISATION ═════════════════════════════════════ */
  let tries=0;const timer=setInterval(()=>{tries++;if(inject()||tries>40)clearInterval(timer);},250);
})();
