import fs from "node:fs";

const pages = [
  "ru/index.html",
  "ru/research/index.html",
  "ru/partners/index.html",
  "ru/for-ai/index.html"
];
const required = ["Настройки аналитики", "Необязательная аналитика", "Разрешить аналитику", "Только необходимое"];
const leaked = ["Analytics preference", "Optional analytics", "Allow analytics", "Necessary only"];

for (const file of pages) {
  const html = fs.readFileSync(file, "utf8");
  for (const token of required) if (!html.includes(token)) throw new Error(`${file} missing localized consent token: ${token}`);
  for (const token of leaked) if (html.includes(token)) throw new Error(`${file} leaked English consent token: ${token}`);
}

console.log(`RU analytics consent localization passed on ${pages.length} representative pages.`);
