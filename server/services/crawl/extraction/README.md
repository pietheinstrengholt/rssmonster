Purpose

Converts raw RSS or Atom entry structures into normalized publisher fields and stable source identity inputs.

# Expected responsibilities:

understand RSS, Atom, JSON Feed, and parser field shapes;
select title, description, content, author, publication, categories, links, GUIDs, and Atom IDs;
preserve publisher field priority;
normalize external identity values;
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