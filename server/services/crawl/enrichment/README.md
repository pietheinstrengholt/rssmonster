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
generate summary bullets and tags;
return advertisement, sentiment, and quality scores;
normalize and validate AI output;
respect feed AI settings;
handle unavailable API keys and rate limits;
avoid semantic embedding or clustering responsibilities.

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
