(() => {
  const feedUrl = "/life-os/datasets/protocols.json";
  const listEl = document.querySelector("#skill-list");
  const resultEl = document.querySelector("#skill-result");
  const searchEl = document.querySelector("#skill-search");
  const statusEl = document.querySelector("#catalog-status");
  const trustedStates = new Set(["reviewed", "practical"]);
  let entries = [];
  let selectedSlug = new URLSearchParams(location.search).get("hack") || "";

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const yaml = (value = "") => `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const markdownLink = (label, url) => url ? `[${label}](${url})` : label;
  const topics = (entry) => (entry.ontology?.topics ?? []).map((item) => item.title).filter(Boolean);
  const searchable = (entry) => [entry.title, entry.description, entry.action, ...(entry.keywords ?? []), ...topics(entry)].join(" ").toLowerCase();

  function skillMarkdown(entry) {
    const evidence = entry.evidence ?? {};
    const state = evidence.status || "unknown";
    const sourceBoundary = state === "reviewed"
      ? (evidence.source_url
          ? `Reviewed source attached to this record: ${evidence.source_url}`
          : "This record is reviewed. Inspect the canonical Brali page for the exact source boundary before making evidence claims.")
      : "This is an eligible practical record. Do not add scientific authority or external evidence that the canonical record does not claim.";
    const topicLine = topics(entry).length ? topics(entry).join(", ") : "See canonical Brali classification";
    const reviewedAt = evidence.reviewed_at ? `\nLast Brali review recorded: ${evidence.reviewed_at}` : "";

    return `---
name: brali-${entry.slug}
description: ${yaml(entry.description || entry.title)}
canonical_id: ${entry.protocol_id}
canonical_url: ${entry.url}
evidence_state: ${state}
license: CC-BY-NC-SA-4.0
---

# ${entry.title}

Use this skill when the user's situation fits the bounded practical problem described by this Brali protocol.

## Goal
${entry.description}

## Protocol
${entry.action}

## Check-in
${entry.check_in || "Ask what changed, what was difficult, and whether the next attempt should be kept, changed, or stopped."}

## Evidence boundary
Evidence state: **${state}**.${reviewedAt}
${sourceBoundary}

Topics: ${topicLine}

## Guardrails
- Keep the canonical Brali protocol and evidence state attached when this skill materially informs an answer.
- Do not turn this protocol into diagnosis, treatment, professional advice, a universal rule, or a guaranteed outcome.
- Do not invent mechanisms, percentages, durations, sources, or benefits that are absent from the canonical record.
- If the user's situation appears safety-sensitive or outside this protocol's bounded scope, stop and use an appropriate safer or professional path instead.
- Treat the check-in as a reason to keep, change, or stop the protocol rather than as proof of causality.

## Canonical record
${markdownLink(entry.title, entry.url)}

Machine-readable trusted feed: https://brali-lifeos.github.io/life-os/datasets/protocols.json
Citation guidance: https://brali-lifeos.github.io/cite/
License and commercial terms: https://brali-lifeos.github.io/terms/
`;
  }

  function button(label, className = "button") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = className;
    el.textContent = label;
    return el;
  }

  function renderSelected(entry) {
    if (!entry) {
      resultEl.innerHTML = '<div class="skill-empty"><h3>Not available as a trusted skill</h3><p>This hack is not in the current reviewed/practical Trusted Protocol Feed, or the URL is invalid. Brali does not package review-gated records as skills.</p><p><a href="/life-os/methodology/">See the evidence policy</a></p></div>';
      return;
    }

    const md = skillMarkdown(entry);
    resultEl.replaceChildren();
    const label = document.createElement("span");
    label.className = "card-label";
    label.textContent = "Portable SKILL.md-style pack";
    const title = document.createElement("h3");
    title.textContent = entry.title;
    const meta = document.createElement("div");
    meta.className = "skill-meta";
    [entry.evidence?.status || "unknown", ...topics(entry).slice(0, 3)].forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "skill-chip";
      chip.textContent = value;
      meta.append(chip);
    });
    const actions = document.createElement("div");
    actions.className = "skill-actions";
    const copy = button("Copy SKILL.md", "button yellow");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(md);
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = "Copy SKILL.md"; }, 1500);
      } catch {
        copy.textContent = "Copy unavailable — select text below";
      }
    });
    const save = button("Save SKILL.md", "button");
    save.addEventListener("click", () => {
      const href = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `brali-${entry.slug}-SKILL.md`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    });
    const source = document.createElement("a");
    source.className = "button quiet";
    source.href = entry.url;
    source.textContent = "Open canonical protocol";
    const json = document.createElement("a");
    json.href = `/life-os/${encodeURIComponent(entry.slug)}/index.json`;
    json.textContent = "Protocol JSON";
    actions.append(copy, save, source, json);
    const pre = document.createElement("pre");
    pre.tabIndex = 0;
    pre.textContent = md;
    resultEl.append(label, title, meta, actions, pre);
  }

  function choose(entry, updateUrl = true) {
    selectedSlug = entry?.slug || selectedSlug;
    renderSelected(entry);
    for (const el of listEl.querySelectorAll("[data-skill-slug]")) {
      el.setAttribute("aria-current", el.dataset.skillSlug === selectedSlug ? "true" : "false");
    }
    if (entry && updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("hack", entry.slug);
      url.hash = "builder";
      history.replaceState({}, "", url);
    }
  }

  function renderList(query = "") {
    const needle = clean(query).toLowerCase();
    const matches = entries.filter((entry) => !needle || searchable(entry).includes(needle));
    listEl.replaceChildren();
    for (const entry of matches.slice(0, 80)) {
      const item = button(entry.title, "skill-choice");
      item.dataset.skillSlug = entry.slug;
      item.setAttribute("aria-current", entry.slug === selectedSlug ? "true" : "false");
      const small = document.createElement("small");
      const topicText = topics(entry).slice(0, 2).join(" · ");
      small.textContent = [entry.evidence?.status, topicText].filter(Boolean).join(" · ");
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
    statusEl.textContent = `${entries.length} trusted protocols can be turned into free skill packs. Showing ${Math.min(matches.length, 80)}${matches.length > 80 ? ` of ${matches.length}` : ""}.`;
  }

  async function start() {
    try {
      const response = await fetch(feedUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const feed = await response.json();
      entries = (feed.entries ?? [])
        .filter((entry) => trustedStates.has(entry.evidence?.status))
        .sort((a, b) => clean(a.title).localeCompare(clean(b.title)));
      renderList();
      if (selectedSlug) choose(entries.find((entry) => entry.slug === selectedSlug), false);
      else if (entries.length) choose(entries[0], false);
    } catch (error) {
      statusEl.textContent = "The trusted skill catalog could not be loaded.";
      listEl.innerHTML = '<div class="skill-empty">Open the Trusted Protocol Feed directly or try again later.</div>';
      resultEl.innerHTML = `<div class="skill-empty"><h3>Catalog unavailable</h3><p>${clean(error.message)}</p></div>`;
    }
  }

  searchEl.addEventListener("input", () => renderList(searchEl.value));
  start();
})();
