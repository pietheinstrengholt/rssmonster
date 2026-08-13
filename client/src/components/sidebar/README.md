# Sidebar

## Purpose

The sidebar is the primary desktop navigation and management surface for RSSMonster. It combines global feed actions, article collection filters, category and feed navigation, and context-sensitive management actions in one content-first column.

The sidebar reflects one shared selection at a time. That selection can identify an article status, smart folder, tag, category, or individual feed. Selected rows receive a distinct visual state, and changing one navigation dimension clears incompatible dimensions so the article list always has an unambiguous scope.

## Layout and behavior

At `768px+`, the sidebar occupies the first column of the application shell grid. It remains in flow and uses sticky positioning rather than a fixed position with a matching content offset. The sidebar and main pane scroll independently within the shell viewport.

The sidebar uses a native 6-pixel scrollbar with a transparent track and theme-aware thumb. Its thumb is transparent at rest—including initial load—and appears on hover or keyboard focus. Visibility is CSS-owned; do not add scroll timers, `.is-scrolling` classes, or DOM mutation merely to reveal the native scrollbar.

### Brand and primary actions

The top of the sidebar displays the RSSMonster logo and name, followed by three primary actions:

- **Refresh feeds** asks the application feed-refresh store to start a feed crawl. While it runs, the sidebar projects shared live progress, including the current feed, processed feeds, new articles, errors, and recent status messages. A standard refresh is used if live progress is unavailable. Completing the refresh reloads the overview and article list even if the Sidebar is not mounted.
- **Add new feed** opens the feed-creation flow.
- **Mark as read** marks all articles covered by the current selection as read and then reloads the overview and article list.

These actions operate independently of scrolling and remain part of the sidebar's global control area.

### Smart folders

Smart folders are saved query-based collections. The section appears only when at least one smart folder exists.

Selecting a smart folder replaces category, feed, and tag filtering with the folder's query. Smart folders open as an unread, newest-first collection. Selecting a regular article-status filter exits the smart-folder context.

Smart-folder counts are fetched snapshots. They describe the result size when the smart-folder data was loaded and do not change merely because the user scrolls, opens an article, or moves between sidebar selections. They change when smart-folder data and its counts are explicitly refreshed, such as after smart-folder management or another relevant reload.

### All feeds

All feeds provides the global article-status views:

- Daily briefing, when AI features are enabled
- Unread
- Read
- Favorites
- Hot
- Clicked

Each count represents the selected status across all feeds. The Daily briefing count represents the currently configured briefing period and preferences.

These are live application counts. They can increase or decrease as articles arrive, are read or restored to unread, are favorited or unfavorited, become hot, or are clicked. Article actions reconcile applicable counts immediately, while overview refreshes restore the authoritative server totals. The overview also refreshes periodically and after explicit reload operations.

When new unread articles are detected by background overview refreshes, a temporary refresh row appears above the status filters. Its count is the number of newly detected unread articles since the last accepted refresh. Selecting it reloads the current data.

Selecting a status changes the meaning of the counts shown for All, categories, and feeds. For example, choosing Favorites makes those rows show favorite totals, while choosing Clicked makes them show clicked totals. Selecting the already active status normally preserves the current view; it also exits an active smart folder when necessary.

### Top tags

The tags section shows up to five of the most frequent tags in the active article-status collection and appears only when tag data is available. Its heading names that scope, such as **Top tags in Daily briefing**, **Top tags in Unread**, or **Top tags in Favorites**, and tag labels are normalized for display.

Selecting a tag scopes articles across all categories and feeds. Selecting the active tag again clears that tag selection.

Each tag count represents matching canonical articles in the active Daily Briefing, Unread, Read, Favorites, Hot, or Clicked collection. Event and topic grouping may collapse those articles visually, but does not change the article count. Switching status requests a new ranked tag snapshot, and tags without matches in that status do not appear. Daily Briefing tag membership follows its saved period, unread-only, score-threshold, source-diversity, interest-match, and developing-event preferences.

Tag counts are fetched snapshots. They do not change merely because the user scrolls or opens articles; they change when tag data is explicitly fetched again.

### Categories and feeds

The category area is the hierarchical view of the user's subscriptions. It contains:

- **Load all categories**, which removes category and feed scoping while retaining the active article status.
- An ordered list of categories.
- The feeds belonging to the currently selected category.

A category count is the aggregate of the corresponding counts for its underlying feeds. Selecting a category expands that category and scopes the article list to all of its feeds. Selecting an individual feed narrows the scope further. Only the selected category is expanded.

Category and feed counts use the active All feeds status. The supported count dimensions are read, unread, favorites, hot, and clicked. Counts must remain consistent at all three levels:

1. The global All feeds total.
2. The category aggregate.
3. The individual feed total.

These counts are dynamic. Reading an article, restoring it to unread, changing favorite state, clicking an article, receiving new articles, marking a selection as read, or refreshing overview data can change the relevant global, category, and feed totals.

Category aggregation is also dynamic when subscriptions are managed. Adding or removing a feed must add or remove its contribution. Moving a feed between categories must subtract every applicable count from the source category and add it to the destination category without changing the global totals. Removing a category or feed must also reconcile the affected aggregates. Authoritative overview refreshes recalculate the hierarchy from server data.

Categories can be reordered by selecting **Reorder** and dragging them into place. Selecting **Done** returns to normal navigation. Drag-and-drop support is loaded only when reorder mode is opened, and each new order is reflected immediately and persisted for future sessions.

Feed rows use the feed favicon when available and otherwise use an RSS icon. Error and disabled feeds retain health-state styling while still participating in selection and count display.

The category area remains available for the Hot view. Its All, category, and feed rows use the authoritative Hot counts from the overview hierarchy, allowing Hot articles to be scoped without deriving totals from the partially loaded article list.

### Contextual actions

The bottom action area changes according to the current category and feed selection:

- **Add category** is available throughout the category area.
- Selecting a category, but not one of its feeds, reveals actions to delete or edit that category.
- Selecting an individual feed reveals actions to delete or edit that feed.
- Selecting all categories and all feeds reveals cleanup and logout actions.

The footer also links to the RSSMonster project and displays the current application version.

## Selection rules

The sidebar keeps filters mutually coherent:

- A category selection clears the selected feed, tag, search, and smart folder.
- A feed selection retains its parent category and clears tag, search, and smart-folder filtering.
- A tag selection clears category, feed, search, and smart-folder filtering.
- A smart-folder selection clears category, feed, and tag filtering and applies the folder's saved query.
- A status selection clears the smart-folder context and any status-specific search when appropriate.
- Loading all categories clears category and feed scoping but preserves the active status.

The action buttons, selected styling, expanded category, displayed counts, and article list are all projections of this shared selection.

## Count expectations

Counts fall into two intentionally different groups:

| Area | Count model | Expected updates |
| --- | --- | --- |
| Smart folders | Fetched snapshot | Changes only when smart-folder counts are fetched again |
| Top tags | Status-scoped fetched snapshot | Changes when the article status or tag data is refreshed |
| All feeds | Live overview state | Changes through article actions, feed refreshes, explicit reloads, and periodic overview refreshes |
| Categories | Live aggregate of child feeds | Tracks the active status and reconciles article and feed-management changes |
| Feeds | Live per-feed state | Tracks the active status and reconciles article changes |

Scrolling is never a count mutation. Navigation changes which live count dimension is displayed, but it does not itself create or remove articles. Large values are abbreviated with a compact `K` suffix to keep the column stable.

Future changes should preserve the distinction between snapshot counts and live overview counts, and should update global, category, and feed values as one consistent hierarchy whenever a mutation affects article membership.
