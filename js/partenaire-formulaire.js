/* ════════════════════════════════════════════════════════════════════════
   FICHIER : partenaire-formulaire.js
   RÔLE    : Formulaire de besoins du partenaire (une page, 5 sections).
             Pré-remplit le nom d'organisation via ?p=<partenaire>,
             collecte les réponses, affiche un récap, gère l'envoi.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  SECTION 1  — Initialisation & paramètres URL (?p, ?token)            │
   │  SECTION 2  — Raccourcis DOM ($ / $$)                                 │
   │  SECTION 3  — Pré-remplissage depuis le vivier (data.json)           │
   │  SECTION 4  — Chips & selects : sélection & écoute                    │
   │  SECTION 5  — Lecture des valeurs (multiVals / val)                   │
   │  SECTION 6  — Collecte complète des réponses                          │
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

  /* ═══ SECTION 2 — RACCOURCIS DOM ════════════════════════════════════════
     $ → un élément ; $$ → liste d'éléments (en tableau). */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* ═══ SECTION 3 — PRÉ-REMPLISSAGE DEPUIS LE VIVIER ══════════════════════
     Charge data.json, retrouve le partenaire et sa fiche organisation.
     Pré-remplit uniquement les données organisationnelles publiques.
     Les coordonnées du contact restent volontairement vides. */
  async function prefill() {
    if (!pid) return;

    try {
      const v = await API.loadVivier();
      const partenaire = API.getPartenaire(v, pid);
      const fiche = v.organisations.find(o => o.id === pid);

      if (!partenaire) {
        console.error("Partenaire introuvable :", pid);
        return;
      }

      const p = { ...(fiche || {}), ...partenaire };

      $("#partnerTag").textContent = "MTL connecte 2026 — Service conciergerie";

      if (p.nom) {
        $("#f_org").value = p.nom;
        $("#orgPrefill").hidden = false;
      }

      if (p.site_web) $("#f_site").value = p.site_web;
      if (p.description) $("#f_desc").value = p.description;
      if (p.localisation) $("#f_lieu").value = p.localisation;

      if (p.type) {
        const type = $("#f_type");
        const option = Array.from(type.options).find(o =>
          o.value.toLowerCase() === p.type.toLowerCase()
        );
        if (option) type.value = option.value;
      }

      if (p.taille) {
        const tailles = {
          "Micro entreprise": "Micro (1-9)",
          "Petite entreprise": "Petite (10-49)",
          "Moyenne entreprise": "Moyenne (50-249)",
          "Grande entreprise": "Grande (250+)",
          "Très Grande entreprise": "Grande (250+)"
        };
        if (tailles[p.taille]) $("#f_taille").value = tailles[p.taille];
      }

      if (p.secteur) {
        const secteur = p.secteur.toLowerCase();

        $$("#f_secteurs .choice-chip").forEach(chip => {
          const valeur = chip.dataset.val.toLowerCase();
          let match = secteur.includes(valeur);

          if (valeur === "éducation" && secteur.includes("enseignement")) {
            match = true;
          }

          if (match) {
            chip.classList.add("selected");
            const icon = chip.querySelector("i");
            if (icon) icon.className = "fas fa-check";
          }
        });
      }

      updateRecap();

    } catch (e) {
      console.error("Erreur pré-remplissage :", e);
    }
  }

  /* ═══ SECTION 4 — CHIPS & SELECTS : SÉLECTION & ÉCOUTE ══════════════════
     Clic sur un chip = bascule sélectionné ; selects écoutés ;
     chaque changement rafraîchit le récap. */
  function bindChoices() {
    $$('[data-multi] .choice-chip').forEach(chip => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("selected");
        const i = chip.querySelector("i");
        if (i) i.className = chip.classList.contains("selected") ? "fas fa-check" : "fas fa-plus";
        updateRecap();
      });
    });
    ["f_type","f_taille"].forEach(id => { const el=$("#"+id); if(el) el.addEventListener("change", updateRecap); });
  }

  /* ═══ SECTION 5 — LECTURE DES VALEURS ═══════════════════════════════════
     multiVals → tableau des chips cochés ; val → valeur d'un champ texte. */
  function multiVals(id) {
    return $$(`#${id} .choice-chip.selected`).map(c => c.dataset.val);
  }
  const val = id => { const el = $("#" + id); return el ? el.value.trim() : ""; };

  /* ═══ SECTION 6 — COLLECTE COMPLÈTE DES RÉPONSES ════════════════════════
     Rassemble tous les champs des 5 sections en un seul objet.
     Les repères // 1..5 renvoient aux sections du formulaire HTML. */
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
      // 2 — Votre profil et vos coordonnées
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
      // 5 — Compléments
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

    // Rappel court — sections 1 & 2
    html += sub("Votre organisation");
    html += row("Organisation", d.organisation);
    html += row("Contact", d.contact_nom);

    // Ce qui sert à choisir les contacts — section 3
    html += sub("Qui vous souhaitez rencontrer");
    html += row("Type d'organisation recherché", d.type_recherche);
    html += row("Secteurs ciblés", d.secteurs_cibles);
    html += row("Taille recherchée", d.taille_recherchee);
    html += row("Rôles / fonctions visés", d.roles);

    // Objectifs — section 4
    html += sub("Vos objectifs");
    html += row("Objectifs", d.objectifs);
    html += row("Précisions", d.objectifs_libre);

    // Compléments — section 5
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
    const labels = ["Votre organisation","Votre profil","Qui rencontrer","Objectifs","Compléments"];
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const idx = +e.target.dataset.section;
          steps.forEach((s, i) => s.classList.toggle("done", i <= idx));
          $("#progressLabel").textContent = `Section ${idx + 1} sur 5 — ${labels[idx]}`;
        }
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    sections.forEach(s => io.observe(s));
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
    const join = v => Array.isArray(v) ? v.join(", ") : (v || "");
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
      contacts_identifies: data.contacts_identifies
    };
  }

  function bindSubmit() {
    $("#submitForm").addEventListener("click", async () => {
      const data = collect();
      if (!data.organisation) { toast("Merci d'indiquer le nom de votre organisation.", true); return; }
      if (!pid || !token) { toast("Lien invalide : identifiant ou jeton manquant.", true); return; }
      const btn = $("#submitForm");
      btn.disabled = true; const orig = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span> Enregistrement…`;
      try {
        await API.saveFormulaire(pid, token, toReponses(data));
        $("#formStatus").textContent = "Merci — vos informations ont bien été enregistrées.";
        toast("Vos préférences ont bien été enregistrées. Notre équipe préparera votre sélection.");
      } catch (e) {
        toast(e.message || "Échec de l'enregistrement. Réessayez.", true);
      } finally {
        btn.disabled = false; btn.innerHTML = orig;
      }
    });
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
    prefill(); bindChoices(); bindInputs(); bindProgress(); bindSubmit();
  });
})();
