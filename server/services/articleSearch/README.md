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
title:"OpenAI model" author:"Jane Smith" event:true eventCount:>=3
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
| `hot:true` | Hot articles; this intentionally searches across the user's feed/category scope. |
| `hot:false` | Articles not marked hot. |
| `event:true` | Articles assigned to an event. |
| `event:false` | Articles not assigned to an event. |

Do not specify contradictory state filters such as `read:true unread:true`.
They target the same database field, and the later executor rule (`read`) wins
rather than producing a logical contradiction.

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

## Sorting

| Expression | Behavior |
| --- | --- |
| `sort:desc` | Newest publication first. This is the normal default. |
| `sort:asc` | Oldest publication first. |
| `sort:recommended` | Recommendation score descending. Uses freshness, interest, quality, event coverage, publisher diversity, corroboration, event boost, and rule-tag boost. |
| `sort:quality` | Computed article quality descending. |
| `sort:attention` | Computed attention score descending. |

Score-based sorts are performed in memory. When multiple `sort:` tokens are
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
"battery storage" unread:true language:en @lastweek quality:>=0.75 event:true eventCount:>=4 sort:recommended limit:25
```

This returns at most 25 canonical English unread articles that:

1. contain the phrase `battery storage` in their title or original content;
2. were published during the rolling previous seven days;
3. have computed quality of at least `0.75`;
4. belong to an event containing at least four articles;
5. pass the request/user minimum score thresholds;
6. are ordered by recommendation score.

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

`hot:true` and the hot status view intentionally remove feed/category scope, but
the user ownership boundary remains in force.

## Parsing and failure behavior

- Keywords and boolean values are case-insensitive.
- Unknown tokens become free-text terms instead of producing a syntax error.
- Malformed recognized numeric filters are consumed but produce no active score
  filter; check saved expressions carefully.
- Missing user identity is an error.
- No matches is a successful empty result.

Relevant implementation files:

- `articleQueryParser.service.js`: expression parsing.
- `articleDateParser.service.js`: date range resolution.
- `articleTextSearch.service.js`: title/content predicate composition.
- `articleSearch.service.js`: scope, precedence, thresholds, limits, and response.
- `articleSearchExecutor.service.js`: database predicates and grouping.
- `articleSort.service.js`: runtime score filters and score-based ordering.