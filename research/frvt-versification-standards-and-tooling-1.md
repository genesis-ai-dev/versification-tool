
[Versification Standards & Tooling](#versification-standards-&-tooling)

[Introduction](#introduction)

[Summary](#summary)

[Background](#background)

[Versification Needs](#versification-needs)

[Research Approach & Sources](#research-approach-&-sources)

[Versification Formats](#versification-formats)

[Paratext VRS](#paratext-vrs)

[Copenhagen Alliance](#copenhagen-alliance)

[SWORD av11n](#sword-av11n)

[VREF / BibleNLP](#vref-/-biblenlp)

[Translation Formats & Versifications](#translation-formats-&-versifications)

[Mappings & Translations](#mappings-&-translations)

[Mapping Standards](#mapping-standards)

[Building Mappings](#building-mappings)

[Using Mappings](#using-mappings)

[Other Options](#other-options)

[Libraries & Tooling](#libraries-&-tooling)

[Open Questions & Next Steps](#open-questions-&-next-steps)

# Versification Standards & Tooling {#versification-standards-&-tooling}

## Introduction {#introduction}

This document summarizes our research into the techniques, standards, and tooling for mapping Bible verse references (numbers) across translations that identify chapters and verses differently. Our goal in this research was to understand the domain well enough to make good strategic decisions, not to solve specific problems. 

That said, the approaches and tooling we’ve identified do show promise for the Codex (Aquilla) and LangQuest applications.

Prepared as part of [FRVT-1 (Research versification standards, review APIs & libraries, provide recommendations)](https://operationalsystems.atlassian.net/browse/FRVT-1).

## Summary {#summary}

1. Defining a versification as a set of differences from the “Original” Hebrew/Greek numbering (abbreviated as “org”), using the Copenhagen Alliance JSON format provides a number of benefits. Among other things, this allows cross-translation mappings to become "Translation A ↔ org ↔ Translation B". This is the same format used by the Scripture Burrito versification “ingredient”, meaning any system that already supports Scripture Burrito is at least on the way to supporting this.  
2. A translation’s associated versification can be misleading because undocumented deviations are relatively common. One way to overcome this is to use the Copenhagen “sniffer” tool to infer a base versification from the text (English/eng, Russian Orthodox/rso, etc.), then customize that versification with manually verified deviations.  
3. Paratext VRS files, used in the DBL and elsewhere, partially capture versification mappings but don’t include splits. This means VRS files can’t be relied upon for reliable cross-translation navigation at scale.  
4. *SIL.Scripture* (.NET) and *@sillsdev/scripture* (TypeScript) are comprehensive software libraries for versification. The former provides complete versification mapping support (beyond what VRS files describe), while the latter provides reference handling but not a mapping engine. This makes *@sillsdev/scripture* a good tool for parsing and validating references, but work would be needed to support cross-versification mappings.

## Background {#background}

A Bible reference like *PSA 51:1* is not a stable address. It is a coordinate in a numbering system called a versification, and versifications for different Bible translations disagree about where chapter and verse boundaries fall. 

This means the same piece of text can be:

1. **The same** **verse**, in multiple versifications (the common case)  
2. **Shifted** by one or more verses  
3. **Renumbered**  
4. **Split** from one to many, **merged** from many to one, or **rearranged** from many to many  
5. **Present in one,** or **absent in the other**  
6. **Partial**, divided across a translation boundary

Based on this:

* Versification *schemes* define spans of translation text identified by book, chapter, and verse.   
* Versification *mappings* relate spans in scheme A with spans including the same text in scheme B, typically a canonical or “base” versification.

These are necessary because chapters and verses originate from different eras and traditions.

In brief:

* Chapter divisions are credited to Stephen Langton (Archbishop of Canterbury) during the 13th century, and were applied first to the Latin Vulgate and then carried into Hebrew and Greek. Chapters were therefore not original to these texts and fell in unexpected places, leading to disagreements among later traditions.  
* Verse divisions in the New Testament are credited to the printer Robert Estienne, during the 16th century and became the verse numbers we still use today. Whole-Bible verse numbering entered English through the Geneva Bible, a few years later.  
* The Hebrew Bible already had verse-end markers in the Masoretic tradition, but Christian-style chapter/verse numbers were retrofitted onto Hebrew Bibles in the 16th century.

Because these systems were layered onto pre-existing, independent traditions (Masoretic Hebrew, the Greek Septuagint, the Latin Vulgate, and later Orthodox/Synodal traditions), the versification schemes we use today have inherited these traditions’ structural differences.

Notable categories of divergence include:

| Area | Effect | Examples |
| :---- | :---- | :---- |
| Psalm superscriptions | Hebrew counts the title as a verse, shifting the body | *PSA 3:0–8* ↔ *PSA 3:1–9* (eng ↔ org) |
| Chapter-boundary drift | An English chapter ends where the next Hebrew chapter starts | *GEN 31:55* ↔ *GEN 32:1* |
| Different chapter counts | A book has more or fewer chapters in one tradition | Joel: 3 (eng) vs 4 (Heb); Malachi 4 vs 3 |
| Greek/Latin Psalm renumbering | LXX merges and splits Psalms & runs one behind Hebrew for most of the Psalter | *PSA 9:22* ↔ *PSA 10:0* (lxx ↔ org) |
| LXX reordering | Whole sections moved and resized | Jeremiah |
| Synodal / Orthodox | Distinct, partly LXX-influenced schemes | Russian Orthodox & Protestant |
| New Testament omissions | Verses absent in critical editions leave gaps | Matt 17:21, Acts 8:37, etc. |

## Versification Needs {#versification-needs}

Given the above, any system that reliably maps verses across translations must have the following capabilities:

1. **Resolve references across versifications.** Given a span of text in one translation, return the corresponding span of text in another, including one-to-many, many-to-one, many-to-many, and other associations.  
2. **Support side-by-side use.** Enable the display, editing, and other uses of two or more translations in parallel, with discernible, reproducible, and correct relationships.  
3. **Reliable loading and saving.** Importing and exporting translations without loss or corruption of versification information.  
4. **Detecting versification.** When importing a new translation, align its verse references with a canonical versification, so the translation will be usable alongside others.

**Notes:** 

* Misaligned verses are a correctness issue, not a cosmetic one, particularly for translation work. This places a premium on choosing reliable strategies that will scale for all reasonable use cases and translations.  
* Many translations introduce some variation from established versification schemes. This means that translation-specific versifications should be expected.

## Research Approach & Sources {#research-approach-&-sources}

Sources:

* The Copenhagen Alliance’s [versification-specification repository](https://github.com/Copenhagen-Alliance/versification-specification) (spec, schema, standard mappings, and their [sniffer code](https://github.com/Copenhagen-Alliance/versification-specification/tree/master/versification-sniffing))  
* SIL's [*SIL.Scripture* repository](https://github.com/sillsdev/libpalaso), particularly its canonical [VRS files](https://github.com/sillsdev/libpalaso/tree/master/SIL.Scripture/Resources)  
* The [*@sillsdev/scripture* repository](https://github.com/sillsdev/scripture)  
* the [Scripture Burrito repository](https://github.com/bible-technology/scripture-burrito)

What we verified:

* The VRS file syntax and SIL-hosted canonical schemes  
* The Copenhagen JSON schema and its identity with the Burrito ingredient  
* The scope of the *@sillsdev/scripture* port

What remains unverified: 

* The Copenhagen sniffer's real-world accuracy (see discussion, below)

## Versification Formats {#versification-formats}

#### Paratext VRS {#paratext-vrs}

[Paratext VRS files](https://github.com/sillsdev/libpalaso/tree/master/SIL.Scripture/Resources) are a standard for describing versification schemes and mappings that’s widely used in the Paratext user community and collections such as the DBL. These are human-readable text files including a single versification scheme per file.

SIL’s canonical VRS files include the following versification schemes:

1. Original Hebrew/Greek (org)  
2. English (eng)  
3. Septuagint (lxx)  
4. Vulgate (vul)  
5. Russian Orthodox (rso)  
6. Russian Protestant (rsc)

The VRS format includes: 

* \#-prefixed comments  
* One "max verses per chapter" line per book  
* Mapping lines in the form: \<this scheme\> \= \<org\> (e.g. *GEN 31:55* \= *GEN 32:1*).   
* Psalm titles are encoded as a "verse 0"

VRS files don’t support verse splits, however (they express them as commented-out lines with the text "no support for splits yet"). Therefore, when two versification schemes differ by splitting a verse, VRS files don’t include the information needed to align the related spans of text. This makes them an unsuitable basis for cross-translation navigation for a number of translations.

#### Copenhagen Alliance {#copenhagen-alliance}

[The Copenhagen Alliance JSON format](https://github.com/Copenhagen-Alliance/versification-specification) is a newer and more comprehensive standard derived from the VRS format by the Copenhagen Alliance Versification Working Group. 

Fields within this format include *basedOn, maxVerses, mappedVerses, excludedVerses, mergedVerses, partialVerses*, covering at least most mapping use cases. The JSON schema's *$id* also resolves to the *burrito.bible/schema/ingredients/versification.schema.json*, which is the same format used by the Scripture Burrito versification ingredient.

#### SWORD av11n {#sword-av11n}

[SWORD av11n](https://wiki.crosswire.org/Alternate_Versification) is a fixed set of versification schemes compiled into the SWORD software libraries, developed by the CrossWire Bible Society. Av11n is appropriate for read-only desktop Bible software, but it’s fundamentally not data-driven. This means av11n can’t be extended to support custom schemes without recompiling the SWORD libraries. Av11n is therefore mainly useful for SWORD interoperability.

#### VREF / BibleNLP {#vref-/-biblenlp}

[vref / BibleNLP](https://github.com/BibleNLP/awesome-bible-nlp) is a one-verse-per-line reference file, used to align parallel corpora for natural language processing (NLP). This is generally useful for NLP applications but not detailed enough for interactive or systematic verse alignment across translations.

### Translation Formats & Versifications {#translation-formats-&-versifications}

Within the dominant Paratext-based USFM, USX, and USJ translation formats, the versification scheme is implicit in the mix of chapter and verse markers, whether or not the translation is bundled with a VRS file. As a result, preserving versification across USFM, USX, and USJ conversions (especially round-trip conversions) is a common cause of broken verse mappings.

This is important because the Digital Bible Library (DBL) and other repositories rely heavily on Paratext formats and VRS files, meaning any strategies or tooling for versification must either be compatible with these or support a migration path. The Copenhagen format is already a superset of VRS files and therefore a good place to start.

## Mappings & Translations {#mappings-&-translations}

### Mapping Standards {#mapping-standards}

Most versification standards are designed for a specific set of translations and applications and are variously unable to capture splits, merges, exclusions, reorderings, and other divergences. 

The only approach that appears to work across all translations and use cases is a pivot-based, data-driven model expressed as deltas from a chosen versification scheme, stored in a format such as Scripture Burrito/Copenhagen Alliance JSON.

This reduces an N² mapping problem across translations into N mappings plus composition. This also means that translations can be added or removed from a set without impacting other translations.

A critical decision with such an approach is the versification scheme that all translations are defined in terms of. A common choice for this is the Original/org, because it is an authoritative scheme with comprehensive mappings to (and through) other schemes.

### Building Mappings {#building-mappings}

When creating new translations, the simplest approach is to declare a base versification scheme and mappings (Original/org, Vulgate/vul, etc.), copy that scheme for the translation, then maintain that copy as the translation is authored.

For existing translations with unknown versifications, it’s possible to build a scheme and mappings by first inferring a base versification and probable deviations, then manually verifying and extending those deviations.

Once a translation’s versification has been identified, that translation may be aligned with any other translation that’s received the same treatment, regardless of source and target languages.

A tool that can potentially automate this is the Copenhagen Alliance “sniffer”, which works by searching a translation for well-known patterns of verse IDs. The sniffer is written in Python, reads USFM, USX, or CSV files, and writes Scripture Burrito/Copenhagen Alliance JSON mappings.

### Using Mappings {#using-mappings}

One direct way to use a fully featured versification mapping in an application is with either the *SIL.Scripture* libraries (for .NET) or by extending the *@sillsdev/scripture* libraries (for Javascript/TypeScript) with a custom-built mapping resolver. Other libraries don’t appear to have comparable versification support, especially for mappings.

That said, the Scripture Burrito/Copenhagen Alliance JSON format is well-documented and widely used, and the tasks that versifications are used for become less complicated when backed by such a data model. This means the aforementioned libraries aren’t mandatory and a custom implementation would be a reasonable solution.

### Other Options {#other-options}

Here are other approaches for defining and using versifications that we’ve identified:

1. **Assume one standard scheme per text.** Label every translation as "eng" or "lxx" and map verses accordingly. This is almost correct, but published texts routinely carry custom modifications. This means a text that is "mostly eng" will be misaligned on (at least) the handful of verses where translators did something unusual. This will also fail silently, which in an editing context is the worst possible outcome. Standard schemes are therefore a starting place, not ground truth.

2. **Direct mappings (NxN).** Map every translation directly to every other, skipping intermediate mappings. This works for a two-translation prototype, but collapses at scale. N translations require N(N−1)/2 separately authored, separately maintained mappings, and each new translation adds N more. A pivot reduces this to N mappings plus composition, which is both performant and scalable.

3. **English, KJV, or another scheme as the pivot.** Assume KJV/English numbering and map everything onto it. English is a derived, lossy scheme, however. It doesn't preserve the Hebrew/Greek structure that other traditions need to map against, including Psalm titles, chapter boundaries, and book ordering. The original-language numbering (org) is closer to a superset and represents a cleaner base.

4. **Algorithmic/Offset mapping.** Compute the shift mathematically (example: "after the merged Psalm, subtract one"). This only works for regular cases, however, and divergences aren't a uniform offset. Instead, they’ll be a mix of one-off shifts, merges, splits, exclusions, and section reorderings (example: Jeremiah). In other words, rule-based schemes accumulate so many exceptions that they become data tables, no more useful than direct mappings.

5. **A maximal versification as the pivot.** Instead of using org, pivot through a synthetic versification containing every verse any tradition recognizes. In this case, nothing can ever be excluded, only missing. This artifact has no external authority, however. Translations will map to a scheme nobody else uses, and this forfeits alignment with org-based ecosystems (Paratext, Scripture Burrito, etc.).

6. **Line-indexes as mappings (similar to vref).** Use a one-verse-per-line format as the versification mapping. This is simple, quick, and good for NLP, but only good for that. Because it’s positional, it indicates when lines correspond, not the specific relationship (1:1, split, merge, excluded, etc.). Among other things, this means such a mapping can’t be used for round-trip navigation and therefore can’t (for example) support a side-by-side editor that renders merges correctly.

7. **Statistical/Embedding-based alignment.** Align translations with machine learning (ML), instead of schemes. This is a first-order technique for identifying alignments in low-resource or unversified translations, but this is probabilistic by nature. Navigation and editing need exact, auditable mappings, not confidence scores. ML is useful for proposing alignments, while mappings are useful for recording them.

8. **Runtime content matching.** Align verses by comparing their text (examples: string similarity, shared proper nouns). This is language-dependent, fragile across translations that phrase things differently, expensive at scale, and (similar to ML) non-deterministic. This is a reasonable discovery aid for (again) low-resource or unversified translations, but not useful for mapping.

9. **Per-translation absolute coordinates (no shared model).** This amounts to storing every translation's references as-is and resolving them on-demand, using custom code. This might be useful for truly exotic, unanticipated translation mappings, but is only practical for a small number of translations.

## Libraries & Tooling {#libraries-&-tooling}

| Tool | Language | Capabilities | Best Use |
| :---- | :---- | :---- | :---- |
| [*@sillsdev/scripture*](https://github.com/sillsdev/scripture) (v2.0.5) | TypeScript | Canon, VerseRef (parse / validate, ranges, sequences, segments, iteration), BookSet, ScrVers (six scheme identities). Zero dependencies. No versification mapping. | In-editor support for a Typescript-based system (example: Electron). A basis for custom capabilities. |
| [*SIL.Scripture*](https://github.com/sillsdev/libpalaso) (v17.0.0) | .NET | Canonical Versification / VerseRef implementation; reads VRS. | Reference / validation, source of truth. |
| [*usfm-grammar*](https://github.com/Bridgeconn/usfm-grammar) (v3.2.0) | Javascript / Typescript | USFM / USJ / USX / CSV conversion. | Parsing layer. |
| [Copenhagen “sniffer”](https://github.com/Copenhagen-Alliance/versification-specification/tree/master/versification-sniffing) | Python | Infers a text's versification scheme, writes Scripture Burrito-compatible JSON. | Import-time versification  inference. |
| [*machine.py*](https://github.com/sillsdev/machine.py) | Python | Versification-aware corpus tooling. | Back-end ETL, translation preparation. |
| [*proskomma-core*](https://github.com/Proskomma/proskomma-core) (v0.11.3) | JS | Queryable scripture runtime. | Optional; heavier than most uses need |

## Open Questions & Next Steps {#open-questions-&-next-steps}

Questions that should be answered next:

1. How accurate is the sniffer on real texts? Recommended experiments: Run it against a deliberately varied set of real translations (examples: an LXX-based Psalter, a Russian Synodal text, a Joel/Malachi case, an NT with critical-text omissions).  
2. How should non-1:1 mappings be presented? This will help us understand how useful mapping standards or libraries really are, and how they may need to be extended to become useful.

Suggestions:

* Build something runnable, such as a side-by-side translation viewer on top of a simple mapping resolver (assuming we don’t find one that’s ready to use). The data needed to drive this is already in or adjacent to the Copenhagen repository, and this would be an uncomplicated task.