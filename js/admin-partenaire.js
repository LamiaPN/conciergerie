/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-partenaire.js
   VERSION : v59 — validation admin légère puis chargement différé
   RÔLE    : Accélère le contrôle du token avant le chargement du cœur admin.

   ┌─ SOMMAIRE ───────────────────────────────────────────────────────────┐
   │  1 — Contrôle admin léger                                            │
   │  2 — Chargement du cœur admin                                        │
   └──────────────────────────────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  /* ═══ SECTION 1 — CONTRÔLE ADMIN LÉGER ════════════════════════════════ */
  const originalGetFormNotificationsAdmin = API.getFormNotificationsAdmin.bind(API);
  let firstAdminCheck = true;

  API.getFormNotificationsAdmin = async function(adminToken) {
    if (!firstAdminCheck) return originalGetFormNotificationsAdmin(adminToken);
    firstAdminCheck = false;

    if (!CONFIG.SHEET_API_URL) throw new Error("La vérification administrateur est indisponible.");

    const separator = CONFIG.SHEET_API_URL.includes("?") ? "&" : "?";
    const url = `${CONFIG.SHEET_API_URL}${separator}action=admin_check&token=${encodeURIComponent(adminToken)}&_=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Vérification administrateur impossible (${response.status}).`);

    const data = await response.json();
    if (data.error || data.ok !== true) throw new Error(data.error || "Accès administrateur refusé.");

    API.getFormNotificationsAdmin = originalGetFormNotificationsAdmin;
    return [];
  };

  /* ═══ SECTION 2 — CHARGEMENT DU CŒUR ADMIN ═══════════════════════════ */
  document.write('<script src="js/admin-partenaire-core.js?v=20260916-v58-core"><\/script>');
})();
