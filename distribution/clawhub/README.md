# Brali router for ClawHub

This folder intentionally contains only the `brali-life-os` router skill. Brali does not bulk-publish one registry entry per hack.

The `SKILL.md` file must remain byte-identical to `agent-skills/skills/brali-life-os/SKILL.md`; CI checks that invariant before any publication work.

## Publication contract

Authenticate with ClawHub first, then inspect the slug before publishing:

```bash
clawhub whoami
clawhub inspect brali-life-os
```

First release command:

```bash
clawhub publish distribution/clawhub/brali-life-os \
  --slug brali-life-os \
  --name "Brali Life OS" \
  --version 1.0.0 \
  --tags latest \
  --changelog "Initial Brali evidence-aware practical-knowledge router."
```

After publication, verify the provider-visible entry with `clawhub search "brali-life-os"` and record the public URL in issue #192 before describing ClawHub as a live acquisition channel.

Do not commit a ClawHub token or claim publication from this source directory alone.
