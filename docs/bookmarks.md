---
title: Bookmarks
parent: Using RSSMonster
nav_order: 6
---

# Bookmarks

Bookmarks let you save articles that you want to revisit. RSSMonster calls
bookmarked articles **Favorites** in the interface, so the Favorites collection
is where you can quickly rediscover everything you have saved.

Bookmarks are also a strong signal of explicit interest. RSSMonster uses them,
together with behavior such as clicks, deeper reads, positive feedback, and
negative feedback, when it builds and recalibrates your interest islands.

## Bookmark an Article

To bookmark an article:

1. Select the three-dot **Article actions** button on the article.
2. Select **Mark as favorite**.

The menu action changes to **Unmark favorite** after the article is saved. Use
it to remove the article from your bookmarks.

You can also press `S` while an article is selected to toggle its favorite
status. See [Keyboard Shortcuts](keyboard-shortcuts.md) for the complete
keyboard reference.

## Find Your Bookmarks

Select **Favorites** in the sidebar to see bookmarked articles. Bookmarks remain
available independently of whether an article is read or unread, making this
collection useful for research, reference material, recipes, tutorials, and
anything else you may want to find again later.

Bookmarks can also be included in a Search or Smart Folder query:

```text
favorite:true
```

For example, this query shows bookmarked Nintendo articles ordered by quality:

```text
favorite:true Nintendo sort:quality
```

The legacy alias `star:true` has the same effect. See the
[Search Guide](search.md) and [Smart Folders](smart-folders.md) for more ways to
build saved views around bookmarks.

## Assign Bookmarks Automatically

Automation rules can mark matching incoming articles as favorites during a
feed crawl. This is useful when you consistently want to save articles about a
particular subject, project, person, or source.

In **Settings → Automation**, add an action with:

- a descriptive name;
- **Set favorite** as the action type; and
- a regular expression that identifies matching articles.

For example, `[Nn]intendo|[Zz]elda` bookmarks incoming articles when either
term appears in the title, HTML or plain-text body, description, or URL.

Automation rules apply while incoming articles are processed. They are not a
retroactive search over articles already stored in your library. If you only
want a dynamic view without changing bookmark state, create a
[Smart Folder](smart-folders.md) instead.

## Bookmarks and Interest Islands

Interest islands represent recurring areas of interest inferred from your
reading behavior. A bookmark contributes positive engagement evidence because
it is an explicit decision to retain an article.

RSSMonster combines that signal with other interactions rather than assuming
that one bookmark defines an entire interest. Repeated, related engagement can
strengthen a behavioral topic and help form or update an interest island. Those
islands can then support personalized relevance and recommendations.

Bookmark articles you genuinely value: doing so improves both your saved
library and the behavioral signals RSSMonster can use to understand your
interests.
