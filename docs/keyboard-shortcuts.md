---
layout: page
title: Keyboard Shortcuts
parent: Using RSSMonster
nav_order: 8
---

# Keyboard Shortcuts

RSSMonster supports keyboard navigation throughout the article views, along
with standard keyboard controls for search, dialogs, menus, and selected form
controls.

## Article Shortcuts

These shortcuts operate on the currently selected article. They are available
in Reader mode and the regular article views, including Headlines and Expanded
views.

| Key | Action |
| --- | --- |
| `J` or Down Arrow | Select the next article. |
| `K` or Up Arrow | Select the previous article. |
| `Enter` or `O` | Open the selected article on its original website. |
| `M` or `R` | Toggle the selected article between read and unread. |
| `S` | Toggle the selected article's favorite status. |

In Reader mode, moving to another article marks the previously selected unread
article as read. See [Marking Articles Read](marking-articles-read.md) for the
full read-state behavior.

## Global Shortcuts

| Key | Action |
| --- | --- |
| Shift+`R` | Refresh the current article collection. |
| `/` | Move focus to article search. |

The uppercase `R` refresh shortcut is distinct from lowercase `R`, which
toggles the selected article's read status.

## Search and Assistant

| Context | Key | Action |
| --- | --- | --- |
| Mobile search | `Enter` | Run the current search. |
| Mobile search | `Escape` | Close the search panel. |
| Compact desktop search | `Escape` | Close the compact search field. |
| AI assistant input | `Enter` | Send the current non-empty message. |

## Dialogs and Menus

RSSMonster uses standard keyboard behavior for modal dialogs and dropdown
menus:

| Context | Key | Action |
| --- | --- | --- |
| Dialog or Settings | `Escape` | Close the active dialog or Settings. |
| Dialog or Settings | `Tab` / Shift+`Tab` | Move between controls while keeping focus inside the active dialog. |
| Dropdown trigger | `Enter` or Space | Open the menu at its first item, or close an open menu. |
| Dropdown trigger | Down Arrow | Open the menu and focus its first item. |
| Dropdown trigger | Up Arrow | Open the menu and focus its last item. |
| Open dropdown | Down Arrow / Up Arrow | Move to the next or previous enabled menu item. Navigation wraps at the ends. |
| Open dropdown | `Home` / `End` | Move to the first or last enabled menu item. |
| Open dropdown | `Escape` | Close the menu and return focus to its trigger. |

Reader article rows can also be selected with `Enter` or Space when the row
itself has keyboard focus. Pressing `Escape` closes the open Reader bulk-action
menu.

## Category Icon Picker

When choosing an icon for a category:

| Key | Action |
| --- | --- |
| Right Arrow or Down Arrow | Select the next icon. |
| Left Arrow or Up Arrow | Select the previous icon. |
| `Home` | Select the first icon. |
| `End` | Select the last icon. |

Icon navigation wraps when moving past the first or last option.

## When Article Shortcuts Are Paused

Article shortcuts do not run while focus is in an input, text area, select
control, editable content, link, or button. They also ignore combinations that
use Control, Command, or Alt. This prevents article actions from firing while
you type, edit a query, or operate another control.
