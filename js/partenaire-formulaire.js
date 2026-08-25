/* ════════════════════════════════════════════════════════════════════════
   FICHIER : partenaire-formulaire.js
   RÔLE    : Formulaire de besoins du partenaire (une page, 6 sections).
             Pré-remplit les champs depuis le vivier via ?p=<partenaire>,
             collecte les réponses, affiche un récap, gère l'envoi.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  SECTION 1  — Initialisation & paramètres URL (?p, ?token)            │
   │  SECTION 2  — Raccourcis DOM ($ / $$)                                 │
   │  SECTION 3  — Snapshot vivier + formulaire déjà enregistré            │
   │  SECTION 4  — Chips & selects : sélection & écoute                    │
   │  SECTION 5  — Lecture des valeurs (multiVals / val)                   │
   │  SECTION 6  — Collecte complète + disponibilités Conciergerie         │
   │  SECTION 7  — Récapitulatif en direct                                 │
   │  SECTION 8  — Progression au scroll                                   │
   │  SECTION 9  — Champs texte → maj récap                                │
   │  SECTION 10 — Envoi du formulaire                                     │
   │  SECTION 11 — Utilitaires (toast, escapeHtml)                         │
   │  SECTION 12 — Démarrage (DOMContentLoaded)                            │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  /* ═══ SECTION 1 — INITIALISATION & PARAMÈTRES URL ═══════════════════════
     Lit ?p=<partenaire> et ?token=<jeton> dans l'adresse de la page. */
  const params = new URLSearchParams(location.search);
  const pid = (params.get("p") || "").trim();
  const token = params.get("token") || "";
  const MULTI_SEPARATOR = " | ";
  let submitBusy = false;

  /* ═══ SECTION 2 — RACCOURCIS DOM ════════════════════════════════════════
     $ → un élément ; $$ → liste d'éléments (en tableau). */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ═══ SECTION 3 — SNAPSHOT VIVIER + PRÉ-REMPLISSAGE ═══════════════════
     Le formulaire ne charge plus le vivier fusionné ni Vivier_modifs.
     data.json contient un snapshot léger `_formulaire`, préparé au moment
     de l'import CSV : référentiels + fiche publique des seuls partenaires.

     RÈGLE :
     - le snapshot est recalculé uniquement lors d'un nouvel import ;
     - si l'import est plus récent que le dernier formulaire enregistré,
       les informations organisationnelles sont rafraîchies depuis le vivier ;
     - sinon, les réponses enregistrées restent prioritaires, mais une valeur
       vide ne remplace jamais une information disponible dans le vivier. */
  async function prefill() {
    if (!pid) return;

    try {
      const [snapshot, formulaireEnregistre] = await Promise.all([
        loadFormSnapshot(),
        token ? API.getFormulaire(pid, token).catch(() => null) : Promise.resolve(null)
      ]);

      buildVivierControls(snapshot.referentiels || {});

      const profil = snapshot.partenaires?.[pid] || null;
      if (!profil) {
        console.error("Partenaire introuvable dans le snapshot formulaire :", pid);
        return;
      }

      $("#partnerTag").textContent = "MTL connecte 2026 — Service conciergerie";
      applyVivierProfile(profil);

      if (formulaireEnregistre) {
        const vivierPlusRecent = isSnapshotNewer(
          snapshot.generated_at,
          formulaireEnregistre.date_modification
        );

        applySavedForm(formulaireEnregistre, { refreshOrganisation: vivierPlusRecent });

        $("#formStatus").textContent = vivierPlusRecent
          ? "Les informations de votre organisation ont été actualisées depuis le dernier vivier. Vos autres réponses sont conservées."
          : "Vos dernières réponses sont chargées. Vous pouvez les modifier puis enregistrer.";
      }

      updateRecap();
    } catch (e) {
      console.error("Erreur pré-remplissage :", e);
      setSubmitStatus("Impossible de charger les informations du formulaire.", true);
    }
  }

  async function loadFormSnapshot() {
    const res = await fetch(CONFIG.DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("Impossible de charger les données du formulaire (" + res.status + ").");

    const data = await res.json();
    if (data._formulaire?.referentiels && data._formulaire?.partenaires) {
      return data._formulaire;
    }

    // Compatibilité avec un ancien data.json : on prépare le snapshot une fois
    // côté navigateur, sans appeler le backend Vivier_modifs.
    return buildFallbackSnapshot(data);
  }

  function buildFallbackSnapshot(data) {
    const organisations = Array.isArray(data.organisations) ? data.organisations : [];
    const partenaires = Array.isArray(data.partenaires) ? data.partenaires : [];
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

    return {
      version: "legacy",
      generated_at: "",
      referentiels: {
        secteurs: unique("secteur"),
        types: unique("type"),
        tailles: unique("taille")
      },
      partenaires: profiles
    };
  }

  function applyVivierProfile(profil) {
    if (profil.nom) {
      $("#f_org").value = profil.nom;
      $("#orgPrefill").hidden = false;
    }

    setMultiValues("f_secteurs", profil.secteur);
    setFieldValue("f_type", profil.type);
    setFieldValue("f_taille", profil.taille);
    setFieldValue("f_site", profil.site_web);
    setFieldValue("f_desc", profil.description);
    setFieldValue("f_lieu", profil.localisation);
  }

  function isSnapshotNewer(generatedAt, formModifiedAt) {
    const vivierDate = parseDateValue(generatedAt);
    const formDate = parseDateValue(formModifiedAt);
    return vivierDate !== null && formDate !== null && vivierDate > formDate;
  }

  function parseDateValue(value) {
    const text = String(value || "").trim();
    if (!text) return null;

    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)
      ? text.replace(" ", "T") + ":00"
      : text;

    const time = new Date(normalized).getTime();
    return Number.isFinite(time) ? time : null;
  }

  function setChipState(chip, selected) {
    if (!chip) return;
    chip.classList.toggle("selected", selected);
    const icon = chip.querySelector("i");
    if (icon) icon.className = selected ? "fas fa-check" : "fas fa-plus";
  }

  function buildSelectOptions(id, values) {
    const select = $("#" + id);
    if (!select) return;
    select.innerHTML = `<option value="">Choisir…</option>` + (values || [])
      .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join("");
  }

  function buildChipOptions(id, values, compact = false) {
    const container = $("#" + id);
    if (!container) return;
    container.innerHTML = (values || []).map(value => `
      <button type="button" class="choice-chip${compact ? " compact-choice-chip" : ""}" data-val="${escapeHtml(value)}">
        <i class="fas fa-plus"></i><span>${escapeHtml(value)}</span>
      </button>`).join("");
  }

  function buildVivierControls(referentiels) {
    const secteurs = Array.isArray(referentiels.secteurs) ? referentiels.secteurs : [];
    const types = Array.isArray(referentiels.types) ? referentiels.types : [];
    const tailles = Array.isArray(referentiels.tailles) ? referentiels.tailles : [];

    buildChipOptions("f_secteurs", secteurs, true);
    buildSelectOptions("f_type", types);
    buildSelectOptions("f_taille", tailles);
    buildChipOptions("f_type_rech", types, true);
    buildChipOptions("f_secteurs_cibles", secteurs, true);
    buildChipOptions("f_taille_rech", tailles, true);
  }

  function splitStoredValues(value, id) {
    if (Array.isArray(value)) {
      return value.map(item => String(item ?? "").trim()).filter(Boolean);
    }

    const text = String(value ?? "").trim();
    if (!text) return [];

    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map(item => String(item ?? "").trim()).filter(Boolean);
      } catch (_) {}
    }

    if (text.includes(MULTI_SEPARATOR)) {
      return text.split(MULTI_SEPARATOR).map(item => item.trim()).filter(Boolean);
    }

    const exact = $$(`#${id} .choice-chip`).some(chip => String(chip.dataset.val || "").trim() === text);
    if (exact) return [text];

    return text.split(",").map(item => item.trim()).filter(Boolean);
  }

  function setMultiValues(id, value) {
    const wanted = new Set(splitStoredValues(value, id));
    $$(`#${id} .choice-chip`).forEach(chip => {
      setChipState(chip, wanted.has(String(chip.dataset.val || "").trim()));
    });
  }

  function setFieldValue(id, value) {
    const element = $("#" + id);
    if (!element) return;
    element.value = String(value ?? "");
  }

  function hasStoredValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    return String(value ?? "").trim() !== "";
  }

  function applySavedForm(data, options = {}) {
    const refreshOrganisation = options.refreshOrganisation === true;

    // Section 1 : les données du vivier restent en place si l'ancien formulaire
    // est vide ou si un nouvel import est plus récent que cet enregistrement.
    if (!refreshOrganisation) {
      if (hasStoredValue(data.organisation)) setFieldValue("f_org", data.organisation);
      if (hasStoredValue(data.secteurs)) setMultiValues("f_secteurs", data.secteurs);
      if (hasStoredValue(data.type)) setFieldValue("f_type", data.type);
      if (hasStoredValue(data.taille)) setFieldValue("f_taille", data.taille);
      if (hasStoredValue(data.site)) setFieldValue("f_site", data.site);
      if (hasStoredValue(data.description)) setFieldValue("f_desc", data.description);
      if (hasStoredValue(data.lieu)) setFieldValue("f_lieu", data.lieu);
    }

    // Sections 2 à 6 : ce sont les réponses propres au partenaire.
    setFieldValue("f_nom", data.contact_nom);
    setFieldValue("f_poste", data.contact_poste);
    setFieldValue("f_email", data.contact_email);
    setFieldValue("f_tel", data.contact_tel);
    setMultiValues("f_langues", data.langues);

    setMultiValues("f_type_rech", data.type_recherche);
    setMultiValues("f_secteurs_cibles", data.secteurs_cibles);
    setMultiValues("f_taille_rech", data.taille_recherchee);
    setFieldValue("f_roles", data.roles);

    setMultiValues("f_objectifs", data.objectifs);
    setFieldValue("f_objectifs_libre", data.objectifs_libre);
    setMultiValues("f_disponibilites", data.disponibilites_conciergerie);
    setFieldValue("f_contacts_ident", data.contacts_identifies);
  }

  /* ═══ SECTION 4 — CHIPS & SELECTS : SÉLECTION & ÉCOUTE ══════════════════
     Clic sur un chip = bascule sélectionné ; selects écoutés ;
     chaque changement rafraîchit le récap. */
  function bindChoices() {
    // Délégation : fonctionne aussi pour les chips générés après le chargement de data.json.
    $$('[data-multi]').forEach(container => {
      container.addEventListener("click", event => {
        const chip = event.target.closest(".choice-chip");
        if (!chip || !container.contains(chip)) return;
        setChipState(chip, !chip.classList.contains("selected"));
        updateRecap();
      });
    });

    ["f_type", "f_taille"].forEach(id => {
      const element = $("#" + id);
      if (element) element.addEventListener("change", updateRecap);
    });
  }

  /* ═══ SECTION 5 — LECTURE DES VALEURS ═══════════════════════════════════
     multiVals → tableau des chips cochés ; val → valeur d'un champ texte. */
  function multiVals(id) {
    return $$(`#${id} .choice-chip.selected`).map(c => c.dataset.val);
  }
  const val = id => { const el = $("#" + id); return el ? el.value.trim() : ""; };

  /* ═══ SECTION 6 — COLLECTE COMPLÈTE DES RÉPONSES ════════════════════════
     Rassemble tous les champs des 6 sections en un seul objet.
     Les repères // 1..6 renvoient aux sections du formulaire HTML. */
  function collect() {
    return {
      partenaire_id: pid,

      // 1 — Votre organisation
      organisation: val("f_org"),
      secteurs: multiVals("f_secteurs"),
      type: val("f_type"),
      taille: val("f_taille"),
      site: val("f_site"),
      description: val("f_desc"),
      lieu: val("f_lieu"),

      // 2 — Personne responsable des rendez-vous
      contact_nom: val("f_nom"),
      contact_poste: val("f_poste"),
      contact_email: val("f_email"),
      contact_tel: val("f_tel"),
      langues: multiVals("f_langues"),

      // 3 — Qui souhaitez-vous rencontrer
      type_recherche: multiVals("f_type_rech"),
      secteurs_cibles: multiVals("f_secteurs_cibles"),
      taille_recherchee: multiVals("f_taille_rech"),
      roles: val("f_roles"),

      // 4 — Objectifs
      objectifs: multiVals("f_objectifs"),
      objectifs_libre: val("f_objectifs_libre"),

      // 5 — Disponibilités réservées à la Conciergerie
      disponibilites_conciergerie: multiVals("f_disponibilites"),

      // 6 — Compléments
      contacts_identifies: val("f_contacts_ident")
    };
  }

  /* ═══ SECTION 7 — RÉCAPITULATIF EN DIRECT ═══════════════════════════════
     row() fabrique une ligne ; updateRecap() reconstruit le bloc récap.
     Priorité aux sections 3-4-5 (ce qui sert à choisir les contacts). */
  function row(k, v) {
    if (!v || (Array.isArray(v) && !v.length)) return "";
    const disp = Array.isArray(v) ? v.join(", ") : v;
    return `<div class="recap-row"><span class="k">${k}</span><span>${escapeHtml(disp)}</span></div>`;
  }
  function sub(t) { return `<div class="recap-sub">${t}</div>`; }

  function updateRecap() {
    const d = collect();
    let html = "";

    html += sub("Votre organisation");
    html += row("Organisation", d.organisation);
    html += row("Contact", d.contact_nom);

    html += sub("Qui vous souhaitez rencontrer");
    html += row("Type d'organisation recherché", d.type_recherche);
    html += row("Secteurs ciblés", d.secteurs_cibles);
    html += row("Taille recherchée", d.taille_recherchee);
    html += row("Rôles / fonctions visés", d.roles);

    html += sub("Vos objectifs");
    html += row("Objectifs", d.objectifs);
    html += row("Précisions", d.objectifs_libre);

    html += sub("Disponibilités Conciergerie");
    html += row("Plages réservées", d.disponibilites_conciergerie);

    html += sub("Compléments");
    html += row("Organisations déjà identifiées", d.contacts_identifies);

    $("#recap").innerHTML = html.trim()
      ? html
      : "Complétez le formulaire ci-dessus, le récapitulatif s'actualise ici.";
  }
  /* ═══ SECTION 8 — PROGRESSION AU SCROLL ═════════════════════════════════
     Met en vert les étapes franchies et met à jour le libellé courant. */
  function bindProgress() {
    const sections = $$(".form-section[data-section]");
    const steps = $$("#progressSteps .step");
    const labels = [
      "Votre organisation",
      "Participant aux rendez-vous",
      "Qui rencontrer",
      "Objectifs",
      "Disponibilités",
      "Compléments"
    ];

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const idx = +e.target.dataset.section;
        steps.forEach((step, i) => step.classList.toggle("done", i <= idx));
        $("#progressLabel").textContent = `Section ${idx + 1} sur ${labels.length} — ${labels[idx]}`;
      });
    }, { rootMargin: "-45% 0px -45% 0px" });

    sections.forEach(section => io.observe(section));
  }

  /* ═══ SECTION 9 — CHAMPS TEXTE → MAJ RÉCAP ══════════════════════════════
     Chaque frappe dans un champ texte rafraîchit le récapitulatif. */
  function bindInputs() {
    ["f_org","f_desc","f_site","f_lieu","f_nom","f_poste","f_email","f_tel","f_roles","f_objectifs_libre","f_contacts_ident"]
      .forEach(id => { const el = $("#" + id); if (el) el.addEventListener("input", updateRecap); });
  }

  /* ═══ SECTION 10 — ENVOI DU FORMULAIRE ══════════════════════════════════
     Convertit les multi-valeurs en chaînes puis enregistre réellement
     le formulaire dans le Google Sheet via API.saveFormulaire(). */
  function toReponses(data) {
    const join = value => Array.isArray(value) ? value.join(MULTI_SEPARATOR) : (value || "");

    return {
      organisation: data.organisation,
      secteurs: join(data.secteurs),
      type: data.type,
      taille: data.taille,
      site: data.site,
      description: data.description,
      lieu: data.lieu,
      contact_nom: data.contact_nom,
      contact_poste: data.contact_poste,
      contact_email: data.contact_email,
      contact_tel: data.contact_tel,
      langues: join(data.langues),
      type_recherche: join(data.type_recherche),
      secteurs_cibles: join(data.secteurs_cibles),
      taille_recherchee: join(data.taille_recherchee),
      roles: data.roles,
      objectifs: join(data.objectifs),
      objectifs_libre: data.objectifs_libre,
      disponibilites_conciergerie: join(data.disponibilites_conciergerie),
      contacts_identifies: data.contacts_identifies
    };
  }

  function setSubmitStatus(message, isError = false) {
    const status = $("#formStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    status.classList.toggle("is-saving", !isError && message.includes("Enregistrement"));
  }

  async function handleSubmit(event) {
    if (event) event.preventDefault();
    if (submitBusy) return;

    const data = collect();

    if (!data.organisation) {
      setSubmitStatus("Merci d'indiquer le nom de votre organisation.", true);
      toast("Merci d'indiquer le nom de votre organisation.", true);
      return;
    }

    if (!data.disponibilites_conciergerie.length) {
      setSubmitStatus("Merci de réserver au moins une plage horaire.", true);
      toast("Merci de réserver au moins une plage horaire pour vos rendez-vous Conciergerie.", true);
      return;
    }

    if (!pid || !token) {
      setSubmitStatus("Lien invalide : identifiant ou jeton manquant.", true);
      toast("Lien invalide : identifiant ou jeton manquant.", true);
      return;
    }

    const btn = $("#submitForm");
    if (!btn) return;

    submitBusy = true;
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> Enregistrement…`;
    setSubmitStatus("Enregistrement en cours…");

    try {
      const result = await API.saveFormulaire(pid, token, toReponses(data));
      if (!result || result.ok !== true) {
        throw new Error("Le serveur n'a pas confirmé l'enregistrement.");
      }

      setSubmitStatus(
        result.changed === false
          ? "Aucune modification : vos informations sont déjà à jour."
          : "Vos informations ont bien été enregistrées."
      );
      showSuccess();

      toast(
        result.changed === false
          ? "Aucune modification détectée : vos informations sont déjà à jour."
          : "Vos informations ont bien été enregistrées."
      );
    } catch (e) {
      const message = e?.message || "Échec de l'enregistrement. Réessayez.";
      console.error("Erreur enregistrement formulaire :", e);
      setSubmitStatus(message, true);
      toast(message, true);
    } finally {
      submitBusy = false;
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  function bindSubmit() {
    const btn = $("#submitForm");
    if (!btn) {
      console.error("Bouton #submitForm introuvable.");
      return;
    }
    btn.type = "button";
    btn.addEventListener("click", handleSubmit);
  }


  function showSuccess() {
    const success = $("#formSuccess");
    const hero = document.querySelector(".form-hero");
    const submitBar = document.querySelector(".form-submit-bar");
    const progress = document.querySelector(".progress-sticky");

    $$(".form-section").forEach(section => {
      if (section.id !== "formSuccess") section.hidden = true;
    });

    if (hero) hero.hidden = true;
    if (submitBar) submitBar.hidden = true;
    if (progress) progress.hidden = true;

    if (success) {
      success.hidden = false;
      success.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    document.body.classList.add("form-completed");
  }

  /* ═══ SECTION 11 — UTILITAIRES ══════════════════════════════════════════
     toast() : notification ; escapeHtml() : sécurise l'affichage. */
  function toast(msg, isErr) {
    const t = document.createElement("div");
    t.className = "toast"; if (isErr) t.style.background = "var(--danger)";
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  /* ═══ SECTION 12 — DÉMARRAGE ════════════════════════════════════════════
     Branche tout une fois le DOM chargé. */
  document.addEventListener("DOMContentLoaded", () => {
    bindChoices();
    bindInputs();
    bindProgress();
    bindSubmit();
    prefill();
  });
})();
