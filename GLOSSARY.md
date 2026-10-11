# Domain glossary

## Assistant

RSSMonster's conversational agent for retrieving user-owned RSS data and invoking
explicitly requested actions. Inference owns its agent loop and model calls;
the application server owns authenticated database tools and chat presentation.
See [assistant orchestration](docs/inference.md#assistant-orchestration-and-database-tools).

## Bulk read

An explicit operation that marks unread, owned, canonical Articles as read using
selected article IDs, a supplied list snapshot, or a matching query. An empty
snapshot selects nothing. Event grouping can include canonical unread siblings of
selected Event members. Completed writes remain completed if a later write fails.

See [manual and bulk actions](docs/marking-articles-read.md#manual-and-bulk-actions).
