# Add Batch Mapping API

**Acceptance Criteria:**

1. Add new endpoint(s) to provide access to batched verse mappings between arbitrary translations and versifications in the system:  
   1. For a range of verses  
      1. Identified by from/to BCV  
      2. Including partials, such as book to book, chapter, and verse  
   2. Or for a set of verse IDs  
2. Versification is an optional mapping parameter, defaulting to:  
   1. A translation’s preferred versification, if present  
   2. The original Hebrew/Greek (org) versification, otherwise
