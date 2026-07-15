Purpose

Determines whether an entry is an existing publisher article or duplicate content.

# Expected responsibilities:
Publisher identity resolution may remain in extraction/ or move here if that better matches the final design. The important point is that publisher identity and duplicate suppression remain conceptually separate.

## Publisher identity
match stable GUID or Atom identity;
match feed-scoped exact or normalized URLs where appropriate;
include filtered articles in identity matching;
identify publisher revisions before duplicate detection.

## Duplicate suppression
compare user-wide visible-text hashes;
compare user-wide source-content hashes;
compare feed-scoped URLs;
use conservative title fallback;
exclude filtered articles from content and title suppression;
return an existing article ID or duplicate result;
never persist or mutate articles.

## Duplicate cache
index feed-scoped URL identities;
index only active articles for content and title suppression;
replace old cache identities after successful article revisions;
remain scoped to the serialized crawl;
expose clear add, update, and lookup behavior.

## Expected invariant:

Identity modules should not:

process HTML;
generate titles;
persist article updates;
call AI;
update tags;
apply actions;
alter filteredInd;
perform semantic duplicate analysis;
conflate same publisher identity with equivalent content.

Publisher identity answers whether this is the same entry.

Duplicate matching answers whether another article already represents the content.