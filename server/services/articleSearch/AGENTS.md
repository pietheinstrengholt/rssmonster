Search is always user-scoped.
Filters compose restrictively.
Eligibility happens before ranking.
Ranking must not resurrect ineligible articles.
Article IDs are the primary search result contract.
Grouping changes result shape, not article meaning.
Empty results are valid.
Keep ordering deterministic.

No Island match means neutral interest, not missing Recommended.
Preserve finite Recommended scoring for every eligible result before limiting.
The `island:true` relationship filter is not a test for nonzero interest or a
prerequisite for Recommended. Keep those contracts distinct; see
[the search README](README.md) and [interest scoring](../islands/README.md).
