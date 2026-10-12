# Ingest

Ingest turns a project zip or a standalone versification file into rows. Parsing lives in `frvt/ingest` and does not touch the database. `frvt/api/ports/ingest_port.py` is the writer. Terms are in [domain-model.md](domain-model.md).

## Inputs

`ingest_project` reads a zip. `locate_project_members` in `frvt/ingest/project_zip.py` requires a `release/USX_*` tree of `.usx` files and a `.vrs` file under `release/`. A missing USX tree or a missing `.vrs` is a blocking issue. `metadata.xml` is optional and supplies the name, language, and text direction when the form does not.

`ingest_versification` accepts a standalone file. `.vrs` is converted by `convert_vrs` in `frvt/ingest/vrs_convert.py`. A Copenhagen JSON file is detected by extension or by a leading `{`. `basedOn` defaults to `org` when the ingredient omits it (`_scheme_from_ingredient`).

`convert_usfm_to_usx` in `frvt/ingest/usfm_convert.py` does not convert. It returns no USX and an `IngestIssue` whose message is "USFM to USX conversion is not supported". A translation row may still record `source_format` `usfm`. Stored scripture is spans produced from USX.

## From file to rows

`derive_ingredient` in `frvt/ingest/source_document.py` converts, normalizes, and validates. Callers persist the source text unchanged and store only the derived ingredient on the scheme. `validate_ingredient` checks the ingredient against the packaged schema. `derive_mappings` flattens the ingredient into mapping rows.

`persist_project` runs in one transaction:

1. Parse the zip. Any issue becomes an `AppError`.
2. Reject a translation name that already exists, case-insensitively.
3. Insert the `translation` and its `verse_span` rows. Spans use Core `executemany` because a full Bible is about 30k write-only rows.
4. Apply combined-milestone splits. `frvt/ingest/derive_combined_milestones.py` appends implied split mappings for combined USX milestones.
5. Insert the scheme named like the translation, its `mapping_record` rows, the `versification_source`, and the preferred [association](domain-model.md#association).

`persist_versification` in `frvt/api/ports/ingest_port.py` parses with `ingest_versification`, rejects issues, and optionally replaces the scheme name from the form. `_lookup_base` resolves `based_on` to an existing translation. The function inserts a non-canonical `VersificationScheme`, then `_insert_mapping_rows` and `_insert_source`. It does not create a translation or spans. A project upload and a versification upload therefore share the derived ingredient and the verbatim source, and only the project upload stores scripture.

`parse_usx_files` in `frvt/ingest/usx_parse.py` walks the USX books in name order and emits `ParsedSpan` rows. `locate_project_members` sorts those paths before the parse, so `seq` follows the sorted archive names, not the order the zip stored them. Combined verse milestones keep their label on the span. `refresh_combined_milestone_splits` in `frvt/api/ports/ingest_port.py` can recompute those implied splits later without re-parsing the zip.

`_infer_source_format` records `usx` when the zip contains USX files and `usfm` when it does not. Inference runs after a successful parse. A USFM-only tree is still not converted into spans.

## Source attach

`attach_source` in `frvt/api/source_attach.py` stores a document on a scheme that does not have one. Canonical schemes and schemes that already have a source raise 409. The upload must re-derive to the stored ingredient. If the first comparison differs, the function retries after applying milestone splits. A remaining difference raises 422 and names the first differing top-level key. The scheme row is not written. That keeps the ingredient, and anything fingerprinted from it, stable.

## Shipped canons

`CANONICAL_NAMES` in `frvt/resources/__init__.py` is `org`, `eng`, `lxx`, `rso`, `rsc`, `vul`. `load_canonical_text` reads `{name}.json`. `load_companion_vrs` reads `vrs/{name}.vrs` and returns `None` when the file is absent. The docstring says `vul` has no companion, and the text that does exist is the Paratext file copied into the package, not a conversion of the JSON.

`seed_canonical` in `frvt/api/bootstrap.py` is idempotent and keyed by case-insensitive name. It creates `org` first as the null-base root. The other anchors set `based_on_id` to the `org` translation. Each anchor is a `Translation` with `is_anchor` true, a canonical scheme, a source row, mapping rows, and a preferred association. Startup calls this from the lifespan described in [architecture.md](architecture.md#startup).

## Parse steps

`parse_usx` in `frvt/ingest/usx_parse.py` reads one USX document into spans starting at a given `seq`. Tag comparisons ignore the XML namespace. Visible text omits nested `note` elements. `parse_usx_files` runs that over every `(name, text)` pair in name order. `collapse_duplicate_spans` keeps the first row when the same book, chapter, verse, and part appears twice.

`convert_vrs` in `frvt/ingest/vrs_convert.py` turns Paratext `.vrs` text into an ingredient dict plus blocking issues. Part letters land in `partialVerses` through `_add_partial`. `normalize_ingredient` in `frvt/ingest/normalize.py` moves a part suffix that was still embedded in a `mappedVerses` key into `partialVerses`, so the stored reference matches `parse_ref`. `strip_part_suffix` is the split it uses.

`validate_ingredient` in `frvt/ingest/burrito_validate.py` checks required structure against the schema from `load_schema` (`frvt/resources/versification_schema.json`). A blocking issue stops persist. `derive_mapping_records` in `frvt/ingest/derive_mappings.py` flattens the ingredient into ordered mapping DTOs. The function is pure: the same ingredient rebuilds the same rows. `ordinal` is the order the keys are walked.

`classify_mapped` labels a `mappedVerses` pair after `strip_part_suffix` and `parse_ref`. A different book or chapter is `renumber`. One verse on each side at the same verse number is `one_to_one`. Equal lengths at different verse numbers are `shift`. Unequal lengths are `renumber`. The remaining equal-length case returns `shift`.

The walk emits five groups, in this order:

- `mappedVerses` pairs, except keys also listed in `mergedVerses` or `splitVerses`. A pair `parse_ref` rejects is logged and skipped. It does not fail the derivation.
- `excludedVerses`, each stored as `exclude` with no base reference.
- `mergedVerses`, each stored as `merge`. The base reference is the `mappedVerses` value for that key, or null when the key is absent.
- `splitVerses`, each stored as `split`. An entry with no `mappedVerses` pair is logged and skipped.
- `partialVerses`, a map of reference to part letters. Each letter is its own row, relation `partial`, and the base reference equals the source reference.

`maxVerses` is not a mapping row. It stays on the ingredient and is read when a scheme is loaded for comparison.

`SourceDocument` is the verbatim text, the format, the optional companion, and the digest. `make_source` hashes both texts, so a companion change is a different source even when the JSON is unchanged. Bootstrap uses that to skip a write. An upload has no companion, so its digest is the uploaded file alone.

`ProjectMetadata` holds the translation name, the language code, and the script direction. `parse_dbl_metadata` returns `None` for each field when the XML is malformed or the element is absent. It does not raise. The port then applies the form fallback, and raises 400 only when name or language is still missing after that fallback.

## Symbols

| Symbol | Contract |
| --- | --- |
| `ingest_project` | Unzip, then parse USX spans and the required `.vrs` |
| `ingest_versification` | Detect `.vrs` or JSON, then convert and validate |
| `locate_project_members` | USX files, one `.vrs`, optional root `metadata.xml`, and issues |
| `parse_dbl_metadata` | Name and language. Malformed XML yields empty fields rather than a raise |
| `resolve_text_direction` | `rtl` only when metadata says RTL. Otherwise `ltr` |
| `parse_usx` | One USX document into spans from a starting `seq` |
| `parse_usx_files` | Several `(name, text)` pairs in name order |
| `collapse_duplicate_spans` | Keep the first row for a repeated book, chapter, verse, and part |
| `parse_usx_verse_number` | Verse integers from a milestone `number`, or `None` |
| `convert_vrs` | `.vrs` text to an ingredient plus blocking issues |
| `normalize_ingredient` | Move an embedded part suffix into `partialVerses` |
| `validate_ingredient` | Blocking issues against the packaged schema |
| `derive_mapping_records` | Ingredient to ordered mapping DTOs. Same input, same rows |
| `apply_combined_milestone_splits` | Add `splitVerses` implied by combined milestones |
| `derive_ingredient` | Parse, normalize, and validate. `(None, issues)` when blocking |
| `make_source` | Verbatim text and a digest of the document and any companion |
| `convert_usfm_to_usx` | No USX. The issue says conversion is not supported |
| `persist_project` | One transaction: translation, spans, scheme, mappings, source, preferred association |
| `persist_versification` | Scheme, mappings, and source. No translation and no association |
| `attach_source` | Store a document on a scheme that has none, without rewriting the scheme row |
| `ProjectArchiveContents` | Located USX pairs, the chosen `.vrs`, optional metadata, and issues |
| `ParsedSpan` | One scripture span from USX |
| `ParsedScheme` | A validated ingredient ready to insert |
| `IngestIssue` | A blocking parse or validation problem, with a kind and a field |
| `MappingRecordDTO` | One derived row. The port assigns the scheme id |
| `strip_part_suffix` | Split an embedded part off a reference |
| `load_schema` | The packaged Copenhagen schema |
| `load_canonical_text` | `{name}.json` from the package |
| `load_companion_vrs` | `vrs/{name}.vrs`, or `None` when the file is absent |
| `seed_canonical` | Idempotent anchors, `org` first, `based_on_id` set for the rest |
| `refresh_combined_milestone_splits` | Rewrite the preferred scheme's mappings when new splits are implied |
| `milestone_label_and_range` | Display label and BCV range for a combined USX milestone |
| `ProjectIngestResult` | Spans, scheme, metadata, and issues from a zip. No database row |
| `SourceDocument` | Verbatim text, format, optional companion, and digest |
| `ProjectMetadata` | Name, language code, and script direction from `metadata.xml` |
| `_raise_for_issues` | Kind `missing` is 400 `bad_request`. Every other kind is 422 `validation_failed` |
| `_lookup_base` | `basedOn`, or `org` when omitted. Unknown name is 422 |
| `_infer_source_format` | `usx` when the zip has USX files, otherwise `usfm` |
| `resolve_text_direction` | `rtl` only when metadata says RTL |
| `classify_mapped` | `mappedVerses` pair to `shift`, `renumber`, or `one_to_one` |
| `CANONICAL_NAMES` | `org`, `eng`, `lxx`, `rso`, `rsc`, `vul` |

`make_source` in `frvt/ingest/source_document.py` builds the `SourceDocument` the port inserts. The document text is UTF-8 with a leading BOM stripped. The digest covers the document and, when present, the companion `.vrs`. Uploads leave the companion empty. Packaged canonical JSON sets it from `load_companion_vrs`.

A project that fails location checks never reaches `persist_project`'s insert. `locate_project_members` returns the issues, and `_raise_for_issues` turns them into an `AppError` before any row is added. Name clash is checked after a successful parse and raises 409. The transaction is the request session from `get_session`: an exception rolls the insert back.

## Archive layout

`locate_project_members` in `frvt/ingest/project_zip.py` returns a `ProjectArchiveContents`: sorted `(path, text)` pairs for every `.usx` file, the chosen `.vrs` path and text, optional `metadata_text`, and blocking issues. A USX file must sit in a `release/USX_*` directory. A `.vrs` file must sit under `release/`. When several `.vrs` files match, a path ending in `versification.vrs` wins. Otherwise the first path in sorted order is used. `metadata.xml` is read only when that exact name is a zip member at the archive root. A nested metadata file is ignored.

A zip that is not a zip, or whose members are not UTF-8, becomes one `IngestIssue` with kind `invalid` and field `archive`. The message is "File is not a readable UTF-8 project zip archive". Missing pieces use kind `missing`: field `archive` with "No USX_* tree", or field `versification` with "No .vrs in project". `_raise_for_issues` maps any `missing` issue to HTTP 400 `bad_request`. Every other issue becomes HTTP 422 `validation_failed`. The field list on the error is the issue list. Status tables stay in [api.md](api.md).

## Names, language, and the base

`metadata_parse.py` reads the optional metadata document. `_resolve_project_name` and `_resolve_project_language` prefer a non-blank metadata value over the upload form. `_require_resolved_project_fields` raises 400 `bad_request` when name or language is still missing, and it reports both gaps in one response. `resolve_text_direction` supplies `ltr` or `rtl` for the translation row. The scheme created for the project is named like the translation, `canonical` false, and `based_on_id` is the translation `_lookup_base` found.

`_lookup_base` treats a missing `basedOn` as `org` and looks the name up case-insensitively. An unknown base is 422 `validation_failed` on field `basedOn`. That lookup runs after the translation row exists, so a project whose `.vrs` names a base that was never seeded fails after the span insert has been staged. The request session still rolls the whole unit back.

`persist_versification` does not create a translation, spans, or an association. The caller associates the new scheme later. A form `name` replaces the name parsed from the file. A blank form name is 422 on field `name`. The inserted scheme is never `canonical`.

## Modules

| Module | Role |
| --- | --- |
| `frvt/ingest/ingest_api.py` | `ingest_project` and `ingest_versification`, the parse entry points |
| `frvt/ingest/project_zip.py` | Locate USX, `.vrs`, and root `metadata.xml` |
| `frvt/ingest/metadata_parse.py` | Name, language, and direction from `metadata.xml` |
| `frvt/ingest/usx_parse.py` | One USX document to `ParsedSpan` rows |
| `frvt/ingest/usx_verse_number.py` | Verse-number tokens inside a USX milestone |
| `frvt/ingest/usfm_convert.py` | Fail-closed USFM rejection |
| `frvt/ingest/vrs_convert.py` | Paratext `.vrs` text to an ingredient |
| `frvt/ingest/normalize.py` | Move embedded part suffixes into `partialVerses` |
| `frvt/ingest/burrito_validate.py` | Ingredient against `versification_schema.json` |
| `frvt/ingest/derive_mappings.py` | Ingredient to ordered mapping DTOs |
| `frvt/ingest/derive_combined_milestones.py` | Implied splits for combined USX milestones |
| `frvt/ingest/source_document.py` | `derive_ingredient` and `make_source` |
| `frvt/ingest/types.py` | `IngestIssue`, `ParsedSpan`, and `ParsedScheme` |
| `frvt/api/ports/ingest_port.py` | The transaction that inserts rows |

`derive_ingredient` is the path a standalone file and a source attach share: convert, `normalize_ingredient`, `validate_ingredient`. `make_source` strips a leading BOM and hashes the document. A companion `.vrs` is included in that hash when the caller passes one. Uploads do not. `seed_canonical` does, via `load_companion_vrs`.

`apply_combined_milestone_splits` runs inside `persist_project` after the spans exist and before the scheme row is inserted, because a split needs the stored milestone labels and the base translation's coordinates. `refresh_combined_milestone_splits` repeats that derivation for the translation's preferred scheme. When the ingredient changes, it writes the new ingredient, deletes that scheme's `mapping_record` rows, inserts the derived rows, and calls `invalidate_for_scheme` with reason `versification updated`. An unchanged ingredient returns false and leaves the rows alone. The source document is not rewritten. A translation with no preferred scheme raises `LookupError`.
