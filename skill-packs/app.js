(() => {
  const catalogUrl = "/skill-packs/library.json";
  const trustedStates = new Set(["reviewed", "practical"]);
  const listEl = document.querySelector("#skill-list");
  const resultEl = document.querySelector("#skill-result");
  const searchEl = document.querySelector("#skill-search");
  const filterEl = document.querySelector("#skill-filter");
  const statusEl = document.querySelector("#catalog-status");
  let entries = [];
  let counts = {};
  let selectedSlug = new URLSearchParams(location.search).get("skill") || new URLSearchParams(location.search).get("hack") || "";

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const searchable = (entry) => [entry.title, entry.description, entry.name, entry.skill_mode, entry.evidence_state, ...(entry.topics ?? []), ...(entry.methods ?? []), ...(entry.lenses ?? []), ...(entry.compatible_hosts ?? [])].join(" ").toLowerCase();
  const isTrusted = (entry) => trustedStates.has(entry.evidence_state) && entry.skill_mode === "usable" && entry.recommendation_eligible === true;
  const isRestricted = (entry) => entry.skill_mode === "restricted-reference";
  const modeLabel = (entry) => entry.skill_mode === "usable" ? "Usable" : entry.skill_mode === "review-required" ? "Review required" : isRestricted(entry) ? "Restricted reference" : "Unknown mode";

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
    heading.textContent = isTrusted(entry) ? "Install" : "Install for review only";
    wrap.append(heading);
    const note = document.createElement("p");
    note.className = "skill-mode-warning";
    note.textContent = isTrusted(entry)
      ? "This skill is recommendation-eligible under the current Brali trust gate."
      : entry.skill_mode === "review-required"
        ? "This file may be installed for editorial or provenance review, but it must not be treated as trusted practical guidance."
        : "This restricted-reference skill is non-operational and should only be installed for controlled review or taxonomy work.";
    wrap.append(note);

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
      resultEl.innerHTML = '<div class="skill-empty"><h3>Skill not found</h3><p>Every current Brali hack should have a skill artifact. If this URL points to an old or removed slug, open the full library and choose the current record.</p></div>';
      return;
    }

    resultEl.replaceChildren();
    const label = document.createElement("span");
    label.className = "card-label";
    label.textContent = `${modeLabel(entry)} Agent Skill`;
    const title = document.createElement("h3");
    title.textContent = entry.title;
    const warning = document.createElement("div");
    warning.className = `skill-mode-banner ${entry.skill_mode}`;
    warning.textContent = isTrusted(entry)
      ? "Usable: reviewed/practical and recommendation-eligible."
      : entry.skill_mode === "review-required"
        ? "Review required: the skill exists for complete corpus coverage, but its draft action is not trusted guidance."
        : "Restricted reference: this skill intentionally refuses to operationalize the underlying technique.";

    const meta = document.createElement("div");
    meta.className = "skill-meta";
    ["AgentSkills.io", entry.evidence_state || "unknown", entry.skill_mode, ...(entry.topics ?? []).slice(0, 2)].forEach((value) => {
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
    source.textContent = "Canonical record";
    const verify = document.createElement("a");
    verify.href = `${entry.skill_page_url}skill.json`;
    verify.textContent = "Verification JSON";
    actions.append(open, raw, source, verify);

    const verification = document.createElement("p");
    verification.className = "verification-line";
    const digest = entry.verification?.sha256 || "unavailable";
    verification.textContent = `Brali CI verified · ${entry.skill_mode} · ${entry.evidence_state} · SHA-256 ${digest.slice(0, 16)}${digest.length > 16 ? "…" : ""}`;

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

    resultEl.append(label, title, warning, meta, actions, verification, install, pre);

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
    for (const el of listEl.querySelectorAll("[data-skill-slug]")) el.setAttribute("aria-current", el.dataset.skillSlug === selectedSlug ? "true" : "false");
    if (entry && updateUrl) {
      const url = new URL(location.href);
      url.searchParams.delete("hack");
      url.searchParams.set("skill", entry.slug);
      url.hash = "catalog";
      history.replaceState({}, "", url);
    }
  }

  function filteredEntries() {
    const needle = clean(searchEl.value).toLowerCase();
    const mode = filterEl?.value || "all";
    return entries.filter((entry) => {
      if (needle && !searchable(entry).includes(needle)) return false;
      if (mode === "usable" && !isTrusted(entry)) return false;
      if (mode === "review-required" && entry.skill_mode !== "review-required") return false;
      if (mode === "restricted-reference" && !isRestricted(entry)) return false;
      return true;
    });
  }

  function renderList() {
    const matches = filteredEntries();
    listEl.replaceChildren();
    for (const entry of matches.slice(0, 150)) {
      const item = button(entry.title, `skill-choice ${entry.skill_mode}`);
      item.dataset.skillSlug = entry.slug;
      item.setAttribute("aria-current", entry.slug === selectedSlug ? "true" : "false");
      const small = document.createElement("small");
      const topicText = (entry.topics ?? []).slice(0, 2).join(" · ");
      small.textContent = [modeLabel(entry), entry.evidence_state, topicText].filter(Boolean).join(" · ");
      item.append(small);
      item.addEventListener("click", () => choose(entry));
      listEl.append(item);
    }
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "skill-empty";
      empty.textContent = "No skill matches this search and trust-mode filter.";
      listEl.append(empty);
    }
    statusEl.textContent = `${entries.length} hacks → ${entries.length} generated skills. Usable ${counts.usable || 0}; review required ${counts["review-required"] || 0}; restricted reference ${counts["restricted-reference"] || 0}. Showing ${Math.min(matches.length, 150)}${matches.length > 150 ? ` of ${matches.length}` : ""}.`;
  }

  async function start() {
    try {
      const response = await fetch(catalogUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const library = await response.json();
      counts = library.counts_by_mode ?? {};
      entries = (library.entries ?? []).sort((a, b) => {
        if (a.recommendation_eligible !== b.recommendation_eligible) return a.recommendation_eligible ? -1 : 1;
        return clean(a.title).localeCompare(clean(b.title));
      });
      renderList();
      if (selectedSlug) choose(entries.find((entry) => entry.slug === selectedSlug), false);
      else if (entries.length) choose(entries[0], false);
    } catch (error) {
      statusEl.textContent = "The complete Agent Skills library could not be loaded.";
      listEl.innerHTML = '<div class="skill-empty">Open library.json directly or try again later.</div>';
      resultEl.innerHTML = `<div class="skill-empty"><h3>Library unavailable</h3><p>${clean(error.message)}</p></div>`;
    }
  }

  searchEl.addEventListener("input", renderList);
  filterEl?.addEventListener("change", renderList);
  start();

  // Trust boundary: Brali does not recommend review-gated records as trusted skills.
})();
