# Web UI

The UI is a React application in `frvt/web`. FastAPI serves the production build. Domain words are in [domain-model.md](domain-model.md). The comparison dialog is in [divergence-dialog.md](divergence-dialog.md). What the user must be able to do is in [ux-spec.md](ux-spec.md), and how it should look is in [ui-style-guide.md](ui-style-guide.md).

## Shell and routes

`App` in `frvt/web/src/App.tsx` nests routes under `AppShell`:

| Path | Screen |
| --- | --- |
| `/` | `ViewerPage` |
| `/manage/translations` | Translation list and project ingest |
| `/manage/versifications` | Scheme list and versification upload |
| `/manage` | Redirect to `/manage/translations` |
| anything else | Redirect to `/` |

`AppShell` is the header: brand, nav, and a slot (`#app-header-end` via `frvt/web/src/lib/appHeaderSlot.ts`) where the viewer puts the mapping control and the Divergence button. Deep links depend on the SPA fallback in [Build and serve](#build-and-serve).

## Viewer session

`ViewerUrlState` in `frvt/web/src/viewer/viewerUrl.ts` is the bookmarkable session. `parseViewerSearch` reads `left` and `right` translation ids, BCV fields (`lb`/`lc`/`lv`/`lp` and the `r*` pair), and scheme ids (`lvers`, `rvers`). Those stay null when absent. `drive` is `right` only when the query says `right`; anything else is `left`. `map` is `0` for off, `all` for the whole chapter, and any other value, including a missing key, for the current alignment. The parser does not invent a BCV. `serializeViewerSearch` writes `drive` and `map` on every update and omits empty optional fields, so a preferred scheme stays off the URL.

`ViewerSession` in `frvt/web/src/viewer/ViewerSession.tsx` is the provider for that URL. It is the place that loads spans, associations, and resolve results, and it writes the next search string after a selection settles. Caches for spans, navigation, and associations live beside the provider so a column change does not refetch a chapter the session already holds. A newer request cancels an older one. The provider comment and `createLatestAsyncGuard` in `frvt/web/src/lib/latestAsyncGuard.ts` are the two mechanisms. Do not start a second store for the same fields. The URL is the source of truth `parseViewerSearch` already named. Resolve runs from the drive column to the follower column. After a result, `scrollColumnToSeq` brings the chosen verse into view. `scrollLock` stops that programmatic scroll from being handled as a new selection.

`ViewerWorkspace` places the two scripture columns and the overlay. Its file comment states the columns scroll independently. The overlay measures in workspace coordinates. The columns do not lock their scroll positions together.

`divergenceLauncherEnabled` in `frvt/web/src/divergence/launcher.ts` enables the Divergence button when both columns can resolve and each pinned scheme id is still associated. A null scheme id means the preferred association and is allowed. A stale id is not. The button opens [divergence-dialog.md](divergence-dialog.md).

## Mapping overlay

`MappingOverlay` in `frvt/web/src/viewer/overlay/MappingOverlay.tsx` draws the current alignment or the whole chapter, matching `map`. `off` hides it. The draw plan uses the [resolver relation](domain-model.md#resolver-relation) on the result. Jump menus call the navigation endpoints listed in [api.md](api.md). The client does not parse a jump range itself. `jumpNavigation` consumes the structured navigation ref.

## Manage

`TranslationsManagePage` and `VersificationsManagePage` keep their own React state: the table and a modal. They do not read the viewer URL. Uploads go through the ingest client in `frvt/web/src/api`. The server rules are in [api.md](api.md).

## API client

`frvt/web/src/api/client.ts` sends same-origin requests with credentials. Domain modules wrap one area each: translations, versifications, associations, spans, resolve, navigation, ingest, health, divergence.

`ApiError` in `frvt/web/src/api/errors.ts` is the non-2xx envelope: HTTP status, `detail`, `code`, and optional field errors. `ErrorCode` in `frvt/web/src/api/types.ts` is the same literal set as `ErrorCode` in `frvt/api/errors.py`: `bad_request`, `unauthorized`, `not_found`, `conflict`, `payload_too_large`, `validation_failed`, `too_many_requests`, `internal_error`, `database_unavailable`. `fromResponse` falls back to a status-derived code when the body is missing or malformed.

`types.ts` mirrors the JSON the server returns, in snake_case. The resolve payload uses `ResolveResult`. The divergence wire types live in `frvt/web/src/divergence/types.ts`, next to the dialog, because the rows are dense arrays rather than the resource objects in `types.ts`.

## Build and serve

`npm run dev` starts Vite alone. `frvt/web/README.md` says it does not proxy `/api`. The UI that talks to Postgres is the one FastAPI serves after `npm run build`.

`npm test` runs Vitest. `npm run typecheck` runs the TypeScript build check. `npm run test:e2e` runs Playwright against a server at `http://localhost:8000` unless `FRVT_E2E_BASE_URL` is set.

`create_app` mounts `SpaStaticFiles` at `/` when `frvt/web/dist` exists. `get_response` in `frvt/api/static.py` serves `index.html` for an extensionless 404, and leaves a 404 that names a file extension alone. HTML responses use a no-cache policy. Without `dist`, the mount is skipped.

## Session details

`ViewerPage` in `frvt/web/src/routes/ViewerPage.tsx` wraps the workspace in `ViewerSessionProvider`. An empty library shows the upload empty state. Otherwise the header controls and `ViewerWorkspace` render. `viewerPersistence` stores the last search and restores it when the viewer URL has no query. The nav link back to the viewer uses that saved search.

A verse click calls `setColumnBcv`. When both sides can resolve, the provider stages a pending selection, requests the mapping, and only then writes both BCVs into the URL. The follower chapter is loaded through the span cache. Chapter overlay mode also requests the chapter resolve endpoint. Aborting a stale request is the job of the guards named above: one for the catalog, one for resolve, and one for a single-column load.

`ScriptureColumn` is one pane: translation picker, BCV fields, scheme picker, jump menu, and the verse list. The drive side is marked as the source. `ColumnChrome` is the picker row. `VerseSpan` is one row of stored text. `JumpMenu` loads the jump-menu endpoint for that column. Book menus mark books returned by the jump-books endpoint. `usx` book order on the server is what those lists follow. The client does not sort books by a second rule.

`MappingOverlay` sits over the workspace, not inside a column, so a line can cross the gutter. `drawPlan` turns a resolve result into segments. `visualLanguage` maps a relation onto a color variable, a stroke, a badge, and a topology: direct, branch, converge, to-void, or graph. The look of each is in [ui-style-guide.md](ui-style-guide.md#mapping-overlay). `OverlayController` remeasures when a column scrolls or the window resizes. `scrollLock` is set around the programmatic scroll so that remeasure does not treat the scroll as a user selection.

Manage modals (`UploadProjectModal`, `UploadVersificationModal`, `RenameModal`, `DeleteConfirmModal`, `AssociateModal`) share `ModalShell`. They post through `apiUpload` or `apiSend` and render `ApiError.detail` on failure. A successful upload reloads the table. It does not change the viewer URL. Opening the viewer afterward is a navigation, and the new translation is available to the pickers because the session reloads its catalog.

Styles live in `frvt/web/src/styles`. `tokens.css` holds the palette, relation colors, and the z-index stack. `app.css` is the viewer and the shell. `modal.css` is the shared dialog chrome. `divergence.css` is the comparison dialog and `divergence-events.css` is its selection column, event list, flag chips, and event table. Both are loaded globally from `frvt/web/src/main.tsx` even though the dialog itself is lazy. Dialog rules belong in those two sheets. The viewer sheet is already large. The roles those sheets implement are in [ui-style-guide.md](ui-style-guide.md).

`contract.test.ts` at `frvt/web/src/contract.test.ts` locks reference formatting, jump navigation, the error envelope, and the overlay draw plan against the types in `types.ts`. When a server field changes, update the type, the client wrapper, and that test in the same change. The test is the check that the UI and the envelope still name the same codes.

Playwright projects live in `frvt/web/e2e` and are selected by `playwright.config.ts`. They expect a running server. They send Basic credentials from the environment. Vitest uses jsdom and does not boot FastAPI. A unit test that needs a verse list builds the fixture in memory. An end-to-end test that needs a translation uses the API through the helper in `frvt/web/e2e/helpers/api.ts`.

The header slot is a DOM node, not React context. `ViewerHeaderControls` portals the mapping select, the Divergence button, and the resolve status into it. Manage pages leave the slot empty. That is why the button disappears on `/manage/translations` without a flag on the shell.

## URL fields

`parseViewerSearch` and `serializeViewerSearch` in `frvt/web/src/viewer/viewerUrl.ts` are the only readers and writers of the viewer query. The keys are:

| Key | Meaning |
| --- | --- |
| `left`, `right` | Translation ids. Absent stays null |
| `lb`, `lc`, `lv`, `lp` | Left book, chapter, verse, part |
| `rb`, `rc`, `rv`, `rp` | Right book, chapter, verse, part |
| `lvers`, `rvers` | Scheme ids. Absent means the preferred association |
| `drive` | `right`, or `left` for every other value |
| `map` | `0` off, `all` chapter, otherwise the current alignment |

The parser does not fill a verse the URL did not name. `viewerPersistence` stores the last search and restores it when the viewer is opened with an empty query. The shell's viewer link uses `loadViewerSearch` so a return from Manage lands on the same pair.

`setColumnBcv` is the verse click. When both sides can resolve, the provider keeps the click as a pending selection, requests the mapping, and writes both BCVs only after that result returns. A newer click invalidates the older request through `createLatestAsyncGuard`. The follower's chapter is loaded from the span cache. `map=chapter` also requests the chapter resolve endpoint. `scrollColumnToSeq` runs after the result, inside `scrollLock`, so the scroll event is not read as a new selection.

`ScriptureColumn` is one pane: translation picker, BCV fields, scheme picker, jump menu, and the verse list. `ColumnChrome` is the picker row. `VerseSpan` is one stored row. `JumpMenu` calls the jump-menu endpoint for that column. Book menus use the jump-books endpoint. Those lists follow the server's USX book order. The client does not sort them again.

`drawPlan` turns one resolve result into overlay segments. `visualLanguage` maps a relation onto a color variable, a stroke, a badge, and a topology: direct, branch, converge, to-void, or graph. The look of each is in [ui-style-guide.md](ui-style-guide.md#mapping-overlay). `OverlayController` remeasures when a column scrolls or the window resizes. The overlay node is a sibling of the columns, so a segment can cross the gutter.

Manage pages reload their table after a successful upload, rename, delete, or association change. They do not write the viewer URL. The next visit to `/` reloads the catalog inside `ViewerSession`, which is how a new translation appears in the pickers. `ApiError.detail` is the message the modal shows.

`frvt/web/src/api` splits the client by resource: translations, versifications, associations, spans, resolve, navigation, ingest, health, and divergence. `apiSend` is JSON. `apiUpload` is the multipart ingest and source upload. Both attach credentials and parse the error envelope through `fromResponse`. A body that is not the envelope becomes a status-derived `ErrorCode`, so a proxy error page does not throw inside the modal.

`npm run dev` does not read `DATABASE_URL` and does not send `/api` anywhere. A button that 404s under Vite is expected until the same build is opened through uvicorn. `npm run build` writes `frvt/web/dist`. `create_app` mounts that directory only when it is present at process start. A build copied in after the process is up is not picked up until restart.

Playwright's `baseURL` is `http://localhost:8000` unless `FRVT_E2E_BASE_URL` is set. The projects are declared in `frvt/web/playwright.config.ts`. `FRVT_E2E_USER` and `FRVT_E2E_PASSWORD` override the defaults the config reads. The helper in `frvt/web/e2e/helpers/auth.ts` sends them. The API helper in `frvt/web/e2e/helpers/api.ts` creates the translation a test navigates to. Vitest does not start that server.

## Symbols

| Symbol | Where |
| --- | --- |
| `parseViewerSearch` | Read the query into `ViewerUrlState` |
| `serializeViewerSearch` | Write it back, omitting empty optional fields |
| `loadViewerSearch` | Last search, used when the query is empty and by the shell link |
| `ViewerSession` | Catalog, resolve, and URL writes for the two columns |
| `createLatestAsyncGuard` | A newer request cancels an older one |
| `MappingOverlay` | Current alignment or the chapter, from `map` |
| `drawPlan` | One resolve result to overlay segments |
| `divergenceLauncherEnabled` | Whether the header button opens the dialog |
| `SpaStaticFiles` | `index.html` for an extensionless 404 |
| `ApiError` | Status, `detail`, `code`, and optional field errors |
| `ErrorCode` | The same literals as `frvt/api/errors.py` |
| `App` | Routes under `AppShell` |
| `ViewerPage` | Empty library, or the session and the workspace |
| `ScriptureColumn` | One pane: pickers, jump menu, verse list |
| `TranslationsManagePage` | Project ingest and the translation table |
| `VersificationsManagePage` | Versification upload and the scheme table |
| `UploadProjectModal` | Zip upload through `apiUpload` |
| `UploadVersificationModal` | Standalone versification upload |
| `AssociateModal` | Attach a scheme to a translation |
| `ModalShell` | Shared dialog chrome |
| `fromResponse` | Envelope, or a status-derived code when the body is not one |
| `apiSend` | JSON request with credentials |
| `apiUpload` | Multipart ingest and source upload |
| `RenameModal` | Rename a translation or a scheme |
| `DeleteConfirmModal` | Confirm a delete |
| `ColumnChrome` | The picker row on one scripture column |
| `OverlayController` | Remeasure on scroll and on resize |
| `visualLanguage` | Relation to color, stroke, badge, and topology |
| `scrollColumnToSeq` | Bring the chosen verse into view |
| `scrollLock` | Ignore the programmatic scroll as a new selection |
| `patchViewerUrl` | Write one session field into the query |
| `parseMapMode` | `0` is off, `all` is the chapter, anything else is current |
| `appHeaderSlot` | The DOM node the viewer portals its controls into |
| `contract.test.ts` | Reference formatting, jumps, the error envelope, and the draw plan |
| `ViewerWorkspace` | Two columns and the overlay. The columns scroll independently |
| `JumpMenu` | The jump-menu endpoint for one column |
| `VerseSpan` | One stored row in the column |
| `tokens.css` | Palette, relation colors, and the z-index stack |
| `app.css` | Viewer and shell |
| `modal.css` | Shared dialog chrome |
| `divergence.css` | Comparison dialog. Loaded from `main.tsx` |
| `latestAsyncGuard` | Drop a response that is no longer the latest request |
| `viewerPersistence` | Save and restore the last viewer query |
| `ErrorBody` fields | `detail`, `code`, optional field errors. Status tables stay in [api.md](api.md) |
| `get_response` | In `frvt/api/static.py`. Extensionless 404s receive `index.html` |
