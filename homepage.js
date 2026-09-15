(() => {
  const form = document.querySelector('#goal-form');
  const picker = document.querySelector('#goal-picker');
  if (!form || !picker) return;

  const match = document.querySelector('#goal-result');
  const title = document.querySelector('#protocol-title');
  const summary = document.querySelector('#protocol-summary');
  const trust = document.querySelector('#protocol-trust');
  const source = document.querySelector('#protocol-source');
  const limit = document.querySelector('#protocol-limit');
  const steps = document.querySelector('#protocol-steps');
  const link = document.querySelector('#protocol-link');
  const topicLink = document.querySelector('.topic-more');

  const matcherPromise = fetch('/homepage-matcher.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Homepage matcher payload returned HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      if (payload?.schema_version !== 1 || !payload?.goals?.focus) {
        throw new Error('Homepage matcher payload does not satisfy schema v1.');
      }
      return payload.goals;
    })
    .catch((error) => {
      console.error('Brali homepage matcher unavailable:', error);
      return null;
    });

  const renderUnavailable = () => {
    const topic = picker.value || 'focus';
    match.textContent = 'Canonical protocol data is temporarily unavailable';
    title.textContent = 'Browse this topic instead';
    summary.textContent = 'Brali will not show a protocol match when its canonical metadata cannot be loaded.';
    if (trust) trust.textContent = 'Unavailable';
    if (source) source.textContent = 'Canonical Protocol Feed';
    if (limit) limit.textContent = 'No fallback recommendation is substituted without its evidence state and provenance.';
    link.href = `/topics/${topic}/`;
    if (topicLink) topicLink.href = `/topics/${topic}/`;
    steps.replaceChildren();
  };

  const render = async () => {
    const protocols = await matcherPromise;
    if (!protocols) {
      renderUnavailable();
      return;
    }

    const protocol = protocols[picker.value] || protocols.focus;
    if (!protocol) {
      renderUnavailable();
      return;
    }

    match.textContent = protocol.match;
    title.textContent = protocol.title;
    summary.textContent = protocol.summary;
    if (trust) trust.textContent = protocol.trust;
    if (source) source.textContent = protocol.source;
    if (limit) limit.textContent = protocol.limit;
    link.href = protocol.href;
    if (topicLink) topicLink.href = `/topics/${picker.value}/`;
    steps.replaceChildren(...protocol.steps.map(([name, detail, time]) => {
      const step = document.createElement('div');
      step.className = 'protocol-step';
      const strong = document.createElement('strong');
      strong.textContent = name;
      const span = document.createElement('span');
      span.textContent = detail;
      const small = document.createElement('small');
      const icon = document.createElement('i');
      icon.className = 'ri-time-line';
      icon.setAttribute('aria-hidden', 'true');
      small.append(icon, document.createTextNode(time));
      step.append(strong, span, small);
      return step;
    }));
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await render();
    title.focus?.();
  });
  picker.addEventListener('change', render);
  render();
})();
