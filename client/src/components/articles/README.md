# Articles

## Purpose

The article area is the primary browsing and reading surface in RSSMonster. It turns the active feed, category, status, tag, search, briefing, or smart-folder selection into a navigable collection of articles.

The experience is designed for two related activities:

- Scanning many articles quickly to decide what deserves attention.
- Reading selected articles with enough context to understand their source, relevance, and relationship to other coverage.

The interface should feel calm, dense, and content-first. Titles and article content have priority over controls. Status, relevance, and organization are communicated with compact icons, labels, and subtle selection states rather than decorative cards or large interface elements.

## Experience model

The article area has three layers:

1. The collection, which represents the current selection and loads articles incrementally.
2. The layout, which determines how the collection is browsed and read.
3. The article presentation, which combines the title, context, signals, media, and content available for one article.

Changing the current selection starts a new collection. Results from an earlier selection must not replace the newer one if they arrive late. Related and duplicate articles can be temporarily inserted into the collection, but they remain visually and behaviorally connected to the article from which they were opened.

## Layouts and reading modes

### Full stream

The full stream presents complete articles one after another. It is intended for continuous reading and preserves the full header, metadata, relevance signals, media, and available article body.

Articles are separated with restrained dividers. Related articles inserted below a parent receive a distinct but subtle background so the grouping is visible without interrupting the reading flow.

### Summarized stream

The summarized stream keeps the same article context while shortening the body to a plain-text preview. It is intended for faster scanning when full source content would be too long.

### Summary bullets

The bullet-summary view presents extracted summary points instead of the full body. When no summary is available, that absence is stated directly.

For unread articles with a predicted reading affinity, the amount of summary detail can vary. Articles expected to deserve deeper attention show more detail, while skimmable items show less. Low-affinity items can suppress a lead image so visual weight follows expected relevance. This adaptation is a reading aid, not a permanent mutation of the article.

### Compact list

The compact view emphasizes headlines. Each row contains an explicit read-state control, the feed identity, title, concise metadata, time, favorite control, and an overflow menu. Read rows are visually quieter than unread rows.

Selecting a row expands its available content beneath the headline. Opening another row closes the previous reading context and treats the previous article as reviewed. A compact row without usable preview content says so and provides a direct route to the original article.

The compact view is optimized for higher-volume browsing and therefore loads larger groups of articles than content-heavy modes.

### Desktop reader

On wider desktop screens, reader mode uses a two-pane layout. The left pane is a scrollable article list and the right pane displays the selected article in full. The list occupies a substantial but secondary portion of the screen so scanning and reading can happen without navigation away from the collection.

The list header summarizes the active collection with its name, unread total, event total, source total, and the most common visible tags. Tags can be selected directly to refine the collection. A collection-level menu provides bulk actions for:

- Marking all currently loaded articles as read.
- Marking articles older than the selected article as read.
- Marking articles above or below the selected article as read.
- Favoriting all currently loaded articles.
- Marking all currently loaded articles as clicked.

Changing the selected reader article marks the previously selected unread article as read. The first available article is selected automatically when a new non-empty collection is opened.

Reader mode is a desktop enhancement. On smaller screens it falls back to the normal article stream so the content does not become constrained by two narrow panes.

## Collection loading

Collections load incrementally. The initial response can include the first articles immediately, and more details are fetched as the user approaches the end of the rendered list. Loading begins before the exact boundary is reached to keep scrolling continuous.

The collection keeps its complete ordered set separate from the articles currently rendered. This supports large selections without requiring every full article payload at once.

Starting a new selection resets pagination, visible-article tracking, temporary related articles, and session-level read bookkeeping. The new collection is isolated from any request still completing for the old selection.

## Article header

The article header presents the title as a link to the original publication. Opening that link records that the article was clicked.

Compact icons before the title explain the article type or why it may deserve attention. They can identify:

- Recognized social, publishing, development, or podcast sources.
- Video content.
- A developing story.
- Previous clicks.
- Favorite or hot status.
- Recommendation relevance.
- Membership in a larger event or topic.

Source-specific and media-specific icons take precedence where they explain the format more clearly than a generic relevance icon. The intent is to provide fast recognition without turning the header into a crowded badge row.

Reader mode also keeps the current read state available beside the article actions.

## Article actions

The three-dot menu holds actions that should remain available without occupying the main reading surface. These include:

- Marking or unmarking a favorite.
- Marking an article as not interesting.
- Asking for more or less content like the current article.
- Ignoring the current topic.
- Muting the feed for seven days after confirmation.

Marking an article as not interesting removes it from the current rendered collection. Favorite and clicked changes are reflected in the article and in applicable collection counts. Repeated input is ignored while the same change is still being saved, preventing accidental double updates.

On mobile portrait screens, swiping an article to the right reveals a favorite action. Crossing the action threshold toggles favorite state; ordinary vertical scrolling must not trigger it. Links and controls inside the article remain independently usable.

## Metadata and labels

A horizontal metadata area follows the title. It provides concise context such as:

- Relative publication time.
- Author or feed name, linked to the feed's origin.
- Number of distinct sources covering an event.
- Similar-article count.
- Duplicate count.
- Rule-assigned tags.
- Category and regular tags.
- Quality, advertising, sentiment, and writing-quality assessments.

Category and tag labels are navigation controls. Selecting one changes the article collection to that context.

Assessment labels are shown when they provide information beyond the neutral baseline. On small portrait screens, some assessments become compact icons to protect space. Their meaning remains available through accessible labels or explanatory text.

## Relevance signals

An article can include a secondary signal bar for stronger relevance evidence. Current signals communicate:

- High overall or recommendation quality.
- Trending or major-event coverage.
- An official source.
- A trusted source.

Where useful, official and trusted-source labels identify the organization or feed. A major-event signal takes precedence over the weaker trending signal. These signals explain why an article may matter; they should never compete visually with the title or body.

## Similar, event, topic, and duplicate articles

Similar-article labels are interactive when grouping is active. Selecting one reveals the other articles from the same event or topic immediately below the parent article. Selecting it again collapses that group.

If a related article already exists elsewhere in the loaded collection, it is moved into the expanded group instead of being displayed twice. Server ordering is retained, and the parent article itself is not repeated among its children.

Duplicate labels behave similarly. They reveal duplicate versions directly after the canonical article and collapse them on a second selection.

Related and duplicate rows are supporting context. Their presentation should make the parent-child relationship understandable while still allowing each article to be read and acted on normally.

## Content and media

The article body is assembled from the best available content, with article text preferred and the feed description used as a fallback.

Presentation depends on the active reading mode and on whether meaningful text, images, summaries, or video metadata are available:

- Full and reader modes render the available rich article content.
- Summarized mode presents a shortened plain-text version.
- Bullet mode presents the available summary points.
- Compact mode reveals rich content only for the opened row.

If no usable preview exists, the interface does not leave an unexplained blank area. It states that no preview is available and offers the original article instead.

### Images

An article image is used as a fallback lead image only when the article has readable text and that same image is not already present in the body. This prevents duplicate imagery.

Known or discovered image dimensions guide the presentation:

- Wide, substantial images can become lead images.
- Portrait images can sit beside opening text.
- Smaller or near-square images use a compact thumbnail treatment.
- Tracking pixels, extreme aspect ratios, very small images, and failed images are hidden.

Images remain constrained to the reading width and become single-column on small screens. Their original proportions should be respected.

### Video

Video articles use a poster-style presentation with a thumbnail when available, a clear play affordance, and optional provider and duration information. The poster opens the original media destination, falling back to the article itself when necessary.

Recognized embedded video references inside article content are presented as responsive players. Media navigation and image loading accept normal web destinations only.

## Viewport-aware reading state

Article exposure is tracked so the application can assist with read status without requiring constant manual input.

When an article first becomes visible, its visible interval begins. Multiple visible intervals can be accumulated until the article's first completed viewing interaction is saved. Once persisted:

- The first-seen value is retained and must not be replaced by later appearances.
- The captured visible duration is retained and must not be rewritten by later appearances.
- The article is treated as read when the viewing interaction completes.

In continuous stream modes, completion occurs when a previously visible article has been passed above the viewport. Temporary disappearance below the viewport does not by itself mean the article was reviewed. Saving the seen state is retried a limited number of times when a transient failure occurs, and local read state is reconciled with the saved result.

Compact and desktop reader modes use deliberate selection changes as the completion signal. Opening another compact article or selecting another reader article marks the previously open unread article as read.

Users can explicitly switch any article between read and unread with the available status control or keyboard action. Explicit choices take precedence over passive observation. Marking an article unread does not erase its historical first-seen value or captured viewing duration, and later viewport changes must not silently reverse the user's deliberate choice.

Bulk read actions are explicit and can update the loaded collection or a relative portion of the reader list. Collection counts are refreshed after these actions so navigation and article state remain consistent.

## Keyboard interaction

Keyboard navigation supports high-volume reading without requiring pointer movement:

- Down Arrow or `J` moves to the next article.
- Up Arrow or `K` moves to the previous article.
- Enter or `O` opens the selected original article.
- `M` or `R` toggles read status.
- `S` toggles favorite status.
- Uppercase `R` refreshes the current collection.
- `/` moves focus to search.

Shortcuts do not run while the user is typing, editing content, using a modified key combination, or interacting with another control. Selected rows remain focusable and are kept within the visible area as keyboard navigation moves.

## Collection context

Daily briefing collections include briefing-specific context before their articles.

Unread collections can show how many unread articles and distinct sources are represented and provide a route to tune the unread selection. This context is hidden on narrow mobile screens where reading space is more valuable.

Smart folders have an overview that presents saved query-based collections as a responsive grid. Each folder shows its name and query and opens the corresponding article selection. When no smart folders exist, the overview explains their purpose rather than showing an empty grid.

## Loading, empty, and end states

The article area always explains what is happening:

- While a collection loads, a lightweight branded loading state and article-shaped placeholders preserve the expected layout.
- When no articles match, the empty state offers clear filters, refresh feeds, and explore smart folders as recovery paths.
- When every article has loaded, the end state confirms completion.
- At the end of an unread collection, the user can explicitly mark the remaining reviewed articles as read or dismiss the suggestion.
- If new unread articles arrive after completion, the collection offers an explicit refresh instead of changing position unexpectedly.

Motion in loading and completion states is restrained and respects reduced-motion preferences.

## Responsive and visual intent

The article experience adapts rather than merely shrinking:

- Desktop reader mode becomes a single stream below its wide-screen breakpoint.
- Compact rows remove nonessential source decoration on narrow portrait screens.
- Metadata and scoring become denser on mobile.
- Lead images stop wrapping beside text when the screen is too narrow.
- The mobile toolbar hides while scrolling down and returns when scrolling up, keeping attention on content without removing navigation permanently.

Light and dark themes must preserve the same hierarchy, selection clarity, readable contrast, and distinction between parent and related articles.

All controls need a meaningful accessible label. Selection and read state must not rely on color alone. Empty content, missing images, unavailable summaries, and failed requests should result in understandable fallbacks rather than broken or silent surfaces.

## Behavioral principles

Future changes should preserve these rules:

- Keep content and titles dominant over interface chrome.
- Make every collection state understandable and recoverable.
- Preserve the distinction between full, summarized, bullet, compact, and reader experiences.
- Load large collections incrementally without mixing responses from different selections.
- Explain article relevance with concise, secondary signals.
- Keep related and duplicate coverage next to its parent without duplicating rows.
- Adapt media to its usefulness and available dimensions.
- Record first-seen and visible-duration history once.
- Use passive observation only for the initial reading transition.
- Preserve explicit read, unread, favorite, and filtering choices.
- Keep pointer, touch, and keyboard behavior consistent with the same article state.
