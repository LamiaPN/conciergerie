/* ============================================================
   config.js — Configuration centrale
   Le seul fichier à éditer pour brancher ton Google Sheet.
   ============================================================ */
const CONFIG = {
  // URL /exec de ton déploiement Google Apps Script (voir apps-script.gs).
  // Reste "" tant que non déployé : l'app fonctionne alors en mémoire (démo).
  SHEET_API_URL: "https://script.google.com/macros/s/AKfycbxMZAaAgRw7L0MuMb9RAQVsSlQnrJbKJBmzkdGEPshYYYPVYi7WLq2d9s8QdXJqW5YmNQ/exec",

  // Chemin du vivier exporté depuis Airtable.
  DATA_URL: "js/data.json",

  // Délai d'attente réseau (ms) avant de considérer une requête échouée.
  TIMEOUT_MS: 8000
};
