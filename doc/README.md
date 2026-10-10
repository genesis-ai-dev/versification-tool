# Maintainer guide

Notes for someone changing the server, the resolver, ingest, indexing, the divergence engine, or the UI. The HTTP contract stays in [api.md](api.md). The generated client schema is [openapi.json](openapi.json).

## Who this is for

Read these notes before changing a behavior another module already depends on. A person and an agent use the same pages. Start with the domain model when a word is doing two jobs. Start with the topic page when the change sits in one package.

The audience is a person or an agent changing the server, the resolver, ingest, indexing, the divergence engine, or the UI. The notes describe current behavior. They are not a changelog and they are not a second copy of the HTTP contract.

## Reading order

1. [domain-model.md](domain-model.md) defines the tables and the words. Other pages link here instead of defining them again. Open it before renaming a status, a relation, or a layer.
2. [architecture.md](architecture.md) is the process, the layering, and the constraints that are easy to break. Open it before adding a router, a worker, or a new session.
3. Then the page for the area you are changing:
   - [resolver.md](resolver.md) maps a reference across schemes. The coordinate work is `frvt/resolver`. The spans, the batch path, the chapter path, and the jump menus are `frvt/api/ports/resolver_port.py`, `frvt/api/resolve_batch.py`, `frvt/api/resolve_chapter.py`, `frvt/api/jump_cancel.py`, `frvt/api/jump_target_content.py`, and `frvt/api/jump_books.py`.
   - [ingest.md](ingest.md) turns a zip or a versification file into rows. Parsing is `frvt/ingest`. The transaction is `frvt/api/ports/ingest_port.py`. Packaged canons are `frvt/resources` and `frvt/api/bootstrap.py`.
   - [indexing.md](indexing.md) precomputes resolve results. The package is `frvt/api/indexing`.
   - [divergence-engine.md](divergence-engine.md) compares two schemes and caches the payload. Comparison is `frvt/divergence`. The cache, the runner, and precompute are `frvt/api/divergence`.
   - [divergence-dialog.md](divergence-dialog.md) draws that payload. The UI is `frvt/web/src/divergence`.
   - [web-ui.md](web-ui.md) is the viewer, the manage pages, and how the built UI is served. The session is `frvt/web/src/viewer`. The client is `frvt/web/src/api`. The static mount is `frvt/api/static.py`.
4. Before changing what a user sees or can do:
   - [ux-spec.md](ux-spec.md) states the functional requirements: what each screen, control, and key must do.
   - [ui-style-guide.md](ui-style-guide.md) states the look: color and type roles, control patterns, and the visual vocabulary of the overlay and the dialog. Values stay in `frvt/web/src/styles`.

[api.md](api.md) is the contract for callers. Use it when a route, a status, or a body changes. Do not copy those tables into the topic pages. [openapi.json](openapi.json) is the checked-in schema a client generator reads. A running server's `GET /openapi.json` is the live schema. The two are not the same document. The export script is `doc/export-openapi.py`.

## Keeping these notes current

Update the topic page in the same change as the behavior. Update [domain-model.md](domain-model.md) when a table, a status set, or a word's meaning changes. Update [api.md](api.md) when an HTTP contract changes, and regenerate [openapi.json](openapi.json) with the command in the repository README. A sentence that the code no longer supports should be deleted, not hedged.

Which note to touch:

| Change | Update |
| --- | --- |
| A table, a foreign key, a status set, or a word with two meanings | [domain-model.md](domain-model.md) |
| Process startup, sessions, auth, logging, or which package owns a call | [architecture.md](architecture.md) |
| How a reference maps, including batch, chapter, and jumps | [resolver.md](resolver.md) |
| A zip rule, a `.vrs` rule, or the canonical seed | [ingest.md](ingest.md) |
| Index status, the worker, or the read path | [indexing.md](indexing.md) |
| Classification, events, runs, or the report cache | [divergence-engine.md](divergence-engine.md) |
| A dialog selection, a layer toggle, or a drawn mark | [divergence-dialog.md](divergence-dialog.md) |
| A route, the viewer URL, or how `dist/` is served | [web-ui.md](web-ui.md) and, for HTTP, [api.md](api.md) |
| What a click, a key, or an enabled control does for the user | [ux-spec.md](ux-spec.md) |
| A color role, a control variant, or a drawn mark's appearance | [ui-style-guide.md](ui-style-guide.md) |

A change that adds a status also changes the domain model, even when the code that sets it lives in another package. A change that adds a route also changes [api.md](api.md) and [openapi.json](openapi.json), even when the handler is a one-line delegate. The topic page names the symbol. It does not paste the request body.

When a note and the code disagree, fix the note to match the code. Do not leave both sentences. The diagrams are claims about the code: a relationship line, a state transition, or a pipeline step that the module does not implement should be removed rather than annotated.

Files worth opening beside each note, one path per row:

| Note | Open |
| --- | --- |
| Domain model | `frvt/api/models/__init__.py` |
| Domain model | `frvt/api/models/divergence.py` |
| Domain model | `frvt/divergence/taxonomy.py` |
| Domain model | `frvt/divergence/refs.py` |
| Architecture | `frvt/api/main.py` |
| Architecture | `frvt/api/db.py` |
| Architecture | `frvt/api/config.py` |
| Architecture | `frvt/api/auth.py` |
| Architecture | `frvt/api/errors.py` |
| Architecture | `frvt/api/static.py` |
| Resolver | `frvt/resolver/resolve.py` |
| Resolver | `frvt/resolver/chains.py` |
| Resolver | `frvt/resolver/compose.py` |
| Resolver | `frvt/api/scheme_select.py` |
| Resolver | `frvt/api/resolve_batch.py` |
| Resolver | `frvt/api/resolve_chapter.py` |
| Ingest | `frvt/ingest/project_zip.py` |
| Ingest | `frvt/ingest/derive_mappings.py` |
| Ingest | `frvt/ingest/usx_parse.py` |
| Ingest | `frvt/api/ports/ingest_port.py` |
| Ingest | `frvt/api/bootstrap.py` |
| Ingest | `frvt/resources/__init__.py` |
| Indexing | `frvt/api/indexing/worker.py` |
| Indexing | `frvt/api/indexing/builder.py` |
| Indexing | `frvt/api/indexing/lookup.py` |
| Indexing | `frvt/api/indexing/invalidation.py` |
| Indexing | `frvt/api/indexing/fingerprint.py` |
| Indexing | `frvt/api/indexing/registry.py` |
| Divergence engine | `frvt/divergence/classify.py` |
| Divergence engine | `frvt/divergence/events.py` |
| Divergence engine | `frvt/divergence/runs.py` |
| Divergence engine | `frvt/divergence/report.py` |
| Divergence engine | `frvt/api/divergence/compute.py` |
| Divergence engine | `frvt/api/divergence/registry.py` |
| Dialog | `frvt/web/src/divergence/DivergenceDialog.tsx` |
| Dialog | `frvt/web/src/divergence/model/selection.ts` |
| Dialog | `frvt/web/src/divergence/model/detail.ts` |
| Dialog | `frvt/web/src/divergence/useDivergenceReport.ts` |
| Web UI | `frvt/web/src/viewer/viewerUrl.ts` |
| Web UI | `frvt/web/src/viewer/ViewerSession.tsx` |
| Web UI | `frvt/web/src/api/client.ts` |
| Web UI | `frvt/web/src/api/errors.ts` |
| UX spec | `frvt/web/src/viewer/ViewerHeaderControls.tsx` |
| UX spec | `frvt/web/src/viewer/ColumnChrome.tsx` |
| UI style guide | `frvt/web/src/styles/tokens.css` |
| UI style guide | `frvt/web/src/divergence/model/colors.ts` |

- Domain model: `frvt/api/models/__init__.py`, `frvt/api/models/divergence.py`, `frvt/api/schemas/__init__.py`, `frvt/divergence/taxonomy.py`.
- Architecture: `frvt/api/main.py`, `frvt/api/db.py`, `frvt/api/config.py`, `frvt/api/auth.py`, `frvt/api/errors.py`.
- Resolver: `frvt/resolver/resolve.py`, `frvt/resolver/chains.py`, `frvt/resolver/compose.py`, `frvt/api/scheme_select.py`.
- Ingest: `frvt/ingest/project_zip.py`, `frvt/ingest/derive_mappings.py`, `frvt/api/ports/ingest_port.py`, `frvt/api/bootstrap.py`.
- Indexing: `frvt/api/indexing/worker.py`, `frvt/api/indexing/builder.py`, `frvt/api/indexing/lookup.py`, `frvt/api/indexing/invalidation.py`.
- Divergence engine: `frvt/divergence/classify.py`, `frvt/divergence/events.py`, `frvt/divergence/runs.py`, `frvt/divergence/report.py`, `frvt/api/divergence/compute.py`.
- Dialog: `frvt/web/src/divergence/DivergenceDialog.tsx`, `frvt/web/src/divergence/model/selection.ts`, `frvt/web/src/divergence/model/detail.ts`.
- Web UI: `frvt/web/src/viewer/viewerUrl.ts`, `frvt/web/src/viewer/ViewerSession.tsx`, `frvt/web/src/api/client.ts`, `frvt/api/static.py`.
- UX spec: `frvt/web/src/viewer/ViewerHeaderControls.tsx`, `frvt/web/src/viewer/ColumnChrome.tsx`, `frvt/web/src/divergence/DivergenceDialog.tsx`.
- UI style guide: `frvt/web/src/styles/tokens.css`, `frvt/web/src/viewer/overlay/visualLanguage.ts`, `frvt/web/src/divergence/model/colors.ts`.

Checks that belong in the same change as the code:

- A new `RelationType` value that is stored on `mapping_record` is added to the model enum and to the domain model. `complex` and `range` stay off that enum.
- A new divergence type is appended to `TYPE_IDS` only by appending to `SEVERITY`. Inserting in the middle changes every stored event integer. `ENGINE_VERSION` changes when the payload shape or the classification changes. The copy in `frvt/web/src/divergence/taxonomy.ts` stays in the same order.
- A new index status is added to `INDEX_STATUSES` and to the lifecycle diagram. The read path still returns a pair only when both sides are `ready`.
- A new report status is added to the check constraint on `divergence_report` and to the dialog poll, which treats only `ready` and `failed` as terminal.
- A new viewer query key is read in `parseViewerSearch` and written in `serializeViewerSearch`. A key that only one of those functions knows about will not survive a refresh.
- A new public path prefix is a prefix, not a substring. `/doc` must not opt out `/docs`.
- A new ingest issue with kind `missing` is HTTP 400. Any other kind is HTTP 422. The route does not invent a third mapping.
- A new worker thread uses `get_session_factory`. It does not take the request session. Tests that roll back per case disable the index worker for that reason.
- A diagram that gains a node names a function that performs that step. A transition that the code does not perform is not drawn.

The index does not restate those rules. The topic page does, next to the symbol that implements them.

What each note is for, in one pass:

[domain-model.md](domain-model.md) is the glossary. It names every table, the foreign keys, and the words that mean two things. The classification table there is copied from `SEVERITY` and `LAYER`. If those dicts change, that table changes in the same change. The erDiagram has no line from `index_mapping` or `index_reclaim` to `translation_index`, because those tables have no foreign key.

[architecture.md](architecture.md) is the process. One process serves the API and, when `frvt/web/dist` exists, the built UI. Routers call ports. Ports call `frvt/resolver`, `frvt/ingest`, and `frvt/divergence`. The index worker and the divergence runner are threads started from the lifespan. Tests that pass `run_startup_seed=False` and `run_index_worker=False` do not start that lifespan, so the runner object exists and is not started.

[resolver.md](resolver.md) is coordinate mapping. `batch_scheme_ref` falls back to canonical `org` when no scheme is preferred. `selected_scheme_ref` raises in that case. Chapter resolve uses `selected_scheme_ref`. Parts are a separate field. `complex` and `range` are results. They are not stored on `mapping_record`.

[ingest.md](ingest.md) is the path from a zip or a versification file to rows. Parsing does not open a session. USFM is rejected. `vul` has no companion `.vrs`. A `missing` issue is HTTP 400. Any other ingest issue is HTTP 422.

[indexing.md](indexing.md) is the precompute queue. Mapping rows are readable only when both indexes are `ready`. Deletes orphan the mapping rows on purpose. `index_reclaim` is how they are removed. A fingerprint change moves a `ready` row back to `pending`.

[divergence-engine.md](divergence-engine.md) is the comparison. Classification order is the order in `classify`. Events collapse adjacent same-family rows. Runs are the seven-column ladder rows. The payload is text so key order survives. Precompute failure is a build note.

[divergence-dialog.md](divergence-dialog.md) is the drawing. A click or a matrix arrow key changes the pin. Pointer movement does not. A hidden layer is drawn as `SAME`. The opening window for a long book is `initialLadderView`. `ladderWindow` is the zoomed slice of that axis.

[web-ui.md](web-ui.md) is the shell. The URL is the viewer session. The columns scroll independently. `npm run dev` does not proxy `/api`. FastAPI serves `dist/` and falls back to `index.html` for an extensionless 404.

[ux-spec.md](ux-spec.md) is the behavior a user relies on, written as requirements. [ui-style-guide.md](ui-style-guide.md) is the look, written as roles rather than values. A UI change that alters behavior updates the first. A change that alters appearance updates the second.

[api.md](api.md) is the contract those notes point at instead of copying. [openapi.json](openapi.json) is the schema a generator reads. Regenerate it when a route or a response model changes.

The commands that check a change are in [the agent guide](../AGENTS.md). Setup and the uvicorn command are in the repository [README](../README.md). A note that names a symbol should still be true after the change. If it is not, edit the note in the same change. Do not add a second definition of a word that [domain-model.md](domain-model.md) already defines.

| If you change | Also read |
| --- | --- |
| `SEVERITY` or `LAYER` | [domain-model.md](domain-model.md#classification) and `frvt/web/src/divergence/taxonomy.ts` |
| `INDEX_STATUSES` | [indexing.md](indexing.md#lifecycle) |
| `RelationType` | [domain-model.md](domain-model.md#resolver-relation) |
| `assemble` | [resolver.md](resolver.md#assemble) |
| `classify` | [divergence-engine.md](divergence-engine.md#classification) |
| `build_runs` | [domain-model.md](domain-model.md#band-and-run) |
| `parseViewerSearch` | [web-ui.md](web-ui.md#url-fields) and [ux-spec.md](ux-spec.md#address-and-persistence) |
| `tokens.css` or `colors.ts` | [ui-style-guide.md](ui-style-guide.md#color-roles) |
| `visualForRelation` | [ui-style-guide.md](ui-style-guide.md#mapping-overlay) |
| `BasicAuthMiddleware` | [architecture.md](architecture.md#sessions-config-logging-errors-auth) |
| `seed_canonical` | [ingest.md](ingest.md#shipped-canons) |
| `claim_report` | [divergence-engine.md](divergence-engine.md#cache) |
| A route or a response model | [api.md](api.md) and `doc/openapi.json` |
