"""CLI to run FRVT test-execution phase gates fail-fast.

Usage (from repo root, PYTHONPATH=repo root)::

    python -m frvt.testops.run_suite --phase 0
    python -m frvt.testops.run_suite --all
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

from frvt.api.logging_config import configure_logging, get_logger

logger = get_logger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_FRVT_ROOT = _REPO_ROOT / "frvt"
_WEB_ROOT = _FRVT_ROOT / "web"
_MATRIX = _REPO_ROOT / ".test" / "coverage-matrix.md"
_EXEC_PLAN = _REPO_ROOT / ".spec" / "frvt-3-test-execution-plan-1.md"

# Expected TC count from the five area files (see coverage matrix).
_EXPECTED_TC_COUNT = 124

_TC_ROW = re.compile(r"^\| TC-[A-Z]+-\d+ \|")


def _run(command: list[str], *, cwd: Path) -> int:
    """Run a subprocess, stream output, and return its exit code.

    On Windows, ``npx``/``npm`` are ``.cmd`` shims, so the first token is resolved
    via ``PATHEXT`` by invoking through the shell when needed.
    """
    logger.debug("Running command=%s cwd=%s", command, cwd)
    print(f"\n==> {' '.join(command)}  (cwd={cwd})", flush=True)
    use_shell = sys.platform.startswith("win") and command[0] in {"npx", "npm"}
    completed = subprocess.run(
        command if not use_shell else subprocess.list2cmdline(command),
        cwd=str(cwd),
        check=False,
        shell=use_shell,
    )
    return int(completed.returncode)


def _phase0() -> int:
    """Validate harness files, imports, and coverage-matrix completeness."""
    logger.debug("Phase 0: validating harness inventory")
    missing: list[str] = []
    required = [
        _EXEC_PLAN,
        _MATRIX,
        _REPO_ROOT / ".test" / "runbooks" / "env-up.md",
        _REPO_ROOT / ".test" / "runbooks" / "run-phase.md",
        _REPO_ROOT / ".test" / "runbooks" / "defect-loop.md",
        _REPO_ROOT / ".test" / "runbooks" / "full-suite.md",
        _FRVT_ROOT / "testops" / "http_client.py",
        _FRVT_ROOT / "testops" / "sample_assets.py",
        _FRVT_ROOT / "testops" / "fixtures" / "malformed_zips.py",
        _FRVT_ROOT / "testops" / "fixtures" / "synthetic_schemes.py",
        _FRVT_ROOT / "testops" / "fixtures" / "verse0_project.py",
        _WEB_ROOT / "playwright.config.ts",
        _WEB_ROOT / "e2e" / "smoke.spec.ts",
    ]
    for path in required:
        if not path.is_file():
            missing.append(str(path))

    if missing:
        print("Phase 0 FAILED — missing files:")
        for item in missing:
            print(f"  - {item}")
        return 1

    # Import smoke for helpers.
    try:
        from frvt.testops import http_client, sample_assets  # noqa: F401
        from frvt.testops.fixtures import (  # noqa: F401
            malformed_zips,
            synthetic_schemes,
            verse0_project,
        )
    except Exception as exc:  # noqa: BLE001 — surface any import failure to the gate
        logger.error("Phase 0 import failed", exc_info=True)
        print(f"Phase 0 FAILED — import error: {exc}")
        return 1

    text = _MATRIX.read_text(encoding="utf-8")
    rows = [line for line in text.splitlines() if _TC_ROW.match(line)]
    if len(rows) != _EXPECTED_TC_COUNT:
        print(
            f"Phase 0 FAILED — coverage matrix has {len(rows)} TC rows, "
            f"expected {_EXPECTED_TC_COUNT}"
        )
        return 1

    zip_path = sample_assets.primary_project_zip()
    if not zip_path.is_file():
        print(f"Phase 0 FAILED — primary sample zip missing: {zip_path}")
        return 1

    verse0_zip = verse0_project.ensure_verse0_project_zip()
    if not verse0_zip.is_file():
        print(f"Phase 0 FAILED — verse-0 fixture zip missing: {verse0_zip}")
        return 1

    print(
        f"Phase 0 OK — matrix={len(rows)} cases, helpers importable, "
        f"sample zip present, verse0 fixture present"
    )
    return 0


def _pytest_phase(phase: int) -> int:
    """Run pytest tests marked for the given phase number."""
    return _run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests",
            "-m",
            f"phase{phase}",
            "-q",
            "--tb=short",
        ],
        cwd=_FRVT_ROOT,
    )


def _wipe_user_translations() -> int:
    """Remove non-anchor translations so e2e empty/solo states are reachable quickly.

    Returns 0 on success. Failures are logged and returned as non-zero so UI phases
    do not silently run against stale catalogs.
    """
    import os

    container = os.environ.get("FRVT_DB_CONTAINER", "frvt-db-1")
    logger.debug("Wiping user translations via dockerized psql container=%s", container)
    completed = subprocess.run(
        [
            "docker",
            "exec",
            container,
            "psql",
            "-U",
            "frvt",
            "-d",
            "frvt",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            "DELETE FROM translation_versification WHERE scheme_id IN "
            "(SELECT id FROM versification_scheme WHERE canonical = false); "
            "DELETE FROM mapping_record WHERE scheme_id IN "
            "(SELECT id FROM versification_scheme WHERE canonical = false); "
            "DELETE FROM versification_scheme WHERE canonical = false; "
            "DELETE FROM verse_span WHERE translation_id IN "
            "(SELECT id FROM translation WHERE is_anchor = false); "
            "DELETE FROM translation_versification WHERE translation_id IN "
            "(SELECT id FROM translation WHERE is_anchor = false); "
            "DELETE FROM translation WHERE is_anchor = false;",
        ],
        check=False,
        cwd=str(_FRVT_ROOT),
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        logger.error(
            "Wipe failed rc=%s stderr=%s stdout=%s",
            completed.returncode,
            completed.stderr,
            completed.stdout,
        )
        print(
            f"Wipe FAILED (container={container} rc={completed.returncode}): "
            f"{completed.stderr or completed.stdout}",
            flush=True,
        )
        return int(completed.returncode)
    print(f"Wipe OK — user translations/schemes cleared via {container}", flush=True)
    return 0


def _playwright_phase(phase: int) -> int:
    """Run Playwright e2e for a phase project (external server required)."""
    # Reset user data before UI phases that depend on empty/solo catalogs.
    if phase in {7, 8, 9, 10}:
        wipe_code = _wipe_user_translations()
        if wipe_code != 0:
            return wipe_code
    # Phase 7 covers smoke deep-links and auth/OOS login cases.
    projects = {
        7: ("smoke", "auth"),
        8: ("viewer",),
        9: ("overlay",),
        10: ("manage",),
    }.get(phase, ("smoke",))
    for project in projects:
        code = _run(
            ["npx", "playwright", "test", f"--project={project}"],
            cwd=_WEB_ROOT,
        )
        if code != 0:
            return code
    return 0


def _vitest_optional() -> int:
    """Run Vitest for optional frontend unit coverage."""
    return _run(["npm", "run", "test"], cwd=_WEB_ROOT)


def run_phase(phase: int) -> int:
    """Dispatch a single phase gate and return the process exit code."""
    logger.debug("Starting phase gate phase=%s", phase)
    print(f"\n======== Phase {phase} ========", flush=True)
    if phase == 0:
        return _phase0()
    if phase in {1, 2, 3, 4, 5, 6}:
        code = _pytest_phase(phase)
        if code == 5:
            print(
                f"Phase {phase} FAILED — no tests collected for marker phase{phase}. "
                "Marker wiring or collection is broken."
            )
            return 1
        return code
    if phase in {7, 8, 9, 10}:
        code = _playwright_phase(phase)
        # Playwright fails hard if no tests in project; treat missing project files
        # as scaffolding success only when exit indicates empty — otherwise surface.
        return code
    if phase == 11:
        return _vitest_optional()
    if phase == 12:
        # Full gate: re-validate matrix has no pending/deferred, then --all semantics
        # are handled by caller; here run phase0 + remind operator.
        matrix = _MATRIX.read_text(encoding="utf-8")
        if re.search(r"\| pending \||\| deferred-", matrix):
            print(
                "Phase 12 FAILED — coverage matrix still has pending or deferred rows"
            )
            return 1
        print("Phase 12 OK — matrix has no pending/deferred rows")
        return 0
    print(f"Unknown phase: {phase}")
    return 2


def run_all() -> int:
    """Run phases 0 through 12 in order; stop at the first failure."""
    logger.debug("Running all phase gates fail-fast")
    for phase in range(0, 13):
        code = run_phase(phase)
        if code != 0:
            print(f"\nFAIL-FAST: phase {phase} exited {code}", flush=True)
            return code
    print("\nAll phases passed.", flush=True)
    return 0


def main(argv: list[str] | None = None) -> int:
    """Parse CLI args and run the requested phase gate(s)."""
    configure_logging("DEBUG")
    parser = argparse.ArgumentParser(description="FRVT test execution phase runner")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--phase", type=int, help="Run a single phase 0..12")
    group.add_argument("--all", action="store_true", help="Run phases 0..12 fail-fast")
    args = parser.parse_args(argv)

    if args.all:
        return run_all()
    if args.phase < 0 or args.phase > 12:
        print("--phase must be between 0 and 12")
        return 2
    return run_phase(args.phase)


if __name__ == "__main__":
    raise SystemExit(main())
