Purpose

Produces lightweight article-level derived state.

# Expected responsibilities:

applyActions.js
evaluate user action regular expressions;
inspect explicit publisher fields;
return action results without database writes;
support discard/filter, read, favorite, clicked, advertisement, quality, and tag actions;
preserve deterministic action ordering;
handle invalid regular expressions safely.

Action expressions accept plain JavaScript patterns (case-sensitive by default) or
`/pattern/flags`, such as `/keyword|phrase/i`. A leading slash and trailing
slash plus letters select the latter syntax; escape a leading slash as `\/`
when a plain URL-path pattern would otherwise be ambiguous. The save API and
crawler share the same compiler. Invalid expressions are rejected before saving;
invalid legacy rules are logged and skipped during crawling.

# Expected output:

shouldDiscard
status
favoriteInd
clickedAmount
advertisementScore
qualityScore
tags

## Article Content
perform lightweight AI article analysis;
create independent default article analysis state;
apply action-owned analysis score overrides;
generate summary bullets and tags;
return advertisement, sentiment, and quality scores;
normalize and validate AI output;
respect feed AI settings;
handle inference availability and rate limits through the AI classification capability;
avoid semantic embedding or clustering responsibilities.

## Article Actions
load user actions when callers have not preloaded them;
keep action loading shared across new-article and revision workflows.

## Official Source
classify whether an article URL belongs to an official source;
return normalized organization metadata;
remain scoped to the correct user.
Not expected

## Enrichment should not:

persist articles directly;
modify duplicate caches;
parse raw feeds;
sanitize HTML;
create vectors;
assign clusters;
create events or topics;
determine whether an entry is new or revised;
reset user engagement state on publisher updates.

Lightweight article analysis and semantic architecture are separate concerns.
