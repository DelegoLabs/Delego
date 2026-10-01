#!/usr/bin/env python3
"""Bulk-create GitHub issues from docs/backlog/frontend-expansion-backlog.md.

Usage:
    GITHUB_TOKEN=<token> python3 scripts/import_issues.py [--dry-run] [--repo OWNER/NAME]

Requires a token with repo scope (classic PAT or fine-grained with Issues: write).
Skips issues whose title already exists (open) so it is safe to re-run.
"""
import argparse
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_REPO = "DelegoLabs/Delego"
BACKLOG = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "docs",
    "backlog",
    "frontend-expansion-backlog.md",
)

LABEL_COLORS = {
    "area/data-layer": "0e8a16",
    "area/wallet": "5319e7",
    "area/delegations": "1d76db",
    "area/approvals": "b60205",
    "area/orders-escrow": "f9d0c4",
    "area/design-system": "c5def5",
    "area/settings": "bfdadc",
    "area/analytics": "d4c5f9",
    "area/testing": "fef2c0",
    "area/perf-a11y": "7057ff",
    "good first issue": "7057ff",
}

HEADER_RE = re.compile(r"^### (FE-\d+) \| (.+?)\s*$", re.M)


def api(method: str, url: str, token: str, payload=None):
    req = urllib.request.Request(
        f"https://api.github.com{url}",
        data=None if payload is None else __import__("json").dumps(payload).encode(),
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "delego-issue-importer",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, __import__("json").loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        return err.code, __import__("json").loads(err.read() or b"{}")


def parse_issues(text: str):
    matches = list(HEADER_RE.finditer(text))
    issues = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[match.end():end]
        labels_match = re.search(r"^labels:\s*(.+)$", chunk, re.M)
        estimate_match = re.search(r"^estimate:\s*(.+)$", chunk, re.M)
        labels = (
            [label.strip() for label in labels_match.group(1).split(",") if label.strip()]
            if labels_match
            else []
        )
        estimate = estimate_match.group(1).strip() if estimate_match else ""
        body = chunk
        if labels_match:
            body = body.replace(labels_match.group(0), "", 1)
        if estimate_match:
            body = body.replace(estimate_match.group(0), "", 1)
        body = body.strip()
        if estimate:
            body += f"\n\n---\n**Estimated effort:** {estimate}"
        issues.append({"number": match.group(1), "title": f"{match.group(1)} {match.group(2)}", "body": body, "labels": labels})
    return issues


def existing_titles(repo: str, token: str):
    titles = set()
    page = 1
    while True:
        status, data = api("GET", f"/repos/{repo}/issues?state=all&per_page=100&page={page}", token)
        if status != 200 or not isinstance(data, list):
            break
        titles.update(item["title"] for item in data)
        if len(data) < 100:
            break
        page += 1
    return titles


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("backlog", nargs="?", default=None,
                        help="Path to backlog markdown (defaults to batch-1 file)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--repo", default=os.environ.get("REPO", DEFAULT_REPO))
    args = parser.parse_args()

    backlog_path = os.path.abspath(args.backlog) if args.backlog else os.path.abspath(BACKLOG)

    token = os.environ.get("GITHUB_TOKEN")
    if not token and not args.dry_run:
        sys.exit("Error: set GITHUB_TOKEN (token with Issues: write permission)")

    with open(backlog_path, encoding="utf-8") as handle:
        issues = parse_issues(handle.read())
    print(f"Parsed {len(issues)} issues from backlog")

    if args.dry_run:
        for issue in issues:
            print(f"  {issue['number']}: {issue['title']} [{', '.join(issue['labels'])}]")
        return

    seen = existing_titles(args.repo, token)

    needed = {label for issue in issues for label in issue["labels"]}
    for label in sorted(needed):
        status, _ = api(
            "POST",
            f"/repos/{args.repo}/labels",
            token,
            {"name": label, "color": LABEL_COLORS.get(label, "ededed")},
        )
        if status in (201, 422):
            print(f"label ok: {label}")
        else:
            print(f"label FAILED ({status}): {label}")

    created = skipped = failed = 0
    for issue in issues:
        if issue["title"] in seen:
            print(f"skip (exists): {issue['title']}")
            skipped += 1
            continue
        status, data = api(
            "POST",
            f"/repos/{args.repo}/issues",
            token,
            {"title": issue["title"], "body": issue["body"], "labels": issue["labels"]},
        )
        if status == 201:
            print(f"created #{data.get('number')}: {issue['title']}")
            created += 1
        else:
            print(f"FAILED ({status}) {issue['title']}: {data.get('message')}")
            failed += 1

    print(f"\nDone. created={created} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
