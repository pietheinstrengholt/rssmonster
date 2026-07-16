Purpose

Coordinates crawl use cases and determines when lower-level services run.

# Expected responsibilities:

define the top-level article-processing control flow;
resolve request-boundary dependencies;
build a normalized article candidate;
perform publisher identity lookup;
choose between revision and new-article workflows;
preserve top-level retry and error behavior;
return standardized crawl result metrics.

# RSSMonster Content Processing Flow

```text
1. Extract publisher fields
        │
        ▼
2. Build normalized article candidate
        │
        ▼
3. Resolve publisher identity
        │
        ├── Existing article ──► Revision workflow
        │
        ▼
4. Detect duplicate content
        │
        ├── Duplicate ─────────► Stop
        │
        ▼
5. Apply user actions
        │
        ├── Filtered ──────────► Persist filtered article
        │
        ▼
6. Perform lightweight enrichment
        │
        ▼
7. Persist article and tags
        │
        ▼
8. Refresh runtime caches
        │
        ▼
9. Execute post-commit effects
        │
        ▼
10. Run post-crawl semantic pipeline
```

## Semantic Pipeline

```text
Persisted new active articles
        │
        ▼
Embeddings
        │
        ▼
Semantic duplicate detection
        │
        ▼
Events & Topics
        │
        ▼
Island scoring
```

# The orchestration folder should not:

implement HTML sanitization;
parse feed-specific media;
calculate URL hashes directly;
implement tag persistence;
implement duplicate matching algorithms;
contain provider-specific transformations;
mutate vectors, clusters, events, topics, or islands during publisher revisions;
become a general-purpose utility directory.

Orchestrators should call lower-level services rather than reimplementing them.