"""Install the Mousai Workspace brand skin into the official discovery path.

Copies ``assets/skins/mousai-editorial-blue.yaml`` into ``$HERMES_HOME/skins/``
— the one location the Hermes skin engine scans for user skins — so the CLI,
the TUI, and any gateway launched with this HERMES_HOME resolve (and can push)
the brand skin. Idempotent: re-running refreshes the file and prints the
SHA256 before/after so runs are auditable.

Usage:
    python scripts/install_mousai_skin.py           # install (or refresh)
    python scripts/install_mousai_skin.py --check   # verify only, no writes
    python scripts/install_mousai_skin.py --activate  # also set display.skin

The script never touches config beyond the optional ``display.skin`` key, and
never modifies any other skin, provider, model, or secret.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SKIN_SOURCE = REPO_ROOT / "assets" / "skins" / "mousai-editorial-blue.yaml"
SKIN_NAME = "mousai-editorial-blue"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hermes_home() -> Path:
    """Resolve HERMES_HOME exactly like the engine does (env → platform default)."""
    env = os.environ.get("HERMES_HOME", "").strip()

    if env:
        return Path(env).expanduser()

    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA", "").strip()
        base = Path(local_appdata) if local_appdata else Path.home() / "AppData" / "Local"
        return base / "hermes"

    return Path.home() / ".hermes"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the installed copy only")
    parser.add_argument("--activate", action="store_true", help="also set display.skin in config.yaml")
    args = parser.parse_args()

    if not SKIN_SOURCE.exists():
        print(f"FAIL: skin source missing: {SKIN_SOURCE}")
        return 2

    source_hash = sha256(SKIN_SOURCE)
    target = hermes_home() / "skins" / f"{SKIN_NAME}.yaml"

    if args.check:
        if not target.exists():
            print(f"CHECK: not installed ({target})")
            return 1

        installed_hash = sha256(target)
        status = "OK" if installed_hash == source_hash else "STALE"
        print(f"CHECK: {status} {target}")
        print(f"  source    sha256 {source_hash}")
        print(f"  installed sha256 {installed_hash}")
        return 0 if status == "OK" else 1

    target.parent.mkdir(parents=True, exist_ok=True)
    before = sha256(target) if target.exists() else "(absent)"
    shutil.copyfile(SKIN_SOURCE, target)
    after = sha256(target)

    print(f"INSTALLED: {target}")
    print(f"  before sha256 {before}")
    print(f"  after  sha256 {after}")
    print(f"  source sha256 {source_hash}")

    if args.activate:
        activated = activate()
        if not activated:
            print("FAIL: could not set display.skin")
            return 2

    return 0


def activate() -> bool:
    """Set display.skin via the official hermes CLI when available."""
    import os
    import subprocess

    hermes = shutil.which("hermes")

    if not hermes:
        print("NOTE: 'hermes' CLI not on PATH; activate with: hermes skin use " + SKIN_NAME)
        return False

    env = {**os.environ, "HERMES_HOME": str(hermes_home())}
    result = subprocess.run(
        [hermes, "skin", "use", SKIN_NAME],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    print(result.stdout.strip())
    print(result.stderr.strip())
    return result.returncode == 0


if __name__ == "__main__":
    raise SystemExit(main())
