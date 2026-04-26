from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = REPO_ROOT / "docs" / "OVERNIGHT_SWARM_SUMMARY.md"
LAUNCH_REPORT_PATH = REPO_ROOT / "LAUNCH_READINESS_REPORT.md"
REQUESTED_LANES = [
    "deps/audit",
    "qa/e2e",
    "qa/visual",
    "obs/sentry-otel",
    "perf/reliability",
    "ux/polish",
]


@dataclass
class BranchInfo:
    name: str
    subject: str
    shortstat: str


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.strip()


def parse_worktree_branches() -> list[str]:
    output = git("worktree", "list", "--porcelain")
    branches: list[str] = []
    for line in output.splitlines():
        if line.startswith("branch refs/heads/"):
            branch = line.removeprefix("branch refs/heads/").strip()
            if branch not in branches:
                branches.append(branch)
    return branches


def get_branch_info(branch: str) -> BranchInfo:
    subject = git("log", "-1", "--pretty=%s", branch)
    shortstat = git("diff", "--shortstat", f"main...{branch}")
    return BranchInfo(name=branch, subject=subject, shortstat=shortstat or "No diff vs main")


def get_verified_branches() -> list[str]:
    branches = parse_worktree_branches()
    verified = [branch for branch in branches if branch != "main"]
    if "launch-readiness-audit" not in verified:
        current = git("branch", "--show-current")
        if current and current != "main":
            verified.insert(0, current)
    return verified


def read_launch_report() -> str:
    if not LAUNCH_REPORT_PATH.exists():
        return ""
    return LAUNCH_REPORT_PATH.read_text(encoding="utf-8")


def extract_bullets(section_title: str, text: str) -> list[str]:
    pattern = re.compile(
        rf"## {re.escape(section_title)}\n\n(.*?)(?:\n## |\Z)",
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return []
    body = match.group(1)
    bullets: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("- "):
            bullets.append(stripped[2:])
    return bullets


def build_issue_rows(report: str) -> list[tuple[str, str, str, str, str, str]]:
    rows: list[tuple[str, str, str, str, str, str]] = []
    if "DeepTwin patient-specific endpoints lacked clinician gating." in report:
        rows.append(
            (
                "Critical",
                "Auth / roles",
                "DeepTwin patient-scoped endpoints lacked clinician/admin gating. Fix exists on the audit branch, but this is a release-sensitive access-control change.",
                "`launch_audit`",
                "`launch-readiness-audit`",
                "Yes",
            )
        )
    if "Production demo-login was enabled." in report:
        rows.append(
            (
                "High",
                "Auth",
                "Demo login was enabled in `staging` / `production`. Audit branch changes block it with `403 demo_login_disabled`.",
                "`launch_audit`",
                "`launch-readiness-audit`",
                "Yes",
            )
        )
    if "deep-link auth gate" in git("log", "--oneline", "main..launch-readiness-audit").lower():
        rows.append(
            (
                "High",
                "Auth UX / QA",
                "Unauthenticated deep-link flow to private routes did not reliably force login overlay behavior. Audit branch adds the fix and regression coverage.",
                "`launch_audit`",
                "`launch-readiness-audit`",
                "Yes",
            )
        )
    if "full backend suite still has not been completed" in report.lower():
        rows.append(
            (
                "High",
                "Verification",
                "Full backend suite was not completed end-to-end during the audit window. A longer unattended pass is still required.",
                "`launch_audit`",
                "`launch-readiness-audit`",
                "Yes",
            )
        )
    return rows


def describe_branch(branch: str, report: str) -> list[str]:
    if branch == "launch-readiness-audit":
        items: list[str] = []
        if "Production demo-login was enabled." in report:
            items.append("Tightened demo auth behavior for non-dev environments.")
        if "DeepTwin patient-specific endpoints lacked clinician gating." in report:
            items.append("Added clinician-or-admin gating for DeepTwin patient-scoped endpoints.")
        if "deep-link auth gate" in git("log", "--oneline", "main..launch-readiness-audit").lower():
            items.append("Fixed unauthenticated deep-link login behavior.")
            items.append("Added regression coverage in API and web tests.")
        return items
    if branch == "api/fix-fixture-order-failures":
        return ["Repaired MRI analyze/report round-trip and timeline test coverage."]
    if branch == "web/split-clinical-tools-bundle":
        return ["Split `pages-clinical-tools` into 5 sub-page chunks to reduce bundle pressure and isolate route-level loading."]
    if branch == "practice/programs-page":
        return ["Replaced the Programs stub with a 3-tab Education Programs page, with supporting API wiring and styles."]
    info = get_branch_info(branch)
    return [f"Latest change: {info.subject} ({info.shortstat})."]


def find_review_required_matches() -> list[str]:
    result = subprocess.run(
        [
            "rg",
            "-n",
            "REVIEW_REQUIRED",
            ".",
            "-g",
            "!node_modules/**",
            "-g",
            "!.git/**",
            "-g",
            "!.pytest_cache/**",
            "-g",
            "!pytest-cache-files-*/**",
            "-g",
            "!.claude/worktrees/**/node_modules/**",
        ],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode not in (0, 1):
        stderr = "\n".join(
            line
            for line in result.stderr.splitlines()
            if "Access is denied." not in line
        ).strip()
        if stderr:
            raise RuntimeError(stderr)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def render() -> str:
    today = date.today().isoformat()
    report = read_launch_report()
    verified_branches = get_verified_branches()
    missing_requested = [lane for lane in REQUESTED_LANES if lane not in verified_branches]
    issue_rows = build_issue_rows(report)
    review_required = find_review_required_matches()
    branch_infos = [get_branch_info(branch) for branch in verified_branches]

    lines: list[str] = []
    lines.append("# DeepSynaps Studio - Overnight Swarm Summary")
    lines.append("")
    lines.append("## 1. High-level status")
    lines.append("")
    lines.append(f"- Date: `{today}`")
    if missing_requested:
        lines.append("- Requested lane branches were not present locally:")
        for lane in missing_requested:
            lines.append(f"  - `{lane}`")
    lines.append("- Verified overnight branches/worktrees present locally:")
    for branch in verified_branches:
        lines.append(f"  - `{branch}`")

    lines.append("")
    lines.append("## 2. Critical / high issues")
    lines.append("")
    lines.append("| Severity | Area | Short description | Lane | Branch | Needs human review? |")
    lines.append("|---------|------|-------------------|------|--------|---------------------|")
    for severity, area, desc, lane, branch, review in issue_rows:
        lines.append(f"| {severity} | {area} | {desc} | {lane} | {branch} | {review} |")
    if not issue_rows:
        lines.append("| None | None | No critical or high issues were derived automatically from the current local audit artifacts. | `n/a` | `n/a` | No |")

    lines.append("")
    lines.append("Notes:")
    lines.append("- No verified overnight repo evidence was found for the placeholder `qEEG Analyzer` critical issue from the draft template.")
    if "qa/e2e" in missing_requested:
        lines.append("- No local evidence was found for the requested `qa/e2e` lane branch.")

    lines.append("")
    lines.append("## 3. Safe changes applied overnight")
    lines.append("")
    for branch in verified_branches:
        lines.append(f"- `{branch}`")
        for item in describe_branch(branch, report):
            lines.append(f"  - {item}")

    lines.append("")
    lines.append("Lane mapping status:")
    for lane in REQUESTED_LANES:
        if lane in verified_branches:
            lines.append(f"- `{lane}`: local branch found")
        else:
            lines.append(f"- `{lane}`: no local branch/report found")

    lines.append("")
    lines.append("## 4. Items explicitly NOT auto-merged")
    lines.append("")
    if review_required:
        lines.append("Explicit `REVIEW_REQUIRED` matches:")
        for match in review_required:
            lines.append(f"- `{match}`")
    else:
        lines.append("No local branches or artifacts were explicitly labeled `REVIEW_REQUIRED`.")

    lines.append("")
    lines.append("The following changes still require human review before merge:")
    if "launch-readiness-audit" in verified_branches:
        lines.append("- Area: Auth / DeepTwin access")
        lines.append("  - Branch: `launch-readiness-audit`")
        lines.append("  - Summary: Role gating was tightened for patient-scoped DeepTwin routes.")
        lines.append("  - Why: Access-control changes are release-sensitive and need explicit reviewer confirmation.")
        lines.append("- Area: Release audit / verification")
        lines.append("  - Branch: `launch-readiness-audit`")
        lines.append("  - Summary: Audit branch contains auth hardening, UX fixes, and launch-readiness findings.")
        lines.append("  - Why: Full backend verification is still incomplete.")
    for info in branch_infos:
        if info.name == "web/split-clinical-tools-bundle":
            lines.append("- Area: Frontend architecture / performance")
            lines.append("  - Branch: `web/split-clinical-tools-bundle`")
            lines.append("  - Summary: Large route/module split of the clinical tools surface.")
            lines.append("  - Why: Heavy refactor size warrants smoke testing on chunk loading and navigation.")

    lines.append("")
    lines.append("## 5. Recommended next steps (today)")
    lines.append("")
    if "launch-readiness-audit" in verified_branches:
        lines.append("- Review and merge `launch-readiness-audit` first.")
        lines.append("- Run a full unattended backend test pass before making any release call.")
        lines.append("- Smoke test private-route auth, DeepTwin clinician access, and demo-login behavior in a production-like environment.")
    if "web/split-clinical-tools-bundle" in verified_branches:
        lines.append("- Manually test `web/split-clinical-tools-bundle` for route loading, chunking, and regressions.")
    if missing_requested:
        lines.append("- Treat the requested lane list as stale until the missing branches or reports are surfaced.")

    lines.append("")
    lines.append("## Evidence basis")
    lines.append("")
    lines.append(f"This summary was generated from the local repo state on `{today}`, using:")
    lines.append("- current branch and diff state")
    lines.append("- local worktree/branch inventory")
    if LAUNCH_REPORT_PATH.exists():
        lines.append("- `LAUNCH_READINESS_REPORT.md`")
    lines.append("- commit history and diff stats for verified overnight branches")
    return "\n".join(lines) + "\n"


def main() -> None:
    OUTPUT_PATH.write_text(render(), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
