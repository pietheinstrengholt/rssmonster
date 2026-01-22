# Scoring and Ranking

RSSMonster ranks every article using a few interpretable signals. Scores stay between 0 and 1 unless noted, so you always know why something is surfaced.

---

## Freshness
- Formula: $freshness = e^{-ageHours/48}$ (time constant of 48h).
- Intuition: today >0.7, yesterday ~0.3-0.7, older pieces decay toward 0.1 and below.
- Used by: importance ranking and freshness filters.

## Quality
- Inputs (0-100 each): `sentimentScore` (50%), `qualityScore` (35%), `advertisementScore` (15%).
- Formula: $overall = 0.5\cdot sentiment + 0.35\cdot quality + 0.15\cdot ads$; clipped to 0-100, then $quality = overall/100$.
- Defaults: if a score is missing, it falls back to 70 (neutral-good) to avoid unfair penalties during ingestion.
- Feed trust: when the feed relation is loaded, quality is multiplied by `feedTrust`, boosting reliable sources and dampening noisy ones.
- Used by: importance ranking, quality sort, quality filters.

## Attention
- Buckets (primary signal): 0 passed, 1 skimmed, 2 read, 3 deep read, 4 highly engaged.
- Base score by bucket: 0 -> 0.0, 1 -> 0.25, 2 -> 0.5, 3 -> 0.75, 4 -> 1.0.
- Reinforcement: small log boosts for revisits and outbound clicks (each up to +0.15). Example boost term: $\min(\log_2(openedCount+1)/5, 0.15)$.
- Cap: final attention is clipped to 1.0.
- Used by: attention sort.

## Coverage and Uniqueness
- Cluster coverage: $coverage = \frac{\log_2(clusterSize+1)}{1 + \log_2(clusterSize+1)}$. Standalone ~0.5, 2 sources ~0.61, 4 sources ~0.70, 16 sources ~0.80.
- Uniqueness (used to suppress duplicates elsewhere): $uniqueness = 1/\log_2(clusterSize+1)$, with 1.0 for standalone items.
- Cluster reps: when cluster view is on, only representative articles surface.

## Importance (default ranking)
- Formula: $importance = 0.2\cdot quality + 0.5\cdot freshness + 0.3\cdot coverage$.
- Behavior: rewards fresh, high-quality stories that multiple trusted sources cover; penalizes stale or low-quality items and de-emphasizes redundant duplicates.

## Sorting Options
- `sort:IMPORTANCE` (default): uses the importance score above.
- `sort:QUALITY`: orders by the computed quality signal.
- `sort:ATTENTION`: highlights what you actually engaged with (attention score).
- `sort:DESC|ASC`: chronological by published date.

---

## How Filters Interact
- Quality/freshness filters are applied after fetching (they are virtual), so they can reduce result counts even if limits are higher.
- Importance/quality/attention sorts are computed in memory, but the signals themselves are fully deterministic and explained above.
