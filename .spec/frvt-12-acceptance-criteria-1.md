# Add Translation Index API

**Acceptance Criteria:**

1. Add new endpoint(s) to CRUD a list of translation and versification combinations whose mappings will be pre-created among all indexed translation/versification combinations in the system (in other words: the cartesian product of mappings). A given translation and versification combination and its pre-created mappings will be referred to as an “index”.  
   1. Note: The number of mappings and their resource requirements are understood to scale disproportionately with the number of indexed translations, so the number of indexed translations is understood to be limited to:  
      1. No more than 12 full-sized translations (\~30k verses, each)  
      2. With no more than 5% divergence (\~1,500 distinct mappings), per translation  
2. Since indexes will take time to create and update:  
   1. Indexing should execute asynchronously and be automatically:  
      1. Terminated when the index or related translation or versification is removed  
      2. Rebuilt when the related translation or versification is updated  
      3. Rebuilt when other indexes are added, to maintain the cartesian product of mappings  
   2. The API should provide:  
      1. Indexing status  
      2. Endpoints for manual index rebuild and termination that safely interact with with automatic indexing operations  
3. Since indexes consume resources:  
   1. The API should provide resource consumption data (example: mapping row counts)  
   2. Indexes should be automatically removed when their configured translations or versifications are removed  
4. Versification is an optional indexing parameter, defaulting to:  
   1. A translation’s preferred versification, if present  
   2. The original Hebrew/Greek (org) versification, otherwise  
5. Invocations of the batch mapping API created for [https://operationalsystems.atlassian.net/browse/FRVT-8](https://operationalsystems.atlassian.net/browse/FRVT-8) will automatically take advantage of indexes when they’re available for specified pairs of translations and versifications, then deliver results in:  
   1. Less than a second  
   2. For an average chapter’s-worth of verses (\~50 verses, 30 words/verse)  
   3. In a typical AWS deployment
