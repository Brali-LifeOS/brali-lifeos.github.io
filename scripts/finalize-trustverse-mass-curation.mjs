import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.join(root, "data/life-os-content");
const indexPath = path.join(contentRoot, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
let changed = 0;

const taxonomyReassignments = new Map([
  ["adopt-new-tools-at-work", {
    from: { slug: "cardio-doc", title: "Cardio Doc" },
    to: { slug: "work", title: "Work" },
    reason: "This protocol is about low-risk workplace tool adoption. Its historical Cardio Doc placement came from an analogy in inherited generated copy, not from medical guidance.",
  }],
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

for (const entry of index) {
  const file = path.join(contentRoot, `${entry.slug}.json`);
  const raw = await readFile(file, "utf8");
  const article = JSON.parse(raw);
  if (!article.trustverseCuration) continue;

  if (typeof article.subtitle === "string") {
    article.subtitle = article.subtitle.replace(/without assuming a guaranteed result\.?/gi, "without assuming the outcome in advance.");
  }

  const reassignment = taxonomyReassignments.get(entry.slug);
  if (reassignment) {
    article.zone = { ...reassignment.to };
    article.lifeOsSource = {
      ...(article.lifeOsSource ?? {}),
      zone: reassignment.to.title,
      zoneSlug: reassignment.to.slug,
    };
    article.keywords = unique((article.keywords ?? [])
      .map((value) => value === reassignment.from.title ? reassignment.to.title : value)
      .concat([reassignment.to.title, "work tools", "tool adoption"]));
    article.title = "Test a New Work Tool on a Low-Risk Task";
    article.subtitle = "Adopt tools deliberately instead of adopting them because they are new.";
    article.description = "Pick one recurring work problem, try one tool on a noncritical task, compare the old and new workflow, then keep, adjust, or drop it based on what you observe.";
    article.lifeOsSource.hack = "Treat a new work tool as a small reversible comparison rather than a commitment to change the whole workflow.";
    article.lifeOsSource.whatYouDo = "Choose one recurring low-risk work task, note how you handle it now, try one new tool on a test or noncritical case, compare the result and friction, and decide whether to repeat, adjust, or stop.";
    article.lifeOsSource.checkIn = "What task did I test, what changed in the workflow, what friction appeared, and is the next step to keep, adjust, or drop the tool?";
    article.faq = [
      {
        id: `${entry.slug}-faq-1`,
        question: "How small should the first test be?",
        answer: "Use a task where mistakes are easy to reverse and where you can compare the old and new workflow without committing the team or production process.",
        answerHtml: "<p>Use a task where mistakes are easy to reverse and where you can compare the old and new workflow without committing the team or production process.</p>",
      },
      {
        id: `${entry.slug}-faq-2`,
        question: "What should I compare?",
        answer: "Compare the observable things that matter for this task: steps, time, rework, errors, handoffs, clarity, or friction. Choose only the measures that actually affect the decision.",
        answerHtml: "<p>Compare the observable things that matter for this task: steps, time, rework, errors, handoffs, clarity, or friction. Choose only the measures that actually affect the decision.</p>",
      },
      {
        id: `${entry.slug}-faq-3`,
        question: "When should I stop trying the tool?",
        answer: "Stop when the tool creates unacceptable risk, requires access you should not grant, handles data in a way your rules do not permit, or simply does not improve the task enough to justify the added friction.",
        answerHtml: "<p>Stop when the tool creates unacceptable risk, requires access you should not grant, handles data in a way your rules do not permit, or simply does not improve the task enough to justify the added friction.</p>",
      },
    ];
    article.body = {
      intro: { html: `<p>${article.description}</p>` },
      sections: [
        { slug: "problem", title: "1. Pick one recurring problem", html: "<p>Choose a narrow work task with visible friction. Describe the current workflow before choosing a tool, so the test is tied to a real problem rather than novelty.</p>" },
        { slug: "try", title: "2. Try it in a reversible setting", html: "<p>Use a test, draft or other noncritical case. Keep the first run small enough that you can undo it and avoid exposing sensitive data or production work to an unapproved tool.</p>" },
        { slug: "compare", title: "3. Compare the workflows", html: "<p>Look at the few observable measures that matter for the task, such as steps, time, rework, errors or handoffs. Record what became easier and what new friction appeared.</p>" },
        { slug: "decision", title: "4. Keep, adjust or drop", html: "<p>Repeat the tool only when another run is justified by what you observed. Otherwise change the setup or stop. A failed small test is useful if it prevents a larger bad adoption decision.</p>" },
      ],
    };
    article.trustverseCuration = {
      ...article.trustverseCuration,
      retained_high_risk_gate: false,
      taxonomy_reclassification: {
        from: reassignment.from.slug,
        to: reassignment.to.slug,
        reason: reassignment.reason,
        reviewed_at: "2026-09-11",
      },
    };
    entry.zone = { ...reassignment.to };
    entry.keywords = unique((entry.keywords ?? [])
      .map((value) => value === reassignment.from.title ? reassignment.to.title : value)
      .concat([reassignment.to.title, "work tools", "tool adoption"]));
  }

  for (const field of ["title", "subtitle", "description"]) {
    if (typeof article[field] === "string" && article[field].trim()) entry[field] = article[field].trim();
  }

  const next = `${JSON.stringify(article, null, 2)}\n`;
  if (next !== raw) {
    await writeFile(file, next);
    changed += 1;
  }
}

await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Trustverse mass curation finalized: ${changed} article file(s) normalized; source index synchronized; ${taxonomyReassignments.size} taxonomy correction(s) applied.`);
