# FRVT-3 Test Coverage Matrix

**Purpose:** Trace each `TC-*` from the test plans to an automated test and track status.
**Status values:** `pending` | `deferred-phaseN` | `in-progress` | `done` | `oos-confirmed` | `blocked`
**Oracle:** [frvt-3-test-execution-plan-1.md](../.spec/frvt-3-test-execution-plan-1.md) and the five area test-plan files.

Update this file whenever you implement or defer a case. Phase 12 requires no `pending` or `deferred-*` rows.

| TC ID | Priority | Phase | Marker / area | Proposed module | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TC-AUTH-001 | Required | 1 | auth | frvt/tests/test_health_auth.py | done | |
| TC-AUTH-002 | Required | 7 | auth | frvt/web/e2e/auth.spec.ts | done | e2e auth.spec |
| TC-AUTH-010 | Required | 1 | auth | frvt/tests/test_health_auth.py | done | |
| TC-AUTH-011 | Required | 1 | auth | frvt/tests/test_health_auth.py | done | |
| TC-AUTH-013 | Required | 7 | auth | frvt/web/e2e/auth.spec.ts | done | e2e route-mocked 401s |
| TC-SERVER-001 | Required | 1 | server | frvt/tests/test_health_auth.py | done | |
| TC-SERVER-002 | Required | 1 | server | frvt/tests/test_bootstrap.py | done | |
| TC-SERVER-003 | Required | 1 | server | frvt/tests/test_api_crud.py | done | |
| TC-SERVER-004 | Required | 7 | server | frvt/web/e2e/smoke.spec.ts | done | e2e smoke |
| TC-SERVER-010 | Required | 1 | server | frvt/tests/test_health_auth.py | done | |
| TC-SERVER-011 | Required | 1 | server | frvt/tests/test_bootstrap.py | done | with TC-SERVER-002 |
| TC-SERVER-013 | Required | 1 | server | frvt/tests/test_api_resolve.py | done | |
| TC-API-001 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-002 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-003 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-004 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-005 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-010 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-011 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-012 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-013 | Required | 2 | api | frvt/tests/test_api_crud.py | done | with TC-API-004 |
| TC-API-014 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-015 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-API-016 | Required | 2 | api | frvt/tests/test_api_crud.py | done | R-10: prefer 422 |
| TC-API-017 | Required | 2 | api | frvt/tests/test_api_crud.py | done | |
| TC-INGEST-001 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | |
| TC-INGEST-002 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | |
| TC-INGEST-003 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | |
| TC-INGEST-004 | Optional | 6 | ingest | frvt/tests/test_ingest_pure.py | done | |
| TC-INGEST-005 | Optional | 6 | ingest | frvt/tests/test_ingest_pure.py | done | |
| TC-INGEST-006 | Optional | 6 | ingest | frvt/tests/test_ingest_pure.py | done | |
| TC-INGEST-007 | Optional | 6 | ingest | frvt/tests/test_ingest_pure.py | done | |
| TC-INGEST-010 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | |
| TC-INGEST-011 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | |
| TC-INGEST-012 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | |
| TC-INGEST-013 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | |
| TC-INGEST-014 | Optional | 6 | ingest | frvt/tests/test_ingest_pure.py | done | |
| TC-INGEST-015 | Optional | 6 | ingest | frvt/tests/test_ingest_pure.py | done | |
| TC-INGEST-016 | Optional | 6 | ingest | frvt/tests/test_ingest_pure.py | done | |
| TC-INGEST-017 | Required | 3 | ingest | frvt/tests/test_api_ingest_resolve.py | done | fail closed |
| TC-INGEST-018 | Required | 8 | ingest | frvt/web/e2e/viewer.spec.ts | done | e2e viewer upload modal |
| TC-RESOLVE-001 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T1 |
| TC-RESOLVE-002 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T2 |
| TC-RESOLVE-003 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T3 ∈ {shift,renumber} |
| TC-RESOLVE-004 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T4 |
| TC-RESOLVE-005 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T5 |
| TC-RESOLVE-006 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T6 |
| TC-RESOLVE-007 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T11 |
| TC-RESOLVE-008 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T12 |
| TC-RESOLVE-009 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-010 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-011 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-012 | Optional | 6 | resolve | frvt/tests/test_resolver.py | done | |
| TC-RESOLVE-013 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-014 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-020 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-021 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-022 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-023 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-024 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-025 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | T10 |
| TC-RESOLVE-026 | Optional | 6 | resolve | frvt/tests/test_resolver.py | done | |
| TC-RESOLVE-027 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-RESOLVE-028 | Required | 4 | resolve | frvt/tests/test_api_resolve.py | done | |
| TC-NAV-001 | Required | 5 | nav | frvt/tests/test_api_navigation.py | done | |
| TC-NAV-002 | Required | 5 | nav | frvt/tests/test_api_navigation.py | done | ordered by source starting BCV |
| TC-NAV-003 | Required | 5 | nav | frvt/tests/test_api_navigation.py | done | vocab only |
| TC-NAV-004 | Required | 5 | nav | frvt/tests/test_api_navigation.py | done | |
| TC-NAV-005 | Required | 8 | nav | frvt/web/e2e/viewer.spec.ts | done | e2e viewer jump |
| TC-NAV-006 | Required | 8 | nav | frvt/web/e2e/viewer.spec.ts | done | e2e viewer jump sections |
| TC-NAV-007 | Required | 8 | nav | frvt/web/e2e/viewer.spec.ts | done | e2e viewer jump BCV |
| TC-NAV-010 | Required | 5 | nav | frvt/tests/test_api_navigation.py | done | |
| TC-NAV-011 | Required | 8 | nav | frvt/web/e2e/viewer.spec.ts | done | e2e single-translation |
| TC-NAV-012 | Required | 5 | nav | frvt/tests/test_api_navigation.py | done | |
| TC-NAV-013 | Required | 5 | nav | frvt/tests/test_api_navigation.py | done | cancel-filter contract, including partial exception |
| TC-UI-001 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-002 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-003 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-004 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | verse-0 fixture zip |
| TC-UI-005 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-006 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-007 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | cross-chapter + exclude void |
| TC-UI-009 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-010 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | partial 404 banner |
| TC-UI-020 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-021 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-022 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-023 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-024 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | desktop layout |
| TC-UI-025 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | a11y floor |
| TC-UI-026 | Optional | 11 | ui | frvt/web/src/api/credentialsLogging.test.ts | done | static scan + console spy |
| TC-UI-027 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | scroll + connectors |
| TC-UI-030 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-031 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-032 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-033 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-034 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-035 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-036 | Required | 8 | ui | frvt/web/e2e/viewer.spec.ts | done | |
| TC-UI-037 | Optional | 11 | ui | frvt/web/src/lib/formatRef.test.ts | done | + jumpNavigation.test.ts |
| TC-OVERLAY-001 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | |
| TC-OVERLAY-002 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | connector presence |
| TC-OVERLAY-003 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | complex ingredient pair seed |
| TC-OVERLAY-004 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | exclude ingredient seed |
| TC-OVERLAY-005 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | outline/label presence |
| TC-OVERLAY-006 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | |
| TC-OVERLAY-007 | Optional | 11 | overlay | frvt/web/src/viewer/overlay/OverlayController.test.ts | done | rAF coalesce + dispose |
| TC-OVERLAY-010 | Optional | 11 | overlay | frvt/web/src/viewer/overlay/OverlayController.test.ts | done | findAnchor fallback |
| TC-OVERLAY-011 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | |
| TC-OVERLAY-012 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | chapter mode dimmed |
| TC-OVERLAY-013 | Required | 9 | overlay | frvt/web/e2e/overlay.spec.ts | done | current vs chapter count |
| TC-MANAGE-001 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-MANAGE-002 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-MANAGE-003 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-MANAGE-004 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-MANAGE-005 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-MANAGE-006 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-MANAGE-010 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-MANAGE-011 | Required | 10 | manage | frvt/web/e2e/manage.spec.ts | done | |
| TC-OOS-001 | Required | 10 | oos | frvt/web/e2e/manage.spec.ts | oos-confirmed | |
| TC-OOS-002 | Required | 10 | oos | frvt/web/e2e/viewer.spec.ts | oos-confirmed | |
| TC-OOS-003 | Required | 10 | oos | frvt/web/e2e/auth.spec.ts | oos-confirmed | |

**Row count:** 121
