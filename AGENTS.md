# Agent guide

## Read first

Start at [doc/README.md](doc/README.md). Read [doc/domain-model.md](doc/domain-model.md) before changing a domain term. The topic pages linked from the index describe the package you are about to edit. Before changing what a user sees or can do in `frvt/web`, read [doc/ux-spec.md](doc/ux-spec.md) and [doc/ui-style-guide.md](doc/ui-style-guide.md). [doc/api.md](doc/api.md) is the HTTP contract. Do not duplicate it.

## Repository map

| Path | What it owns |
| --- | --- |
| `frvt/api` | HTTP routers, ports, sessions, auth, indexing, and divergence orchestration |
| `frvt/resolver` | Coordinate mapping across schemes. No HTTP and no verse text |
| `frvt/ingest` | Parse a project zip or a versification file. No database writes |
| `frvt/divergence` | Compare two schemes through org and encode the wire payload |
| `frvt/resources` | Packaged canonical ingredients and companion `.vrs` files |
| `frvt/web` | React viewer, manage pages, and the divergence dialog |
| `doc` | Maintainer notes and the HTTP contract |

Routers call ports and orchestration. Those call the three libraries and the SQLAlchemy models. `frvt/resolver/chains.py` loads mapping rows, and the libraries log through `frvt/api/logging_config.py`. That is the existing seam. Do not add HTTP or session use inside `frvt/ingest` or `frvt/divergence`.

`frvt/api` routers, in include order: `health.py`, `translations.py`, `spans.py`, `versifications.py`, `associations.py`, `ingest.py`, `resolve.py`, `navigation.py`, `indexes.py`, `divergence.py`. Ports live in `frvt/api/ports`. Indexing lives in `frvt/api/indexing`. Report orchestration lives in `frvt/api/divergence`. Sessions, settings, auth, and errors are `db.py`, `config.py`, `auth.py`, `errors.py`, and `logging_config.py`.

`frvt/resolver` is `parse_ref.py`, `chains.py`, `resolve.py`, `cover.py`, `walk.py`, `compose.py`, `range_hull.py`, `normalize.py`, and `types.py`. `resolve` does not read verse text.

`frvt/ingest` parses only. `project_zip.py` locates members. `usx_parse.py` and `usx_verse_number.py` read USX. `vrs_convert.py`, `normalize.py`, and `burrito_validate.py` produce an ingredient. `derive_mappings.py` and `derive_combined_milestones.py` flatten it. `usfm_convert.py` rejects USFM. `source_document.py` is the derive entry the port calls.

`frvt/divergence` compares. `scheme.py` loads an in-memory scheme. `compose.py` builds relations and calls `classify.py`. `events.py` and `runs.py` encode the groups the dialog draws. `report.py` is the wire payload. `taxonomy.py` owns `TYPE_IDS` and `ENGINE_VERSION`. `text_facts.py` overlays stored coordinates. It does not read scripture content.

`frvt/web` routes are `/`, `/manage/translations`, and `/manage/versifications`. Viewer state is the query string in `frvt/web/src/viewer/viewerUrl.ts`. The comparison dialog is `frvt/web/src/divergence`. Production assets are `frvt/web/dist`, served by `frvt/api/static.py` when that directory exists.

`doc/api.md` is the HTTP contract. `doc/openapi.json` is the checked-in schema. The other files in `doc/` are the notes linked from `doc/README.md`. Do not paste request bodies into those notes.

| Path | Owns |
| --- | --- |
| `frvt/resolver/parse_ref.py` | BCV grammar for resolve |
| `frvt/resolver/chains.py` | `based_on_id` hops and the mapping-row load |
| `frvt/resolver/resolve.py` | `assemble` and `resolve` |
| `frvt/resolver/cover.py` | Narrowest covering record |
| `frvt/resolver/walk.py` | Upward and downward verse sets |
| `frvt/resolver/compose.py` | Atomic relation composition |
| `frvt/resolver/range_hull.py` | Unequal-zip range promotion |
| `frvt/resolver/normalize.py` | Same-BCV rewrite |
| `frvt/ingest/project_zip.py` | Required zip members |
| `frvt/ingest/usx_parse.py` | USX to spans |
| `frvt/ingest/vrs_convert.py` | `.vrs` to an ingredient |
| `frvt/ingest/derive_mappings.py` | Ingredient to mapping DTOs |
| `frvt/ingest/usfm_convert.py` | Fail-closed USFM |
| `frvt/api/ports/ingest_port.py` | The insert transaction |
| `frvt/divergence/classify.py` | Type, cardinality, flags |
| `frvt/divergence/events.py` | Adjacent rows into events |
| `frvt/divergence/runs.py` | Constant-offset bands |
| `frvt/divergence/report.py` | Wire payload |
| `frvt/divergence/taxonomy.py` | `TYPE_IDS` and `ENGINE_VERSION` |
| `frvt/api/indexing/worker.py` | Daemon, lock, reclaim, sweep |
| `frvt/api/indexing/lookup.py` | Ready-pair read |
| `frvt/api/indexing/invalidation.py` | Requeue and drop |
| `frvt/api/divergence/compute.py` | Run the engine and store the payload |
| `frvt/api/divergence/registry.py` | Claim, heartbeat, ready, failed |
| `frvt/api/divergence/precompute.py` | Queue comparisons when an index is ready |
| `frvt/api/auth.py` | Basic gate for the API, the UI, and `/docs` |
| `frvt/api/static.py` | `index.html` fallback for extensionless paths |
| `frvt/web/src/viewer/viewerUrl.ts` | Bookmarkable viewer session |
| `frvt/web/src/divergence/DivergenceDialog.tsx` | Pin, layers, and tabs |
| `frvt/web/src/divergence/model/selection.ts` | What a click stores |
| `frvt/web/src/divergence/model/detail.ts` | Ladder window and book-scoped runs |
| `frvt/web/src/divergence/model/index.ts` | Matrix cell score and `buildIndex` |
| `frvt/api/main.py` | App, lifespan, router order |
| `frvt/api/db.py` | Request session and the engine |
| `frvt/api/config.py` | Environment settings |
| `frvt/api/errors.py` | `ErrorBody` and `ErrorCode` |
| `frvt/api/bootstrap.py` | Packaged canonical seed |
| `frvt/api/source_attach.py` | Store a document without rewriting the scheme |
| `frvt/ingest/source_document.py` | Derive the ingredient and hash the source |
| `frvt/ingest/normalize.py` | Move embedded part suffixes |
| `frvt/divergence/scheme.py` | In-memory scheme and edges to org |
| `frvt/divergence/text_facts.py` | Overlay stored coordinates, not scripture text |
| `frvt/divergence/compose.py` | Relations through org, then classify |
| `frvt/web/src/App.tsx` | Routes |
| `frvt/web/src/api/client.ts` | Same-origin client |
| `frvt/web/README.md` | UI commands and the e2e base URL |
| `frvt/web/src/divergence/launcher.ts` | When the Divergence button is enabled |
| `frvt/web/src/divergence/taxonomy.ts` | Client copy of `TYPE_IDS` |
| `frvt/api/indexing/builder.py` | Materialize both directions against ready indexes |
| `frvt/api/indexing/fingerprint.py` | Digest of the translation and the scheme chain |
| `frvt/api/divergence/fingerprint.py` | Digest of engine version, indexes, and source hashes |
| `frvt/api/divergence/runner.py` | Interactive priority ahead of precompute |
| `frvt/api/failed_auth_limiter.py` | Sliding window for Basic failures |
| `frvt/api/logging_config.py` | `TRACE` at level 5, stderr, `frvt` logger tree |
| `frvt/resources/__init__.py` | `CANONICAL_NAMES` and packaged ingredients |
| `doc/export-openapi.py` | Regenerate `doc/openapi.json` |
| `doc/api.md` | HTTP contract |
| `doc/README.md` | Index of the maintainer notes |

## Commands

Setup, Postgres, and the uvicorn command are in [README.md](README.md). From a shell where `$REPO` is the repository root:

```bash
cd "$REPO/frvt" && PYTHONPATH="$REPO" .venv/bin/python -m pytest -n auto
```

```bash
cd "$REPO/frvt/web" && npm test && npm run typecheck
```

```bash
PYTHONPATH=. frvt/.venv/bin/python doc/export-openapi.py
```

The third command runs from the repository root, after a route or a model change.

## Invariants

- Do not reorder `TYPE_IDS`. Bump `ENGINE_VERSION` when the payload shape or the classification changes (`frvt/divergence/taxonomy.py`).
- Consume index mappings only when both indexes are `ready` (`TranslationIndex` in `frvt/api/models/__init__.py`).
- The resolver does not read verse text (`frvt/resolver/__init__.py` describes a coordinate-only `resolve`).
- `versification_source` is the stored document. The ingredient on the scheme is derived (`frvt/api/models/divergence.py`).
- `complex` and `range` are not stored on `mapping_record` (`RelationType` in `frvt/api/models/__init__.py` and `frvt/api/schemas/__init__.py`).
- HTTP Basic covers the API, the UI, and `/docs` unless a path prefix is opted out (`frvt/api/auth.py`).

How to check each one before finishing a change:

- `TYPE_IDS` is `tuple(SEVERITY)` in `frvt/divergence/taxonomy.py`. The integer on an event is the index. The client tuple in `frvt/web/src/divergence/taxonomy.ts` is the same sequence. Appending a type means appending a key to `SEVERITY` and a layer to `LAYER`. `ENGINE_VERSION` is the string `"1"` until the payload shape or the classification changes.
- `find_ready_pair` in `frvt/api/indexing/lookup.py` returns a pair only when both indexes are `ready`. A new read path that loads `index_mapping` any other way is wrong even if the payload happens to look current.
- `resolve` in `frvt/resolver/resolve.py` does not query `verse_span`. Text is attached in `frvt/api/ports/resolver_port.py` after the coordinate result. A change that needs scripture content belongs in the port or in `frvt/divergence/text_facts.py`, which still does not read the text itself.
- `VersificationSource` in `frvt/api/models/divergence.py` stores `document_text`. `VersificationScheme.ingredient` is the derived JSON. `attach_source` refuses to rewrite the scheme row.
- `RelationType` on the model is the stored set. The schema enum adds `complex` and `range`. A migration that adds those two names to `mapping_record` contradicts the model.
- `BasicAuthMiddleware` runs for every path that `path_matches_public_prefix` does not opt out. The default public-prefix list is empty. `/docs` is covered. A prefix of `/` opts everything out. `/doc` does not opt out `/docs`.

The three commands above are the checks to run. The first is the Python suite from `frvt/`, with `PYTHONPATH` set to the repository root so `frvt` imports. The second is the UI unit tests and the TypeScript check. The third regenerates `doc/openapi.json` from the repository root after a route or a model change. Setup, Postgres, and the uvicorn command are in `README.md`, not here.

## Workspace rules

Further rules live in `.cursor/rules/`. Ticket ids, phase numbers, and test-case ids stay out of code, comments, config, and `doc/`.

The files in that directory, and the constraint each one states:

- `.cursor/rules/01-reliable-code.mdc` asks for code a later reader can check.
- `.cursor/rules/02-backend-logging.mdc` asks public backend operations to log at debug, caught exceptions at error, and getters at trace.
- `.cursor/rules/03-testing-standards.mdc` asks tests to cover the contract and the essential failure, not a controller that only delegates.
- `.cursor/rules/04-orienting-comments.mdc` asks a new field or method to say why it exists.
- `.cursor/rules/05-spec-documents.mdc` puts design notes in `.spec` as Markdown.
- `.cursor/rules/06-reusable-code.mdc` asks for a shared helper when a second copy would be the same rule.
- `.cursor/rules/07-modern-patterns.mdc` asks for the current idiom of the language level in use.
- `.cursor/rules/08-boilerplate-reduction.mdc` asks for the language feature that removes repetitive declarations.
- `.cursor/rules/09-file-size-limits.mdc` sets a desirable file size of 600 lines and a hard limit of 1000.
- `.cursor/rules/10-argument-limits.mdc` sets a desirable argument count of 6 and a hard limit of 10.
- `.cursor/rules/11-no-commit-or-push.mdc` leaves commits and pushes to the owner.
- `.cursor/rules/12-no-plan-identifiers.mdc` keeps plan and workflow identifiers out of code, comments, configuration, and `doc/`.

Those files are the rule text. This page does not replace them. A change that cannot satisfy one of them should stop and say which file it conflicts with, rather than quietly weakening the file.
