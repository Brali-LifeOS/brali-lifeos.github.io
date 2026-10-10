// Shared presentation copy. Rebuild the shell and locale pages after editing.
function banner(label, name, dismissLabel) {
  return `<aside class="vedokrok-banner" data-vedokrok-banner><div class="wrap vedokrok-banner__inner"><img class="vedokrok-banner__logo" src="/assets/images/vedokrok-logo.webp" alt="" width="24" height="30"><p class="vedokrok-banner__line">${label} <a href="https://vedokrok.com">${name} →</a></p><button class="vedokrok-banner__dismiss" type="button" aria-label="${dismissLabel}" data-vedokrok-dismiss><i class="ri-close-line" aria-hidden="true"></i></button></div><script src="/assets/vedokrok-banner.js?v=20261010"></script></aside>`;
}

export const VEDOKROK_BANNER = banner("Brali is now part of", "Vedokrok", "Hide the Vedokrok announcement");
export const VEDOKROK_BANNER_RU = banner("Brali теперь часть", "Ведокрока", "Скрыть сообщение о Ведокроке");
export const VEDOKROK_BANNER_DE = banner("Brali ist jetzt Teil von", "Vedokrok", "Vedokrok-Mitteilung ausblenden");

export const VEDOKROK_FOOTER_LINE = `<p class="vedokrok-footer">Brali is part of <a href="https://vedokrok.com">Vedokrok</a>. Explore practical ideas for life and work.</p>`;
export const VEDOKROK_FOOTER_LINE_RU = `<p class="vedokrok-footer">Brali — часть <a href="https://vedokrok.com">Ведокрока</a>. Практические идеи для жизни и работы.</p>`;
export const VEDOKROK_FOOTER_LINE_DE = `<p class="vedokrok-footer">Brali ist Teil von <a href="https://vedokrok.com">Vedokrok</a>. Praktische Ideen für Alltag und Arbeit.</p>`;

export function vedokrokBannerFor(rel) {
  if (rel.startsWith("ru/")) return VEDOKROK_BANNER_RU;
  if (rel.startsWith("de/")) return VEDOKROK_BANNER_DE;
  return VEDOKROK_BANNER;
}

export function vedokrokFooterLineFor(rel) {
  if (rel.startsWith("ru/")) return VEDOKROK_FOOTER_LINE_RU;
  if (rel.startsWith("de/")) return VEDOKROK_FOOTER_LINE_DE;
  return VEDOKROK_FOOTER_LINE;
}
