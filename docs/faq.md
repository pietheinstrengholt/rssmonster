---
layout: page
title: FAQ
nav_order: 7
---

## What makes RSSMonster different from other RSS readers?

RSSMonster is a **signal-driven RSS reader**. It offers chronological ordering
alongside transparent Quality, Recommended, and Top Stories modes.

Traditional readers answer:
> “What’s new?”

RSSMonster can also answer:
> “What is valuable, relevant to me, or important right now?”

---

## Is RSSMonster an algorithm deciding what I see?

Yes — but **you control it**.

RSSMonster composes visible signals such as article quality, FeedTrust,
freshness, personal interest, reading attention, and Event corroboration. Each
ranking mode gives those signals a specific meaning.

Ranking formulas and many supporting signals are documented. Model-generated
analysis and semantic matches remain estimates; explanations do not make them
factual guarantees. Optional external model providers receive data used in their
requests. See [Model Usage]({% link model-usage.md %}).

---

## Can I disable ranking and use RSSMonster like a classic RSS reader?

Yes.

You can:
- Sort by date (`sort:desc`)
- Ignore quality or trust thresholds
- Use Smart Folders that behave like traditional views

RSSMonster does not force ranking — it *enables* it.

---

## Why are some articles hidden or ranked very low?

The selected sort determines ordering. Recommended can place an article later
because of weak or negative personal interest, age, Quality, or limited Event
corroboration. Top Stories emphasizes Event evidence, freshness, and Quality;
Quality emphasizes article quality and FeedTrust. Newest and Oldest remain
chronological unless the optional legacy high-trust preference is enabled.

Filters and automated actions are separate from sorting and can exclude an
article from a view. Duplicate and Event grouping can also show one
representative first while keeping the related sources available.

---

## Why do I sometimes see only one article for a big news story?

Duplicate suppression and event grouping can reduce repetition for different
reasons. A duplicate represents the same content; an event connects coverage of
one occurrence, including distinct reporting. Open the available story-source
controls to compare coverage. See [Events]({% link events.md %}).

## What is a cluster, exactly?

Older descriptions use “cluster” loosely. RSSMonster distinguishes duplicates,
Events and Interest Islands. An event describes a specific occurrence,
and an Island represents personal interests.
See [Concepts]({% link concepts.md %}) for examples and read-state implications.

---

## How is article quality calculated?

Article quality is a normalized score (0.0 – 1.0) based on:

```text
articleQuality =
    0.50 × qualityScore
  + 0.25 × sentimentScore
  + 0.25 × advertisementScore
```

The inputs use `0`–`100` and the result is normalized to `0`–`1`. The
advertisement component scores the absence of promotional content, so higher
is better. Quality ordering then combines `70%` article quality with `30%`
FeedTrust.

Quality is used for ranking, filtering, and automation — not censorship.

---

## What does “uniqueness” mean?

Originality in FeedTrust uses deterministic duplicate evidence. Semantic
co-coverage does not automatically make an article unoriginal, and RSSMonster
does not measure every article's journalistic novelty. See [FeedTrust]({% link feedtrust.md %}).

---

## How does feed trust work?

Feed trust estimates how consistently valuable a source has recently been as a
source of articles.

It is based on:
- Average existing article quality
- Supporting engagement among exposed articles
- Originality based on actual duplicate links
- Explicit negative feedback

It is not factual verification, crawl health, personal interest, or a reward for
publishing frequently. Trust improves ranking reliability but never fully hides
content.

---

## Why doesn’t feed trust update immediately?

Feed trust is recalculated from a rolling 30-day evidence window.

It updates in batches to:
- Reuse the same transparent evidence model for every feed
- Keep sparse signals close to neutral through per-signal confidence
- Produce the same result when unchanged data is recalculated

You can manually recalculate trust using:

```bash
npm run feedtrust
```

[Read the complete FeedTrust explanation →]({% link feedtrust.md %})

## Can I use RSSMonster without AI?

Yes. The default SQLite Docker profile supports basic reading without running
the AI worker. For background analysis and semantic features, use the MySQL
profile and configure inference. See [Configuration]({% link configuration.md %}).

## Why is my briefing or recommendation list empty?

Your filters may exclude all candidates, or the available content may lack
sufficient semantic or personal-interest evidence. Try broader
[Briefing Preferences]({% link daily-briefing.md %}) and check processing-job health.
Recommendation thresholds deliberately allow no results.

## Can I read offline after installing the app?

Installation caches the application shell, not your entire article archive.
Article loading and reading-state changes require server access. See
[Web App and Notifications]({% link web-app-and-notifications.md %}).

## Can RSSMonster email my briefing or reset my password?

Yes, when the operator enables SMTP and you verify your address.
[Account and Email]({% link account.md %}) covers both workflows; [Email Configuration]({% link email-configuration.md %})
explains server setup and delivery diagnostics.
