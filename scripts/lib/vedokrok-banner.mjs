export const VEDOKROK_BANNER = `<aside class="vedokrok-banner" data-vedokrok-banner><div class="wrap vedokrok-banner__inner"><p class="vedokrok-banner__kicker">Now part of</p><p class="vedokrok-banner__name"><a href="https://vedokrok.com">Vedokrok</a></p><p class="vedokrok-banner__line">Brali explored one question: why does useful knowledge so rarely change what people do? Vedokrok turns the answer into a broader system — practical knowledge, ready at the moment it can change an action or decision.</p><p class="vedokrok-banner__cta"><a href="https://vedokrok.com">Explore Vedokrok →</a></p></div></aside>`;

export const VEDOKROK_BANNER_RU = `<aside class="vedokrok-banner" data-vedokrok-banner><div class="wrap vedokrok-banner__inner"><p class="vedokrok-banner__kicker">Теперь часть</p><p class="vedokrok-banner__name"><a href="https://vedokrok.com">Vedokrok</a></p><p class="vedokrok-banner__line">Brali изучал один вопрос: почему полезные знания так редко меняют то, что люди делают? Vedokrok превращает ответ на него в более широкую систему — практические знания, готовые в тот момент, когда могут изменить действие или решение.</p><p class="vedokrok-banner__cta"><a href="https://vedokrok.com">Открыть Vedokrok →</a></p></div></aside>`;

export const VEDOKROK_BANNER_DE = `<aside class="vedokrok-banner" data-vedokrok-banner><div class="wrap vedokrok-banner__inner"><p class="vedokrok-banner__kicker">Jetzt Teil von</p><p class="vedokrok-banner__name"><a href="https://vedokrok.com">Vedokrok</a></p><p class="vedokrok-banner__line">Brali hat eine Frage untersucht: Warum ändert nützliches Wissen so selten, was Menschen tun? Vedokrok verwandelt die Antwort darauf in ein umfassenderes System — praktisches Wissen, bereit in dem Moment, in dem es eine Handlung oder Entscheidung verändern kann.</p><p class="vedokrok-banner__cta"><a href="https://vedokrok.com">Vedokrok entdecken →</a></p></div></aside>`;

export const VEDOKROK_FOOTER_LINE = `<p class="vedokrok-footer">Now part of <a href="https://vedokrok.com">Vedokrok</a> — a broader practical knowledge system.</p>`;

export const VEDOKROK_FOOTER_LINE_RU = `<p class="vedokrok-footer">Теперь часть <a href="https://vedokrok.com">Vedokrok</a> — более широкой системы практических знаний.</p>`;

export const VEDOKROK_FOOTER_LINE_DE = `<p class="vedokrok-footer">Jetzt Teil von <a href="https://vedokrok.com">Vedokrok</a> — einem breiteren System praktischen Wissens.</p>`;

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
