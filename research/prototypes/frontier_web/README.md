# Versification Viewer frontend POC

A viewer-first React proof of concept for comparing two Bible translations whose chapter and verse numbering systems differ.

This directory is the early frontend prototype. The product UI is [`frvt/web`](../../../frvt/web/README.md), served by the FastAPI process in the repository README.

The interface renders two independently navigable translation columns and visualizes resolved relationships between their spans, including:

- one-to-one mappings
- shifted verse numbers
- chapter or block renumbering
- one-to-many splits
- many-to-one merges
- excluded verses
- partial-verse mappings

## Run locally

```bash
pnpm install
pnpm dev
```

The Vite development server prints the local URL, normally `http://localhost:5173`.

Other commands:

```bash
pnpm lint
pnpm build
pnpm preview
```

## Current architecture

The POC is intentionally frontend-only. It uses an asynchronous in-memory API client under `src/api/` rather than a server.

- `contracts.ts` mirrors the response shapes and relation vocabulary in the server/API design specification.
- `client.ts` defines the viewer-facing API boundary.
- `mockClient.ts` implements that boundary with modest latency so loading states are exercised.
- `mockData.ts` contains representative translations, spans, versifications, navigation data, and mapping examples.

Viewer components depend on the API interface rather than importing fixtures directly. The product app did not grow out of this mock client; it is a separate tree under `frvt/web`.

## Connector rendering

Connections are rendered with a small native SVG overlay. Verse rows register their DOM elements by normalized reference and optional part. The geometry hook measures the visible anchors, batches scroll and resize updates with `requestAnimationFrame`, and uses `ResizeObserver` to keep the paths attached while either column moves.

No visualization or connection library is used. The native layer is small and provides the control needed for splits, merges, exclusions, and exact partial-span anchors.

## Scope

This iteration focuses on the two-column research viewer. Translation CRUD, versification CRUD, project upload, and standalone mapping upload screens are intentionally deferred until a backend exists.
