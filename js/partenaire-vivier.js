/* ════════════════════════════════════════════════════════════════════════
   FICHIER : partenaire-vivier.js
   RÔLE    : Propositions PN par défaut + exploration volontaire du vivier.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Paramètres & mode temporaire                                    │
   │  2 — Propositions PN                                                  │
   │  3 — Préchargement du vivier                                         │
   │  4 — Interface exploration                                           │
   │  5 — Sections                                                        │
   │  6 — Fin de chargement                                               │
   └──────────────────────────────────────────────────────────────────────┘

   RÈGLE ABSOLUE :
   - Une actualisation de la page revient toujours aux propositions PN.
   - Le vivier complet n'est visible qu'après un clic volontaire sur
     "Explorer tout le vivier".
   ════════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  /* ═══ SECTION 1 — PARAMÈTRES & MODE TEMPORAIRE ═══════════════════════ */
  const params = new URLSearchParams(location.search);
  const pid = (params.get("p") || "").trim();
  const token = (params.get("token") || "").trim();
  const exploreKey = `conciergerie_explore_once_${pid}`;
  const cacheKey = "conciergerie_vivier_cache_v10";

  const urlExplore = params.get("vivier") === "1";
  const clickExplore = sessionStorage.getItem(exploreKey) === "1";
  const exploreAll = urlExplore && clickExplore;

  // Le droit d'explorer est consommé immédiatement.
  // Ainsi F5 / Ctrl+F5 revient automatiquement aux propositions.
  sessionStorage.removeItem(exploreKey);

  if (urlExplore && !exploreAll) {
    const clean = new URL(location.href);
    clean.searchParams.delete("vivier");
    history.replaceState({}, "", clean);
  }

  if (typeof API === "undefined") return;

  const originalLoadVivier = API.loadVivier.bind(API);
  const originalGetPropositions = API.getPropositions.bind(API);
  const originalGetSelections = API.getSelections.bind(API);

  let pnIds = new Set();
  let fullPromise = null;

  const partnerDataPromise = pid && token
    ? Promise.all([
        originalGetPropositions(pid, token),
        originalGetSelections(pid, token).catch(() => [])
      ])
    : Promise.resolve([[], []]);

  /* ═══ SECTION 2 — PROPOSITIONS PN ═════════════════════════════════════ */
  API.getPropositions = async function(partenaireId, partnerToken) {
    const propre = String(partenaireId || "").trim();
    let propositions, selections;

    if (propre === pid && partnerToken === token) {
      [propositions, selections] = await partnerDataPromise;
    } else {
      [propositions, selections] = await Promise.all([
        originalGetPropositions(propre, partnerToken),
        originalGetSelections(propre, partnerToken).catch(() => [])
      ]);
    }

    pnIds = new Set((propositions || []).map(id => String(id || "").trim()).filter(Boolean));

    const selectedIds = (selections || [])
      .map(id => String(id || "").trim())
      .filter(id => id && id !== propre);

    if (!exploreAll) {
      return [...new Set([...pnIds, ...selectedIds])];
    }

    const vivier = await loadFullVivier();
    const allIds = (vivier.organisations || [])
      .map(org => String(org?.id || "").trim())
      .filter(id => id && id !== propre);

    return [...new Set([...allIds, ...selectedIds])];
  };

  API.getSelections = async function(partenaireId, partnerToken) {
    if (String(partenaireId || "").trim() === pid && partnerToken === token) {
      const [, selections] = await partnerDataPromise;
      return Array.isArray(selections) ? selections : [];
    }
    return originalGetSelections(partenaireId, partnerToken);
  };

  /* ═══ SECTION 3 — PRÉCHARGEMENT DU VIVIER ═════════════════════════════ */
  function loadFullVivier() {
    if (fullPromise) return fullPromise;

    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.data && Date.now() - cached.savedAt < 30 * 60 * 1000) {
          fullPromise = Promise.resolve(cached.data);
          return fullPromise;
        }
      }
    } catch (_) {}

    fullPromise = originalLoadVivier().then(vivier => {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: vivier }));
      } catch (_) {}
      return vivier;
    });

    return fullPromise;
  }

  function preloadFullVivier() {
    if (exploreAll) return;
    hideExplore();
    loadFullVivier().then(showExplore).catch(showExplore);
  }

  /* ═══ SECTION 4 — INTERFACE EXPLORATION ═══════════════════════════════ */
  function hideExplore() {
    ["#exploreVivierNote", "#exploreVivierActions"].forEach(sel => {
      const node = document.querySelector(sel);
      if (node) {
        node.hidden = true;
        node.style.display = "none";
      }
    });
  }

  function showExplore() {
    ["#exploreVivierNote", "#exploreVivierActions"].forEach(sel => {
      const node = document.querySelector(sel);
      if (node) {
        node.hidden = false;
        node.style.display = "";
      }
    });
  }

  function init() {
    const button = document.querySelector("#exploreVivierBtn");
    const text = document.querySelector("#exploreVivierText");

    if (!exploreAll) hideExplore();

    if (button && exploreAll) {
      button.innerHTML = '<i class="fas fa-arrow-left"></i> Revenir aux propositions PN';
      if (text) text.textContent =
        "Vous explorez tout le vivier. Votre propre organisation est automatiquement exclue.";
    }

    if (button) {
      button.addEventListener("click", () => {
        const next = new URL(location.href);

        if (exploreAll) {
          next.searchParams.delete("vivier");
        } else {
          sessionStorage.setItem(exploreKey, "1");
          next.searchParams.set("vivier", "1");
        }

        location.href = next.toString();
      });
    }

    waitForList();
  }

  /* ═══ SECTION 5 — SECTIONS ════════════════════════════════════════════ */
  function styleSections() {
    const grid = document.querySelector("#orgGrid");
    if (!grid) return;

    let sections = [...grid.querySelectorAll(":scope > .partner-list-section")];
    const selected = sections.find(s => s.classList.contains("selected") && !s.dataset.vivierDerived);
    const other = sections.find(s => s.classList.contains("other") && !s.dataset.vivierDerived);

    styleSection(selected, "Vos choix actuels");

    if (other && !exploreAll) {
      styleSection(other, "Nos propositions");
    } else if (other && exploreAll) {
      const pn = cloneFiltered(other, id => pnIds.has(id), "pn");
      const rest = cloneFiltered(other, id => !pnIds.has(id), "rest");

      styleSection(pn, "Nos propositions");
      styleSection(rest, "Autres organisations");
      other.replaceWith(pn, rest);
    }

    sections = [...grid.querySelectorAll(":scope > .partner-list-section")];
    sections.forEach(section => {
      if (!section.querySelector("[data-id]")) section.remove();
    });

    sections = [...grid.querySelectorAll(":scope > .partner-list-section")];
    sections.forEach((section, index) => {
      if (index > 0) {
        section.style.borderTop = "1px solid #DDE0DC";
        section.style.paddingTop = "28px";
        section.style.marginTop = "28px";
      }
    });
  }

  function cloneFiltered(source, keep, marker) {
    const clone = source.cloneNode(true);
    clone.dataset.vivierDerived = marker;

    clone.querySelectorAll("[data-id]").forEach(card => {
      if (!keep(String(card.dataset.id || "").trim())) card.remove();
    });

    clone.querySelectorAll(".partner-sector-group").forEach(group => {
      if (!group.querySelector("[data-id]")) group.remove();
    });

    return clone;
  }

  function styleSection(section, title) {
    if (!section) return;

    const heading = section.querySelector(".partner-list-heading");
    const h2 = section.querySelector(".partner-list-heading h2");
    const count = section.querySelector(".partner-list-heading > span");

    if (heading) {
      heading.style.display = "block";
      heading.style.textAlign = "center";
    }

    if (h2) {
      h2.textContent = title;
      h2.style.fontSize = "26px";
      h2.style.textAlign = "center";
      h2.style.margin = "0 0 12px";
    }

    if (count) count.style.display = "none";
  }

  /* ═══ SECTION 6 — FIN DE CHARGEMENT ═══════════════════════════════════ */
  function waitForList() {
    const started = Date.now();

    const check = () => {
      const grid = document.querySelector("#orgGrid");
      const ready = !!grid &&
        (grid.querySelector(".partner-list-section") || grid.querySelector(".partner-list-empty"));

      if (ready || Date.now() - started > 12000) {
        styleSections();

        const loading = document.querySelector("#listLoadingNote");
        const result = document.querySelector("#resultCount");
        const actions = document.querySelector("#postListActions");

        if (loading) {
          loading.hidden = true;
          loading.style.display = "none";
        }

        if (result) {
          result.hidden = false;
          result.style.display = "";
        }

        if (grid) {
          grid.hidden = false;
          grid.style.display = "";
        }

        if (actions) {
          actions.hidden = false;
          actions.style.display = "";
        }

        if (!exploreAll) {
          hideExplore();
          setTimeout(preloadFullVivier, 0);
        }

        return;
      }

      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  }

  document.addEventListener("click", event => {
    if (event.target.closest("#orgGrid, #filterPanel")) {
      requestAnimationFrame(() => requestAnimationFrame(styleSections));
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();