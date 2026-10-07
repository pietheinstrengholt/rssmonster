# Domain glossary

## Bulk read

An explicit operation that marks unread, owned, canonical Articles as read using
selected article IDs, a supplied list snapshot, or a matching query. An empty
snapshot selects nothing. Event grouping can include canonical unread siblings of
selected Event members. Completed writes remain completed if a later write fails.

See [manual and bulk actions](docs/marking-articles-read.md#manual-and-bulk-actions).
