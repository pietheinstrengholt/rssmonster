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

Some views intentionally loosen normal feed/category scope when the concept being requested is not source-local. For example, a hot-article view is about the article's global attention state inside the user's library, not about one selected feed.

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
