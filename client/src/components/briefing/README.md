# Daily Briefing

## Purpose

The briefing area presents a focused, event-aware reading collection assembled from recent articles. It gives the user a concise explanation of the selected material, highlights the strongest current stories, and provides controls for tuning what qualifies for the collection.

The implementation has three related responsibilities:

- Displaying reusable selection context, such as article and source totals
- Presenting the Daily Briefing context and morning story summary above the article list
- Loading and saving the authenticated user's briefing preferences

The Daily Briefing is surfaced in desktop and mobile status navigation when AI features are enabled. It remains an article collection rather than a separate page, so the normal list, reader, pagination, read-state, and article-action behavior still applies beneath the briefing introduction.

## Daily Briefing selection

Selecting Daily Briefing changes the active article status to the briefing collection and uses the user's saved briefing configuration. Status selection does not inherently discard an existing category, feed, or tag scope, so the visible article list can be narrower than the global briefing.

The default briefing:

- Considers the last seven days
- Includes both read and unread articles
- Does not require interest matching or developing-event membership
- Allows events covered by a single source
- Does not prioritize high-trust coverage

The selection period is persisted as either `24h` or `7d`; `7d` is the default. The Daily Briefing preference record is one-to-one with its owning user. A user must never have multiple briefing preference rows.

The saved eligibility preferences feed the article search, briefing count, context statistics, and story summary. The Briefing-specific developing-events preference is presentation-only: it selects developing coverage for the morning summary without changing article-search results. Their navigation scope is not identical: the sidebar count and structured introduction describe the user's global briefing across subscriptions, while the visible article list can also be narrowed by an active category, feed, or tag. The briefing respects the user's global article score thresholds and normal article safety and filtering rules.

## Briefing introduction

The briefing introduction appears above articles in both the standard list and desktop reader layouts. It is also shown with the empty state when a briefing has no matching articles.

The introduction contains two areas:

1. A context strip describing how many eligible articles and distinct feeds contributed to the briefing, plus the number of newly created events and connected topics.
2. A morning summary titled “The stories shaping your morning.”

The morning summary contains up to four distinct event stories. Stronger events are presented first, with representative publication time used as a secondary ordering signal. Each item uses the event name when available, otherwise the representative article title, and may include a concise excerpt derived from the representative article.

Summary excerpts are structured from stored article text. Repeated titles, media credits, continuation prompts, forum calls to action, and other low-value publisher boilerplate are excluded where possible. Missing or unsuitable source text results in a headline without an excerpt rather than invented summary content.

In the standard article-list layout, headlines and available excerpts are displayed. Reader mode intentionally keeps the introduction compact and shows the context and morning-summary heading without the detailed story list. On narrow portrait screens, excerpts are hidden while headlines remain visible.

The introduction has separate loading, empty, and failure messages for its context and summary. A briefing-summary failure does not replace or block the article list.

## Selection context

The context strip is a reusable informational pattern shared with the unread collection. It can show:

- A loading message
- Article and distinct-source totals
- Additional collection-specific details
- A temporary failure message
- An empty-context message
- An action that opens the appropriate tuning dialog

Counts use locale-aware number formatting and correct singular or plural labels. Context is informational and does not itself mutate article state.

For Daily Briefing, the tuning action opens Briefing Preferences. For the unread collection, the same presentation opens unread-selection configuration. Changes to this shared presentation must therefore remain neutral enough to work in both contexts.

## Briefing Preferences

Briefing Preferences is a dedicated modal for defining the Daily Briefing candidate set and ordering.

The modal loads the authenticated user's effective preferences when opened. If no saved record exists, server defaults are returned. Unsaved changes remain local to the modal. Cancel, the close button, and Escape close the modal without persisting the draft.

### Article selection

The available article-selection controls are:

- **Only unread articles** excludes articles already marked as read.
- **Mark as read while scrolling** automatically marks briefing articles as read after they pass the viewport. It is available only when the unread-only filter is enabled.
- **Developing events** includes new coverage for events the user has already seen.
- **Show only interest-matched articles** restricts eligibility to positive interest matches.
- **Show only developing stories** restricts eligibility to unread articles selected as an event's developing article when that differs from its representative.

The two “show only” choices are mutually exclusive. Enabling one disables the other in the draft, and the server rejects any payload that enables both. This exclusivity is a business rule and must remain enforced in both the interface and persistence layer.

The briefing scrolling preference is independent from the equivalent unread-selection setting. Disabling “Only unread articles” hides and clears the briefing preference, and the server rejects a saved enabled value without unread-only filtering.

“Developing events” and “show only developing stories” have different meanings. The former selects continuing coverage for morning-summary events without changing the article list. The latter applies the exact `isDevelopingStory` conditions and forces event grouping with developing-event selection. Users can apply `developing:true` when they explicitly want the same developing-story condition in a normal search.

The developing-events preference is stored independently from the wider user setting and never updates the generic article selection.

### Selection period

The lookback period controls how far RSSMonster searches for relevant developments:

- **Last 24 hours** provides the more focused current view.
- **Last 7 days** provides broader weekly coverage.

Only these two stored values are valid. Changing the period updates both the article query and the structured briefing context after a successful save.

The current article query and structured introduction interpret `24h` through the application's “Today” date window, while the overview count uses a rolling one-day interval. Around midnight these surfaces can temporarily describe slightly different windows. Future changes should align that interpretation before assuming the label, count, and article results are exactly equivalent.

### Coverage quality

Minimum distinct sources requires an eligible event to be represented by a chosen number of separate feeds. The current interface offers values from one through five sources. Higher values favor stories corroborated across more subscriptions but can substantially reduce the briefing.

Prioritize high-trust coverage uses recommended ordering and adds the feed's bounded trust score to each article's runtime recommendation score. It affects priority rather than acting as a strict trust cutoff. The structured morning summary currently keeps its own deterministic event-strength ordering and does not use the trust-priority preference.

### Saving

Saving replaces the complete preference set for the current user. Partial preference payloads are not the persistence contract.

During a save, duplicate submission is disabled. A failed save keeps the modal open, preserves the draft, and shows an error. A successful save:

- Applies the saved period, unread and scrolling choices, trust priority, and article-type filter to the current Briefing selection
- Invalidates the currently displayed structured briefing so it reloads
- Requests refreshed overview counts
- Closes the modal

Interest matching, strict event-only filtering, and minimum-source changes may not be visible in the simple article-query text. They still trigger a briefing revision so the article list and structured summary are fetched using the newly persisted server preferences.

Reset to defaults restores the local draft to a seven-day briefing with one required source and all optional eligibility, scrolling, developing-event, and trust settings disabled. The reset is persisted only when Save Changes succeeds.

## Data refresh behavior

The briefing has related but distinct data surfaces:

| Surface | Source and refresh behavior |
| --- | --- |
| Article list | Reloads through the normal article-selection flow when briefing selection or preferences change; category, feed, and tag scope can further narrow it |
| Sidebar and toolbar count | Comes from global overview count data and refreshes after preference saves and normal overview updates |
| Context statistics | Comes from the global structured briefing response and reloads when the effective period, unread state, or briefing revision changes |
| Morning summary | Comes from the same global structured briefing response as context and follows the same refresh signature |
| Preference draft | Loads from the per-user preference endpoint each time the modal is created |

Late responses from an older briefing or preference request must not overwrite a newer selection or an unmounted view. Loading state belongs to the active request only.

Scrolling, opening an article, or switching between articles does not independently refetch the structured briefing. Article actions can still change the underlying eligibility and counts through the normal application state; the next relevant overview or briefing refresh reconciles the displayed snapshot.

## Empty and failure states

An empty briefing is a valid result. It can occur because the lookback period is narrow, only unread articles are allowed, source diversity is too strict, or an interest/event filter excludes all candidates. The introduction remains available so the user can understand and tune the selection.

Structured briefing failures are recoverable presentation failures. The article list remains usable even when context or the morning summary cannot load.

If preference loading fails, the modal reports the failure and disables both Save Changes and Reset to defaults. This prevents the displayed fallback draft from replacing valid server preferences. Closing and reopening the modal starts a new load attempt.

## Current limitations

The preferences modal closes on Escape but does not currently provide the full focus-trapping and focus-restoration behavior of the main Settings dialog. Any accessibility improvement should preserve Cancel and unsaved-draft semantics.

## Maintenance expectations

Future briefing changes should preserve:

- Per-user ownership and the one-row-per-user preference invariant
- The `24h` and `7d` period contract with `7d` as the default
- Mutual exclusivity of interest-only and developing-event-only filters
- Clear separation between including continuing coverage and requiring the current developing story
- Consistent saved eligibility rules across article results, overview counts, context, and morning summary, while preserving their documented scope differences
- Deterministic, source-grounded morning summaries with no invented text
- Separate loading, empty, and failure states
- Stale-request protection when selection or preferences change
- Options API and existing modal-state patterns
- Responsive and dark-mode presentation
