# Maintainer architecture documentation

**Document:** `frvt-7-architecture-docs-execution-plan-1`
**Status:** Not started
**Audience:** The agent writing these documents, and the owner reviewing them
**Scope:** New Markdown under `doc/`, a root `AGENTS.md`, and link-only edits to `README.md`, `frvt/web/README.md`, and `doc/api.md`. No other files.

Never commit or push. The owner reviews all changes. Do not edit this plan. Do not edit anything under `.spec/completed/`. Do not edit source, tests, config, `doc/openapi.json`, or `doc/export-openapi.py`.

---

## How to use this document

Do the phases in order. Each phase lists the files to read, the file to write, the sections to use, and a gate. Do not start a phase until the previous gate passes.

When this plan and the code disagree, the code wins. Record the disagreement in the phase report. Do not invent a fact to fill a gap. If you cannot confirm a claim by opening the file named here, omit the claim.

A link must resolve at the end of the phase that adds it. Link only to files that already exist. Phase 10 adds cross-links from earlier documents to later ones.

> Phase numbers in this plan stay in this file. They must not appear in `doc/`, `AGENTS.md`, source, comments, or config.

## Rules for every phase

- Write current behavior. Do not narrate history, tickets, or how a feature was phased in.
- Cite a repository-relative path and a symbol name. Do not cite line numbers.
- Cite one real path. Do not use brace globs such as `routers/{a,b}.py`.
- Keep every new document directly under `doc/`. Do not add a subdirectory.
- From a file in `doc/`, link a sibling as `domain-model.md#chain-and-hop`. From `AGENTS.md`, link as `doc/README.md`. Do not link to a directory. Mention `.cursor/rules/` in backticks, not as a link.
- Define a term in [doc/domain-model.md](../doc/domain-model.md) and link to that heading afterward. Do not paste a second definition.
- [doc/api.md](../doc/api.md) remains the HTTP contract. Name a route only to point at that file. Do not copy request bodies, status tables, or curl examples into the new documents.
- Each new file is 150 to 400 lines and must stay under 600.
- Mermaid is allowed for a flow, a lifecycle, or the table relationships. One diagram per document is enough. Node ids are `camelCase` or `snake_case` with no spaces. Quote a label that contains parentheses, commas, or colons. Do not set colors, classes, or `click`. Do not use `end`, `subgraph`, `graph`, or `flowchart` as a node id. For a subgraph, write `subgraph id [Label]`. An `erDiagram` uses the table names as entity names.
- Prose is specific. Name the module, the status, or the rule. Do not write "robust", "seamless", "leverages", "it's worth noting", "delve", or "importantly". Do not open a section with "Not only". The place for two meanings of one word is the table "Same word, different meaning".
- Do not add a report file, a checker script, or any other new path inside the repository. The phase report is the message you return. The checker script lives under `/tmp`.

## Findings that shape this plan

These were checked against the code while this plan was written. Re-read the cited file before you copy a value. If the file differs, use the file.

**Two layers.** HTTP routers call ports and the `resolve_*` / indexing / divergence orchestration modules. Those call `frvt/resolver` (coordinates only), `frvt/ingest` (pure parse), and `frvt/divergence` (pure comparison). SQLAlchemy models sit at the edge. `frvt/resolver` still imports logging and, in `chains.py`, loads mapping rows, so describe it as "no HTTP and no verse text", not as a package with zero `frvt.api` imports.

**Catalogs to reproduce after re-reading:**

| Item | Value | Read first |
| --- | --- | --- |
| Canonical names | `org`, `eng`, `lxx`, `rso`, `rsc`, `vul` (`org` is the null base) | `frvt/resources/__init__.py` `CANONICAL_NAMES` |
| Stored mapping relations | `one_to_one`, `shift`, `renumber`, `split`, `merge`, `exclude`, `partial` | `RelationType` in `frvt/api/models/__init__.py` |
| Resolve-time relations | the stored set plus `complex` and `range` | `RelationType` in `frvt/api/schemas/__init__.py` |
| Index status | `pending`, `building`, `ready`, `failed`, `cancelled` | `INDEX_STATUSES` in `frvt/api/models/__init__.py` |
| Report status | `pending`, `running`, `ready`, `failed` | `DivergenceReport` check constraint in `frvt/api/models/divergence.py` |
| Report stages | `loading`, `composing`, `classifying`, `events`, `runs`, `encoding` | `STAGES` in `frvt/api/divergence/registry.py` |
| Error codes | `bad_request`, `unauthorized`, `not_found`, `conflict`, `payload_too_large`, `validation_failed`, `too_many_requests`, `internal_error`, `database_unavailable` | `ErrorCode` in `frvt/api/errors.py` |
| Engine version | `"1"` | `ENGINE_VERSION` in `frvt/divergence/taxonomy.py` |

`TYPE_IDS` is `tuple(SEVERITY)`. The integer stored on an event is the index into that tuple. Do not reorder it. Severity and layer, from `frvt/divergence/taxonomy.py`:

| Type id | Severity | Layer |
| --- | --- | --- |
| `VERSE0_TITLE` | 1 | scheme |
| `BRIDGE` | 1 | text |
| `RENUMBER` | 2 | scheme |
| `MERGE` | 3 | scheme |
| `SPLIT` | 3 | scheme |
| `SEGMENT` | 3 | segment |
| `CHAPTER_MOVE` | 4 | scheme |
| `ORDER_INVERSION` | 4 | scheme |
| `CROSS_BOOK` | 4 | scheme |
| `EXCLUDED` | 4 | text |
| `ONE_SIDED` | 4 | scheme |
| `BOOK_ONE_SIDED` | 5 | canon |

`frvt/divergence/runs.py` opens with: contiguous 1:1 relations with a constant offset merge into bands. The UI draws those rows as ribbons on a three-axis ladder. The words "rung" and "lane" are not domain terms. Do not introduce them.

`frvt/ingest/usfm_convert.py` fails closed. USFM conversion is not supported.

A ready index is the only index the read path consumes. Every other index status resolves live (`TranslationIndex` docstring).

The report payload column is text so key order is preserved (`DivergenceReport` docstring).

## Locked decisions

**Files**, written in phase order:

| Phase | File |
| --- | --- |
| 1 | `doc/domain-model.md` |
| 2 | `doc/architecture.md` |
| 3 | `doc/resolver.md` |
| 4 | `doc/ingest.md` |
| 5 | `doc/indexing.md` |
| 6 | `doc/divergence-engine.md` |
| 7 | `doc/divergence-dialog.md` |
| 8 | `doc/web-ui.md` |
| 9 | `doc/README.md`, `AGENTS.md`, plus the three link edits |
| 10 | Cross-links and a consistency pass. No new file. |

**Heading text in `doc/domain-model.md` is fixed** so later phases can link to it. Use these headings, in this order. You may add further `###` headings under `## Terms` only when you also add them to the list in Phase 10.

```markdown
# Domain model

## Tables

## Terms

### Anchor

### Scheme

### Ingredient and source

### Association

### Chain and hop

### Verse reference

### Span

### Index

### Coupled scheme

### Resolver relation

### Divergence relation

### Event

### Classification

### Ladder

### Band and run

### Ribbon

## Same word, different meaning
```

The slug of a heading is the heading in lower case, with characters other than letters, digits, spaces, and hyphens removed, then spaces turned into single hyphens. `### Chain and hop` is `#chain-and-hop`. `## Same word, different meaning` is `#same-word-different-meaning`.

**The disambiguation table** under `## Same word, different meaning` has these rows, and no others unless you found another collision while reading:

| Word | Meaning A | Meaning B |
| --- | --- | --- |
| Relation | Stored or resolve-time `RelationType` (`frvt/api/models/__init__.py`, `frvt/api/schemas/__init__.py`) | A connected A–org–B component inside `frvt/divergence/compose.py` |
| Span | `VerseSpan` row (`frvt/api/models/__init__.py`) | Five-field verse range encoded by `frvt/divergence/refs.py` |
| Scheme | `VersificationScheme` row | `Scheme` loaded by `frvt/divergence/scheme.py` |
| Segment | Event type and viewer layer `segment` | Hit-test geometry in `frvt/web/src/divergence/model/dotPlot.ts` |
| Band / ribbon | A band is the merged run produced by `frvt/divergence/runs.py` | A ribbon is that run drawn on the ladder or the radial chart |

**`AGENTS.md` sections**, in this order: `# Agent guide`, `## Read first`, `## Repository map`, `## Commands`, `## Invariants`, `## Workspace rules`.

**Link edits**, and nothing else in those files:

- In `README.md`, under `## Documentation`, add this bullet after the `doc/api.md` bullet: `[doc/README.md](doc/README.md) is the maintainer guide to architecture and domain objects.`
- At the end of `frvt/web/README.md`, add: `Maintainer notes on the UI are in [doc/web-ui.md](../../doc/web-ui.md).`
- At the end of the first paragraph of `doc/api.md`, add: `Maintainer notes on architecture and domain objects are in [the doc index](./README.md).`

Leave every heading, table, and code block in those three files as it is. `README.md` already links into `.spec/`. Leave those links. The forbidden-identifier check below applies to `doc/` and `AGENTS.md` only.

## Shared gate

From the repository root, after the phase's file is written.

**Line count.** Every `doc/*.md` and, once it exists, `AGENTS.md`, is under 600 lines:

```bash
wc -l doc/*.md AGENTS.md
```

Skip `AGENTS.md` in that command until Phase 9.

**Links, headings, and cited paths.** Copy the script below to `/tmp/check_maintainer_docs.py`. From Phase 1 on, run it with `--locked-domain`. In Phases 9 and 10, also pass `--require-agents --locked-agents`. Exit code 0 is the gate. Fix every reported line. Do not weaken the script. The script checks that the locked heading slugs are present. It allows extra headings.

```python
#!/usr/bin/env python3
"""Check maintainer docs for broken links, duplicate headings, and missing paths."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(".").resolve()
# `{3}` keeps this source from closing the Markdown fence it is embedded in.
FENCE = re.compile(r"`{3}.*?`{3}", re.DOTALL)
LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
PATH = re.compile(r"`((?:frvt|doc)/[A-Za-z0-9_./-]+)`")
DOMAIN_SLUGS = (
    "domain-model",
    "tables",
    "terms",
    "anchor",
    "scheme",
    "ingredient-and-source",
    "association",
    "chain-and-hop",
    "verse-reference",
    "span",
    "index",
    "coupled-scheme",
    "resolver-relation",
    "divergence-relation",
    "event",
    "classification",
    "ladder",
    "band-and-run",
    "ribbon",
    "same-word-different-meaning",
)
AGENT_SLUGS = (
    "agent-guide",
    "read-first",
    "repository-map",
    "commands",
    "invariants",
    "workspace-rules",
)


def slug(heading: str) -> str:
    text = heading.strip().lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text.strip("-")


def strip_fences(text: str) -> str:
    return FENCE.sub("", text)


def heading_slugs(text: str, label: str, errors: list[str]) -> set[str]:
    counts: dict[str, int] = {}
    for _marks, raw in HEADING.findall(strip_fences(text)):
        item = slug(raw)
        counts[item] = counts.get(item, 0) + 1
    dupes = [name for name, count in counts.items() if count > 1]
    if dupes:
        errors.append(f"{label}: duplicate heading slugs {dupes}")
    return set(counts)


def missing_slugs(text: str, required: tuple[str, ...], label: str, errors: list[str]) -> None:
    found = heading_slugs(text, label, errors)
    absent = [name for name in required if name not in found]
    if absent:
        errors.append(f"{label}: missing heading slugs {absent}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-agents", action="store_true")
    parser.add_argument("--locked-domain", action="store_true")
    parser.add_argument("--locked-agents", action="store_true")
    args = parser.parse_args()
    files = sorted((ROOT / "doc").glob("*.md"))
    agents = ROOT / "AGENTS.md"
    if agents.exists():
        files.append(agents)
    elif args.require_agents:
        print("missing AGENTS.md", file=sys.stderr)
        return 1
    errors: list[str] = []
    if args.locked_domain:
        domain = ROOT / "doc" / "domain-model.md"
        if not domain.is_file():
            errors.append("missing doc/domain-model.md")
        else:
            missing_slugs(domain.read_text(encoding="utf-8"), DOMAIN_SLUGS, "doc/domain-model.md", errors)
    if args.locked_agents:
        if not agents.is_file():
            errors.append("missing AGENTS.md")
        else:
            missing_slugs(agents.read_text(encoding="utf-8"), AGENT_SLUGS, "AGENTS.md", errors)
    for path in files:
        text = path.read_text(encoding="utf-8")
        label = str(path.relative_to(ROOT))
        if len(text.splitlines()) > 600:
            errors.append(f"{label} exceeds 600 lines")
        body = strip_fences(text)
        local_headings = heading_slugs(text, label, errors)
        for raw in LINK.findall(body):
            target = raw.strip()
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            target = target.split()[0]
            file_part, _, anchor = target.partition("#")
            if not file_part:
                if anchor and anchor not in local_headings:
                    errors.append(f"{label}: missing local anchor #{anchor}")
                continue
            resolved = (path.parent / file_part).resolve()
            if not resolved.is_file():
                errors.append(f"{label}: missing file {file_part}")
                continue
            if anchor:
                target_text = resolved.read_text(encoding="utf-8")
                target_headings = heading_slugs(target_text, str(resolved.relative_to(ROOT)), errors)
                if anchor not in target_headings:
                    errors.append(f"{label}: missing anchor {file_part}#{anchor}")
        for cited in PATH.findall(body):
            if not (ROOT / cited).exists():
                errors.append(f"{label}: missing path `{cited}`")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"checked {len(files)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

The same-file anchor branch treats the fragment as a slug. Write same-file links as `[text](#chain-and-hop)`, not as a full heading string.

**Forbidden identifiers.** This must print nothing:

```bash
rg -n 'frvt-[0-9]|[Pp]hase [0-9]|TC-[A-Z][A-Z0-9-]*|\.spec/' doc AGENTS.md
```

Until `AGENTS.md` exists, run the same command with only `doc`.

**Markdown lint.** From the repository root:

```bash
npx -y markdownlint-cli2 "doc/**/*.md" "AGENTS.md"
```

The repo `.markdownlint.json` disables `MD013` and `MD060`. If `npx` cannot download the package, say so in the phase report and continue. Do not add a lint config.

**Mermaid.** For each fence tagged `mermaid`, confirm the syntax rules in "Rules for every phase". If `npx -y @mermaid-js/mermaid-cli` runs, render each fence to `/tmp`. If it does not, say that rendering was not verified. Do not commit rendered images.

**Phase report.** In the message you return, list the files written, each gate command's result, any fact you dropped because the code did not support it, and any plan sentence the code contradicted.

## Phase 1: Domain model

**Read, in order:** `frvt/api/models/__init__.py`, `frvt/api/models/divergence.py`, `frvt/api/schemas/__init__.py` (`RelationType` only), `frvt/divergence/taxonomy.py`, `frvt/divergence/refs.py`, `frvt/divergence/compose.py` (module docstring and the function that builds a relation), `frvt/divergence/runs.py` (module docstring), `frvt/divergence/scheme.py` (class `Scheme`), `frvt/web/src/divergence/Ladder.tsx` (the component comment or the top of the file), `frvt/web/src/divergence/model/dotPlot.ts` (the segment type).

**Write:** `doc/domain-model.md` with the locked headings.

**Cover:**

- Under `## Tables`, one paragraph per table: `translation`, `verse_span`, `versification_scheme`, `translation_versification`, `mapping_record`, `translation_index`, `index_mapping`, `index_reclaim`, `versification_source`, `divergence_report`. Name the table, what a row is, and the foreign keys. Then one `erDiagram` of those tables. `index_mapping` has no foreign key to `translation_index`; say that next to the diagram, because a Mermaid relationship line would be a lie.
- Under each locked `###` heading, one short section: what it is, which symbol defines it, and what a caller can rely on. `### Index` includes the five statuses. `### Resolver relation` lists both the stored values and `complex` / `range`. `### Classification` includes the type / severity / layer table.
- `### Anchor` covers `Translation.is_anchor` and the canonical names.
- `### Ingredient and source` covers the derived JSON on the scheme versus the verbatim `versification_source` row.
- `### Coupled scheme` covers `frvt/api/coupled_scheme_delete.py`: a preferred scheme whose name matches the translation and that has no other association, deleted with that translation.

**Gate:** Shared gate with `--locked-domain`.

## Phase 2: Architecture

**Read:** `frvt/api/main.py`, `frvt/api/bootstrap.py`, `frvt/api/db.py`, `frvt/api/config.py`, `frvt/api/logging_config.py`, `frvt/api/errors.py`, `frvt/api/auth.py`, `frvt/api/failed_auth_limiter.py`, `frvt/tests/conftest.py` (fixture list only).

**Write:** `doc/architecture.md` with these headings:

```markdown
# Architecture

## Process

## Layering

## Startup

## Sessions, config, logging, errors, auth

## Priorities and tradeoffs

## Tests
```

**Cover:**

- One process serves the API and, when `frvt/web/dist` exists, the built UI (`frvt/api/main.py`, `frvt/api/static.py`).
- A flowchart of the layering in the Findings section. Label the resolver limitation accurately.
- Lifespan: `seed_canonical`, then `DivergenceRunner`, then `IndexWorker` when enabled. Tests pass flags that skip the seed and the index worker.
- `get_session` commits on success and rolls back on failure. Settings come from the environment. Logging has `TRACE` (level 5), `DEBUG`, and `ERROR`. The error body is `detail`, `code`, and optional `errors`. Auth is HTTP Basic for the API, the UI, and `/docs`, with an in-process failure limiter.
- Tradeoffs, each tied to a docstring you opened: Basic auth is a shared gate; Postgres is required; index and divergence workers run in the API process; a non-ready index is slow rather than wrong; the resolver does not read verse text; the source row is the stored document and the ingredient is derived; span and mapping inserts use Core `executemany`; modules are split so files stay readable.
- Tests: rollback sessions, a session-scoped canonical seed, per-worker databases when xdist is on. Point at `frvt/web/README.md` for the UI suite. Do not list test case ids.

Link to `doc/domain-model.md` and `doc/api.md` only.

**Gate:** Shared gate with `--locked-domain`.

## Phase 3: Resolver

**Read:** `frvt/resolver/resolve.py`, `frvt/resolver/chains.py`, `frvt/resolver/types.py` (`Hop`), `frvt/resolver/compose.py`, `frvt/resolver/parse_ref.py` (module docstring), `frvt/api/ports/resolver_port.py`, `frvt/api/scheme_select.py`, `frvt/api/resolve_batch.py`, `frvt/api/resolve_chapter.py`, `frvt/api/jump_cancel.py`, `frvt/api/jump_target_content.py`, `frvt/api/jump_books.py`.

**Write:** `doc/resolver.md` with these headings:

```markdown
# Resolver

## Selection

## Chains and hops

## Assemble

## What the port adds

## Batch, chapter, and range

## Jump menus
```

**Cover:** Preferred, explicit, and batch scheme selection, including the batch fallback when no scheme is preferred (confirm the fallback target in `scheme_select.py` before naming it). `build_chain` walks `based_on_id`. Hops meet at the nearest shared numbering-space translation. `assemble` takes an atomic path, a range hull, or a complex hull. Parts are not encoded inside the reference string (`parse_ref.py`). `complex` and `range` are not stored on `mapping_record`. The port attaches stored spans and recomputes the relation from the span counts. Batch and range resolve reuse one path per request; chapter resolve dedupes repeated alignments. Jump menus drop identity targets and, for non-anchor translations, targets in empty books.

Link terms back to `doc/domain-model.md`. Link route details to `doc/api.md`.

**Gate:** Shared gate with `--locked-domain`.

## Phase 4: Ingest

**Read:** `frvt/ingest/ingest_api.py`, `frvt/ingest/project_zip.py`, `frvt/ingest/usx_parse.py`, `frvt/ingest/vrs_convert.py`, `frvt/ingest/source_document.py`, `frvt/ingest/derive_mappings.py`, `frvt/ingest/derive_combined_milestones.py`, `frvt/ingest/usfm_convert.py`, `frvt/api/ports/ingest_port.py`, `frvt/api/source_attach.py`, `frvt/api/bootstrap.py`, `frvt/resources/__init__.py`.

**Write:** `doc/ingest.md` with these headings:

```markdown
# Ingest

## Inputs

## From file to rows

## Source attach

## Shipped canons
```

**Cover:** A project zip needs USX and a `.vrs` file. A standalone upload is `.vrs` or Copenhagen JSON. USFM is rejected by `convert_usfm_to_usx`. Parse stays free of the database. `derive_ingredient` converts, normalizes, and validates. Combined milestones can add splits. `persist_project` writes the translation, spans, scheme, mapping rows, source, and preferred association in one transaction. `attach_source` stores a document on a scheme that does not have one, and does not rewrite the scheme row. Bootstrap loads the packaged ingredients and companion `.vrs` files. `vul` has no companion `.vrs`; confirm that against `frvt/resources` before writing it.

**Gate:** Shared gate with `--locked-domain`.

## Phase 5: Indexing

**Read:** `frvt/api/indexing/keys.py`, `fingerprint.py`, `registry.py`, `builder.py`, `worker.py`, `lookup.py`, `invalidation.py`, and the `TranslationIndex` / `IndexMapping` / `IndexReclaim` classes in `frvt/api/models/__init__.py`.

**Write:** `doc/indexing.md` with these headings:

```markdown
# Indexing

## What an index stores

## Lifecycle

## Build and reclaim

## Read path

## Invalidation
```

**Cover:** An index is one translation plus one scheme. Mapping rows store a precomputed resolve payload and are not foreign-keyed, so deletes go through `index_reclaim`. A state diagram of the five statuses. The worker holds a Postgres advisory lock, recovers a stuck `building` row, reclaims orphans, and requeues on fingerprint drift. The read path uses a pair only when both indexes are `ready`; a miss resolves live. Edits to a translation or scheme mark indexes for rebuild. Usage figures include divergence report count and payload bytes; the column names are in `frvt/api/indexing/registry.py`. Confirm them there.

**Gate:** Shared gate with `--locked-domain`.

## Phase 6: Divergence engine

**Read:** `frvt/divergence/report.py`, `compose.py`, `classify.py`, `events.py`, `runs.py`, `text_facts.py`, `taxonomy.py`, `frvt/api/divergence/compute.py`, `fingerprint.py`, `registry.py`, `runner.py`, `precompute.py`, `frvt/api/models/divergence.py`.

**Write:** `doc/divergence-engine.md` with these headings:

```markdown
# Divergence engine

## Pipeline

## Classification

## Events, runs, and bands

## Schemes and texts

## Cache
```

**Cover:**

- A flowchart of compose, classify, events, runs, encode. Input is two schemes plus the org scheme.
- Classification rules as implemented in `classify.py`: agreement drops out, then excluded, one-sided, cross-book, chapter move, verse 0, segment, merge, split, renumber, then order inversion overriding the previous type. If you cannot confirm a step from the function, omit that step.
- Events collapse adjacent same-family rows. Runs merge constant-offset 1:1 relations into bands. `SAME` is a run with no deviance type.
- `mode` is `schemes` unless text facts are applied, in which case compute sets `texts`. Confirm both assignments in `report.py` and `compute.py`.
- The wire payload is a dense row, not an object per event. Describe the top-level keys you see in `report.py` (`types`, `comparisons`, `eventNotes`, `sides`, `org`, `catalog`, `engineVersion`). Do not invent keys.
- Cache: four ids, fingerprint, the status lifecycle, heartbeat stall, interactive priority over precompute, payload stored as text. Precompute runs when an index becomes ready and a precompute failure does not fail the index. Confirm that in `precompute.py` before writing it.

Link type names to `doc/domain-model.md#classification`.

**Gate:** Shared gate with `--locked-domain`.

## Phase 7: Divergence dialog

**Read:** `frvt/web/src/divergence/DivergenceDialog.tsx`, `model/selection.ts`, `model/index.ts`, `model/detail.ts`, `breakdown.ts`, `MatrixView.tsx`, `RadialView.tsx`, `Ladder.tsx`, `DotPlot.tsx`, `EventTable.tsx`, `Inspector.tsx`, `DetailView.tsx`, `ScopeHeading.tsx`.

**Write:** `doc/divergence-dialog.md` with these headings:

```markdown
# Divergence dialog

## State

## Selection

## Overview

## Book detail

## From wire rows to marks
```

**Cover:** The dialog owns the pin, the active run, the layer toggles, and the tab. A click or a matrix arrow key changes the pin. Pointer movement does not. Overview is the matrix, the radial chart, the donut, and the inspector. Book detail is the ladder (axes A, org, and B; ribbons; one-sided blocks; chapter ticks), the dot plot, and the event table. A hidden layer is drawn as `SAME` so the band stays and loses its type color (`model/detail.ts`). `buildIndex` and `scopeRuns` are the two transforms from wire rows to those marks.

Link band, run, ribbon, and event to `doc/domain-model.md`. Link the pipeline to `doc/divergence-engine.md`.

**Gate:** Shared gate with `--locked-domain`.

## Phase 8: Web UI

**Read:** `frvt/web/src/App.tsx`, `AppShell.tsx`, `routes/ViewerPage.tsx`, `viewer/ViewerSession.tsx` (the provider comment and the URL sync), `viewer/viewerUrl.ts`, `viewer/ViewerWorkspace.tsx`, `viewer/overlay/MappingOverlay.tsx`, `api/client.ts`, `api/errors.ts`, `api/types.ts`, `frvt/web/package.json` (scripts only), `frvt/web/README.md`, `frvt/api/main.py` (the static mount), `frvt/api/static.py`.

**Write:** `doc/web-ui.md` with these headings:

```markdown
# Web UI

## Shell and routes

## Viewer session

## Mapping overlay

## Manage

## API client

## Build and serve
```

**Cover:** Routes `/`, `/manage/translations`, `/manage/versifications`. The URL is the viewer state (`viewerUrl.ts`). Resolve runs from the drive column to the follower; the columns scroll the chosen verse into view and do not lock their scroll positions together. The overlay draws the current alignment or the chapter. Jump menus use the navigation endpoints. Manage pages keep their own state. The client is `src/api/` with the `ErrorCode` union. `npm run dev` does not proxy the API. FastAPI serves `dist/` and falls back to `index.html` for extensionless paths. The Divergence button's enablement lives in `frvt/web/src/divergence/launcher.ts`; describe that rule after reading it, and link the dialog document for everything inside the dialog.

**Gate:** Shared gate with `--locked-domain`.

## Phase 9: Index and agent guide

**Write `doc/README.md`** with:

```markdown
# Maintainer guide

## Who this is for

## Reading order

## Keeping these notes current
```

Reading order: domain model, architecture, then the topic document for the area being changed. `## Who this is for` says the audience is a person or an agent changing the server, the resolver, ingest, indexing, the divergence engine, or the UI. `## Keeping these notes current` says to update the topic document in the same change as the behavior, and to update `doc/api.md` when an HTTP contract changes.

Link every other `doc/*.md`, including `doc/api.md` and `doc/openapi.json`.

**Write `AGENTS.md`** with the locked sections.

- `## Read first` points at `doc/README.md` and says to read `doc/domain-model.md` before changing a domain term.
- `## Repository map` is a short table: `frvt/api`, `frvt/resolver`, `frvt/ingest`, `frvt/divergence`, `frvt/resources`, `frvt/web`, `doc`. One sentence each, matching Phase 2's layering.
- `## Commands` copies these three and points at `README.md` for setup. Do not invent flags.

```bash
cd "$REPO/frvt" && PYTHONPATH="$REPO" .venv/bin/python -m pytest -n auto
```

```bash
cd "$REPO/frvt/web" && npm test && npm run typecheck
```

```bash
PYTHONPATH=. frvt/.venv/bin/python doc/export-openapi.py
```

The third command runs from the repository root. Say that.

- `## Invariants` lists only these. Open the named file again and write the bullet only if the file still says so:
  - Do not reorder `TYPE_IDS`. Bump `ENGINE_VERSION` when the payload shape or the classification changes (`frvt/divergence/taxonomy.py`).
  - Consume index mappings only when both indexes are `ready` (`TranslationIndex` in `frvt/api/models/__init__.py`).
  - The resolver does not read verse text (`frvt/resolver/__init__.py` describes a coordinate-only `resolve`).
  - `versification_source` is the stored document. The ingredient on the scheme is derived (`frvt/api/models/divergence.py`).
  - `complex` and `range` are not stored on `mapping_record` (`RelationType` in `frvt/api/models/__init__.py` and `frvt/api/schemas/__init__.py`).
  - HTTP Basic covers the API, the UI, and `/docs` unless a path prefix is opted out (`frvt/api/auth.py`).
- `## Workspace rules` says further rules live in `.cursor/rules/`, and that ticket ids, phase numbers, and test-case ids stay out of code, comments, config, and `doc/`.

**Apply the three link edits** from Locked decisions. Do not rewrite surrounding sentences.

**Gate:** Shared gate with `--locked-domain --require-agents --locked-agents`. Then confirm `doc/README.md` links to every file in `doc/`, and `AGENTS.md` links to `doc/README.md`.

## Phase 10: Cross-links and consistency

**Edit only files already written.** Add a `## See also` section to each topic document that does not yet link to its neighbors:

| File | Add links to |
| --- | --- |
| `doc/architecture.md` | `doc/resolver.md`, `doc/ingest.md`, `doc/indexing.md`, `doc/divergence-engine.md`, `doc/web-ui.md` |
| `doc/resolver.md` | `doc/indexing.md` (read path) |
| `doc/divergence-dialog.md` | `doc/web-ui.md` |
| `doc/web-ui.md` | `doc/divergence-dialog.md` (already required in Phase 8; do not duplicate) |

**Consistency checks**, and fix the documents when one fails:

- Every locked `###` heading from Phase 1 is still present and still has the same slug.
- The type / severity / layer table matches `frvt/divergence/taxonomy.py` at this moment.
- A search for a second definition: in `doc/*.md` other than `doc/domain-model.md`, a heading must not be `Relation`, `Span`, `Scheme`, `Band`, or `Event`. Those sections live in the domain model.
- The first mention of "band", "ribbon", "ladder", and "coupled scheme" in each other document is a link to the domain model.
- No document lists HTTP fields that `doc/api.md` already specifies. A mention of a path such as `/api/resolve` plus a link is enough.
- Re-read each Mermaid diagram against the module it claims to depict. Remove a node you cannot point at in code.

**Prose.** Read `/home/mkitchin/.cursor/skills/no-ai-slop/SKILL.md` when that file is present, and audit `doc/` and `AGENTS.md` in `audit` mode at severity `strong`. Apply a fix only when it does not delete a fact. If the skill file is absent, skip it and say so. The banned phrases in "Rules for every phase" still apply either way.

**Gate:** Shared gate with `--locked-domain --require-agents --locked-agents`, plus markdownlint, plus the Mermaid check. The phase report includes the consistency-check results.
