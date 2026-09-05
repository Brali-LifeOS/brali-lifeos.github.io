#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def previous_month(today: dt.date) -> str:
    first = today.replace(day=1)
    previous = first - dt.timedelta(days=1)
    return previous.strftime("%Y-%m")


def month_bounds(month: str) -> tuple[dt.date, dt.date]:
    start = dt.date.fromisoformat(f"{month}-01")
    if start.month == 12:
        end = dt.date(start.year + 1, 1, 1)
    else:
        end = dt.date(start.year, start.month + 1, 1)
    return start, end


def git_commits(month: str) -> list[dict]:
    start, end = month_bounds(month)
    command = [
        "git",
        "log",
        f"--since={start.isoformat()}T00:00:00Z",
        f"--until={end.isoformat()}T00:00:00Z",
        "--format=%H%x09%ad%x09%s",
        "--date=short",
    ]
    result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True)
    rows = []
    for line in result.stdout.splitlines():
        sha, date, subject = line.split("\t", 2)
        rows.append({"sha": sha, "date": date, "subject": subject})
    return rows


def render_markdown(digest: dict) -> str:
    month = digest["month"]
    status = digest["status"]
    counts = digest["counts"]
    lines = [
        f"# Brali Monthly Research Digest — {month}",
        "",
        f"Status: **{status}**. Generated from canonical Brali research registries and repository history.",
        "",
        "## At a glance",
        "",
        f"- Research candidates discovered: **{counts['candidates_discovered']}**",
        f"- Evidence decisions reviewed: **{counts['decisions_reviewed']}**",
        f"- Protocol proposals: **{counts.get('propose-protocol', 0)}**",
        f"- Existing protocols strengthened: **{counts.get('support-existing', 0)}**",
        f"- Challenges to existing claims: **{counts.get('challenge-existing', 0)}**",
        f"- Watch decisions: **{counts.get('watch', 0)}**",
        f"- Rejected after review: **{counts.get('rejected', 0)}**",
        "",
        "## What we reviewed",
        "",
    ]
    if digest["reviewed"]:
        for item in digest["reviewed"]:
            lines.append(f"- **{item['decision']}** — {item['title']} ({item['reviewed_at']})")
    else:
        lines.append("- No evidence decisions were recorded for this month.")

    lines += ["", "## What we added or strengthened", ""]
    promoted = [x for x in digest["reviewed"] if x["decision"] in {"propose-protocol", "propose-hack", "support-existing"}]
    if promoted:
        for item in promoted:
            targets = item.get("targets") or []
            suffix = f" → {', '.join(targets)}" if targets else ""
            lines.append(f"- **{item['decision']}** — {item['title']}{suffix}")
    else:
        lines.append("- No source crossed the promotion/strengthening boundary this month.")

    lines += ["", "## What we did not add — and why", ""]
    held = [x for x in digest["reviewed"] if x["decision"] in {"watch", "challenge-existing", "rejected"}]
    decided_ids = {x["candidate_id"] for x in digest["reviewed"]}
    screening = [x for x in digest["discovered"] if x["id"] not in decided_ids and x.get("status") in {"new", "screening"}]
    if held or screening:
        for item in held:
            lines.append(f"- **{item['decision']}** — {item['title']}. Kept out of protocol promotion by the recorded evidence boundary.")
        for item in screening:
            lines.append(f"- **{item.get('status', 'screening')}** — {item['title']}. Discovery lead only; source review is incomplete.")
    else:
        lines.append("- No held-back records were recorded for this month.")

    lines += ["", "## Project changes", ""]
    if digest["commits"]:
        for item in digest["commits"]:
            lines.append(f"- `{item['date']}` {item['subject']} (`{item['sha'][:8]}`)")
    else:
        lines.append("- No repository commits were recorded for this month.")

    lines += [
        "",
        "## Method",
        "",
        "The digest is an audit surface, not an evidence source. Candidate discovery never becomes reviewed evidence automatically. Only explicit Evidence Decisions can promote, constrain, challenge, or reject a research lead. Counts come from `data/research-candidates.json` and `data/evidence-decisions.json`; project changes come from Git history.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Brali's monthly research and project digest.")
    parser.add_argument("--month", help="Calendar month in YYYY-MM. Defaults to the previous calendar month.")
    args = parser.parse_args()

    today = dt.date.today()
    month = args.month or previous_month(today)
    start, end = month_bounds(month)
    current_month = today.strftime("%Y-%m") == month

    queue = load("data/research-candidates.json")
    decisions = load("data/evidence-decisions.json")
    candidates = [c for c in queue.get("candidates", []) if str(c.get("discovered_at", "")).startswith(month)]
    reviewed = [d for d in decisions.get("entries", []) if str(d.get("reviewed_at", "")).startswith(month)]
    candidate_by_id = {c.get("id"): c for c in queue.get("candidates", [])}

    reviewed_rows = []
    for decision in sorted(reviewed, key=lambda x: (x.get("reviewed_at", ""), x.get("id", ""))):
        candidate = candidate_by_id.get(decision.get("candidate_id"), {})
        targets = list(decision.get("target_protocol_ids", [])) + list(decision.get("target_hack_ids", []))
        reviewed_rows.append({
            "id": decision.get("id"),
            "candidate_id": decision.get("candidate_id"),
            "title": decision.get("source_title") or candidate.get("title") or decision.get("id"),
            "decision": decision.get("decision"),
            "reviewed_at": decision.get("reviewed_at"),
            "source_url": decision.get("source_url"),
            "targets": targets,
        })

    decision_counts = Counter(row["decision"] for row in reviewed_rows)
    counts = {
        "candidates_discovered": len(candidates),
        "decisions_reviewed": len(reviewed_rows),
        **dict(sorted(decision_counts.items())),
    }

    digest = {
        "schema_version": 1,
        "month": month,
        "period_start": start.isoformat(),
        "period_end_exclusive": end.isoformat(),
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "partial" if current_month else "closed",
        "counts": counts,
        "reviewed": reviewed_rows,
        "discovered": [
            {
                "id": c.get("id"),
                "title": c.get("title"),
                "status": c.get("status"),
                "publication_date": c.get("publication_date"),
                "reference_url": c.get("reference_url"),
            }
            for c in sorted(candidates, key=lambda x: (x.get("discovered_at", ""), x.get("title", "")))
        ],
        "commits": git_commits(month),
        "note": "Audit digest only. Discovery metadata is not reviewed evidence and this file must never be used to bypass Evidence Decisions.",
    }

    json_path = ROOT / "data" / "monthly-digests" / f"{month}.json"
    md_path = ROOT / "research" / "monthly" / f"{month}.md"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(digest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(digest), encoding="utf-8")
    print(f"monthly digest generated: {month} ({counts['decisions_reviewed']} decisions, {counts['candidates_discovered']} candidates)")


if __name__ == "__main__":
    main()
