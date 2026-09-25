# Interest Islands in Settings

The user-facing Island overview lives in Settings → Islands. The existing Island Insights introduction remains at the top. The overview below it uses the [Interest API](interests-api.md) for summary counts, search, polarity and lifecycle filters, sorting, and evidence. Active is selected when the page opens. Search is debounced by 300 ms; superseded requests are canceled. Only Active and Archived lifecycle states are supported. See the [user guide](interest-islands.md#inspecting-your-islands) and its updated Settings screenshot for the visible controls.

Inspect opens the existing contextual `InterestInspector` beside the list on wide screens and in `BaseDialog` on smaller screens. It fetches `GET /api/interests/:id` on selection and cancels obsolete requests. The inspector shows polarity, lifecycle, activity, evidence, and representative articles. Example articles open in the current reader through its existing supplemental retrieval. Merely inspecting an interest does not write article state or behavioral evidence.

Each Island row offers Mute or Unmute without changing its Active/Archived lifecycle or reloading the overview. Muted Islands remain visible with a badge and keep their evidence and normal maintenance, but no longer participate in future Island-based interest scoring. Unmuting restores scoring participation for subsequent calculations. Neither toggle rescans or rescores previously scored Articles.

When a recommended article attributes its promotion to an Island, its “Why recommended” explanation links the Island name to Settings → Islands. The page opens on Active and inspects that Island. Explanations without an Island ID keep the name as plain text.

The standalone `/interests` page and its sidebar and mobile menu entries have been removed. `SettingsIslands.vue` owns the list state, `InterestInspector.vue` owns detail state, and `api/interests.js` owns the API calls. The old Settings Island overview API remains available for other consumers but is no longer used by this page.
