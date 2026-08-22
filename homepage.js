(() => {
  const form = document.querySelector('#goal-form');
  const picker = document.querySelector('#goal-picker');
  if (!form || !picker) return;

  const protocols = {
    focus: {
      match: 'A small plan that reduces competing priorities',
      title: '3-Task Reset',
      summary: 'Clear mental clutter with three meaningful tasks chosen for impact, not urgency.',
      trust: 'Practical',
      source: 'Brali protocol record',
      href: '/life-os/top-3-daily-focus-planner/',
      steps: [
        ['Capture', 'Dump everything on your mind.', '5 min'],
        ['Choose', 'Pick three tasks that move the needle.', '10 min'],
        ['Focus', 'Do the first one distraction-free.', '25 min']
      ]
    },
    memory: {
      match: 'Retrieval practice with its evidence boundary visible',
      title: 'Active Recall',
      summary: 'Close the material and retrieve the key idea from memory before checking what you missed.',
      trust: 'Reviewed boundary',
      source: 'Protocol + evidence decision',
      href: '/life-os/active-recall-test-yourself/',
      steps: [
        ['Close', 'Put the source out of sight.', '2 min'],
        ['Recall', 'Write the key points from memory.', '10 min'],
        ['Check', 'Compare, correct, and try again later.', '5 min']
      ]
    },
    stress: {
      match: 'A short pause before choosing the next action',
      title: 'Two-Minute Reset',
      summary: 'Slow the pace briefly, notice the body, and return to one controllable next step.',
      trust: 'Practical',
      source: 'Brali protocol record',
      href: '/life-os/box-breathing-for-speakers/',
      steps: [
        ['Pause', 'Stop adding new input for two minutes.', '2 min'],
        ['Breathe', 'Use a slow, comfortable breathing rhythm.', '4 min'],
        ['Choose', 'Name one action you can control now.', '2 min']
      ]
    },
    sleep: {
      match: 'A repeatable cue that protects the sleep window',
      title: 'Evening Cutoff',
      summary: 'Choose one evening boundary and make it easier to repeat than to negotiate each night.',
      trust: 'Practical',
      source: 'Brali protocol record',
      href: '/life-os/stop-caffeine-after-lunch/',
      steps: [
        ['Pick', 'Choose one cue or cutoff that matters.', '5 min'],
        ['Prepare', 'Remove the most likely obstacle early.', '10 min'],
        ['Review', 'Notice what changed after a week.', '7 days']
      ]
    }
  };

  const match = document.querySelector('#goal-result');
  const title = document.querySelector('#protocol-title');
  const summary = document.querySelector('#protocol-summary');
  const trust = document.querySelector('#protocol-trust');
  const source = document.querySelector('#protocol-source');
  const steps = document.querySelector('#protocol-steps');
  const link = document.querySelector('#protocol-link');
  const topicLink = document.querySelector('.topic-more');

  const render = () => {
    const protocol = protocols[picker.value] || protocols.focus;
    match.textContent = protocol.match;
    title.textContent = protocol.title;
    summary.textContent = protocol.summary;
    if (trust) trust.textContent = protocol.trust;
    if (source) source.textContent = protocol.source;
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

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
    title.focus?.();
  });
  picker.addEventListener('change', render);
})();
