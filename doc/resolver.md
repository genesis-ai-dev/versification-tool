# Resolver

The resolver maps a verse reference from one scheme to another. It is coordinate-only: `resolve` in `frvt/resolver/resolve.py` never reads verse text. Terms are defined in [domain-model.md](domain-model.md). HTTP shapes are in [api.md](api.md).

## Selection

`_select_scheme` uses an explicit `SchemeRef` when the caller passes one. Otherwise it loads the translation's preferred scheme. A missing preferred scheme raises `LookupError` on this path.

`selected_scheme_ref` in `frvt/api/scheme_select.py` is the HTTP-facing version of that choice. An override scheme id is checked against the translation. No override and no preferred association is an error for the single-reference and chapter endpoints.

`batch_scheme_ref` is the exception. With no override and no preferred association, it calls `org_scheme_ref` and uses the canonical `org` scheme. The docstring says batch endpoints must not fail the whole request because a preferred scheme is missing. Single-reference endpoints still raise in that case.

## Chains and hops

`resolve` parses `source_ref` with `parse_ref`, expands it to member verses, and applies `part` onto each member. Parts are not encoded in the reference string. `parse_ref` in `frvt/resolver/parse_ref.py` raises `ReferenceError` when a part suffix is embedded or the range crosses chapters.

It then calls `build_chain` for the source scheme and the target scheme. A [chain](domain-model.md#chain-and-hop) is the walk of preferred-scheme hops along `based_on_id` to a root. `nearest_shared_translation` returns the numbering-space translation where those chains meet. `hops_to_ancestor` is the source walk upward. `hops_from_ancestor` is the target walk downward. `assemble` receives those two hop lists.

A cycle, a missing scheme, or no shared ancestor raises `LookupError`.

`hops_to_ancestor` keeps hops until `based_on_id` is the ancestor, and it drops a trailing root hop whose `based_on_id` is null when the chain is already at that numbering. `hops_from_ancestor` is that list reversed, so the target side applies the same schemes from the shared numbering back down to the target scheme. A Spanish custom scheme based on `eng`, compared with another scheme also based on `eng`, meets at the `eng` numbering space. Compared with a scheme based only on `org`, the chains meet at `org` if `eng` itself is based on `org`.

Each hop projects a verse with `project_verse` in `frvt/resolver/cover.py`. `compose` in `frvt/resolver/compose.py` folds two atomic relations along a 1:1 path. `one_to_one` disappears in favor of the other side. Either side `exclude` yields `exclude`. `split` composed with `merge` yields `one_to_one`. `invert_relation` swaps `split` and `merge` and leaves every other atomic relation unchanged. That inverse is what a downward hop applies. `dominant_relation` returns the highest-precedence relation that is not `one_to_one`, or `None` when every relation is `one_to_one`. The hull path uses the walk helpers in `frvt/resolver/walk.py` (`up_set`, `down_set`, `edge_legs`) to close the set of verses reachable through the hops.

## Assemble

`assemble` is the single entry point after the hops are known.

1. `find_range_trigger` in `frvt/resolver/range_hull.py` looks for an unequal-length zip that should become a range.
2. When a trigger exists, `build_hull` closes the connected many-to-many set. If that result's relation is `complex`, `assemble` returns it.
3. Otherwise `build_range_hull` builds the range result, and `normalize_same_bcv` rewrites a same-BCV outcome.
4. With no range trigger, `_atomic_result` projects each member through the hops. `compose` in `frvt/resolver/compose.py` combines per-hop relations. The result is normalized the same way.

`complex` and `range` are [resolver relations](domain-model.md#resolver-relation) that exist only on the result. `mapping_record` stores the atomic set: `one_to_one`, `shift`, `renumber`, `split`, `merge`, `exclude`, and `partial`.

## What the port adds

`frvt/api/ports/resolver_port.py` turns a coordinate result into the API `ResolveResult`. It looks up stored [spans](domain-model.md#span) for the source and target coordinates, including combined-milestone coverage, and drops duplicates. `_relation_after_dedupe` then recomputes the relation from the surviving span counts:

- `complex` is left as `complex`.
- No target spans becomes `exclude`.
- One source span and one target span at the same book, chapter, verse, and part becomes `one_to_one`.
- Many source spans and one target span becomes `merge`.
- One source span and many target spans becomes `split`.

The coordinate engine does not know `seq` or `content`. The port does.

## Batch, chapter, and range

`resolve_verse_set` and the range helper in `frvt/api/resolve_batch.py` build one `ResolvePath` for the request (`build_resolve_path`) and resolve each reference against that path. A member that fails becomes an entry error. It does not fail the other members.

When an index pair is ready, `_resolve_entries` loads cached payloads with `load_payloads` and uses a cached `ResolveResult` on a hit. A miss, or a reference that is not a single-verse index key, calls `resolve_single_with_path`. The index lifecycle is a separate note. This file only depends on the rule that a non-ready pair is absent, so the call resolves live.

`frvt/api/resolve_chapter.py` resolves the verses of one chapter. `alignment_fingerprint` is the emit-once key: the same source and target span set is not emitted twice in that chapter response.

## Jump menus

Jump menus list numbering differences for navigation. Three filters run before the book list:

- `frvt/api/jump_cancel.py` drops a row whose resolved target is the same BCV as the source. Results are cached in the process, keyed by the scheme pair, and reused across requests.
- `target_content_books_or_unfiltered` in `frvt/api/jump_target_content.py` hides targets that land in a book with no stored text. For an [anchor](domain-model.md#anchor) it returns `None` and skips the filter. An anchor stores no verse text, and treating that as empty would hide every jump into a numbering space.
- `jump_difference_books` in `frvt/api/jump_books.py` returns the distinct from-side books of the rows that remain, in USX book order.

The route list is in [api.md](api.md).

## Projection

`project_verse` in `frvt/resolver/cover.py` finds the narrowest covering `mapping_record` for a verse, or treats the verse as identity when no record covers it. `find_covering_record` does the lookup. `_parse_ref_plain` strips a legacy part suffix that older rows embedded in the reference string. New rows keep the part in the `part` column. `unequal_zip_cover` detects the row shape that `find_range_trigger` later promotes to a range hull. `apply_identity` is the projection used when the cover search misses.

Upward hops call `apply_hops_forward` in `frvt/resolver/walk.py`. Downward hops call `apply_hops_downward`, which inverts direction and therefore inverts `split` and `merge`. `up_set` and `down_set` collect the verses reachable from one verse. `src_of_pivot` and `piv_of_target` walk those sets backward when the hull has to know which source verses share a pivot. `edge_legs` and `edge_relation` compose one source-pivot-target path into the edge the hull emits.

`normalize_same_bcv` in `frvt/resolver/normalize.py` rewrites a 1:1 result that lands on its own book, chapter, verse, and part to `one_to_one`. `spans_share_bcv` is the comparison. The port's `_relation_after_dedupe` repeats a similar check after stored spans are attached, because dedupe can change the cardinality the coordinate result reported.

`ResolutionDTO` in `frvt/resolver/types.py` is the coordinate result: source spans, target spans, one relation, and edges. It has no `seq` and no scripture text. `VerseId` is book, chapter, verse, and an optional part. `RefRange` is what `parse_ref` returns. `SchemeRef` is the scheme id the chain walker starts from. `MappingView` is the in-memory copy of one mapping row, so the cover search does not keep an ORM object.

Batch code in `frvt/api/resolve_batch.py` builds that path once per request (`ResolvePath` holds the source hops and the target hops) and then resolves each member. A range request expands to the closed verse interval in `frvt/api/verse_range.py` before that loop. Chapter resolve uses `selected_scheme_ref`, not `batch_scheme_ref`, so a missing preferred scheme fails the chapter instead of falling back to `org`.

## Composition order

`_PRIORITY` in `frvt/resolver/compose.py` is `exclude`, `merge`, `split`, `renumber`, `shift`, `partial`, `one_to_one`. `priority_rank` uses that index. An unknown relation sorts last. `compose` returns the other side when either side is `one_to_one`. Either side `exclude` returns `exclude`. The set `{split, merge}` returns `one_to_one`. Two equal relations stay that relation. Otherwise the earlier rank wins. `dominant_relation` skips `one_to_one` and returns `None` when nothing else is present. The module docstring calls this an interim table for a single 1:1 path. The hull path does not use it for a many-to-many close. That close is `build_hull`.

`resolve_chapter` in `frvt/api/resolve_chapter.py` uses `selected_scheme_ref` on both sides, then walks stored whole verses in the drive chapter. A member that raises is logged and omitted. It does not become an entry error the way a batch member does. `alignment_fingerprint` drops a result whose alignment was already emitted. The response length is the number of unique alignments, not the number of verses.

## Modules

| Module | Role |
| --- | --- |
| `frvt/resolver/parse_ref.py` | Copenhagen `BOOK C:V` and same-chapter ranges |
| `frvt/resolver/chains.py` | `build_chain`, shared ancestor, hop lists |
| `frvt/resolver/resolve.py` | `resolve` and `assemble` |
| `frvt/resolver/cover.py` | Narrowest covering mapping, or identity |
| `frvt/resolver/walk.py` | Upward and downward verse sets |
| `frvt/resolver/compose.py` | Atomic relation composition |
| `frvt/resolver/range_hull.py` | Range trigger and range hull |
| `frvt/resolver/normalize.py` | Same-BCV rewrite to `one_to_one` |
| `frvt/resolver/types.py` | `Hop`, `VerseId`, `ResolutionDTO` |
| `frvt/api/ports/resolver_port.py` | Spans, dedupe, and the API relation |
| `frvt/api/scheme_select.py` | Preferred, explicit, and batch fallback |
| `frvt/api/resolve_batch.py` | One path, many members, index hits |
| `frvt/api/resolve_chapter.py` | One chapter, emit-once alignments |
| `frvt/api/verse_range.py` | Closed interval for a range request |
| `frvt/api/jump_cancel.py` | Drop a jump whose target BCV equals the source |
| `frvt/api/jump_target_content.py` | Hide jumps into books with no stored text |
| `frvt/api/jump_books.py` | Distinct from-side books that remain |

`Hop` is one scheme step: the scheme id, the numbering it is based on, and the mapping rows for that step. `build_chain` loads those rows. The rest of `resolve` does not query. That is the seam the package docstring allows: no HTTP and no verse text, and one module that reads mapping rows.

`SchemeRef` is the scheme id plus the base-translation id the chain walker starts from. `ResolvedSpanDTO` is one single-verse span. `ref` is a single-verse BCV string: never a range, and never a part suffix. The part is the separate field. `ResolutionEdgeDTO` is one connector in a `complex` hull: `source_index`, `target_index`, and the relation on that connector. `edges` is populated only when `relation` is `complex`. `source_rel` and `target_rel` are the dominant non-identity relations on each axis of a composed hull.

`sort_verses` orders by book, chapter, verse, then part. `is_contiguous` is true for fewer than two verses, and otherwise only when every verse is the same book, the same chapter, and exactly one greater than the previous. Atomic assembly calls `build_hull` when the source list or the target list fails that test, or when the members do not share one relation.

## Symbols

| Symbol | Contract |
| --- | --- |
| `parse_ref` | Parse a BCV or same-chapter range, or raise `ReferenceError` |
| `expand` | One `VerseId` per verse in a `RefRange`. Part is left unset |
| `format_bcv` | A single-verse BCV string. The part is omitted |
| `covers` | Whether a verse is inside a record range, same book and chapter |
| `load_mapping_views` | All mapping rows for one scheme, as `MappingView` |
| `preferred_scheme_ref` | The preferred scheme, or `None` |
| `build_chain` | `based_on_id` hops to a root. A cycle raises `LookupError` |
| `nearest_shared_translation` | Nearest shared ancestor, or `LookupError` |
| `hops_to_ancestor` | Hops from the chain head toward the ancestor |
| `hops_from_ancestor` | Those hops reversed, for the walk back down |
| `find_covering_record` | Narrowest cover, preferring an exact `partial` part match |
| `project_verse` | Cover or identity, then project |
| `apply_hops_forward` | Upward hops |
| `apply_hops_downward` | Downward hops, with `split` and `merge` inverted |
| `find_range_trigger` | Narrowest unequal zip on the path, or `None` |
| `build_range_hull` | The unequal-zip hull, or `None` to fall back to atomic |
| `build_hull` | Connected many-to-many set seeded by the members |
| `assemble` | The single entry after the hops are known |
| `normalize_same_bcv` | A 1:1 result on its own coordinate becomes `one_to_one` |
| `up_set` | Pivot verses reached by walking upward |
| `down_set` | Target verses reached by walking downward |
| `src_of_pivot` | Source verses that map onto one pivot |
| `piv_of_target` | Pivot verses that map onto one target |
| `edge_relation` | The relation on one source-pivot-target path |
| `priority_rank` | Index in `_PRIORITY`. Unknown relations sort last |
| `expand` | One `VerseId` per verse. Part stays unset |
| `format_bcv` | Single-verse BCV. Part is omitted |
| `scheme_ref_from_id` | A `SchemeRef`, or `None` when the id is missing |
| `numbering_nodes` | Translation ids visited along a chain |
| `to_span` | A `VerseId` as a single-verse `ResolvedSpanDTO` |
| `project_through` | Project one verse through one record. Descent swaps sides |
| `apply_identity` | The projection used when no record covers the verse |

## See also

The read path that consumes these rows is in [indexing.md](indexing.md).
