import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalizationAuthoringIndex, localizationSourceSnapshot } from "./lib/localization-source.mjs";

const root = process.cwd();
const libraryRoot = path.join(root, "data", "localization", "ru", "library");
const authoring = await loadLocalizationAuthoringIndex(root);
const sourceBySlug = new Map(authoring.map((entry) => [entry.slug, localizationSourceSnapshot(entry)]));

const reviewed = new Map([
  ["challenge-confirmation-bias-checklist", {
    title: "Проведите проверку на опровергающие данные",
    subtitle: "Сформулируйте, какие факты должны снизить уверенность в вашем выводе",
    description: "Сформулируйте один проверяемый тезис и заранее определите, какие данные заставили бы вас снизить уверенность в нём. Затем найдите релевантные надёжные источники, включая данные против вашей текущей версии, и обновите вывод, если факты этого требуют. Цель — проверить конкретное убеждение, а не автоматически искать противоположное мнение.",
  }],
  ["cut-your-losses-sunk-cost", {
    title: "Оценивайте обязательство по тому, что произойдёт дальше",
    subtitle: "Прошлые затраты не вернуть; сравнивайте будущие варианты",
    description: "Если уже потраченные время, деньги или усилия тянут вас к продолжению, отделите их от решения, которое принимается сейчас. Сравните реалистичные будущие расходы, пользу, ограничения, риски и альтернативы. Это проверка на ошибку невозвратных затрат, а не автоматическая команда прекратить проект.",
  }],
  ["if-then-rules-productivity", {
    title: "Свяжите конкретный сигнал с конкретным действием по правилу «если — то»",
    subtitle: "Превратите намерение в заранее определённую реакцию на наблюдаемую ситуацию",
    description: "Для цели, которую вы уже хотите реализовать, выберите конкретный наблюдаемый сигнал и выполнимое действие: «если происходит X, то я делаю Y». Такие намерения в формате «если — то» хорошо изучены как инструмент саморегуляции, но не гарантируют автоматического поведения и требуют реалистичного действия и подходящего контекста.",
  }],
  ["pause-to-avoid-anchoring-bias", {
    title: "Сделайте паузу перед тем, как принять первое число или формулировку за точку отсчёта",
    subtitle: "Отделите первый якорь от собственной независимой оценки",
    description: "Перед решением явно отметьте первое число, вариант, оценку или формулировку, которые могут стать якорем. Сформируйте независимую альтернативу или диапазон и проверьте данные, действительно важные для выбора. Пауза нужна не сама по себе — она создаёт место для второй точки отсчёта.",
  }],
  ["sunk-cost-decision-coach", {
    title: "Разберите сложное решение о продолжении или остановке по будущим сценариям",
    subtitle: "Для крупных обязательств учитывайте зависимости, переключение и интересы сторон",
    description: "Если решение связано с несколькими участниками, зависимостями или заметной стоимостью переключения, сравните будущие сценарии явно: продолжить, изменить курс или остановиться. Зафиксируйте текущие факты, затраты перехода, последствия для сторон и критерии следующего шага. Прошлые вложения полезны как информация, но сами по себе не оправдывают продолжение.",
  }],
]);

const found = new Set();
const files = (await readdir(libraryRoot)).filter((name) => name.endsWith(".json")).sort();
for (const name of files) {
  const file = path.join(libraryRoot, name);
  const batch = JSON.parse(await readFile(file, "utf8"));
  let changed = false;
  for (const record of batch.records || []) {
    const copy = reviewed.get(record.slug);
    if (!copy) continue;
    const source = sourceBySlug.get(record.slug);
    if (!source) throw new Error(`Canonical source missing for ${record.slug}`);
    record.source = source;
    record.title = copy.title;
    record.subtitle = copy.subtitle;
    record.description = copy.description;
    record.quality_state = "language-reviewed";
    found.add(record.slug);
    changed = true;
  }
  if (changed) await writeFile(file, `${JSON.stringify(batch, null, 2)}\n`);
}

const missing = [...reviewed.keys()].filter((slug) => !found.has(slug));
if (missing.length) throw new Error(`Reviewed RU migration targets missing: ${missing.join(", ")}`);
console.log(`Updated ${found.size} reviewed Russian records to current canonical source snapshots.`);
