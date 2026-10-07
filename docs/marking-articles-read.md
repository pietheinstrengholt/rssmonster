---
layout: page
title: Marking Articles Read
parent: Using RSSMonster
nav_order: 7
---

# Marking Articles Read

RSSMonster can update article read status automatically as you work through a
collection. The behavior depends on the active view: continuous reading views
can mark articles after you scroll past them, while Reader mode uses article
selection changes as the completion signal.

You can also explicitly mark an article as read or unread at any time. An
explicit choice takes precedence over automatic scroll tracking.

## Mark as Read While Scrolling

Open [Tune your unread selection](#tune-your-unread-selection) to configure
**Mark as read while scrolling**, then select **Save changes**.

When this option is enabled, RSSMonster marks an unread article as read after
it has been visible and you scroll past it above the viewport. An article that
temporarily disappears below the viewport is not considered read merely
because you have not reached it yet.

Disable the option if you want articles in the unread selection to remain
unread while scrolling. Headlines also supports this preference for rows you
scroll past; expanding an article does not by itself mark that current article
as read.

## Reader Mode

Reader mode displays the article list beside the selected article. Moving to a
different article marks the previously selected unread article as read. This
lets you work through a collection without manually changing the status of
each article. Reader selection behavior is independent of the **Mark as read
while scrolling** preference.

Keyboard shortcuts make this workflow faster:

- Press `J` or the Down Arrow to select the next article.
- Press `K` or the Up Arrow to select the previous article.
- Press `Enter` or `O` to open the selected article on its original website.
- Press `M` or `R` to toggle the selected article between read and unread.

When keyboard navigation changes the Reader selection, the article you leave
is marked as read and the newly selected article opens in the reader panel.
The new article is not marked as read until you move away from it or explicitly
toggle its status.

Shortcuts do not run while you are typing in a field, editing content, using a
modified key combination, or interacting with another control.

## Manual and Bulk Actions

Use an article's read-status control when you want to mark it read or restore
it to unread immediately. The sidebar action can **Mark selection read**,
including unloaded matching articles, or **Mark all visible as read** when that
sidebar preference is enabled.

The collection's three-dot **More actions** menu is available in Reader,
Expanded, Summarized, Summary Bullets, and Headlines views, including compact
layouts. It can:

- Mark all visible articles as read.
- Mark articles older than the current article as read, using publication dates.
- Mark articles above or below the current article as read, in the current list order.
- Save all visible articles or mark their originals as opened.

“Visible” means rows intersecting the reading viewport, not every loaded article.
The relative read actions operate on loaded articles and exclude the current
article. In Reader, the current article is the selected article. In other views,
the menu uses the selected/open article or the article nearest the top of the
viewport when no article is selected. Unavailable relative actions are disabled.
Marking originals as opened records that state; it does not open many publisher
tabs. There is no bulk undo control; use an article's status or saved control to
reverse an individual change.

These explicit actions are useful when automatic scrolling does not match how
you reviewed a collection.

## Tune your unread selection

Use this dialog to adjust your unread selection, automatic read marking,
startup selection, and article-link behavior.

1. Select **Unread** in the sidebar or status selector.
2. Select the toolbar's **sliders** button. On desktop it is labelled
   **Tune your unread selection**; in the compact/mobile layout it is labelled
   **Open unread settings**.
3. Adjust the switches and select **Save changes** to persist your preferences.
   **Cancel** or closing the dialog discards unsaved changes.

![Tune your unread selection dialog showing developing events, high-trust prioritization, scroll-based read marking, startup selection, and article-link behavior]({{ '/assets/unread-settings.png' | relative_url }})

| Setting | What it changes |
| --- | --- |
| Developing events | Includes new coverage for Events you have already seen. See [Events]({% link events.md %}#viewing-event-coverage) for grouped coverage and developing articles. |
| Prioritize high-trust coverage | Gives coverage from feeds with stronger FeedTrust more prominence in Unread. This can change Newest/Oldest ordering; leave it off for strictly chronological reading. See [Scoring]({% link scoring.md %}#chronological). |
| Mark as read while scrolling | Marks unread articles as read after you scroll past them, including in Headlines mode. Reader mode instead marks the article you leave when you change selection, independently of this switch. |
| Use default view on startup | Opens the default unread selection after refreshing or reopening RSSMonster. Turn it off to restore the last-used selection instead. |
| Open article links in a new tab | Opens links within article bodies in a new tab across reading views, keeping RSSMonster open. When off, links follow the publisher's behavior. Article titles always open in a new tab. |

The screenshot shows one example configuration, with scroll-based read marking
enabled and the other switches off. Choose the settings that suit your reading
workflow; they do not need to match the screenshot.

Daily Briefing has its own unread-only and scroll-reading preferences; changing
one collection's scroll option does not change the other's. See
[Daily Briefing]({% link daily-briefing.md %}).
