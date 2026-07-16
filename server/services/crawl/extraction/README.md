Purpose

Converts RSSMonster canonical entries into normalized publisher fields used by crawl processing.

# Expected responsibilities:

consume parser-independent canonical entry fields;
select title, description, content, author, publication, categories, URL, and identity;
preserve the canonical adapter's publisher field priority;
generate a fallback title when publisher title is missing;
return publisher source information without persistence;
remain deterministic and testable.

# Expected outputs may include:

title
author
description
content
link
externalId
externalIdType
published
publishedSource
publishInferred
categories
feed metadata
Not expected

## Extraction should not:

query the Article model;
perform duplicate detection;
apply user actions;
sanitize HTML;
write tags;
call OpenAI;
persist articles;
select semantic clusters;
update duplicate caches;
decide whether an article is filtered.

Extraction describes publisher input. It does not decide library behavior.
