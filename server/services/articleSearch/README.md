# Article Search

Article search turns a compact expression into an ordered list of article IDs. An
expression can contain free text, structured filters, a date, a sort mode, and a
result limit. These parts can be combined in one query and, in general, all active
constraints must match.

For the architectural contract and boundaries, see `AGENTS.md` in this directory.
This README documents the search language implemented by the parser and executor.

## Quick examples

```text
AI agents unread:true @today sort:recommended
"climate policy" language:en quality:>=0.7
title:"OpenAI model" author:"Jane Smith" event:true island:true eventCount:>=3
tag:security favorite:true firstSeen:24h sort:desc limit:50
event:false freshness:>0.5
```

Structured tokens are removed from the free-text portion of the query. The
remaining words or quoted phrase become the article text search.

## Text search

### Unquoted terms

```text
AI agents
```

Every term must match, but each individual term may occur in either `title` or
`contentOriginal`. The example is therefore equivalent to:

```text
(title contains "AI" OR content contains "AI")
AND
(title contains "agents" OR content contains "agents")
```

Matching is case-insensitive. Commas and whitespace separate terms. Trailing
periods, commas, and semicolons are removed from tokens.

### Quoted phrase

```text
"AI agents"
```

The complete phrase must occur in either `title` or `contentOriginal`. Only the
first ordinary quoted phrase is treated as the exact text phrase.

### Title filter

```text
title:OpenAI
title:"AI Safety"
```

The value must occur in the title. Despite the parser retaining `titleExact`
metadata for the quoted form, both forms currently use case-insensitive
substring matching.

A title filter can be combined with additional text:

```text
title:"AI Safety" regulation Europe
```

The title must contain `AI Safety`, and the article content must contain at least
one of the remaining terms (`regulation` or `Europe`). This differs from a query
without `title:`, where every remaining term must match title or content.

## Boolean filters

Boolean filters accept `true` or `false`, case-insensitively.

| Expression | Meaning |
| --- | --- |
| `favorite:true` | Favorited articles only. |
| `favorite:false` | Non-favorited articles only. |
| `star:true` / `star:false` | Legacy aliases for `favorite`. |
| `unread:true` | Unread articles. |
| `unread:false` | Read articles. |
| `read:true` | Read articles. |
| `read:false` | Unread articles. |
| `clicked:true` | Articles with one or more recorded clicks. |
| `clicked:false` | Articles with zero recorded clicks. |
| `seen:true` | Articles whose `firstSeen` timestamp is present. |
| `seen:false` | Articles whose `firstSeen` timestamp is absent. |
| `hot:true` | Hot articles within the selected feed/category scope. |
| `hot:false` | Articles not marked hot. |
| `event:true` | Articles assigned to an event. |
| `event:false` | Articles not assigned to an event. |
| `island:true` | Articles whose event has at least one topic linked to an active interest island for the user. |
| `island:false` | Articles without an applicable active interest island, including articles without an event. |
| `briefing:true` | Articles with a nonzero interest score or belonging to an event containing more than one article. |
| `briefing:false` | Articles with a zero interest score that do not belong to a multi-article event. |
| `developing:true` | Unread articles selected as their event's developing article, when that differs from its representative article. |
| `developing:false` | Articles that do not currently meet the developing-story conditions. |

Do not specify contradictory state filters such as `read:true unread:true`.
They target the same database field, and the later executor rule (`read`) wins
rather than producing a logical contradiction.

`developing:true` always uses event grouping with developing-event selection enabled.
This is required because the developing article deliberately replaces the event's
normal representative. The server enforces this presentation even when callers
send another grouping mode.

## Metadata filters

| Expression | Meaning |
| --- | --- |
| `tag:security` | Articles with the named tag. Tag lookup is scoped to the user. |
| `author:Jane` | Author contains `Jane`, case-insensitively under the configured database collation. |
| `author:"Jane Smith"` | Author contains the complete value `Jane Smith`. |
| `language:en` | Exact stored language code; accepts two or three letters. |
| `firstSeen:12h` | Articles first seen during the last 12 hours, plus articles never seen. |
| `firstSeen:7d` | Articles first seen during the last 7 days, plus articles never seen. |
| `eventCount:3` | Events containing at least three articles. |
| `eventCount:>=3` | Same as `eventCount:3`. |

`firstSeen` is not an age-at-least filter. It keeps recent or unseen articles:

```text
firstSeen IS NULL OR firstSeen >= now - interval
```

`eventCount` currently supports only a minimum event article count. Operators
such as `>`, `<`, and `=` are not supported for this filter.

Island membership follows the semantic relationship tables: an article's event
must have an `event_topics` assignment whose topic has an `island_topics`
assignment to a non-archived island owned by the same user. Primary and secondary
event topics are both considered. Archived islands do not satisfy `island:true`.

Briefing eligibility combines two independent signals as a union. An article
matches `briefing:true` when its stored `interestScore` is nonzero, including a
negative score, or when its associated event has `articleCount > 1`. This filter
does not require event or topic grouping; grouping only controls which
representative articles are returned after eligibility is established.

### Daily Briefing composition

The Daily Briefing starts with two article groups:

1. **Interest-matched articles:** canonical, unfiltered articles whose stored
   `interestScore` is not zero. Both positive and negative nonzero values qualify.
2. **Developing-event articles:** canonical, unfiltered articles belonging to an
   event owned by the user where `articleCount > 1`. These articles qualify even
   when their individual `interestScore` is zero.

Conceptually, the base selection is:

```text
interest-scored articles
UNION
articles from multi-article events
```

This is implemented as one SQL query with an `OR`, rather than concatenating two
result arrays. An article matching both branches therefore appears only once.

For the Daily Briefing pseudo-status, the stored user preferences further
restrict this combined set:

- `selectionPeriod` limits publication time to the rolling last 24 hours or
  seven days.
- `includeOnlyUnreadArticles` optionally requires `status = 'unread'`.
- `minDistinctSources` requires qualifying events to contain canonical,
  unfiltered articles from the configured number of distinct feeds. A value of
  one preserves the base behavior, including qualifying standalone articles.
- `showOnlyInterestMatchedArticles` replaces the base union with only articles
  whose stored `interestScore` is nonzero.
- `showOnlyDevelopingEventArticles` replaces the base union with only unread
  articles selected as a user-owned event's non-representative developing article.

The two `showOnly` preferences are mutually exclusive. When both are disabled,
the normal interest-matched and developing-event union is used.

Daily Briefing always uses `sort:recommended` and event grouping, regardless of
sort or grouping supplied by a caller. When its `prioritizeHighTrust`
preference is enabled, each candidate feed's bounded `feedTrust` value is added
to the runtime recommendation score. The generic Unread
preference adds the same bounded trust value to Recommended, Newest, Oldest,
Quality, and Most Engaged ranking. Explicit Trust sorting remains an exact
database ordering by feed trust, publication date, and article ID. The two
stored preferences are resolved independently and do not change eligibility or
sidebar counts.

Tag values should currently be a single unquoted token. Quoted tag values retain
their quote characters and therefore should not be used.

## Score filters

```text
quality:0.7
quality:>=0.7
quality:>0.7
quality:=0.7
quality:<0.7
quality:<=0.7

freshness:0.5
freshness:>=0.5
```

Supported operators are `=`, `>`, `<`, `>=`, and `<=`. When omitted, the
operator defaults to `>=`. Decimal forms such as `.7` are valid.

- `quality` filters the Article model's computed quality value on a 0–1 scale.
- `freshness` filters its computed publication-time decay score on a 0–1 scale.

These filters run in memory after the database query. They combine with the
stored minimum advertisement, sentiment, and quality thresholds supplied by the
request or user settings; they do not replace those baseline gates.

## Publication date expressions

Date filters apply to `publishedAt`.

| Expression | Range |
| --- | --- |
| `@today` | Rolling 24 hours ending at the current time. |
| `@yesterday` | Previous UTC calendar day. |
| `@lastweek` | Rolling seven days ending at the current time. |
| `@2026-07-20` | The specified UTC calendar day. |
| `@"2 days ago"` | That UTC calendar day. |
| `@"last monday"` | The most recent previous Monday in UTC. If today is Monday, this means Monday of the previous week. |

All weekday names are supported. Only one date filter should be supplied. If
several parse successfully, later simple date tokens can replace an earlier date.
Specific dates must be real calendar days; invalid values such as `@2026-02-31`
or `@2026-99-99` are ignored and, when supplied alone, do not relax the current
status scope.

## Sorting

| Expression | Behavior |
| --- | --- |
| `sort:desc` | Newest publication first. This is the normal default. |
| `sort:asc` | Oldest publication first. |
| `sort:trust` | Feed trust descending, then newest publication first. |
| `sort:recommended` | Recommendation score descending. Uses freshness, interest, quality, event coverage, publisher diversity, corroboration, event boost, and rule-tag boost. |
| `sort:quality` | Computed article quality descending. |
| `sort:attention` | Computed attention score descending. |

Computed score sorts are performed in memory. Trust sorting is performed in the database. When multiple `sort:` tokens are
present, the last recognized token wins.

## Limits

```text
limit:50
```

Use a positive integer for the limit. Although `limit:0` parses as an integer, it
is treated as no explicit limit. An expression limit takes precedence
over the smart-folder default limit. Without an explicit limit, a normal search
expression is capped at 500 results. An empty normal view is not subject to that
search-expression cap.

For count-only searches, an active limit caps the returned count as well.

## Combining expressions

Filters compose restrictively: ownership, feed/category scope, canonical-article
visibility, text, tags, dates, metadata, state, scores, and event constraints are
combined with logical AND unless a behavior above explicitly describes an OR or
an override.

For example:

```text
"battery storage" unread:true language:en @lastweek quality:>=0.75 event:true island:true eventCount:>=4 sort:recommended limit:25
```

This returns at most 25 canonical English unread articles that:

1. contain the phrase `battery storage` in their title or original content;
2. were published during the rolling previous seven days;
3. have computed quality of at least `0.75`;
4. belong to an event containing at least four articles;
5. have an event topic linked to one of the user's active interest islands;
6. pass the request/user minimum score thresholds;
7. are ordered by recommendation score.

Another example combines a narrow title with broader content terms:

```text
title:"European Union" regulation AI author:"Jane Smith" favorite:true
```

The title must contain `European Union`, the content must contain `regulation`
or `AI`, the author must contain `Jane Smith`, and the article must be favorited.

## Request options outside the expression

The search service also receives options from the API/UI:

- `categoryId` and `feedId` establish source scope.
- `status` supplies the current view (`unread`, `read`, `favorite`, `hot`,
  `clicked`, or `%` for all).
- `grouping` is `none`, `event`, or `topic`.
- minimum advertisement, sentiment, and quality scores establish baseline gates.
- `countOnly` returns a count instead of article IDs.
- `smartFolderSearch` enables the saved-search execution path.

Recognized expression filters take precedence over the equivalent view state.
For example, `unread:false` overrides an unread view. Any non-empty free-text or
structured search normally relaxes a plain read/unread `status` default to all
statuses unless an explicit state filter is present. Special status views such as
favorite, hot, and clicked remain active unless explicitly overridden by their
corresponding filter.

Grouping changes which representative articles are eligible when no explicit
`event:true` or `event:false` filter is present:

- `grouping=event` returns each event's representative article plus articles not
  assigned to an event.
- `grouping=topic` returns the representative article of the strongest event for
  each topic.
- An explicit `event:` filter disables those grouping representative predicates.

`hot:true` and the hot status view retain the selected feed/category scope. With
the all-feeds selection they search the user's complete library; with a category
or feed selection they return only Hot articles from that source scope.

## Parsing and failure behavior

- Keywords and boolean values are case-insensitive.
- Unknown tokens become free-text terms instead of producing a syntax error.
- Malformed recognized numeric filters are consumed but produce no active score
  filter. When they are the only tokens, they do not relax the current status
  scope; for example, `quality:nope` in the default view still returns only
  unread articles. Valid accompanying text or filters continue to apply normally.
- Missing user identity is an error.
- No matches is a successful empty result.

Relevant implementation files:

- `articleQueryParser.service.js`: expression parsing.
- `articleDateParser.service.js`: date range resolution.
- `articleTextSearch.service.js`: title/content predicate composition.
- `articleSearch.service.js`: scope, precedence, thresholds, limits, and response.
- `articleSearchExecutor.service.js`: database predicates and grouping.
- `articleSort.service.js`: runtime score filters and score-based ordering.

# Article Search Architecture

Article search is the system that turns a user's reading intent into a precise, ordered set of articles from that user's library. It exists to make a large feed archive feel navigable: users should be able to ask for text, state, quality, recency, tags, sources, events, and ranking in one expression, and receive results that match the meaning of that expression.

This document describes what search is supposed to do. It is an architectural specification, not an implementation guide.

## Architectural Objective

Search must provide a predictable retrieval contract for articles.

A search request represents:

- The user whose library is being searched.
- The scope of the library being considered.
- The article states and metadata that constrain eligibility.
- The text intent that narrows relevance.
- The ordering model that decides what should appear first.
- The desired response shape: matching article identifiers or a matching count.

The search system is responsible for combining those dimensions into one coherent answer.

## Core Principles

Search is user-scoped. A result may only come from the requesting user's article library unless a behavior is explicitly defined as a cross-feed or global-user view. User ownership is the first boundary of every search.

Search is restrictive by composition. Each explicit filter narrows the eligible article set. Text, tags, dates, reading state, source scope, scores, event state, and language must work together rather than replacing one another, except where precedence is part of the query language.

Search is intent-preserving. A compact query string is not just text; it may contain structured intent. The system must distinguish between human text to search for and fielded constraints that describe how articles should be selected or ranked.

Search is stable enough to reason about. Equivalent requests should produce equivalent result sets and ordering, assuming the article library has not changed.

Search is optimized around article identity. The primary answer is the ordered set of matching article IDs. Full article rendering, enrichment, and presentation are responsibilities outside the search contract.

## Search Scope

Every search operates inside a library scope. The broadest normal scope is all feeds belonging to the user. Narrower scopes may select one feed, one category, or a derived subset such as tagged articles or grouped representatives.

Scope controls where results may come from. It does not decide relevance by itself. Relevance is determined after scope is established by applying text intent, state filters, metadata filters, quality thresholds, and ordering.

Status views retain normal feed/category scope. A Hot view applies the Hot predicate within the selected source scope, while selecting all feeds applies it across the user's complete library.

## Query Intent

The search expression has two meanings at once:

- Free text expresses article content the user wants to find.
- Fielded tokens express constraints or ranking preferences.

Quoted text represents phrase intent. Unquoted text represents term intent. Fielded tokens represent structured intent and should not accidentally become normal text search terms.

When a structured token and an external request parameter describe the same concept, the search expression is the more specific user intent and takes precedence. This allows saved views and UI defaults to be refined from the search box without changing the surrounding view.

Legacy vocabulary remains part of the architecture when it represents the same user concept. For example, "starred" and "favorite" are one conceptual state even if older clients use older language.

## Article Eligibility

An article is eligible only when it satisfies the active constraints.

The fundamental eligibility dimensions are:

- Ownership: the article belongs to the requesting user.
- Source scope: the article is in the selected feed/category scope unless the requested concept overrides source locality.
- Canonical visibility: duplicate or non-canonical articles are excluded according to the product's canonical article rules.
- Reading state: unread, read, favorite, clicked, seen, hot, or all.
- Text relevance: title and article text match the requested term or phrase intent.
- Metadata: tag, title, author, language, date, first-seen age, event state, event size, interest-island applicability, or grouping concept.
- Quality gates: advertisement, sentiment, and quality thresholds are all satisfied.

Eligibility is binary. Ranking must not resurrect articles that failed eligibility.

## Time Concepts

Search supports human time intent. Users may ask for concrete dates, relative periods, recent days, or named days. These expressions describe publication-time ranges unless another product concept explicitly says otherwise.

Relative time is evaluated at request time. A saved search containing relative time remains dynamic: "today" and "last week" move as time moves.

First-seen age is a different concept from publication date. Publication date describes when the article says it was published. First seen describes when RSSMonster encountered the article.

## Text Relevance

Text search should favor understandable user expectations over linguistic cleverness. A simple term search should find articles whose title or searchable content contains those terms. An exact phrase search should preserve phrase intent.

Title-specific search is a narrower form of text search. It should not be treated as equivalent to full-content search.

Text relevance determines eligibility, not ranking, unless a future ranking model explicitly includes textual relevance as a scoring concept.

## Quality and Safety Gates

Search uses score thresholds as gates before ranking. Advertisement score, sentiment score, and quality score represent minimum acceptability levels for the current view.

Explicit thresholds supplied by the caller take precedence over stored user defaults. When thresholds are not supplied, user defaults define the baseline. The absence of a stored preference should not make search unusable.

Quality gates are cumulative. An article below any active minimum is excluded.

## Ranking Models

Ordering answers the question "what should the reader see first?" after eligibility has already been decided.

Supported ranking concepts include:

- Chronological order, newest or oldest first.
- Recommended order, prioritizing articles with stronger usefulness signals.
- Quality order, prioritizing higher-quality articles.
- Attention order, prioritizing articles with stronger engagement or attention signals.

Recommended ranking is a product-level judgment, not a synonym for recency. It may consider article quality, user interest, feed trust, event strength, source diversity, source count, and other signals that represent likely reading value.

When a ranking model depends on event or source context, search must treat that context as part of the ranking concept. Missing context should reduce confidence or score rather than make an otherwise eligible article invalid, unless the query explicitly requires that context.

Tie-breaking should be deterministic so users do not see avoidable result jitter.

## Grouping Concepts

Search can operate over individual articles or representative articles.

Event grouping means that clustered coverage should not flood the result list with many articles about the same event. The representative article stands in for the cluster, while unclustered articles remain eligible as themselves.

Topic grouping means that broad topics should be represented by their strongest current event rather than every article or every event in that topic.

Grouping changes the shape of the eligible set. It does not change what an individual article means.

## Counts and Limits

Search may return article IDs or only a count. Count-only search answers the same eligibility question without materializing the ordered result list.

Limits cap the size of the answer. A limit is part of the search contract, especially for saved views and smart folders where bounded work and bounded UI output matter.

When both counting and limiting are active, the count represents the bounded answer the caller requested, not necessarily the total possible universe, unless a caller explicitly asks for total-match semantics.

## Response Contract

A successful search response communicates both the answer and the interpreted query context.

For ID searches, the answer is an ordered list of article IDs.

For count searches, the answer is the number of matching articles.

The response should preserve enough query metadata for callers to understand which user, search expression, tag, sort, date, or other high-level intent shaped the result. This supports debugging, UI state, and saved-view behavior.

An empty result is a valid answer. It means the request was understood and no article satisfied the active constraints.

## Failure Semantics

Search cannot run without a user identity. Missing identity is an invalid request, not an empty search.

Invalid or unknown optional intent should degrade conservatively. Search should prefer default behavior over surprising broad matches when a non-essential option cannot be interpreted.

## Architectural Boundaries

Search decides which articles match and in what order.

Search does not decide how articles are rendered, how feeds are crawled, how article content is extracted, how users authenticate, or how UI controls are displayed.

Search may rely on article metadata, user settings, feed trust, tags, event information, and recommendation signals, but those concepts remain external inputs. Search composes them into retrieval behavior; it does not own their lifecycle.

## Product Promise

The reader should experience article search as a calm, precise command surface over their knowledge stream.

A simple query should feel obvious. A structured query should feel powerful. A saved smart folder should feel like the same search contract running consistently over time.

The architecture succeeds when an agent can infer the correct behavior from the user's intent and these principles, without needing to memorize the current implementation shape.
