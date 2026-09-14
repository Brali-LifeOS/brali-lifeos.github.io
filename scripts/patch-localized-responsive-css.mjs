import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stylesPath = path.join(root, "styles.css");
const marker = "/* brali-localized-responsive-boundary-v1 */";
const block = `
${marker}
@media (max-width:720px) {
  body[data-brali-cluster^="localized-"] .page h1,
  body[data-brali-cluster^="localized-"] .page h2,
  body[data-brali-cluster^="localized-"] .page h3,
  body[data-brali-cluster^="localized-"] .page .lead,
  body[data-brali-cluster^="localized-"] .page .button,
  body[data-brali-cluster^="localized-"] .page code {
    overflow-wrap:anywhere;
    word-break:normal;
  }
  body[data-brali-cluster^="localized-"] .page .button {
    max-width:100%;
    white-space:normal;
  }
  body[data-brali-cluster^="localized-"] .page .grid,
  body[data-brali-cluster^="localized-"] .page .grid > *,
  body[data-brali-cluster^="localized-"] .page .card,
  body[data-brali-cluster^="localized-"] .page .prose,
  body[data-brali-cluster^="localized-"] .page .callout,
  body[data-brali-cluster^="localized-"] .page pre {
    min-width:0;
    max-width:100%;
  }
  body[data-brali-cluster^="localized-"] .page pre {
    overflow-x:auto;
    overscroll-behavior-inline:contain;
  }
}
`;

const styles = await readFile(stylesPath, "utf8");
if (!styles.includes(marker)) {
  await writeFile(stylesPath, `${styles.trimEnd()}\n${block}`);
  console.log("Patched localized narrow-screen wrapping into styles.css.");
} else {
  console.log("Localized narrow-screen wrapping already present.");
}
