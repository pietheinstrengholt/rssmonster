# Application Shell Controls

## Purpose

The shell controls provide the persistent navigation and reading controls around RSSMonster's article content. They translate the same shared article selection into interfaces suited to desktop and mobile use.

Desktop favors speed and visibility: the sidebar remains available and the fixed toolbar exposes reading controls, search, theme, chat, and Settings without covering content. Mobile favors reachability and space: the sidebar and desktop toolbar disappear, a sticky toolbar retains the most common filters, and secondary actions move into a full-width options sheet.

These are two presentations of one application state, not separate navigation systems. Status, category, smart folder, sort, grouping, view mode, search, and chat choices must remain synchronized through the shared store.

## Design intent

The shell follows RSSMonster's calm, content-first design:

- Article content receives most of the viewport.
- Frequently changed reading controls stay close to the content.
- Secondary and management actions use progressive disclosure.
- Selection is communicated with typography, a single accent color, and restrained surfaces.
- Desktop density is compact without becoming a dashboard.
- Mobile targets are larger, touch-friendly, safe-area aware, and usable without the desktop sidebar.
- Light and dark themes preserve the same hierarchy and interaction meaning.

The shell should feel like the controls of a professional reader. New features should not turn either toolbar into a collection of unrelated icons or marketing-style panels.

## Responsive ownership

Below 880 pixels, the desktop toolbar is replaced by the mobile toolbar. The fixed sidebar remains visible from 768 through 879 pixels, while narrower phone layouts hide it and let the article area fill the viewport width.

At desktop widths, the mobile toolbar is hidden. The sidebar is fixed at the left, the content area is offset beside it, and the desktop toolbar is fixed across the top of that content area.

The desktop sidebar and article pane scroll independently. The sidebar reveals a subtle scrollbar only while it is being scrolled. The mobile toolbar is sticky so collection controls remain reachable while the article content scrolls. In the 768–879 pixel hybrid range, it uses a fixed layer above the document-scrolling article pane and preserves its initial layout space with a measured spacer.

At the top of an active mobile article collection, a resisted downward pull refreshes the current database-backed article query and overview counts. The gesture preserves rendered articles while the request is active, keeps the toolbar visible, and never starts the longer feed-crawl workflow.

The breakpoint behavior belongs to the application shell rather than to individual article views. Changes must be checked on both sides of the breakpoint, including portrait and landscape orientations.

## Shared selection behavior

Both toolbar variants control the same article-selection dimensions:

- **Status** chooses Daily briefing, Unread, Favorites, Hot, Clicked, or Read.
- **Sort** chooses Oldest, Newest, or Trust, with additional AI ordering when available.
- **Grouping** chooses ungrouped articles, event clusters, or topic clusters when AI is available.
- **Search** updates the shared article query.

Selecting a different status changes the active collection. Selecting the already active status with no smart folder selected requests a full reload instead of performing a no-op. Selecting that same status while a smart folder is active exits the smart-folder context.

Category, feed, tag, and smart-folder scope can coexist with status where allowed by the shared selection rules. The shell must use the store's selection contracts so incompatible filters are cleared together and the article list never receives a partially updated selection.

Sorting is selection state, not merely local toolbar state. Changing sort also reconciles any equivalent sort instruction embedded in the search query. Grouping changes can affect overview structure and counts, so they trigger the wider grouping refresh behavior.

## Desktop behavior

### Layout

The desktop toolbar is a compact fixed row above the article pane. Reading filters occupy the left and center. Chat, search, theme, and Settings occupy the action area, with theme and Settings anchored at the right edge.

The toolbar adapts before switching to the mobile layout:

- Filter labels disappear while the selected values remain visible.
- The search field becomes a search button that opens a compact floating field.
- Chat text collapses to an icon, then the chat control disappears at narrower desktop widths.
- The compact search trigger also disappears immediately before the mobile breakpoint.

This compression order protects the core View, Show, and Sort controls for as long as possible.

### Reading controls

Desktop presents separate dropdowns for:

- **View:** Reader, Expanded, Summarized, Summary Bullets when AI is enabled, and Headlines.
- **Show:** Daily briefing when AI is enabled, Unread, Favorite, Hot, Clicked, and Read.
- **Sort:** Oldest, Newest, Trust, plus Recommended, Quality, and Most Engaged when AI is enabled.
- **Grouping:** None, Events, and Topics when AI is enabled.

Each dropdown shows its active value directly in the toolbar and marks the selected option in its menu. Grouping is omitted entirely when AI is unavailable rather than showing nonfunctional choices.

Desktop is the only shell surface that directly offers Reader view. Reader is designed for the wider two-pane experience and is intentionally absent from the mobile options sheet.

### Search

At wide desktop sizes, search is an inline field with explanatory query syntax in its placeholder. On narrower desktop widths, it becomes a button that opens the field below the toolbar. Escape closes that compact field without clearing the stored query.

Typing updates the shared draft query and applies it after a short pause. The query is validated before it becomes the active article search. Invalid syntax receives a danger treatment and explanatory tooltip, and the last valid article selection remains active.

Other areas of the application can request search focus through the shared focus-search event. The desktop toolbar responds by opening the compact field when necessary and placing focus in it.

### Chat

Chat is shown only when AI features are enabled. Opening or closing it swaps the article area with the assistant through shared application state. Desktop clears the search draft when chat is toggled so a hidden article query does not compete with the assistant context.

### Theme

Desktop exposes System, Light, and Dark theme modes. A choice is applied immediately and saved as the user's preference. If persistence fails, the previous theme is restored in the interface, application state, and document theme, and a recoverable error is shown.

System mode follows the operating-system preference through the application theme service. Explicit Light or Dark choices override that system preference.

### Settings

The desktop gear opens the full Settings dialog inside the toolbar's shell context. The control exposes dialog state to assistive technology, and focus returns to the gear after Settings closes.

Settings sections can request a wider content refresh after saving. The toolbar passes that request to the application shell rather than reloading article or overview data independently.

## Mobile behavior

### Sticky toolbar

The mobile toolbar uses two rows:

1. A brand row with the RSSMonster logo and name, article refresh, search control, and options gear.
2. A compact filter row for status, smart folders, and categories.

Portrait presentation slightly reduces the logo, title, controls, and filter heights to preserve reading space. The toolbar remains touch-friendly and uses ellipsis rather than allowing the brand to push actions off screen.

The gear is visually labeled as Settings for accessibility in the current implementation, but its behavior is different from the desktop gear: it opens the mobile **Options** sheet, not the full Settings workspace.

### Status, sort, and grouping

The first mobile dropdown combines several desktop controls to reduce horizontal pressure:

- The active status and its global count appear on the closed control.
- Status choices show their corresponding global counts.
- Sort choices appear after the status choices.
- AI grouping choices appear at the bottom when AI is enabled.

This menu combines controls visually but does not combine their state. Choosing a sort does not change status, and choosing a grouping does not change sort.

### Smart folders

The Smart folders dropdown lists the current folder snapshots and their counts. Selecting a folder applies its saved query and standard smart-folder defaults. Selecting No smart folder exits that context.

The counts follow the smart-folder snapshot behavior described by the sidebar documentation. Opening or scrolling the mobile menu does not recalculate them.

### Categories

The Categories dropdown allows selection of all categories or one category. Category rows display the count matching the active status. Selecting a category clears feed and incompatible query scope through the shared category-selection behavior.

Mobile does not expose individual feed selection in the top toolbar or options sheet. Category navigation is the intended compact hierarchy at this level; feed-level navigation remains a desktop-sidebar capability.

Daily Briefing has a global overview count but the current category records do not contain per-category briefing counts. When Briefing is active, mobile category rows therefore fall back to zero even though selecting a category can still narrow the visible article list. That fallback must not be interpreted as an authoritative empty-category result.

### Search

The search icon toggles a full-width field directly below the mobile toolbar. Escape closes it. Enter applies a non-empty query and closes the field. Search also closes automatically when the viewport expands into the wider layout.

The current mobile behavior applies the shared search selection on every input change. Unlike desktop search, it does not currently debounce or validate query syntax before applying it. Enter therefore acts primarily as confirmation and dismissal rather than the first point at which the query runs.

The mobile search-open state is also shared with article layout so content can adjust while the field is visible. External focus-search requests open and focus this same field.

### Article refresh

The refresh button rebuilds the complete article list from a snapshot of the current selection and returns the collection to its beginning beneath the sticky mobile toolbar after the first page renders. It clears only local list, observer, and pool state, so unread articles that remained later in the previous list are not marked as read and can appear again in the refreshed selection. The button disables itself while loading and does not reload the application or crawl publisher feeds.

This differs intentionally from the pull-down gesture, which preserves rendered articles until replacement data is ready and shows its own compact refresh indicator.

Every complete article-list rebuild resets the shared responsive scroll roots before loading and again after the first page renders. Status, category, smart-folder, sort, grouping, and other selection changes therefore begin at the first article beneath the mobile toolbar instead of retaining the previous collection's viewport offset.

## Mobile Options sheet

The mobile Options sheet replaces the dense desktop combination of sidebar management and toolbar actions. It appears as a bottom sheet over a dimmed backdrop, accounts for device safe areas, contains its own scrolling region, and locks background body scrolling while open.

### Category selection

The sheet repeats category navigation using larger rows and a clear selected indicator. Selecting a category updates the shared selection and closes the sheet after a short visual delay.

This duplication is intentional: the toolbar dropdown is optimized for quick changes, while the sheet provides a more spacious touch interface alongside other reading options.

### Content view

The sheet offers:

- **Expanded** for full article content
- **Summarized content** for generated summaries
- **Summary bullets** when AI is enabled
- **Headlines** for the densest list

Selecting a view applies it immediately and closes the sheet after a short delay. Reader view is not offered on mobile.

### Feed actions

Refresh feeds forwards the request to the application shell, which uses the existing sidebar refresh workflow and its server-side crawl behavior. The sheet currently remains open after starting a refresh.

Add new feed closes the sheet first and then opens the standard feed-creation dialog.

### Notifications

The notification control reflects the browser's permission state:

- Enable notifications when permission has not yet been requested
- Requesting permission while the browser prompt is active
- Notifications enabled after permission is granted
- Notifications blocked when the browser has denied permission
- Notifications unavailable when the API is unsupported

Opening the sheet never triggers a browser permission prompt. Permission is requested only after an explicit user action. Granted, denied, and unsupported states disable the control. A denial directs the user to browser settings because the application cannot reverse it.

This control requests browser notification permission; it does not independently implement a new notification-delivery subscription.

### Chat

When AI is enabled, the sheet can open or close the assistant. The sheet closes after the choice. Unlike the desktop chat control, the current mobile action does not clear the shared search draft.

## Desktop and mobile capability map

| Capability | Desktop | Mobile |
| --- | --- | --- |
| Status and global counts | Show dropdown; counts remain in sidebar | Combined status menu with counts |
| Sort | Dedicated dropdown | Combined into status menu |
| Grouping | Dedicated AI-only dropdown | Combined into status menu |
| View mode | Dedicated dropdown including Reader | Options sheet without Reader |
| Smart folders | Persistent sidebar | Toolbar dropdown |
| Categories | Persistent sidebar with feeds | Toolbar dropdown and options sheet |
| Individual feeds | Sidebar hierarchy | Not exposed by shell controls |
| Search | Validated, debounced inline or compact field | Immediate full-width field |
| Chat | Toolbar action; clears search draft | Options-sheet action; retains search draft |
| Theme | Toolbar dropdown | Not exposed by mobile shell |
| Full Settings | Toolbar gear | Not exposed by mobile shell |
| Refresh feeds | Sidebar | Options sheet |
| Add feed | Sidebar | Options sheet |
| Notification permission | Browser behavior outside toolbar | Options sheet |

## Count behavior

Status and category counts are projections of shared overview state. They update reactively as the store reconciles reading, unread, favorite, clicked, crawl, and overview changes. Navigation only changes which count dimension is displayed; it does not itself create or remove articles.

Smart-folder counts are loaded snapshots and do not follow every article interaction. The shell must not make them appear live merely because the status and category counts are live.

Desktop does not duplicate status counts inside its toolbar because the persistent sidebar already provides them. Mobile includes counts in the status menu because the sidebar is absent.

## Accessibility and interaction state

Both toolbars use navigation landmarks, accessible names, active option styling, and visible focus states. Menu controls expose expanded state through the underlying dropdown behavior. The desktop Settings control communicates that it opens a dialog and participates in focus restoration.

The mobile sheet is marked as a modal dialog and prevents background scrolling. Its close button is always visible, and its internal list and sheet scroll independently.

The current mobile sheet does not close on Escape, close when the backdrop is selected, trap keyboard focus, or restore focus to its opener. These are current limitations, not behavior to silently depend on. Accessibility improvements should preserve body-scroll locking, explicit close behavior, and the delayed close feedback after category or view selection.

## Maintenance expectations

Future shell changes should preserve:

- One shared selection across desktop and mobile
- The responsive handoff between persistent desktop controls and compact mobile controls
- Desktop progressive compression before the mobile breakpoint
- Mobile safe-area support and background-scroll locking
- AI feature gating for briefing, Summary Bullets, AI sorting, grouping, and chat
- The distinction between live overview counts and smart-folder snapshots
- Search focus integration with the wider application
- Desktop query validation unless mobile and desktop behavior are intentionally unified
- Theme persistence rollback on failure
- Options API patterns and existing store selection contracts
- Light and dark theme parity

When adding a new control, first decide whether it is a high-frequency reading action, a navigation dimension, or a secondary management action. That determines whether it belongs in the desktop toolbar, mobile toolbar, mobile Options sheet, sidebar, or full Settings workspace.
