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

Tags can be added automatically during a feed crawl or manually from an article.

### Manual Tags

You can add and manage tags on individual articles, including articles already
in your library. These changes apply to the selected article; removing a tag
from it does not remove the same label from other articles.

#### Add tags to an article

1. Open the article's three-dot **Article actions** menu and choose **Add tags**.
2. Select existing labels from the suggestions or use **Search tags** to find
   a label by name.
3. To create a label, select **Create new tag**, enter a name, and select
   **Create**. You can also type a new name into the search field and choose
   **Create "name"** when offered.
4. Select **Add tags** to save the selected labels to the article.

Creating a label selects it in the dialog; it is saved to the article only when
you submit your changes. **Cancel** closes the dialog without saving.

Open the article's **…** menu and choose **Add tags** to select existing labels
or create a new one inline. Existing article tags remain selected and cannot be
removed in this workflow. Current tags appear immediately. Suggestions combine
up to ten names from the current sidebar's usage snapshot (**Most used in this
view**) with ten alphabetical defaults, without repeating selected labels.
Search looks up matching names on the server after a 250 ms pause, returning up
to twenty results with selected matches first. Clearing search restores the
small suggestion set. **Create "name"** selects a new label without closing the
dialog. The dialog never loads the complete tag collection.

There is no Recently used section: crawl processing can recreate tag rows, so
their creation timestamps do not reliably represent when you last used a tag.

#### Manage an article's tags

1. Open the article's three-dot **Article actions** menu and choose **Manage tags**.
2. Review **Current tags** at the top of the dialog. Select the **×** on a tag
   chip or uncheck its matching search result to remove it from the selection.
3. Under **Add more tags**, search for and select existing labels, choose from
   **Most used in this view** or **More tags**, or use **Create new tag**.
4. Select **Save changes** to apply additions and removals together, or
   **Cancel** to leave the article unchanged.

![Manage tags dialog for an individual article, showing current tags, tag search, suggestions, Create new tag, and Save changes]({{ '/assets/manage-tags.png' | relative_url }})

The screenshot shows **Verstappen** and **Videos** selected on one article.
Remove either chip to stop assigning that label to this article, or select
additional labels before saving. Removing an automatically assigned tag can be
temporary: later crawl processing may add it again. Manually added tags survive
automatic tag reconciliation.

Saved tags appear immediately on the article, including compact and mobile
metadata. They use the same search, Smart Folder, and sidebar navigation as
automatically assigned tags. If a multi-request save is interrupted, the dialog
keeps your selections and retries only the remaining changes.

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

[Actions]({% link actions.md %}) can assign your own tag when an incoming article matches a
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
tag during article processing. A [Smart Folder]({% link smart-folders.md %}) uses a
[search expression]({% link search.md %}) to build a dynamic view without modifying the
article.

To reject matching entries before they are stored or enriched, configure a
[feed item filter]({% link feed-item-filters.md %}) instead.

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

Quote multiword tag names in search expressions, for example `tag:"read later"`.
See the [Search Guide]({% link search.md %}) for every supported expression.

## Article Tagging API

Authenticated API clients can assign manual tags to existing articles. There is
no separate tag catalogue: a new label is created when it is first assigned to
an article, and remains available while at least one assignment exists.

| Operation | API |
| --- | --- |
| Default suggestions | `GET /api/tags?scope=all&limit=10` |
| Search available names | `GET /api/tags?search=security&limit=20` |
| Read current assignments | `GET /api/articles/:articleId` (`article.tags`) |
| Add existing or new labels | `POST /api/articles/:articleId/tags` with `{"tags":["security","project"]}` |
| Remove one assignment | `DELETE /api/articles/:articleId/tags/:tagId` |

The available-name response is `{ "tags": [{ "name": "security" }], "hasMore": false }`.
Names are distinct and alphabetically ordered across the user's articles,
regardless of reading status. `limit` defaults to 100 and accepts 1–100; `offset`
defaults to zero. Advance the offset by the limit while `hasMore` is true.
Supplying `search` selects this same name catalogue (with or without
`scope=all`). Search is normalized using the existing trim/lowercase convention
and matches literal substrings; `%` and `_` are not wildcards. An exact match is
ordered first, followed by alphabetical matches. Search defaults to twenty
results and accepts limits of 1–50. Queries longer than 255 characters after
normalization are rejected. Both tag and article ownership are enforced in the
same limited SQL query. Existing user/name indexes are reused; no popularity
aggregation runs on keystrokes.
Without `scope=all` or `search`, `GET /api/tags` retains its status-scoped Top Tags
behavior.

Add requests accept 1–100 string names. Names are trimmed and lowercased using
the same conventions as automatically assigned tags; empty names and names
longer than 255 characters are rejected. Repeated assignments are idempotent.
New assignments have `tagType: "manual"`. An existing assignment keeps its
original provenance and is not converted from a rule, feed, or provider tag.

Both mutation endpoints return `{ "tags": [...] }` with the article's current
assignments, each containing `id`, `name`, and `tagType`. The removal ID identifies
one assignment on that article, not a label shared across the library. Removal
does not affect another article's assignments, even when the names match.
An explicitly removed automatic tag can return during later crawl processing.
Manual tags survive automatic tag reconciliation.

Mutations require an owned, visible canonical article. Malformed IDs or invalid
payloads return 400; nonexistent, foreign-owned, or unavailable articles and
assignments return 404. Authentication uses the existing API session middleware.
Changes are immediately available to tag search and Smart Folder queries.
Multiword labels work in search and Smart Folders using a quoted tag expression,
for example `tag:"read later"`. The Smart Folder editor preserves the complete
tag name and generates the required quotes.
