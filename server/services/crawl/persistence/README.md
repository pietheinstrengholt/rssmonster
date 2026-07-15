Purpose

Owns Article and Tag database write contracts.

# Expected responsibilities:

## Article Values
map normalized candidate data to Article fields;
calculate URL hashes consistently;
normalize lead-image metadata;
select mutable publisher source fields;
omit undefined values safely;
keep creation and update mapping aligned.

## Save Article
validate ownership;
create article and tags transactionally;
handle recognized unique-key races;
load the exact race winner;
return structured creation or conflict results;
avoid broad or ambiguous winner queries.

## Update Article
locate or accept an exact existing article;
validate user and feed ownership;
classify changes;
produce an explicit update plan;
apply source, derived, and tag changes transactionally;
preserve sparse publisher values;
preserve user state;
support optimistic concurrency when implemented.

## Tags
normalize tag names;
distinguish generated, feed, rule, and manual provenance;
reconcile crawl-owned tags transactionally;
preserve manual tags;
avoid duplicate tag rows.
Not expected

# Persistence should not:

parse RSS fields;
clean HTML;
apply user actions;
call OpenAI;
select lead images;
calculate semantic memberships;
decide when enrichment should run;
mutate duplicate caches before transactions commit;
contain controller or route logic.

Persistence applies decisions made by orchestration. It should not make those decisions itself.