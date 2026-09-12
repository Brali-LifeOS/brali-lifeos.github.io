const clean = value => String(value ?? '').trim();

const candidateSummary = candidate => ({
  protocol_id: candidate.protocol_id,
  slug: candidate.slug,
  title: candidate.title,
  canonical_url: candidate.canonical_url,
  skill_page_url: candidate.skill_page_url,
  skill_markdown_url: candidate.skill_markdown_url,
  evidence_status: candidate.evidence_status,
  gold_review_status: candidate.gold_review_status
});

export function evaluateTroubleshooter(model, answers = {}) {
  if (!model || !Array.isArray(model.candidate_protocols) || model.candidate_protocols.length === 0) {
    throw new Error('Troubleshooter model has no candidate protocols.');
  }
  const normalizedAnswers = {};
  const missing = new Set();
  const rejected = [];
  const eligible = [];
  for (const candidate of model.candidate_protocols) {
    const reasons = [];
    for (const constraint of candidate.constraints ?? []) {
      const value = clean(answers[constraint.id]);
      if (!value) {
        if (constraint.required) missing.add(constraint.id);
        continue;
      }
      normalizedAnswers[constraint.id] = value;
      const option = (constraint.options ?? []).find(item => item.value === value);
      if (!option) {
        reasons.push({constraint_id: constraint.id, reason: 'This answer is not part of the reviewed applicability contract.'});
        continue;
      }
      if (option.effect === 'reject') reasons.push({constraint_id: constraint.id, reason: option.reason || 'This represented constraint makes the protocol ineligible.'});
    }
    if (reasons.length) rejected.push({...candidateSummary(candidate), reasons});
    else eligible.push(candidate);
  }
  let status = 'abstain';
  let selected = null;
  let summary = model.abstention_message;
  if (missing.size > 0) {
    status = 'incomplete';
    summary = 'Answer the decision-changing questions before Brali checks protocol fit.';
  } else if (eligible.length === 1) {
    status = 'selected';
    selected = eligible[0];
    summary = `${selected.title} fits the constraints represented in this Brali check. Treat it as a bounded trial, not a guarantee.`;
  } else if (eligible.length > 1) {
    status = 'needs-choice';
    summary = 'More than one trusted protocol fits the represented constraints. Brali does not invent a ranking when the current contract cannot distinguish them.';
  }
  const packet = {
    schema_version: 1,
    problem_slug: model.problem_slug,
    canonical_url: model.canonical_url,
    decision: status,
    constraints: normalizedAnswers,
    missing_constraints: [...missing],
    selected_protocol: selected ? candidateSummary(selected) : null,
    rejected_protocols: rejected,
    first_action: selected?.first_action ?? null,
    review_horizon: selected?.review_horizon ?? null,
    observable_signal: selected?.observable_signal ?? null,
    stop_or_change_rule: selected?.stop_or_change_rule ?? null,
    fallback: selected?.fallback ?? null,
    evidence_boundary: selected?.evidence_boundary ?? null,
    limitations: selected?.limitations ?? [],
    citation: selected?.citation ?? null
  };
  return {status, summary, selected, rejected, missing: [...missing], packet};
}

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const renderReasons = (container, rejected) => {
  const reasons = rejected.flatMap(item => item.reasons.map(reason => reason.reason));
  if (!reasons.length) return;
  const list = el('ul');
  for (const reason of [...new Set(reasons)]) list.append(el('li', reason));
  container.append(list);
};
const renderDecision = (root, decision) => {
  const result = root.querySelector('[data-brali-troubleshooter-result]');
  const packet = root.querySelector('[data-brali-troubleshooter-packet]');
  const copy = root.querySelector('[data-brali-troubleshooter-copy]');
  result.replaceChildren();
  const card = el('article', '', 'card');
  if (decision.status === 'selected') {
    card.append(el('span', 'Fits represented constraints', 'card-label'));
    card.append(el('h3', decision.selected.title));
    card.append(el('p', decision.summary));
    const first = el('p'); first.append(el('strong', 'Try: ')); first.append(document.createTextNode(decision.selected.first_action)); card.append(first);
    const observe = el('p'); observe.append(el('strong', 'Notice: ')); observe.append(document.createTextNode(decision.selected.observable_signal)); card.append(observe);
    const change = el('p'); change.append(el('strong', 'Change or stop when: ')); change.append(document.createTextNode(decision.selected.stop_or_change_rule)); card.append(change);
    const links = el('p');
    const protocolLink = el('a', 'Open canonical protocol'); protocolLink.href = decision.selected.canonical_url; links.append(protocolLink);
    if (decision.selected.skill_page_url) {
      links.append(document.createTextNode(' · '));
      const skillLink = el('a', 'Use as Agent Skill →'); skillLink.href = decision.selected.skill_page_url; links.append(skillLink);
    }
    card.append(links);
  } else if (decision.status === 'incomplete') {
    card.append(el('span', 'More information needed', 'card-label')); card.append(el('h3', 'Answer both fit questions')); card.append(el('p', decision.summary));
  } else if (decision.status === 'needs-choice') {
    card.append(el('span', 'Several eligible options', 'card-label')); card.append(el('h3', 'Brali will not fake a tie-breaker')); card.append(el('p', decision.summary));
  } else {
    card.append(el('span', 'Brali abstains', 'card-label')); card.append(el('h3', 'Do not force the focus-block protocol')); card.append(el('p', decision.summary)); renderReasons(card, decision.rejected);
  }
  result.append(card);
  packet.textContent = JSON.stringify(decision.packet, null, 2);
  copy.disabled = false;
};
const boot = root => {
  const modelNode = root.querySelector('[data-brali-troubleshooter-model]');
  const form = root.querySelector('[data-brali-troubleshooter-form]');
  const copy = root.querySelector('[data-brali-troubleshooter-copy]');
  const packet = root.querySelector('[data-brali-troubleshooter-packet]');
  if (!modelNode || !form || !copy || !packet) return;
  let model;
  try { model = JSON.parse(modelNode.textContent); } catch { return; }
  form.addEventListener('submit', event => {
    event.preventDefault();
    renderDecision(root, evaluateTroubleshooter(model, Object.fromEntries(new FormData(form).entries())));
  });
  copy.addEventListener('click', async () => {
    const text = packet.textContent;
    if (!text || text.startsWith('Run the check')) return;
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Copy unavailable — select the JSON above'; }
  });
};
if (typeof document !== 'undefined') for (const root of document.querySelectorAll('[data-brali-troubleshooter]')) boot(root);
