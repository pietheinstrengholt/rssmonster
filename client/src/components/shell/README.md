# Application Shell Controls

## Purpose

The shell controls provide the persistent navigation and reading controls around RSSMonster's article content. They translate the same shared article selection into interfaces suited to desktop and mobile use.

Desktop favors speed and visibility: the sidebar remains available and the sticky toolbar exposes reading controls, search, theme, chat, and Settings without covering content. Mobile favors reachability and space: the sidebar and desktop toolbar disappear, a sticky toolbar retains the most common filters, and secondary actions move into a full-width options sheet. Between those states, the hybrid shell keeps the sidebar and uses the compact mobile toolbar.

These are three presentations of one application state, not separate navigation systems. Status, category, smart folder, sort, grouping, view mode, search, and chat choices must remain synchronized through the shared store.

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

The application shell has three intentional width-driven states:

| Width | Shell mode | Sidebar | Toolbar | Structure |
| --- | --- | --- | --- | --- |
| `0–767px` | Mobile | Hidden | Mobile | Single-column reading surface |
| `768–879px` | Hybrid | Visible | Mobile, compact single-row presentation | Two-column compact shell |
| `880px+` | Desktop | Visible | Desktop | Two-column desktop shell |

`768px` is the sidebar-introduction boundary. `880px` is the point at which the full desktop toolbar has enough room. Do not collapse these into one breakpoint: the hybrid state is a deliberate layout, not a temporary transition.

JavaScript uses the canonical values and mode names from `../../config/responsiveLayout.js` through `../../composables/useShellMode.js`. CSS media queries mirror those values because CSS does not consume JavaScript constants. `responsive-layout.test.js` and the shell ownership tests enforce agreement. Any breakpoint change must update the contract, matching CSS, documentation, and tests together.

At `768px+`, `.app-shell-row` is a two-column grid. `.app-shell__sidebar` participates in that grid and remains sticky and independently scrollable; `.app-shell__main-frame` owns the main pane and its overlay host. The main pane does not use sidebar-width margins, calculated widths, or other compensation for a fixed sidebar.

Both toolbars remain in normal shell flow and use sticky positioning. The mobile toolbar's stable outer container owns `position: sticky`; its inner `.mobile-toolbar-surface` owns the hide/show transform. This separation preserves a predictable layout box on Safari and avoids combining sticky positioning and transforms on one element. The hybrid state uses the same structure without a fixed wrapper, measured spacer, `ResizeObserver`, or toolbar/search height synchronization.

The breakpoint behavior belongs to the application shell rather than to individual article views. Changes must be checked at representative widths on both sides of `768px` and `880px`, including portrait and landscape orientations. Typography is consistent throughout `0–767px`; orientation may alter available space, but it must not create a second phone type scale.

## Layout and scroll ownership

Each vertical scroll surface has one explicit owner:

- On mobile, the single-column shell and browser viewport provide the reading flow.
- At `768px+`, `.app-shell__sidebar` and `.app-shell__main` are independent shell scroll surfaces.
- At `880px+`, Expanded view may own its native scrollbar on `.article-list-view--expanded`.
- Reader view owns separate native scrollbars on `.article-reader__list` and `.article-reader__content`.

The article collection `.article-list-view__items` does not add toolbar padding, search-open compensation, or vertical clipping. Horizontal swipe clipping belongs to the dedicated `.mobile-swipe-shell`. A view should not hide overflow to conceal an incorrect parent height; the intended shell or view scroll owner must expose the layout error and own scrolling directly.

Native scrollbar styling uses 6-pixel tracks, transparent backgrounds, rounded theme-aware thumbs, and no JavaScript visibility timers. The sidebar thumb is transparent at rest—including initial load—and appears on hover or keyboard focus. The desktop main pane exposes its scrollbar from `880px`; platform overlay and idle-fade behavior still belongs to the browser or operating system.

The connectivity notice is positioned by `.app-shell__overlay-host` inside `.app-shell__main-frame`. The notice component owns only its local inset and maximum width and must not calculate offsets from `--sidebar-width`.

At the top of an active mobile or compact touch-tablet article collection, a resisted downward pull refreshes the current database-backed article query and overview counts. The gesture preserves rendered articles while the request is active, keeps the toolbar visible, and never starts the longer feed-crawl workflow. Its indicator keeps zero flow height while visually translating the article collection by the revealed distance, preventing scroll-geometry changes while letting the articles follow the gesture.

## Structural naming and layers

Shell and article layout selectors describe ownership rather than historical page positions:

| Selector | Responsibility |
| --- | --- |
| `.app-shell__main` | Primary shell content and desktop main scroll surface |
| `.app-shell__sidebar` | Persistent navigation column and sidebar scroll surface |
| `.article-list-view` | Article-list layout owner |
| `.article-list-view__items` | Article collection without toolbar geometry |
| `.article-list-view--expanded` | Expanded presentation and its desktop scroll surface |
| `.article-list-view--empty` | Empty collection presentation |
| `.article-reader` | Reader layout owner |
| `.article-reader__list` | Reader article list and scroll surface |
| `.article-reader__content` | Reader content and scroll surface |
| `.article-reader__empty` | Reader empty state |
| `.article-reader__item`, `__badge`, `__thumbnail` | Reader-owned item presentation |

Do not reintroduce generic structural IDs such as `#home`, `#sidebar`, `#main-container`, or `#articles`, and do not add layout modifiers outside the component that owns them.

Global stacking uses semantic tokens from `assets/styles/theme.css`: `--layer-content`, `--layer-refresh-indicator`, `--layer-sticky`, `--layer-dropdown`, `--layer-overlay`, `--layer-modal`, and `--layer-notification`. Components should choose the semantic layer matching their role instead of using arbitrary integers or arithmetic such as `calc(var(--layer-sticky) - 1)`.

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

The desktop toolbar is a compact sticky row in the main pane's flex flow. Reading filters occupy `.toolbar-filters`; chat, search, theme, and Settings remain together in `.toolbar-actions`. No toolbar sibling leaves flow or uses viewport-fixed offsets.

The toolbar adapts before switching to the hybrid layout:

- Filter labels disappear while the selected values remain visible.
- The search field becomes a search button that opens a compact field anchored to its relatively positioned search control.
- Chat text collapses to an icon at compact desktop widths.
- Search and chat remain available throughout the desktop state and hand off with the rest of the desktop toolbar at `880px`.

The filter and action groups may shrink, and dropdown labels may compress, but controls must not overflow the viewport or be positioned with coordinated `top`, `right`, or compensating margin values. Compact desktop behavior should remain one coherent toolbar state rather than a chain of overlapping breakpoint-specific offsets.

### Reading controls

Desktop presents separate dropdowns for:

- **View:** Reader, Expanded, Summarized, Summary Bullets when AI is enabled, and Headlines.
- **Show:** Daily briefing when AI is enabled, Unread, Favorite, Hot, Clicked, and Read.
- **Sort:** Oldest, Newest, Trust, plus Recommended, Quality, and Most Engaged when AI is enabled.
- **Grouping:** None, Events, and Topics when AI is enabled.

Each dropdown shows its active value directly in the toolbar and marks the selected option in its menu. Grouping is omitted entirely when AI is unavailable rather than showing nonfunctional choices.

Desktop is the only shell surface that directly offers Reader view. Reader is designed for the wider two-pane experience and is intentionally absent from the mobile options sheet.

### Search

At wide desktop sizes, search is an inline field with explanatory query syntax in its placeholder. On compact desktop widths, it becomes a button that opens the field below its own search control. Escape closes that compact field without clearing the stored query. The panel is locally anchored and never positioned relative to the viewport.

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

On phone layouts, the mobile toolbar uses two rows:

1. A brand row with the RSSMonster logo and name, article refresh, search control, and options gear.
2. A compact filter row for status, smart folders, and categories.

Phone typography and control sizing remain consistent across `0–767px`, avoiding abrupt orientation-driven changes around common device widths. The toolbar remains touch-friendly and uses ellipsis rather than allowing the brand to push actions off screen. In the `768–879px` hybrid state, the persistent sidebar supplies the brand, so the mobile toolbar becomes one compact row with equal-height filter controls and actions.

Scrolling down hides `.mobile-toolbar-surface`; scrolling up reveals it. Because the search panel is inside that animated surface, an open mobile search field hides and returns with the toolbar instead of remaining pinned over article content. The sticky container remains in place and retains stable geometry throughout the animation.

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

The search icon toggles a full-width field directly below the mobile toolbar. Escape or an outside pointer press closes it. Enter applies a non-empty query and closes the field. Search also closes automatically when the viewport expands into the desktop layout.

The current mobile behavior applies the shared search selection on every input change. Unlike desktop search, it does not currently debounce or validate query syntax before applying it. Enter therefore acts primarily as confirmation and dismissal rather than the first point at which the query runs.

Search geometry belongs exclusively to `MobileToolbar`. The article list does not bind a search-open class or compensate for the panel's height. External focus-search requests open and focus the toolbar-owned field.

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

The notification control reflects the browser's permission and Push subscription state:

- Enable notifications when permission has not yet been requested
- Requesting permission while the browser prompt is active
- Disable notifications after a Push subscription is active
- Notifications blocked when the browser has denied permission
- Notifications unavailable when the API is unsupported
- Home Screen app required when RSSMonster is open in an ordinary iOS/iPadOS browser tab
- Retry notification check after a transient configuration request failure

Opening the sheet never triggers a browser permission prompt. It refreshes an existing subscription on the server when present. Permission and a new Push subscription are requested only after an explicit user action. On iOS/iPadOS, the sheet explains that RSSMonster must be added to the Home Screen and opened there. Denied and unsupported states disable the control; transient checks can be retried, a missing subscription can be restored, and an active subscription can be disabled from the same control.

### Chat

When AI is enabled, the sheet can open or close the assistant. The sheet closes after the choice. Unlike the desktop chat control, the current mobile action does not clear the shared search draft.

## Shell capability map

| Capability | Desktop (`880px+`) | Hybrid (`768–879px`) | Mobile (`0–767px`) |
| --- | --- | --- | --- |
| Status and global counts | Show dropdown; counts remain in sidebar | Combined status menu; sidebar remains visible | Combined status menu with counts |
| Sort | Dedicated dropdown | Combined into status menu | Combined into status menu |
| Grouping | Dedicated AI-only dropdown | Combined into status menu | Combined into status menu |
| View mode | Dedicated dropdown including Reader | Options sheet without Reader | Options sheet without Reader |
| Smart folders | Persistent sidebar | Sidebar plus toolbar dropdown | Toolbar dropdown |
| Categories | Persistent sidebar with feeds | Sidebar plus toolbar/options navigation | Toolbar dropdown and options sheet |
| Individual feeds | Sidebar hierarchy | Sidebar hierarchy | Not exposed by shell controls |
| Search | Validated, debounced inline or locally anchored compact field | Immediate toolbar-owned field | Immediate toolbar-owned field |
| Chat | Toolbar action; clears search draft | Options-sheet action; retains search draft | Options-sheet action; retains search draft |
| Theme | Toolbar dropdown | Not exposed by compact shell | Not exposed by mobile shell |
| Full Settings | Toolbar gear | Not exposed by compact shell | Not exposed by mobile shell |
| Refresh feeds | Sidebar | Sidebar and options sheet | Options sheet |
| Add feed | Sidebar | Sidebar and options sheet | Options sheet |
| Notification permission | Browser behavior outside toolbar | Options sheet | Options sheet |

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
- The named mobile, hybrid, and desktop shell contract at `768px` and `880px`
- Grid-owned sidebar and main-pane geometry without fixed-width compensation
- Flow-based sticky toolbars with transforms confined to mobile toolbar content
- Desktop progressive compression before the hybrid breakpoint
- One explicit vertical scroll owner per surface and native scrollbar styling
- Toolbar and search geometry owned by toolbar components, not article collections
- Semantic stacking tokens instead of arbitrary z-index values
- Component-owned BEM structural naming instead of generic layout IDs
- Mobile safe-area support and background-scroll locking
- AI feature gating for briefing, Summary Bullets, AI sorting, grouping, and chat
- The distinction between live overview counts and smart-folder snapshots
- Search focus integration with the wider application
- Desktop query validation unless mobile and desktop behavior are intentionally unified
- Theme persistence rollback on failure
- Options API patterns and existing store selection contracts
- Light and dark theme parity

When adding a new control, first decide whether it is a high-frequency reading action, a navigation dimension, or a secondary management action. That determines whether it belongs in the desktop toolbar, compact/mobile toolbar, mobile Options sheet, sidebar, or full Settings workspace. Then verify its ownership in all three shell states without introducing spacers, viewport-fixed sibling positioning, or article-content compensation.
