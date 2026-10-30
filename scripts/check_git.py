"""Check Git's staged or tracked snapshot for private/generated files and common secrets.

Only filenames and finding categories are printed. This is a focused check,
not a guarantee that every possible secret or private document is detected.
"""
from __future__ import annotations

import argparse
import fnmatch
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_DIRS = {".venv", "venv", "__pycache__", "node_modules", ".next", ".wrangler",
                ".openai", ".vscode", ".idea", "backups", "idx-lens-stage1-backups"}
PRIVATE_PATTERNS = ("*.pyc", "*.pyo", "*.bak", "*.bak.*", "*.log", "*.zip", "*.7z",
                    "*.pem", "*.key", "*.dump", "*.sql.gz", "*.db", "*.sqlite*",
                    "*.pkl", "*.pickle", "*.joblib")
TOKEN = re.compile(rb"(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----)")
ASSIGNMENT = re.compile(
    rb'''(?im)\b(MYSQL_PASSWORD|API_BEARER_TOKEN|IDX_PROVIDER_TOKEN)\b["']?\s*[:=]\s*["']?([^\s"'#,\r\n]+)''')


def git(*args: str, cwd: Path = ROOT) -> bytes:
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError("Git command failed. Run this in your initialized project repository.")
    return result.stdout


def private_path(name: str) -> bool:
    path = PurePosixPath(name.lower())
    if any(part in PRIVATE_DIRS for part in path.parts):
        return True
    if name.lower().startswith(("data/raw/", "ml/artifacts/", "web/dist/", "web/out/")):
        return True
    if path.name != ".env.example" and (path.name == ".env" or path.name.startswith(".env.") or path.name.endswith(".env")):
        return True
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in PRIVATE_PATTERNS)


def content_finding(data: bytes, name: str) -> str | None:
    if TOKEN.search(data):
        return "token or private-key pattern"
    # Check literal assignments in configuration and source files, not examples
    # quoted inside prose or the scanner's own regex.
    if name.endswith((".py", ".json", ".toml", ".yaml", ".yml", ".env.example")):
        for match in ASSIGNMENT.finditer(data):
            value = match[2].lower()
            if value.startswith((b"replace_", b"${", b"<", b"os.", b"secrets.")) or value in {b"none", b"null"}:
                continue
            return "non-placeholder credential assignment"
    return None


def check(cwd: Path, staged: bool) -> tuple[int, list[tuple[str, str]]]:
    if staged:
        names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z", cwd=cwd)
    else:
        names = git("ls-files", "-z", cwd=cwd)
    selected = [name.decode("utf-8") for name in names.split(b"\0") if name]
    findings = []
    for name in selected:
        if private_path(name):
            findings.append((name, "private or generated file"))
            continue
        # Read the Git index, not an edited working copy. Files already staged
        # for deletion are excluded by the commands above.
        data = git("show", ":" + name, cwd=cwd)
        if len(data) > 2 * 1024 * 1024:
            findings.append((name, "large file; review before publishing"))
            continue
        finding = content_finding(data, name)
        if finding:
            findings.append((name, finding))
    return len(selected), findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--tracked", action="store_true")
    args = parser.parse_args()
    try:
        count, findings = check(ROOT, args.staged)
        if findings:
            print("FAIL: review these files before committing:")
            for name, reason in findings:
                print(" ", name, "-", reason)
            return 1
        if not count:
            print("FAIL: no files selected. Stage the project files first.")
            return 1
        print("PASS:", count, "Git files checked; no listed private files or secret patterns found.")
        return 0
    except (RuntimeError, OSError, UnicodeError):
        print("FAIL: could not read the Git snapshot. Confirm Git is installed and initialized here.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
