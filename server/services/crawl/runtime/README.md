Purpose

Contains crawl-run-local caches, batchers, and optimization state.

# Expected responsibilities:

batch hotlink writes;
cache repeated hotlink counts;
store crawl-local optimization state;
expose explicit initialization and flush behavior;
remain scoped to one crawl or serialized user crawl;
avoid hidden global state;
support observability such as hits, misses, and batch sizes.
Not expected

# Runtime modules should not:

contain article business rules;
determine filtering;
sanitize content;
perform identity matching;
own transactions;
call AI;
create semantic state;
remain alive indefinitely across unrelated users;
become a generic utils folder.

# Runtime services optimize execution. They do not define domain behavior.

Cross-folder dependency rules

Expected dependency direction:

orchestration
  → extraction
  → content
  → media
  → identity
  → enrichment
  → persistence
  → runtime

This is not a strict linear call sequence, but lower-level folders should not depend on orchestration.

# Allowed examples:

orchestration → content
orchestration → persistence
orchestration → identity
content → content/compatibility
media → shared media-provider utility
persistence → models
identity → models
runtime → controllers or models for batched writes

# Disallowed examples:

content → processArticle
persistence → processNewArticle
identity → applyActions
media → saveArticle
enrichment → duplicateCache
compatibility → updateArticle