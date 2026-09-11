(() => {
  const catalogUrl = "/skill-packs/catalog.json";
  const listEl = document.querySelector("#skill-list");
  const resultEl = document.querySelector("#skill-result");
  const searchEl = document.querySelector("#skill-search");
  const statusEl = document.querySelector("#catalog-status");
  let entries = [];
  let selectedSlug = new URLSearchParams(location.search).get("skill") || new URLSearchParams(location.search).get("hack") || "";

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const searchable = (entry) => [entry.title, entry.description, entry.name, ...(entry.topics ?? []), ...(entry.compatible_hosts ?? [])].join(" ").toLowerCase();

  function button(label, className = "button") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = className;
    el.textContent = label;
    return el;
  }

  async function readSkill(entry) {
    const response = await fetch(entry.skill_markdown_url, { headers: { Accept: "text/markdown,text/plain" } });
    if (!response.ok) throw new Error(`SKILL.md HTTP ${response.status}`);
    return response.text();
  }

  function installBlock(entry) {
    const wrap = document.createElement("div");
    wrap.className = "skill-install";
    const heading = document.createElement("h4");
    heading.textContent = "Install";
    wrap.append(heading);

    const items = [
      ["Claude Code", `Personal: ${entry.install?.claude_code?.personal_path || "see stable page"}`],
      ["Hermes Agent", entry.install?.hermes_agent?.command || "see stable page"],
      ["OpenClaw", `Global: ${entry.install?.openclaw?.global_path || "see stable page"}`],
    ];
    for (const [label, value] of items) {
      const row = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      const code = document.createElement("code");
      code.textContent = value;
      row.append(strong, code);
      wrap.append(row);
    }
    return wrap;
  }

  async function renderSelected(entry) {
    if (!entry) {
      resultEl.innerHTML = '<div class="skill-empty"><h3>Skill not found</h3><p>This skill is not in the current trusted catalog. Brali only emits reviewed/practical records as installable Agent Skills.</p><p><a href="/life-os/methodology/">See the evidence policy</a></p></div>';
      return;
    }

    resultEl.replaceChildren();
    const label = document.createElement("span");
    label.className = "card-label";
    label.textContent = "Portable Agent Skill";
    const title = document.createElement("h3");
    title.textContent = entry.title;
    const meta = document.createElement("div");
    meta.className = "skill-meta";
    ["AgentSkills.io", entry.evidence_state || "unknown", ...(entry.topics ?? []).slice(0, 3)].forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "skill-chip";
      chip.textContent = value;
      meta.append(chip);
    });

    const actions = document.createElement("div");
    actions.className = "skill-actions";
    const open = document.createElement("a");
    open.className = "button yellow";
    open.href = entry.skill_page_url;
    open.textContent = "Open stable skill page";
    const raw = document.createElement("a");
    raw.className = "button";
    raw.href = entry.skill_markdown_url;
    raw.textContent = "Open SKILL.md";
    const source = document.createElement("a");
    source.className = "button quiet";
    source.href = entry.canonical_protocol_url;
    source.textContent = "Canonical protocol";
    const verify = document.createElement("a");
    verify.href = `${entry.skill_page_url}skill.json`;
    verify.textContent = "Verification JSON";
    actions.append(open, raw, source, verify);

    const verification = document.createElement("p");
    verification.className = "verification-line";
    const digest = entry.verification?.sha256 || "unavailable";
    verification.textContent = `Brali CI verified · ${entry.evidence_state} · SHA-256 ${digest.slice(0, 16)}${digest.length > 16 ? "…" : ""}`;

    const install = installBlock(entry);
    const pre = document.createElement("pre");
    pre.tabIndex = 0;
    pre.textContent = "Loading SKILL.md…";

    const copy = button("Copy SKILL.md", "button");
    copy.disabled = true;
    const save = button("Save SKILL.md", "button");
    save.disabled = true;
    actions.insertBefore(copy, source);
    actions.insertBefore(save, source);

    resultEl.append(label, title, meta, actions, verification, install, pre);

    try {
      const markdown = await readSkill(entry);
      if (entry.slug !== selectedSlug) return;
      pre.textContent = markdown;
      copy.disabled = false;
      save.disabled = false;
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(markdown);
          copy.textContent = "Copied";
          setTimeout(() => { copy.textContent = "Copy SKILL.md"; }, 1500);
        } catch {
          copy.textContent = "Copy unavailable — select text below";
        }
      });
      save.addEventListener("click", () => {
        const href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = "SKILL.md";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(href);
      });
    } catch (error) {
      pre.textContent = `Could not load SKILL.md: ${clean(error.message)}`;
    }
  }

  function choose(entry, updateUrl = true) {
    selectedSlug = entry?.slug || selectedSlug;
    renderSelected(entry);
    for (const el of listEl.querySelectorAll("[data-skill-slug]")) {
      el.setAttribute("aria-current", el.dataset.skillSlug === selectedSlug ? "true" : "false");
    }
    if (entry && updateUrl) {
      const url = new URL(location.href);
      url.searchParams.delete("hack");
      url.searchParams.set("skill", entry.slug);
      url.hash = "catalog";
      history.replaceState({}, "", url);
    }
  }

  function renderList(query = "") {
    const needle = clean(query).toLowerCase();
    const matches = entries.filter((entry) => !needle || searchable(entry).includes(needle));
    listEl.replaceChildren();
    for (const entry of matches.slice(0, 100)) {
      const item = button(entry.title, "skill-choice");
      item.dataset.skillSlug = entry.slug;
      item.setAttribute("aria-current", entry.slug === selectedSlug ? "true" : "false");
      const small = document.createElement("small");
      const topicText = (entry.topics ?? []).slice(0, 2).join(" · ");
      small.textContent = [entry.evidence_state, topicText].filter(Boolean).join(" · ");
      item.append(small);
      item.addEventListener("click", () => choose(entry));
      listEl.append(item);
    }
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "skill-empty";
      empty.textContent = "No trusted skill matches this search yet.";
      listEl.append(empty);
    }
    statusEl.textContent = `${entries.length} trusted protocols have generated Agent Skills. Showing ${Math.min(matches.length, 100)}${matches.length > 100 ? ` of ${matches.length}` : ""}.`;
  }

  async function start() {
    try {
      const response = await fetch(catalogUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      entries = (catalog.entries ?? []).sort((a, b) => clean(a.title).localeCompare(clean(b.title)));
      renderList();
      if (selectedSlug) choose(entries.find((entry) => entry.slug === selectedSlug), false);
      else if (entries.length) choose(entries[0], false);
    } catch (error) {
      statusEl.textContent = "The generated Agent Skills catalog could not be loaded.";
      listEl.innerHTML = '<div class="skill-empty">Open catalog.json directly or try again later.</div>';
      resultEl.innerHTML = `<div class="skill-empty"><h3>Catalog unavailable</h3><p>${clean(error.message)}</p></div>`;
    }
  }

  searchEl.addEventListener("input", () => renderList(searchEl.value));
  start();
})();
