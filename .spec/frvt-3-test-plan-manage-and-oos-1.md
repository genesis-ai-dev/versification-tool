# FRVT-3 Test Plan — Manage UI & Out-of-Scope Confirmations

**Document:** `frvt-3-test-plan-manage-and-oos-1`
**Parent index:** [frvt-3-test-plan-1.md](./frvt-3-test-plan-1.md)
**Areas:** manage UI (`MANAGE`), out-of-scope confirmations (`OOS`)

Shared setup, fixtures, and the traceability matrix live in the [parent index](./frvt-3-test-plan-1.md). Cases are **Required** browser/manage workflows (directly accessible); they do not require DevTools or private module calls.

---

## Manage UI (`MANAGE`)

### TC-MANAGE-001 — Translations manage CRUD workflow

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-150
- **Preconditions:**
  - Seeded and/or ingested data; the authenticated Manage → Translations page.
- **Steps:**
  1. List translations.
  2. Rename a translation.
  3. Associate a scheme to a translation.
  4. Upload a project.
  5. Delete a translation.
- **Expected result:**
  - Each action matches the manage capabilities and succeeds.
  - Actions open as modals over the manage page (they are not separate URL routes).

### TC-MANAGE-002 — Versifications manage workflow (incl. delete unassociated)

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-151, REQ-042
- **Preconditions:**
  - Some schemes exist, including at least one unassociated scheme; the Manage → Versifications page.
- **Steps:**
  1. List schemes.
  2. Rename a scheme.
  3. Upload a standalone scheme.
  4. Delete an **unassociated** scheme.
- **Expected result:**
  - Each success path works; deleting an unassociated scheme succeeds (server returns `204`).

### TC-MANAGE-003 — Removing the preferred association is blocked

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-152
- **Preconditions:**
  - A translation with a preferred association.
- **Steps:**
  1. Attempt to remove the preferred association from the UI.
- **Expected result:**
  - The action is disabled/blocked; the user must set another scheme preferred first.

### TC-MANAGE-004 — Upload and associate are separate steps

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-191
- **Preconditions:**
  - The Manage → Versifications page.
- **Steps:**
  1. Upload a standalone scheme via the upload modal.
  2. Separately, associate that scheme to a translation via the association action.
- **Expected result:**
  - The upload modal creates an **unassociated** scheme.
  - Association is a distinct modal/action; both steps succeed independently.

### TC-MANAGE-005 — Manage actions are local-state modals, not routes

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-192
- **Preconditions:**
  - The manage pages loaded.
- **Steps:**
  1. Open, in turn: upload, rename, associate, remove-association, and confirm-delete.
  2. Watch the URL as each opens.
- **Expected result:**
  - Each action is a local-state modal; the URL route does not change when it opens.
  - Remove-association is presented as a confirmation modal.

### TC-MANAGE-006 — Set preferred in Manage does not reset viewer column selection

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-193
- **Preconditions:**
  - A translation with two associated schemes; viewer has a per-column scheme override selected (`*vers` set).
- **Steps:**
  1. In Manage, set a different scheme as preferred for that translation.
  2. Return to the viewer without clearing the URL.
- **Expected result:**
  - Manage shows the new preferred scheme.
  - The viewer's column still uses its per-request selection (URL `*vers` / selected override), not forcibly reset to the new preferred.

### TC-MANAGE-010 — Delete confirmation modal

- **Level:** e2e · **Priority:** Required · **Category:** functional · **Traces:** REQ-153
- **Preconditions:**
  - A deletable entity in a manage list.
- **Steps:**
  1. Open the delete action.
  2. Cancel it.
- **Expected result:**
  - A local-state confirmation modal appears; cancelling leaves the data unchanged.

### TC-MANAGE-011 — Conflict responses produce actionable UX

- **Level:** e2e · **Priority:** Required · **Category:** error-handling · **Traces:** REQ-129
- **Preconditions:**
  - Conditions that provoke a `409` (e.g. deleting a preferred association or a based_on-restricted entity).
- **Steps:**
  1. Attempt the conflicting action.
- **Expected result:**
  - The UI presents an actionable `409` message explaining how to proceed (e.g. set another preferred first).

---

## Out-of-scope confirmations (`OOS`)

### TC-OOS-001 — No versification sniffer/detector in UI or API

- **Level:** manual/integration · **Priority:** Required · **Category:** out-of-scope-confirmation · **Traces:** REQ-161
- **Preconditions:**
  - The running app and its route/UI surface.
- **Steps:**
  1. Search routes and UI for any versification detection/sniffer feature.
- **Expected result:**
  - No such feature exists (out of scope).

### TC-OOS-002 — Scripture text is not editable

- **Level:** e2e · **Priority:** Required · **Category:** out-of-scope-confirmation · **Traces:** REQ-162
- **Preconditions:**
  - The viewer with rendered verse text.
- **Steps:**
  1. Attempt to edit verse text.
- **Expected result:**
  - Text is read-only (editing is out of scope).

### TC-OOS-003 — No custom login route

- **Level:** e2e · **Priority:** Required · **Category:** out-of-scope-confirmation · **Traces:** REQ-163, REQ-006
- **Preconditions:**
  - The running app.
- **Steps:**
  1. Attempt to visit `/login` and inspect available routes.
- **Expected result:**
  - There is no `/login` route/form; only native HTTP Basic is used.
