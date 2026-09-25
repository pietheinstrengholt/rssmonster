---
layout: page
title: Hot Articles
parent: Using RSSMonster
nav_order: 12.5
---

# Hot Articles

Hot articles are recent articles that other articles in your subscriptions link
to. RSSMonster uses these links to highlight coverage attracting attention across
your feeds. Hot status is specific to your account: it is not a global popularity
score, a count of readers, or an AI prediction.

For example, you subscribe to a research publication and a news site. The news
site publishes an article linking to a recent report from the publication. If
both articles are stored in your account and meet the rules below, the linked
report becomes Hot. The news article does not become Hot simply by linking to it.

## How an article becomes Hot

During article processing, RSSMonster collects external HTTP and HTTPS links from
the article's HTML. Links to the source article's own website are skipped, and
repeated links to the same normalized URL within one article count only once.
Filtered or duplicate articles do not contribute link observations.

When RSSMonster reconciles Hot status, a stored article qualifies if:

- It belongs to your account and is neither filtered nor a duplicate.
- Its publication date falls within the last 14 days.
- At least one link observation recorded within the last 14 days points to its
  URL, belongs to your account, and comes from a different feed.

Matching uses normalized URLs. Tracking parameters such as `utm_source`, URL
fragments, and trailing slashes are removed, while meaningful query parameters
are preserved. Reconciliation matches those normalized URLs exactly; similar
headlines or article text are not enough.

The stored `hotlinks` value counts matching link observations, not distinct feeds.
Several articles from one other feed can contribute several observations. The
`hotInd` flag indicates whether that count is greater than zero. Separate feeds
do not necessarily mean independent reporting, and Hot status is not a quality
rating or a fact check.

## Find Hot articles

Select **Hot** in the sidebar or the **Show** menu. You can narrow the collection
to a category or feed. Articles also display a Hot label or flame indicator,
depending on the reading layout.

Use [Search]({% link search.md %}) for more specific selections:

| Search | Result |
| --- | --- |
| `hot:true` | Hot articles in the active feed or category scope. |
| `hot:true unread:true` | Hot articles you have not read. |
| `hot:false` | Articles that are not currently Hot. |

Save a frequently used search as a [Smart Folder]({% link smart-folders.md %}).

## Ranking bonus

Both **Top Stories** and **Recommended** add a flat **+0.07** to an article's score
when `hotInd` is set. This is an additive bonus, not a seven-percent multiplier.
More link observations do not increase the bonus, and the existing score caps
still apply. The bonus does not change Quality, Newest, or Oldest ordering.

Other scoring signals still matter, so a Hot article is not guaranteed to rank
above every non-Hot article. See [Scoring and Ranking]({% link scoring.md %}) for
the complete formulas.

## Daily Briefing

Open **Daily briefing → Tune your briefing** and use **Include Hot articles**
under Article selection. This preference is enabled by default.

- **Enabled:** Hot status is another way to qualify for the briefing, alongside
  stored interest and qualifying Event membership. A Hot article does not need
  either of those other signals when the two **Show only** options are off.
- **Disabled:** all Hot articles are excluded from the briefing, including those
  that also have stored interest or qualifying Event membership.

Hot articles still have to meet your saved period, unread-only setting, minimum
distinct sources, and any interest-only or developing-only restriction. Existing
visibility and score filters also apply. Enabling the switch does not bypass
these filters or give every Hot article its own overview highlight; Event
grouping and overview limits still apply.

Select **Save changes** to update the collection and overview. The preference
also applies to the saved selection used for briefing emails. **Reset to defaults**
turns it back on in the draft settings. See [Daily Briefing]({% link daily-briefing.md %})
for the other controls.

## When Hot status changes

Hot status is recalculated after crawling and during expired-link cleanup. An
article loses it when no qualifying links remain or its publication date ages
outside the 14-day window. Publisher revisions replace their earlier outbound
links, so removing a link can reduce the linked article's count or clear its
Hot status. These updates happen during reconciliation, not continuously as the
clock advances.

If an expected article is missing, check that the linked article is stored in
your account, the link came from an accepted article in another feed, and both
the target publication date and link observation are recent enough. Links to
the source article's own website are skipped. Your active filters can also hide
an article that is still Hot.
