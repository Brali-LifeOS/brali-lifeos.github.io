import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "data", "localization", "ru", "library");

const changes = new Map(Object.entries({
  "productive-day-sketch-planner": {
    description: "Набросайте, как выглядит удачный день: один-три приоритета, обязательные ограничения, время на восстановление и то, что можно убрать. Используйте этот черновик как ориентир, а не как расписание, которое нужно выполнить любой ценой."
  },
  "random-rewards-motivation-engine": {
    title: "Добавляйте небольшую случайность в вознаграждения за повторяющиеся задачи"
  },
  "routine-experiment-planner": {
    title: "Меняйте один параметр привычного процесса и проверяйте результат"
  },
  "routine-variation-coach": {
    title: "Добавляйте вариативность в повторяющиеся занятия"
  },
  "schedule-daily-worry-time": {
    description: "Если вы часто возвращаетесь к одним и тем же тревожным мыслям, выделите ограниченное время, чтобы записать их и решить, требует ли что-то действия. При сильной или стойкой тревоге эта техника самопомощи не заменяет профессиональную поддержку."
  },
  "shake-up-your-routine": {
    title: "Иногда меняйте привычный порядок действий"
  },
  "shared-family-goals-tracker": {
    description: "Выберите одну общую цель, договоритесь, что именно каждый делает, и периодически обсуждайте прогресс. Не превращайте семейную жизнь в систему постоянного контроля: цель должна быть добровольной и понятной всем участникам."
  },
  "standardize-routines-tools-triz": {
    subtitle: "Стандартизируйте повторяющиеся шаги и инструменты там, где это упрощает работу"
  },
  "tension-sprints-for-problem-solving": {
    description: "Если вопрос требует совместного решения, ограничьте обсуждение коротким рабочим отрезком с ясным вопросом, затем сделайте паузу и оцените идеи. Искусственная срочность не нужна: смысл в фокусе, а не в дополнительном стрессе."
  },
  "top-3-daily-focus-planner": {
    description: "Выберите до трёх задач, которые действительно важны сегодня, и держите их отдельно от общего списка. Если день изменился, пересмотрите приоритеты, а не пытайтесь во что бы то ни стало закрыть исходный список."
  },
  "triz-flexible-routines": {
    title: "Делайте привычные процессы гибкими, если условия меняются",
    description: "Если повторяющийся процесс регулярно ломается при смене условий, определите, какие его части можно сделать адаптивными: время, последовательность, инструмент или объём. Гибкость должна снижать трение, а не превращать процесс в постоянное переизобретение."
  },
  "values-goal-alignment-coach": {
    description: "Периодически проверяйте, поддерживают ли текущие цели то, что вы считаете важным. Если цель больше не соответствует приоритетам, скорректируйте её или способ движения к ней вместо автоматического продолжения."
  },
  "finish-on-time-timebox": {
    subtitle: "Заранее ограничьте время на задачу и определите критерий завершения"
  },
  "four-cs-communication-coach": {
    subtitle: "Четыре ориентира для проверки сообщения"
  },
  "guided-flooding-support-buddy": {
    subtitle: "Интенсивную экспозицию не стоит проводить как самостоятельный эксперимент при сильном страхе"
  },
  "learn-during-chores-with-podcasts": {
    title: "Совмещайте простые бытовые дела с аудиоматериалами, если внимание не страдает"
  },
  "memento-mori-action-tracker": {
    description: "Используйте напоминание о конечности времени, чтобы проверить приоритеты и выбрать конкретное действие сегодня. Если практика усиливает тревогу или тяжёлые мысли, откажитесь от неё: она не должна становиться способом давить на себя."
  }
}));

const files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
const seen = new Map([...changes.keys()].map((slug) => [slug, 0]));
let changedFiles = 0;
let changedFields = 0;

for (const name of files) {
  const file = path.join(dir, name);
  const batch = JSON.parse(await readFile(file, "utf8"));
  let dirty = false;
  for (const record of batch.records || []) {
    const patch = changes.get(record.slug);
    if (!patch) continue;
    seen.set(record.slug, (seen.get(record.slug) || 0) + 1);
    for (const [field, value] of Object.entries(patch)) {
      if (record[field] === value) continue;
      record[field] = value;
      changedFields += 1;
      dirty = true;
    }
  }
  if (dirty) {
    await writeFile(file, `${JSON.stringify(batch, null, 2)}\n`);
    changedFiles += 1;
  }
}

const missing = [...seen.entries()].filter(([, count]) => count !== 1);
if (missing.length) throw new Error(`Expected each closure slug exactly once: ${JSON.stringify(missing)}`);
console.log(`Russian final language closures applied: ${changedFields} field(s) across ${changedFiles} batch file(s).`);
