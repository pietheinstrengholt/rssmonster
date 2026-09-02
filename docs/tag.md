---
layout: page
title: Tags
parent: Using RSSMonster
nav_order: 5
---

# Tags

Tags organize related articles across feeds and categories. RSSMonster stores
tags per user, displays them on articles, and surfaces frequently used tags in
the sidebar for quick filtering.

## Where Tags Come From

Tags can be added to an article in several ways during a feed crawl.

### Publisher Tags and Categories

RSS and Atom providers can include categories, labels, or tags in an article.
RSSMonster extracts those values and carries them into the article's tags
automatically. You do not need to recreate labels that the publisher already
provides.

Publisher values are normalized before they are stored. Empty and duplicate
values are removed so the same label is not displayed more than once on an
article.

### Feed Tags

You can configure tags on an RSSMonster feed. Those feed tags are applied to
new articles saved from that feed, which is useful for stable labels such as a
publisher, project, team, or broad subject area.

### Generated Tags

When AI enrichment is configured for a feed, RSSMonster can derive a small set
of tags from the article content. These are combined with categories supplied
by the publisher.

### Rule-Based Tags

Automation rules can assign your own tag when an incoming article matches a
regular expression. Rules are useful when publishers do not provide the label
you need or when you want one consistent tag across several sources.

For example, if you follow Nintendo and Zelda news, create an Automation action
with:

- **Name:** Nintendo and Zelda
- **Type:** Assign tag
- **Tag value:** `nintendo`
- **Regular Expression:** `[Nn]intendo|[Zz]elda`

The rule checks each incoming article's title, HTML and plain-text body,
description, and URL. If any one of those fields matches, RSSMonster assigns
the `nintendo` tag. This example uses character classes so it matches both
capitalized and lowercase forms.

Rules run while articles are processed during a crawl. They are intended for
incoming articles and should not be treated as a retroactive search over the
existing library.

Rule-based tags and Smart Folder queries solve different problems. An
Automation rule uses a JavaScript regular expression to attach a persistent
tag during article processing. A [Smart Folder](smart-folders.md) uses a
[search expression](search.md) to build a dynamic view without modifying the
article.

To reject matching entries before they are stored or enriched, configure a
[feed item filter](feed-item-filters.md) instead.

## Finding Tagged Articles

Tags appear as clickable labels on the articles themselves. Rule-assigned tags
have their own visual treatment so they can be distinguished from other tag
sources.

RSSMonster also shows the most frequently used tags for the active article
status in the sidebar. Each sidebar tag includes the number of matching
articles in that status.

Select a tag on an article or in the sidebar to show other articles carrying
the same tag. The current status, sorting, grouping, and view mode remain in
effect, so an Unread view continues to show only unread articles with that tag.
Select the active sidebar tag again to clear the tag filter.

You can also use a tag directly in Search or a Smart Folder query:

```text
tag:nintendo
```

Combine it with other expressions to narrow the result further:

```text
tag:nintendo unread:true @lastweek sort:recommended
```

Tag values in search expressions should be written as a single unquoted token.
See the [Search Guide](search.md) for every supported expression.
