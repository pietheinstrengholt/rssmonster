Purpose

Transforms publisher-provided content into safe, canonical RSSMonster reading content.

# Expected responsibilities:

## Source preservation
retain unmodified selected publisher content as contentOriginal;
derive safe display HTML separately;
derive normalized visible text separately;
calculate source and visible-text hashes.

## HTML processing
identify plain text versus HTML;
recover lazy-image sources;
transform supported provider structures;
remove active and unsafe elements;
normalize structural HTML;
resolve relative URLs;
canonicalize publisher cards;
sanitize against explicit allowlists;
produce safe HTML fragments.

## URL behavior
allow only supported protocols;
resolve relative resources against the article URL;
preserve valid anchor fragments;
normalize srcset candidates;
make URL normalization happen before publisher-card normalization.

# Compatibility transforms

The compatibility/ directory may contain modules for transforming content for specific publishers or markup patterns such as Redidit, Wordpress, and so on.

## Each compatibility module should:

target one known publisher or markup pattern;
be small and testable;
be idempotent where practical;
convert publisher markup into RSSMonster-owned static markup;
fail locally rather than failing the complete article.
Not expected

## Content processing should not:

query or persist articles;
apply actions;
call OpenAI;
write hotlinks directly;
access duplicate caches;
classify official sources;
update tags;
decide whether an article is new or revised;
trigger embeddings or semantic processing;
retain arbitrary publisher JavaScript, iframe code, classes, or styles.

processHtmlContent() should return data. It should not create database side effects.