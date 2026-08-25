(() => {
  "use strict";

  if (typeof document === "undefined" || typeof location === "undefined") return;

  const params = new URLSearchParams(location.search);
  const partenaireId = String(params.get("p") || "").trim();
  const token = String(params.get("token") || "").trim();
  const current = document.body.dataset.partnerPage || "";

  const pages = {
    besoins: "partenaire-formulaire.html",
    choix: "partenaire-selection.html",
    rendezvous: "partenaire-rendezvous.html"
  };

  const query = new URLSearchParams();
  if (partenaireId) query.set("p", partenaireId);
  if (token) query.set("token", token);

  document.querySelectorAll("[data-partner-nav]").forEach(link => {
    const target = link.dataset.partnerNav;
    const file = pages[target];
    if (!file) return;

    link.href = query.toString() ? `${file}?${query.toString()}` : file;

    const active = target === current;
    link.classList.toggle("active", active);

    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
})();
