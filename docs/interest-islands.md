---
layout: page
title: Interest Islands & Personalization
---

## What Are Interest Islands?

**Interest Islands** are semantic profiles of your reading interests. They emerge organically from your interactions — stars, clicks, and reading patterns — and shape personalized recommendations.

Think of them as **durable interest clusters** that:
- Learn from your engagement
- Persist across time
- Influence RECOMMENDED ranking
- Grow stronger or fade based on activity

---

## How Interest Islands Form

### The Process

1. **You interact with an article** — star it, click it, or mark it negatively
2. **RSSMonster detects semantic signals** — vector embeddings from the article's topic
3. **An island is created or reinforced** — if strong enough evidence accumulates
4. **The island influences future rankings** — similar articles rank higher for you

### Thresholds

An interest island is **promoted** when:
- Cluster affinity ≥ 5 points
- Evidence: 1 star + 2 clicks, or ~5 clicks total
- With negative marking: quick decay and potential deletion

---

## Why Semantic Merging?

### The Problem

Over time, users naturally develop overlapping interests. Without consolidation:

| Without Merging | With Merging |
|---|---|
| "Windows 11 tweaks" | **Windows topics** |
| "PowerToys workflows" | *(consolidated)* |
| "Windows customization" | |
| "Linux desktop tools" | Linux desktop tools |

**Result:** Recommendation signals fragment across near-duplicates, reducing confidence per island.

### Why Vector Similarity?

Labels and names are unstable (you retitle islands), keywords are subjective. **Vector embeddings** capture true semantic content across language variance.

Only cosine similarity matters — not names, feeds, or keywords.

---

## Interest Island Merge System

The **Interest Island Merge** consolidates near-duplicate semantic profiles into stronger, more durable long-term interests.

### When to Run Merges

**Automated contexts:**
- Scheduled maintenance (weekly consolidation)
- Post-import cleanup (after large feed additions)
- Before recommendation ranking (optional, if fragmentation detected)

**Manual contexts:**
- Admin maintenance tasks
- Per-user cleanup
- Debug and diagnostics

### Configuration

| Setting | Default | Override |
|---------|---------|----------|
| `PROFILE_MERGE_THRESHOLD` | 0.90 | `PROFILE_MERGE_THRESHOLD=0.88` |

**Understanding thresholds:**

- **0.85**: Aggressive merging → fewer islands, broader topics
- **0.90**: Balanced (default) → production-tested
- **0.95**: Conservative → preserve nuance

Lower threshold = more merges. Higher threshold = fewer merges.

---

## Running Merge Operations

### Command Line

**Merge all users:**
```bash
npm run merge-profiles
```

**Merge specific user:**
```bash
npm run merge-profiles -- --userId=42
```

**Custom threshold:**
```bash
PROFILE_MERGE_THRESHOLD=0.85 npm run merge-profiles
```

### Output Example

```
[ISLAND MERGE] starting merge pass for 5 users
[ISLAND MERGE] merged profile 12 into 5 (similarity=0.93)
[ISLAND MERGE] merged profile 8 into 3 (similarity=0.91)
[ISLAND MERGE] completed for user 42: 8 -> 6 profiles (2 merged, threshold=0.90)
[ISLAND MERGE] merge pass complete: 120 -> 98 total profiles (22 merged across 5 users)
```

### Programmatic Usage

```javascript
import { mergeInterestProfilesForUser } from './util/interestProfileMerge.service.js';

const result = await mergeInterestProfilesForUser(userId);
// { before: 8, after: 5, mergedCount: 3, threshold: 0.90 }

import { mergeAllInterestProfiles } from './util/interestProfileMerge.service.js';
const result = await mergeAllInterestProfiles();
// { totalUsers: 50, totalBefore: 200, totalAfter: 165, totalMerged: 35 }
```

---

## How Merging Works

### Algorithm

1. **Fetch & Sort**: Load all profiles for user, ordered by weight (highest = most mature)
2. **Compare**: Compute cosine similarity between profile vectors
3. **Merge**: If similarity ≥ threshold, merge weaker into stronger
4. **Blend**: Normalize vectors, sum stats, preserve metadata
5. **Invalidate**: Clear profile cache

### Merge Process

When profile B is absorbed into profile A (higher weight):

**Vector Blending:**
```
mergedVector = normalize(blend(A.vector, B.vector, A.weight, B.weight))
```

**Stats Accumulation:**
```
weight            += B.weight
interactionCount  += B.interactionCount
starCount         += B.starCount
clickCount        += B.clickCount
lastSeen          = max(A.lastSeen, B.lastSeen)
```

**Metadata Preserved:**
```
topicKey  = A.topicKey  (survivor's topic)
label     = A.label     (survivor's label)
```

### Safety Guarantees

✅ **No duplicate merges** — Tracks merged IDs in set  
✅ **Vector validation** — Checks for NaN, mismatched dimensions, invalid types  
✅ **Self-merge prevention** — Skips profile-to-self comparisons  
✅ **Graceful errors** — Individual failures don't block others  
✅ **Transaction safety** — Destroy only after successful update  
✅ **Cache management** — Invalidates after all merges complete  

---

## Performance

### Time Complexity

**O(n²)** per user, where n = profiles per user (typically < 25)

| Profile Count | Time |
|--------|------|
| 5      | ~1ms |
| 15     | ~5ms |
| 25     | ~12ms |

**All users:** ~5 seconds (50 users × 15 profiles avg)

### Expected Impact

**Typical merge pass:**
- 10–20% reduction in duplicate islands
- 1–2 profiles consolidated per user
- Stronger per-island ranking signals

**After large crawl operations:**
- Up to 40% reduction in fragmentation
- 3–5 profiles consolidated per user

---

## Configuration & Tuning

### `PROFILE_MERGE_THRESHOLD`

Located in: `server/config/ranking.config.js`

```javascript
export const PROFILE_MERGE_THRESHOLD = 0.90;  // Override via env var
```

**Adjustment guide:**

**To consolidate more aggressively:**
```bash
PROFILE_MERGE_THRESHOLD=0.82 npm run merge-profiles
# Merges even somewhat-similar islands
```

**To be more selective:**
```bash
PROFILE_MERGE_THRESHOLD=0.94 npm run merge-profiles
# Only merges extremely similar islands
```

---

## Understanding Interest Islands Data

### UserInterestProfile

Represents a learned interest (island).

| Column | Meaning |
|--------|---------|
| `id` | Unique profile ID |
| `userId` | Owner user |
| `label` | Human-readable island name |
| `topicKey` | Cluster topic key (or null) |
| `vector` | Semantic embedding (array) |
| `weight` | Strength/maturity (0+) |
| `interactionCount` | Total interactions |
| `starCount` | Stars received |
| `clickCount` | Clicks received |
| `lastSeen` | Most recent interaction |

### UserClusterAffinity

Latent engagement signal (fast reinforcement).

| Column | Meaning |
|--------|---------|
| `userId` | Owner user |
| `clusterId` | Article cluster (topic) |
| `affinity` | Engagement score (-∞ to +∞) |
| `topicKey` | Cluster topic key |
| `interactionCount` | Total interactions |
| `starCount` | Stars received |
| `clickCount` | Clicks received |
| `lastInteractionAt` | Most recent interaction |

---

## Operational Considerations

### Scheduling

**Recommended cron for weekly maintenance:**
```bash
0 2 * * 0 cd /app && npm run merge-profiles >> logs/merge.log 2>&1
```

### Monitoring

Watch logs for errors or unexpected merge counts:

```bash
# Show all merge activity
npm run merge-profiles 2>&1 | grep "ISLAND MERGE"

# Count successful merges
npm run merge-profiles 2>&1 | grep -c "merged profile"

# Check for errors
npm run merge-profiles 2>&1 | grep -i error
```

### Troubleshooting

**No profiles merging?**
```bash
# Check vectors are valid
node -e "
  import db from './models/index.js';
  const profiles = await db.UserInterestProfile.findAll({ where: { userId: 42 } });
  profiles.forEach(p => {
    const valid = Array.isArray(p.vector) && p.vector.length > 0;
    console.log(\`Profile \${p.id}: vector valid=\${valid}, weight=\${p.weight}\`);
  });
"

# Try lower threshold
PROFILE_MERGE_THRESHOLD=0.80 npm run merge-profiles
```

**Too many merges?**
```bash
# Try higher threshold
PROFILE_MERGE_THRESHOLD=0.95 npm run merge-profiles
```

---

## Future Enhancements

Potential improvements (not yet implemented):

- [ ] Automatic scheduled merging (background job)
- [ ] HTTP admin endpoint for manual trigger
- [ ] Advanced metadata merging (AI-generated labels)
- [ ] Partial merging (keep both, boost winner weight)
- [ ] Merge analytics dashboard
- [ ] Automatic threshold tuning based on profile volatility

---

## Related Topics

- **[Core Concepts](concepts.md)** — Understanding articles, clusters, and quality
- **[Scoring & Ranking](scoring.md)** — How RECOMMENDED score works
- **[API Documentation](api.md)** — Programmatic access to profiles
- **Getting Started** — Basic RSSMonster setup

---

## References

- **Configuration**: `server/config/ranking.config.js`
- **Service**: `server/util/interestProfileMerge.service.js`
- **Script**: `server/scripts/mergeInterestProfiles.js`
- **Vector Utilities**: `server/util/interestIsland.service.js`
- **Vector Math**: `server/util/vectorMath.js`
