# Hotness contract

An article is hot when at least one accepted article belonging to the same user,
but from a different feed, links to its normalized URL.

- `hotlinks` is the number of matching observations.
- `hotInd = hotlinks > 0`.
- Same-feed links do not count.
- Filtered and duplicate articles do not produce observations.
- Hotness uses the existing 14-day window. Moving to a seven-day window is a
  separate product decision.

Reconciliation clears `hotInd` and `hotlinks` when an article ages outside this
window. Persisted hotness therefore remains consistent for API filters, counts,
and other consumers that do not apply their own date restriction.

Publisher revisions replace their outbound observations, so end-of-crawl
reconciliation can decrement or clear affected target articles. Scheduled
observation cleanup deletes expired observations and reconciles the affected
users in the same transaction, allowing a failed cleanup to be retried safely.
The `npm run hotlinks` repair command invokes this same reconciliation service
for every user that owns articles.

Each reconciliation logs the user ID and the numbers of articles inspected,
changed, made hot, currently hot, and cleared. Failures are stored as
`hot_reconciliation` processing failures. Post-crawl failures remain
best-effort so committed ingestion is preserved and the next crawl retries the
derived state. Cleanup and repair failures propagate after being recorded so
their transactional or operator retry behavior remains intact.

URL matching must use one shared normalization rule. Matching is exact after
URL normalization removes tracking parameters. Do not mix exact normalized-URL
matching with SQL prefix matching.
