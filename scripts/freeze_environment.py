"""Record package versions from this virtual environment, without URLs or secrets."""
from __future__ import annotations

from importlib.metadata import distributions
import os
from pathlib import Path
import re
import subprocess
import sys


def main() -> int:
    if sys.prefix == sys.base_prefix:
        print("Use the project's .venv Python executable for this command.")
        return 1
    result = subprocess.run([sys.executable, "-m", "pip", "check"], check=False)
    if result.returncode:
        return result.returncode
    platform = "windows" if os.name == "nt" else sys.platform
    filename = f"requirements-{platform}-py{sys.version_info.major}{sys.version_info.minor}.lock.txt"
    target = Path(__file__).resolve().parents[1] / filename
    packages = {}
    for package in distributions():
        name, version = package.metadata["Name"], package.version
        if not name or not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or not re.fullmatch(r"[A-Za-z0-9_.+!-]+", version):
            print("Unexpected package metadata; no lock file written.")
            return 1
        packages[re.sub(r"[-_.]+", "-", name).lower()] = version
    header = (
        "# Exact installed versions; generated after local verification.\n"
        f"# Platform: {platform}; Python: {sys.version_info.major}.{sys.version_info.minor}\n"
        "# May include packages left from earlier development.\n"
        "# Not a universal cross-platform dependency lock.\n"
    )
    text = header + "".join(f"{name}=={version}\n" for name, version in sorted(packages.items()))
    target.write_text(text, encoding="utf-8", newline="\n")
    print("Saved:", filename)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
