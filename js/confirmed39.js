/* =====================================================
   PILOTE - CONFIRMED39.JS

   Rôle :
   Intégrer une seule fois l'état courant des 39 partenaires
   privés confirmés 2026 à partir de l'export Airtable fourni
   par Lamia, sans recréer les organisations ni écraser les
   tâches déjà saisies dans Pilote.

   SOMMAIRE
   1. Données source intégrées
   2. Normalisation et recherche
   3. Processus Visibilité minimal
   4. Lecture des états Commercial / Entente
   5. Lecture des états Visibilité
   6. Intégration non destructive des 39 partenaires
   7. API publique

   RÈGLES
   - Les 39 organisations existent déjà dans le Vivier : on les
     retrouve par nom normalisé, on ne les duplique jamais.
   - La colonne Suivi est découpée par processus : le statut
     Entente/Commercial n'écrase jamais le statut Visibilité.
   - Aucun historique n'est inventé et aucune Action n'est créée
     automatiquement : on enregistre l'état atteint + la prochaine
     tâche standard suggérée, que Lamia pourra choisir de créer.
   - Le processus Visibilité créé ici est minimal et administrable.
===================================================== */

(function () {
  "use strict";

  const VERSION = 1;
  const SOURCE_LABEL = "Partenaires privés confirmés 2026";
  const PARTNERS = [
  {
    "nom": "Action TI",
    "suivi": "16-Entente envoyée,21-Suivi  visibilité",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Aleia",
    "suivi": "15-Rédaction entente,Éléments de visibilité a venir",
    "statutEntente": "3- en Validation",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "AQIII (L’Association québécoise des informaticiennes et informaticiens indépendants)",
    "suivi": "16-Entente en attente  de signature,22-éléments envoyés",
    "statutEntente": "3- en Validation",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Atelier B2B",
    "suivi": "15-Rédaction entente,25- Relance visibilité",
    "statutEntente": "7-Contresignée",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "BAnQ",
    "suivi": "17- Entente Signée,22-éléments envoyés,éléments de visbilite recu",
    "statutEntente": "6-Demande de contresignature",
    "statutFacture": "En attente"
  },
  {
    "nom": "BDC",
    "suivi": "15-Rédaction entente",
    "statutEntente": "4-Envoyée",
    "statutFacture": ""
  },
  {
    "nom": "Behaviour Interactive",
    "suivi": "16-Entente envoyée,Éléments de visibilité a venir",
    "statutEntente": "",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "BRP",
    "suivi": "15-Rédaction entente,Éléments de visibilité a venir",
    "statutEntente": "2-Rédigée",
    "statutFacture": ""
  },
  {
    "nom": "Concordia University",
    "suivi": "16-Entente envoyée,Éléments de visibilité a venir",
    "statutEntente": "",
    "statutFacture": ""
  },
  {
    "nom": "Cybereco",
    "suivi": "22-éléments envoyés,éléments de visbilite recu",
    "statutEntente": "8-Entente contresignée transmise",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "DataFranca",
    "suivi": "15-Rédaction entente,22-éléments envoyés",
    "statutEntente": "4-Envoyée",
    "statutFacture": "En attente"
  },
  {
    "nom": "Desjardins Caisse des Technologies",
    "suivi": "16-Entente en attente  de signature,22-éléments envoyés",
    "statutEntente": "4-Envoyée",
    "statutFacture": "En attente"
  },
  {
    "nom": "Dialog Insight",
    "suivi": "17- Entente Signée,22-éléments envoyés,éléments de visbilite recu",
    "statutEntente": "8-Entente contresignée transmise",
    "statutFacture": "Facture envoyée"
  },
  {
    "nom": "Données SOUVERAINES QUÉBEC",
    "suivi": "16-Entente en attente  de signature,21-Suivi  visibilité",
    "statutEntente": "3- en Validation",
    "statutFacture": ""
  },
  {
    "nom": "Druide",
    "suivi": "17- Entente Signée,22-éléments envoyés,21-Suivi  visibilité",
    "statutEntente": "8-Entente contresignée transmise",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Eficio",
    "suivi": "17- Entente Signée,22-éléments envoyés",
    "statutEntente": "8-Entente contresignée transmise",
    "statutFacture": "Facture envoyée"
  },
  {
    "nom": "Felix & Paul Studios",
    "suivi": "16-Entente envoyée,Éléments de visibilité a venir",
    "statutEntente": "4-Envoyée",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "GLM Conseil",
    "suivi": "15-Rédaction entente,Éléments de visibilité a venir",
    "statutEntente": "1-Proposition",
    "statutFacture": ""
  },
  {
    "nom": "IRIU",
    "suivi": "5 -1 ère rencontre planifiée,21-Suivi  visibilité",
    "statutEntente": "1-Proposition",
    "statutFacture": ""
  },
  {
    "nom": "ISACA",
    "suivi": "16-Entente en attente  de signature,22-éléments envoyés",
    "statutEntente": "4-Envoyée",
    "statutFacture": "En attente"
  },
  {
    "nom": "Le lien multimédia",
    "suivi": "15-Rédaction entente",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Le Monde",
    "suivi": "15-Rédaction entente,Éléments de visibilité a venir",
    "statutEntente": "1-Proposition",
    "statutFacture": ""
  },
  {
    "nom": "Le Wagon",
    "suivi": "17- Entente Signée,22-éléments envoyés,éléments de visbilite recu",
    "statutEntente": "7-Contresignée",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "makila ai",
    "suivi": "22-éléments envoyés",
    "statutEntente": "8-Entente contresignée transmise",
    "statutFacture": "Facture envoyée"
  },
  {
    "nom": "Moment Factory",
    "suivi": "16-Entente envoyée,Éléments de visibilité a venir",
    "statutEntente": "4-Envoyée",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Montreal International",
    "suivi": "15-Rédaction entente,21-Suivi  visibilité",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "PairConnex",
    "suivi": "17- Entente Signée,21-Suivi  visibilité",
    "statutEntente": "7-Contresignée",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "paysages.studio X",
    "suivi": "7-Documents envoyés,21-Suivi  visibilité",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Pixsenses",
    "suivi": "15-Rédaction entente,25- Relance visibilité",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Plumfind",
    "suivi": "17- Entente Signée,22-éléments envoyés",
    "statutEntente": "8-Entente contresignée transmise",
    "statutFacture": "Facture envoyée"
  },
  {
    "nom": "PME MTL",
    "suivi": "15-Rédaction entente,21-Suivi  visibilité",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "R2i",
    "suivi": "17- Entente Signée,21-Suivi  visibilité",
    "statutEntente": "4-Envoyée",
    "statutFacture": ""
  },
  {
    "nom": "Royal Photo",
    "suivi": "15-Rédaction entente,Éléments de visibilité a venir",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Sterling North Partners",
    "suivi": "16-Entente en attente  de signature,22-éléments envoyés,éléments de visbilite recu",
    "statutEntente": "4-Envoyée",
    "statutFacture": "En attente"
  },
  {
    "nom": "Tourisme Montréal",
    "suivi": "11-Suivi à faire,Éléments de visibilité a venir",
    "statutEntente": "1-Proposition",
    "statutFacture": ""
  },
  {
    "nom": "UM6P",
    "suivi": "16-Entente envoyée,21-Suivi  visibilité",
    "statutEntente": "4-Envoyée",
    "statutFacture": ""
  },
  {
    "nom": "URSA Marketing",
    "suivi": "16-Entente envoyée,Éléments de visibilité a venir",
    "statutEntente": "6-Demande de contresignature",
    "statutFacture": ""
  },
  {
    "nom": "Women Techmakers Montréal",
    "suivi": "21-Suivi  visibilité",
    "statutEntente": "1-Proposition",
    "statutFacture": "Aucune facture"
  },
  {
    "nom": "Xn Québec",
    "suivi": "22-éléments envoyés",
    "statutEntente": "4-Envoyée",
    "statutFacture": "Aucune facture"
  }
];

  const VISIBILITY_TASKS = [
    ["Éléments de visibilité à venir", false],
    ["Faire le suivi de la visibilité", true],
    ["Éléments de visibilité envoyés", false],
    ["Relancer la visibilité", true],
    ["Éléments de visibilité reçus", false]
  ];

  /* =====================================================
     2. NORMALISATION ET RECHERCHE
  ===================================================== */

  function nowIso() { return window.PiloteUtils.nowIso(); }
  function uuid() { return window.PiloteUtils.uuid(); }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function compact(value) { return normalize(value).replace(/\s+/g, ""); }

  function findProcess(state, name) {
    const key = normalize(name);
    return (state.processus || []).find(item => normalize(item.nom) === key) || null;
  }

  function findModelByTitle(state, processusId, title) {
    const key = normalize(title);
    return (state.modelesTache || []).find(item =>
      item.processusId === processusId && normalize(item.titre) === key
    ) || null;
  }

  function findOrganisation(state, name) {
    const key = compact(name);
    return (state.organisations || []).find(item => compact(item.nom) === key) || null;
  }

  function findRole2026(state, organisationId) {
    return (state.rolesCommandite || []).find(item =>
      item.organisationId === organisationId && String(item.edition) === "2026"
    ) || null;
  }

  /* =====================================================
     3. PROCESSUS VISIBILITÉ MINIMAL
  ===================================================== */

  function ensureVisibilityProcess(state) {
    state.processus = Array.isArray(state.processus) ? state.processus : [];
    state.modelesTache = Array.isArray(state.modelesTache) ? state.modelesTache : [];

    let process = findProcess(state, "Visibilité");
    let created = false;

    if (!process) {
      process = {
        id: uuid(),
        modifieLe: nowIso(),
        nom: "Visibilité",
        structure: "libre",
        actif: true
      };
      state.processus.push(process);
      created = true;
    }

    if (created || !(state.modelesTache || []).some(item => item.processusId === process.id)) {
      VISIBILITY_TASKS.forEach(([titre, repetable], index) => {
        state.modelesTache.push({
          id: uuid(),
          modifieLe: nowIso(),
          processusId: process.id,
          phase: window.PiloteSOP.FREE_PHASE,
          titre,
          ordre: index + 1,
          parentId: null,
          tacheSuivanteId: null,
          repetable: Boolean(repetable),
          actif: true,
          note: "Initialisé depuis les états Airtable des partenaires confirmés. Modifiable dans l’éditeur SOP."
        });
      });
      window.PiloteSOP.rebuildNextLinks(process.id, state);
    }

    return process;
  }

  /* =====================================================
     4. ÉTAT COMMERCIAL / ENTENTE
  ===================================================== */

  function resolveCommercialState(row, state, commercial) {
    const suivi = normalize(row.suivi);
    const entente = normalize(row.statutEntente);
    const facture = normalize(row.statutFacture);

    const make = (etatLibelle, nextTitle = null, sourceChamp = "Suivi") => {
      const nextModel = nextTitle ? findModelByTitle(state, commercial.id, nextTitle) : null;
      return {
        etatLibelle,
        prochaineTacheModeleId: nextModel?.id || null,
        prochaineTacheTitre: nextModel?.titre || null,
        sourceChamp,
        sourceValeur: sourceChamp === "Statut Facture" ? row.statutFacture : (sourceChamp === "Statut de l'entente" ? row.statutEntente : row.suivi)
      };
    };

    if (facture.includes("facture envoyee")) return make("Facture envoyée", "Confirmer le paiement reçu", "Statut Facture");

    if (entente.includes("8-entente contresignee transmise")) {
      if (facture.includes("aucune facture")) return make("Entente transmise — sans facture", null, "Statut de l'entente");
      return make("Entente transmise — facturation à poursuivre", "Demander / émettre la facture", "Statut de l'entente");
    }

    if (entente.includes("7-contresignee")) return make("Entente contresignée", "Préparer la transmission de l’entente", "Statut de l'entente");
    if (entente.includes("6-demande de contresignature")) return make("Demande de contresignature", "Faire contresigner l’entente", "Statut de l'entente");

    if (suivi.includes("17 entente signee")) return make("Entente signée", "Faire contresigner l’entente");

    if (entente.includes("4-envoyee") || suivi.includes("16 entente envoyee") || suivi.includes("16 entente en attente de signature")) {
      return make("Entente envoyée / en attente de signature", "Relancer pour signature");
    }

    if (entente.includes("3 en validation")) return make("Entente en validation", "Faire valider l’entente", "Statut de l'entente");
    if (entente.includes("2-redigee") || entente.includes("2 redigee")) return make("Entente rédigée", "Faire valider l’entente", "Statut de l'entente");
    if (suivi.includes("15 redaction entente")) return make("Rédaction de l’entente", "Préparer l’entente");
    if (suivi.includes("7 documents envoyes")) return make("Proposition / documents envoyés", "Faire le suivi de la proposition");
    if (suivi.includes("11 suivi a faire")) return make("Suivi de proposition à faire", "Faire le suivi de la proposition");
    if (suivi.includes("5 1 ere rencontre planifiee")) return make("Première rencontre planifiée", "Première rencontre effectuée");

    return make("Partenariat confirmé", null, "Statut partenaires");
  }

  /* =====================================================
     5. ÉTAT VISIBILITÉ
  ===================================================== */

  function resolveVisibilityState(row, state, visibility) {
    const suivi = normalize(row.suivi);
    const make = (etatLibelle, nextTitle = null) => {
      const nextModel = nextTitle ? findModelByTitle(state, visibility.id, nextTitle) : null;
      return {
        etatLibelle,
        prochaineTacheModeleId: nextModel?.id || null,
        prochaineTacheTitre: nextModel?.titre || null,
        sourceChamp: "Suivi",
        sourceValeur: row.suivi
      };
    };

    if (suivi.includes("elements de visbilite recu") || suivi.includes("elements de visibilite recu")) {
      return make("Éléments de visibilité reçus", null);
    }
    if (suivi.includes("25 relance visibilite")) return make("Relance visibilité", "Relancer la visibilité");
    if (suivi.includes("22 elements envoyes")) return make("Éléments de visibilité envoyés", "Relancer la visibilité");
    if (suivi.includes("21 suivi visibilite")) return make("Suivi visibilité", "Faire le suivi de la visibilité");
    if (suivi.includes("elements de visibilite a venir")) return make("Éléments de visibilité à venir", "Faire le suivi de la visibilité");
    return null;
  }

  /* =====================================================
     6. INTÉGRATION NON DESTRUCTIVE
  ===================================================== */

  async function ensureImported() {
    const state = window.PiloteState;
    if (!state) throw new Error("PiloteState n'est pas initialisé.");

    const previous = state.ui?.confirmed39Integration;
    if (previous?.version === VERSION && previous?.completed === true) return previous;

    const commercial = findProcess(state, "Commercial");
    if (!commercial) throw new Error("Le processus Commercial est introuvable.");
    const visibility = ensureVisibilityProcess(state);

    const report = {
      version: VERSION,
      completed: false,
      source: SOURCE_LABEL,
      expected: PARTNERS.length,
      matched: 0,
      missing: [],
      commercialStates: 0,
      visibilityStates: 0,
      importedAt: nowIso()
    };

    PARTNERS.forEach(row => {
      const org = findOrganisation(state, row.nom);
      if (!org) {
        report.missing.push(row.nom);
        return;
      }

      const role = findRole2026(state, org.id);
      if (!role) {
        report.missing.push(`${row.nom} (dossier 2026 absent)`);
        return;
      }

      // Conserver l’état local actif/dormant choisi dans Pilote.
      role.modifieLe = nowIso();
      role.suiviProcessus = role.suiviProcessus && typeof role.suiviProcessus === "object"
        ? { ...role.suiviProcessus }
        : {};

      const commercialState = resolveCommercialState(row, state, commercial);
      role.suiviProcessus[commercial.id] = {
        processusId: commercial.id,
        processusNom: commercial.nom,
        ...commercialState,
        importeLe: nowIso()
      };
      report.commercialStates += 1;

      const visibilityState = resolveVisibilityState(row, state, visibility);
      if (visibilityState) {
        role.suiviProcessus[visibility.id] = {
          processusId: visibility.id,
          processusNom: visibility.nom,
          ...visibilityState,
          importeLe: nowIso()
        };
        report.visibilityStates += 1;
      }

      report.matched += 1;
    });

    report.completed = report.matched === report.expected;
    state.ui = { ...(state.ui || {}), confirmed39Integration: report };

    await window.PiloteStorage.saveState(state);
    window.PiloteState = await window.PiloteStorage.loadState(window.PiloteStorage.emptyState());
    return window.PiloteState.ui.confirmed39Integration;
  }

  /* =====================================================
     7. API PUBLIQUE
  ===================================================== */

  window.PiloteConfirmed39 = {
    VERSION,
    ensureImported,
    getReport: () => window.PiloteState?.ui?.confirmed39Integration || null
  };
})();
