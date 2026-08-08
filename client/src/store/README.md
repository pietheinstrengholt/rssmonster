# Client Store

## Purpose

The client store is the shared state boundary between RSSMonster's API data, article-selection behavior, and application presentation. It keeps unrelated concerns in focused Pinia domains so components can depend only on the state they actually need.

The store is not a second database and is not the authority for persisted server records. It provides:

- A coherent in-memory view of the authenticated session
- One normalized article selection shared by desktop and mobile
- Cached navigation structure, counts, Smart Folders, and tags
- Immediate reconciliation after common article and subscription mutations
- Resource loading and failure state for recoverable UI
- Application-wide presentation flags and fatal-error state
- Protection against stale requests and data leaking between users

There is no monolithic compatibility store. Consumers should use the focused ownership domain appropriate to their task rather than recreating a global all-purpose state object.

## Ownership domains

| Domain | Owns | Does not own |
| --- | --- | --- |
| Authentication | Active token, user role and identifier, session-transition generation, and synchronization with the shared API client | Cookie persistence, login form state, or user profile data |
| Selection | Article status, navigation scope, query, tag, sorting, view mode, grouping, score thresholds, AI capability, developing-event choice, and briefing filter state | Category/feed records, counts, modal visibility, or the local search input draft |
| Overview | Category and feed hierarchy, global and hierarchical counts, Smart Folders, Top Tags, unread-arrival delta, and their resource states | The active selection, authentication, or dialog state |
| UI | Active dialog identifier, assistant visibility, mobile-search visibility, search input draft, selected theme mode, and fatal application error | Article query semantics, server resource collections, or authentication authority |

A small shared resource contract converts transport failures into stable diagnostics containing a message, optional error code, and optional HTTP status. This prevents UI surfaces from depending on raw client-library error shapes.

## Initialization and lifetime

Pinia is installed before any stateful component mounts. Each focused domain is created from the same Pinia instance and remains independently mutable and observable.

Store state is in memory for the current browser session. No Pinia persistence plugin writes the stores wholesale to local storage. Persistence is deliberately handled elsewhere:

- The authentication token is stored in a cookie by the root flow and applied to the shared API client by the authentication store.
- User settings and domain records are persisted through their APIs.
- The theme preference is also mirrored through the theme service and browser storage.
- Article search requests may persist supported reading preferences on the server.

On application startup, a saved token is validated before authenticated state is accepted. After authentication, persisted settings load before the initial overview so the first counts, status-scoped tags, and article query use the user's effective configuration.

## Authentication and session isolation

Authentication state contains the current token, role, and user identifier. The role drives administrator-only presentation, while server authorization remains authoritative.

Every authentication attempt belongs to a session generation. If an older validation or login response arrives after a newer attempt, logout, or user change, it is ignored.

Changing from one non-empty token to another first clears the previous user's state. Logout or session expiry performs one coordinated reset:

- Authentication and role are cleared.
- Selection returns to defaults.
- Categories, feeds, counts, Smart Folders, and tags are removed.
- Dialog, assistant, search, theme, and fatal-error presentation state are reset.
- All in-flight settings and overview resource generations are invalidated.

Request-generation counters survive the state reset at their newer values. This is essential: a late response from the previous user must never repopulate a cleared store or overwrite the next user's state.

The authentication store applies or clears the shared API authorization header whenever its session changes. The root authentication flow owns cookie persistence and delegates every accepted login, restored session, logout, and expiry transition to that store.

## Article selection

The selection domain represents the complete input used to fetch and present an article collection.

The default selection is:

- AI features unavailable until settings say otherwise
- Unread status
- All categories and all feeds
- No free-text query, tag, or Smart Folder
- Zero score thresholds
- Newest-first sorting
- Expanded article presentation
- No semantic grouping
- Developing-event inclusion disabled
- No briefing revision

Category and feed identifiers are stored as strings in navigation state. A percent wildcard means all values. Overview records can contain numeric identifiers, so ownership lookups and structural mutations must tolerate numeric/string identifier equivalents.

Only supported settings fields are accepted when hydrating selection from a server response. Unknown response properties must not be copied into the selection simply because the endpoint returned them.

### Atomic transitions

Navigation transitions update all related fields together so watchers never observe an incoherent intermediate state.

| User intent | Resulting behavior |
| --- | --- |
| Select a status | Keeps category, feed, tag, sort, grouping, and view; clears Smart Folder; replaces the active query with the briefing query for Daily Briefing or clears it for ordinary statuses |
| Select a category | Keeps status, sort, grouping, and view; selects all feeds in that category; clears tag, query, and Smart Folder |
| Select a feed | Keeps status, sort, grouping, and view; selects its parent category; clears tag, query, and Smart Folder |
| Select a tag | Keeps status, sort, grouping, and view; returns to all categories and feeds; clears query and Smart Folder |
| Enter a free-form search | Keeps existing navigation scope and status; clears the tag because tag and free-form query are competing text filters |
| Select a Smart Folder | Returns to all categories and feeds, forces Unread and Newest, clears tag, and applies the saved query plus its optional result limit |
| Clear a Smart Folder through Smart Folder navigation | Returns to the same all-category, all-feed, Unread, Newest baseline with no saved query |
| Change explicit sort | Normalizes unsupported values to Newest and removes any embedded sort instruction from the query |
| Change view mode | Changes presentation without changing article membership |
| Change grouping | Restricts grouping to none, event, or topic; invalidates any older tag request and refreshes overview data |

Most selection changes close the assistant because the article collection and assistant are alternative content contexts. Callers should not manually reproduce this side effect.

The local search input draft belongs to UI state and is separate from the active selection query. This allows validation and debouncing on desktop, but it also means clearing or changing one value does not automatically change the other unless the interaction explicitly applies it.

## Daily Briefing selection

The selection domain keeps the subset of briefing preferences needed to construct the active article query:

- A 24-hour or seven-day period, with seven days as the default
- Whether only unread articles are included
- Whether high-trust ordering is preferred

When Daily Briefing is selected, these values produce the briefing marker, date filter, optional unread filter, and optional trust-boosted recommended sort used by article search. If a relevant preference changes while Briefing is active, the query is rebuilt.

Other briefing preferences are enforced by the server and may not appear in query text. A numeric briefing revision invalidates the active collection after those non-query preferences change, allowing consumers to reload without inventing a fake query term.

Briefing count data received with an overview also refreshes the selection-owned briefing filter snapshot. This keeps server preferences, sidebar count behavior, and future Briefing selections aligned.

## Overview and navigation data

The overview domain owns the shared navigation hierarchy and the counts projected into Sidebar and Shell:

- Categories and their feeds
- Daily Briefing, Unread, Read, Favorites, Hot, and Clicked global totals
- Read, unread, favorite, hot, and clicked totals for categories and feeds when returned by the server
- Smart Folder definitions and result-count snapshots
- Top Tag snapshots for the active grouping
- The difference between the latest unread total and the previous overview total

Category and feed responses normalize read, unread, favorite, and feed-error counters to finite nonnegative values, and missing feed collections become empty collections. Count-preserving structure refreshes also normalize the five displayed article-status dimensions while merging cached values.

Direct authoritative responses currently rely on the server to return valid Hot and Clicked category/feed values and valid global totals. Those fields are not all passed through the same client-side normalization as read, unread, and favorite. Future changes should preserve the server contract or extend normalization consistently rather than assuming every incoming counter is already guarded by the client.

The selected category and feed are derived by combining selection-owned identifiers with overview-owned records. Wildcards or missing records produce no selected entity rather than a fabricated placeholder.

## Two-stage overview loading

The preferred overview path separates structure from expensive counts:

1. Persisted settings are loaded on initial entry.
2. A lightweight category/feed hierarchy is published quickly.
3. Existing successful counts are merged onto matching category and feed identifiers so navigation does not flash to zero.
4. Authoritative global, category, and feed counts load in the background.
5. The count response replaces the complete normalized count snapshot.

This separation keeps navigation responsive while protecting previously displayed counts. A structure-only response must not erase count fields. If a count request fails, the last successful counts remain visible and the count resource enters an error state that can be retried independently.

A complete overview path also exists for responses that contain structure and counts together. Both paths apply the same normalization, briefing synchronization, assistant-closing behavior, and unread-delta rules.

Initial and forced refreshes reset the unread-arrival delta to zero. Ordinary background overview updates compare the new global unread total with the previous total. Only positive increases are used for new-article prompts and notifications; a decrease is a count reconciliation, not a new-arrival event.

## Smart Folders and Top Tags

Smart Folder definitions and Smart Folder counts are separate resources. Definitions publish first with a safe count fallback, then counts refresh in the background. A count failure retains the loaded folders and their last known counts.

Top Tags are fetched for the active Daily Briefing, Unread, Read, Favorites, Hot, or Clicked collection. Changing article status requests a new ranked snapshot whose counts represent matching articles, independent of event or topic grouping. Daily Briefing preference changes refresh its snapshot so its period and eligibility rules remain aligned with the article collection. If selection context changes again before an older response arrives, only the newest response may update the store.

Smart Folder and Top Tag counts are snapshots. They do not reconcile on scrolling, article opening, or every read/favorite transition. Explicit refreshes and relevant management operations replace them.

## Resource-state contract

Settings, overview structure, overview counts, Smart Folder structure, Smart Folder counts, and Top Tags each have independent lifecycle state:

- **Idle** means no active result is being requested.
- **Loading** means a request is in flight while any cached data remains usable.
- **Success** means the latest applicable request completed.
- **Error** means the latest applicable request failed and a normalized diagnostic is available.

Starting a retry clears only that resource's prior error. Resource failures do not automatically clear cached successful data.

Primary startup resources report failures to the application shell so it can distinguish authentication, offline, timeout, and overview failures. Background enrichment resources contain their own failure, preserve the current snapshot, and expose retry state to their UI.

Resource errors are not the same as fatal application errors. A sidebar count or tag failure is recoverable in place. Fatal errors represent conditions that replace the main application content, such as an unreachable backend or unusable overview.

## Request ordering

Every asynchronous resource has a monotonically increasing request generation. Only the response belonging to the newest generation may update data, status, or error state.

This protects against:

- A slow older count response replacing newer totals
- A failed older request replacing a newer success state
- Old grouping tags replacing tags for the current grouping
- Older Smart Folder counts replacing a newer refresh
- Initial overview work continuing after an explicit reload begins
- Any previous user's response mutating the next user's session

Request ordering applies equally to successes and failures. Ignoring stale data while still allowing a stale promise to reject is acceptable as long as it cannot change current state.

## Immediate count reconciliation

The server overview is authoritative, but common mutations update cached counts immediately so navigation reacts without waiting for the next poll.

Read-state transitions reconcile unread and read totals at three levels:

1. Global overview
2. Owning category
3. Owning feed

While an unread-only Daily Briefing is active, a scroll-reading transition also
decrements the global, owning-category, and owning-feed Briefing counters once
for the displayed event group. Briefings that include read articles leave these
counters unchanged.

Favorite transitions reconcile the favorite total across the same hierarchy. Deltas can represent one or several articles and are clamped at zero. A no-op transition must not change a count.

If the owning category or feed cannot be found, hierarchical reconciliation stops and a diagnostic is logged. The next authoritative overview refresh repairs any drift.

Subscription mutations keep the cached hierarchy coherent:

- New or updated categories are normalized and inserted or replaced by identifier.
- Category display fields can update without replacing their feeds and counts.
- Category ordering changes immediately while persistence remains the caller's responsibility.
- Feeds can be inserted, replaced, removed, or moved between categories.
- Moving a feed subtracts its contribution from the source category and adds it to the destination without changing global totals.
- Removing a category or feed subtracts its contribution from applicable global and category totals.

Current immediate organizational reconciliation covers read, unread, and favorite counts. Hot and clicked contributions are carried in authoritative overview snapshots but are not adjusted by local category/feed move or removal bookkeeping. Those dimensions rely on the next overview refresh after subscription changes. Future work should expand the local reconciliation deliberately if all five dimensions must update before that refresh.

## Feed refresh state

Feed refresh is application-domain state rather than Sidebar state. The feed-refresh store owns the current job identifier, running and completion state, progress metrics, bounded logs, fallback behavior, delayed completion presentation, and generation guards. Sidebar, mobile options, empty states, and AppShell consume this shared state without mounting one another to reach the refresh controller.

The streaming service owns authenticated SSE transport, wire-format parsing, reconnect timing, and connection teardown. The store interprets named domain events and decides how they affect refresh progress. Successful live completion increments a generation observed by AppShell, which then performs the existing overview and article reload. Session reset closes transport resources and invalidates startup, fallback, stream, and timer callbacks from the previous user.

## UI state

UI state contains ephemeral application presentation rather than content-domain data.

Globally routed dialogs share one active identifier. An empty identifier means no routed dialog. The application shell resolves supported identifiers to lazily loaded dialog content; arbitrary values must not cause arbitrary components to mount. The desktop Settings workspace owns its visibility locally and is separate from this routed-dialog slot.

Assistant visibility is shared so desktop, mobile, selection changes, and the application shell agree on whether articles or chat occupy the main area.

Mobile-search visibility allows article layouts to adjust while the mobile search panel is open. The search input draft is shared between desktop and mobile controls but remains distinct from the applied article query.

Theme mode records System, Light, or Dark presentation selected for the current session. Applying and persisting the theme remains the theme service and toolbar's responsibility.

Fatal error state is reserved for application-level replacement surfaces. Recoverable action notices and most local form errors remain owned by their initiating workflow rather than becoming global store state.

## Cross-domain coordination

Focused ownership does not mean the domains never coordinate. Coordination occurs only where a business transition crosses boundaries:

- Authentication reset invalidates and clears selection, overview, feed-refresh, and UI state.
- Loading persisted settings places theme in UI ownership and article filters in selection ownership.
- Overview responses synchronize briefing filter metadata into selection ownership.
- Status changes refresh status-scoped tags, while grouping changes refresh overview counts and invalidate any older tag request.
- Selection changes normally close the assistant through UI ownership.
- Briefing preference saves refresh authoritative overview counts.

Do not duplicate the same source of truth in multiple domains merely to avoid this coordination. When a cross-domain effect is required, keep the owning state in one place and make the transition explicit.

## Maintenance expectations

Future store changes should preserve:

- Focused domain ownership with no global compatibility bridge
- Options-style Pinia stores
- Atomic selection transitions
- The distinction between search draft and applied query
- Numeric/string identifier compatibility at API boundaries
- Nonnegative normalized counters where the client owns normalization, with explicit server contracts for the remaining authoritative fields
- Fast overview structure with protected background count loading
- Cached data retention during recoverable failures
- Independent resource status and retry behavior
- Latest-request-wins ordering for both success and failure
- Complete cross-user reset and stale-response invalidation
- Immediate global/category/feed reconciliation for supported mutation dimensions
- Authoritative overview refresh as the final repair mechanism

When adding state, first identify its owner. Authentication facts belong to authentication, article membership and presentation choices belong to selection, server navigation snapshots and counts belong to overview, and transient application chrome belongs to UI. If no existing domain clearly owns it, reconsider whether it should be component-local before creating another global concern.
