/* ════════════════════════════════════════════════════════════════════════
   FICHIER : admin-partenaire.js
   VERSION : v65 — recharge du cœur admin avec contact principal
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
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const url = `${CONFIG.SHEET_API_URL}${separator}action=admin_check&token=${encodeURIComponent(adminToken)}&_=${Date.now()}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`Vérification administrateur impossible (${response.status}).`);

        const data = await response.json();
        if (data.error || data.ok !== true) throw new Error(data.error || "Accès administrateur refusé.");

        API.getFormNotificationsAdmin = originalGetFormNotificationsAdmin;
        return [];
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }

    throw lastError || new Error("Vérification administrateur impossible.");
  };

  /* ═══ SECTION 2 — CHARGEMENT DU CŒUR ADMIN ═══════════════════════════ */
  document.write('<script src="js/admin-partenaire-core.js?v=20261010-v61-core"><\/script>');
})();
