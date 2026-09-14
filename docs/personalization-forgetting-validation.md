# Interest Island forgetting validation

The tables below preserve the original evaluation. The mixed-signal lifecycle
defect observed there is now fixed; see [the follow-up](#mixed-signal-normalization-follow-up).

Controlled evaluation of the current `topic-removal` implementation. This task adds tests and documentation only; production algorithms, configuration, thresholds and recommendation weights are unchanged.

## Reproduce and inspect

```bash
cd server
npm test -- tests/semantic/personalizationForgetting.test.js
# Optional independent SQLite test database:
DB_DIALECT=sqlite DB_STORAGE=/tmp/rssmonster-forgetting.sqlite npm test -- tests/semantic/personalizationForgetting.test.js
```

The [suite](../server/tests/semantic/personalizationForgetting.test.js) writes ignored `server/tests/.semantic-regression/forgetting/{mysql,sqlite}.json` artifacts containing every source's raw counts, interaction clocks, per-signal decayed contribution, Island ID/weight, scoring and lifecycle confidence, behavioral activity, archive state/time, held-out scoring paths, Recommended score and fixed-pool rank. An artifact can contain partial results after a failed run; check the test exit status.

## Method and limits

Eleven isolated users/scenarios; six clock observations each: day 0, 7, 30, 90, 180, 365. Day 0 is 2026-09-14 12:00 UTC. All source Articles were published in 2022 but interacted with at day 0. Thus a favorite on an old Article starts at full strength. Repeated reading means three distinct deeply read Articles at day 0; it is not a fabricated read counter. The continued-strong scenario repeats more-like-this at each observation. Reactivation adds a favorite at day 180 to the original clicked Article.

Each user has three fixed eligible unread held-outs. Sources are read; held-outs have no behavior. Controlled orthogonal 3D vectors isolate two possible interests plus an unrelated neutral candidate. Exact directional matches test temporal behavior, not real embedding quality or boundary similarity. No inference or taxonomy generation runs. Production calibration, persistence, active-Island evidence loading, interest evaluation and Recommended calculation are used; the evaluator's score must equal the persisted candidate score.

Recommended uses fixed freshness 0.5, default quality 0.64, no rules and no candidate Event association. Neutral Recommended is 0.253. This isolates personalization from publication aging and corroboration. Rank sorts this fixed three-candidate pool by Recommended, breaking ties by stable group order; neutral ties may remain rank 1 and do not imply a preference. Group 0 is Kubernetes, group 1 earthquake response, group 2 unrelated baking. All sources use one feed.

The Event-burst scenario has a stored three-Article breaking Event with three clicks, alongside an independent favorite. It evaluates forgetting after Event membership exists, not Event formation/cooling or live-news ranking. Calibration must leave its Event status and count unchanged. Event membership itself supplies no new behavioral evidence.

Every observation calibrates twice and compares the full snapshot. Source clocks are reloaded from the database; unchanged behavior must retain day-0 activity (or no remaining meaningful support), never the calibration time. This tests deterministic sequential replay; worker checkpoint retries have separate focused coverage.

## Signal decay

True half-life: `retained fraction = 2^(-ageDays / halfLifeDays)`. Raw weights remain click 2 (count capped at 3), deep read 1, favorite 4, more-like-this 8, not-interested −8. Signals decay independently using their own interaction clocks. Null clocks retain the production publication-time fallback; this suite uses explicit clocks, with fallback covered by the focused recency/lifecycle tests. Explicit fallback scoring retains its separate 30-day half-life and 90-day window; these controlled direct matches normally use Islands.

| Signal | Half-life days | Day 0 | 7 | 30 | 90 | 180 | 365 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| lastClickedAt | 30 | 1.0000 | 0.8507 | 0.5000 | 0.1250 | 0.0156 | 0.0002 |
| lastMeaningfulReadAt | 90 | 1.0000 | 0.9475 | 0.7937 | 0.5000 | 0.2500 | 0.0601 |
| favoritedAt | 365 | 1.0000 | 0.9868 | 0.9446 | 0.8429 | 0.7105 | 0.5000 |
| positiveFeedbackAt | 730 | 1.0000 | 0.9934 | 0.9719 | 0.9181 | 0.8429 | 0.7071 |
| negativeFeedbackAt | 365 | 1.0000 | 0.9868 | 0.9446 | 0.8429 | 0.7105 | 0.5000 |

Fractions above multiply each raw weighted signal. Example mixed Article at day 90: click `2 × 0.125 = 0.25`, favorite `4 × 0.8429 ≈ 3.3716`, total positive evidence ≈3.6216. Negative evidence has finite decay even when its Island weight is temporarily saturated.

## Scenario traces

`C/D/F/P/N` are raw weighted click/deep/favorite/positive/negative magnitudes; negative is subtracted. The evidence column records decayed contributions in that order, summed across supporting Articles (zeros shown as `0`). Island weights use production community averaging and clamping, so are not simply the sum. `Conf` is scoring confidence / lifecycle confidence; archived Islands have no active scoring confidence (`—`). State: `A` active/recent, `S` active but behaviorally stale, `X` archived. Values rounded to four decimals; comparisons use unrounded evidence and persisted scoring precision. Archive dates are first observed transitions, not exact eligibility boundaries between samples.

### Click-only temporary interest

Day-0 raw counts C/D/F/P/N: `1/0/0/0/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 2.0000/0/0/0/0 | 0.3157 | 0.3500/0.3500 | A | 0.1105 | 0.3027 | 1 |
| 7/0 | 1.7013/0/0/0/0 | 0.2730 | 0.3500/0.2977 | A | 0.0955 | 0.2960 | 1 |
| 30/0 | 1.0000/0/0/0/0 | 0.1729 | 0.3500/0.1750 | A | 0.0605 | 0.2802 | 1 |
| 90/0 | 0.2500/0/0/0/0 | 0.0657 | —/0.0437 | X | 0.0000 | 0.2530 | 1 |
| 180/0 | 0.0312/0/0/0/0 | 0.0657 | —/0.0000 | X | 0.0000 | 0.2530 | 1 |
| 365/0 | 0.0004/0/0/0/0 | 0.0657 | —/0.0000 | X | 0.0000 | 0.2530 | 1 |

### Repeated deep reading

Day-0 raw counts C/D/F/P/N: `0/3/0/0/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 0/3.0000/0/0/0 | 0.2329 | 0.5250/0.5250 | A | 0.1223 | 0.3080 | 1 |
| 7/0 | 0/2.8425/0/0/0 | 0.2254 | 0.5250/0.4974 | A | 0.1183 | 0.3062 | 1 |
| 30/0 | 0/2.3811/0/0/0 | 0.2034 | 0.5250/0.4167 | A | 0.1068 | 0.3011 | 1 |
| 90/0 | 0/1.5000/0/0/0 | 0.1614 | 0.5250/0.2625 | S | 0.0847 | 0.2911 | 1 |
| 180/0 | 0/0.7500/0/0/0 | 0.1257 | 0.5250/0.1312 | S | 0.0660 | 0.2827 | 1 |
| 365/0 | 0/0.1804/0/0/0 | 0.0986 | —/0.0316 | X | 0.0000 | 0.2530 | 1 |

### Favorite-driven interest

Day-0 raw counts C/D/F/P/N: `0/0/1/0/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 0/0/4.0000/0/0 | 0.6014 | 0.3500/0.3500 | A | 0.2105 | 0.3477 | 1 |
| 7/0 | 0/0/3.9472/0/0 | 0.5939 | 0.3500/0.3454 | A | 0.2079 | 0.3466 | 1 |
| 30/0 | 0/0/3.7785/0/0 | 0.5698 | 0.3500/0.3306 | A | 0.1994 | 0.3427 | 1 |
| 90/0 | 0/0/3.3716/0/0 | 0.5117 | 0.3500/0.2950 | S | 0.1791 | 0.3336 | 1 |
| 180/0 | 0/0/2.8419/0/0 | 0.4360 | 0.3500/0.2487 | S | 0.1526 | 0.3217 | 1 |
| 365/0 | 0/0/2.0000/0/0 | 0.3157 | 0.3500/0.1750 | S | 0.1105 | 0.3027 | 1 |

### More-like-this strong interest

Day-0 raw counts C/D/F/P/N: `0/0/0/1/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 0/0/0/8.0000/0 | 1.0000 | 0.3500/0.3500 | A | 0.3500 | 0.4105 | 1 |
| 7/0 | 0/0/0/7.9470/0 | 1.0000 | 0.3500/0.3477 | A | 0.3500 | 0.4105 | 1 |
| 30/0 | 0/0/0/7.7753/0 | 1.0000 | 0.3500/0.3402 | A | 0.3500 | 0.4105 | 1 |
| 90/0 | 0/0/0/7.3447/0 | 1.0000 | 0.3500/0.3213 | S | 0.3500 | 0.4105 | 1 |
| 180/0 | 0/0/0/6.7432/0 | 0.9933 | 0.3500/0.2950 | S | 0.3477 | 0.4095 | 1 |
| 365/0 | 0/0/0/5.6569/0 | 0.8381 | 0.3500/0.2475 | S | 0.2933 | 0.3850 | 1 |

### Negative evidence

Day-0 raw counts C/D/F/P/N: `0/0/0/0/1`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 0/0/0/0/8.0000 | -1.0000 | 0.3500/0.3500 | A | -0.3500 | 0.1480 | 3 |
| 7/0 | 0/0/0/0/7.8944 | -1.0000 | 0.3500/0.3454 | A | -0.3500 | 0.1480 | 3 |
| 30/0 | 0/0/0/0/7.5570 | -1.0000 | 0.3500/0.3306 | A | -0.3500 | 0.1480 | 3 |
| 90/0 | 0/0/0/0/6.7432 | -0.9933 | 0.3500/0.2950 | S | -0.3477 | 0.1487 | 3 |
| 180/0 | 0/0/0/0/5.6838 | -0.8420 | 0.3500/0.2487 | S | -0.2947 | 0.1646 | 3 |
| 365/0 | 0/0/0/0/4.0000 | -0.6014 | 0.3500/0.1750 | S | -0.2105 | 0.1899 | 3 |

### Mixed click + favorite

Day-0 raw counts C/D/F/P/N: `1/0/1/0/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 2.0000/0/4.0000/0/0 | 0.8871 | 0.3500/0.3500 | A | 0.3105 | 0.3927 | 1 |
| 7/0 | 1.7013/0/3.9472/0/0 | 0.8369 | 0.3500/0.3295 | A | 0.2929 | 0.3848 | 1 |
| 30/0 | 1.0000/0/3.7785/0/0 | 0.7126 | 0.3500/0.2787 | A | 0.2494 | 0.3652 | 1 |
| 90/0 | 0.2500/0/3.3716/0/0 | 0.5474 | 0.3500/0.2113 | S | 0.1916 | 0.3392 | 1 |
| 180/0 | 0.0312/0/2.8419/0/0 | 0.4404 | 0.3500/0.1676 | S | 0.1541 | 0.3223 | 1 |
| 365/0 | 0.0004/0/2.0000/0/0 | 0.3158 | —/0.1167 | X | 0.0000 | 0.2530 | 1 |

### Abandoned click history

Day-0 raw counts C/D/F/P/N: `3/0/0/0/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 6.0000/0/0/0/0 | 0.3757 | 0.5250/0.5250 | A | 0.1972 | 0.3417 | 1 |
| 7/0 | 5.1040/0/0/0/0 | 0.3330 | 0.5250/0.4466 | A | 0.1748 | 0.3317 | 1 |
| 30/0 | 3.0000/0/0/0/0 | 0.2329 | 0.5250/0.2625 | A | 0.1223 | 0.3080 | 1 |
| 90/0 | 0.7500/0/0/0/0 | 0.1257 | —/0.0656 | X | 0.0000 | 0.2530 | 1 |
| 180/0 | 0.0938/0/0/0/0 | 0.1257 | —/0.0000 | X | 0.0000 | 0.2530 | 1 |
| 365/0 | 0.0013/0/0/0/0 | 0.1257 | —/0.0000 | X | 0.0000 | 0.2530 | 1 |

### Archived interest returning

Day-0 raw counts C/D/F/P/N: `1/0/0/0/0`. Favorite count becomes 1 at day 180; Island ID remains the same across archival and reactivation.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 2.0000/0/0/0/0 | 0.3157 | 0.3500/0.3500 | A | 0.1105 | 0.3027 | 1 |
| 7/0 | 1.7013/0/0/0/0 | 0.2730 | 0.3500/0.2977 | A | 0.0955 | 0.2960 | 1 |
| 30/0 | 1.0000/0/0/0/0 | 0.1729 | 0.3500/0.1750 | A | 0.0605 | 0.2802 | 1 |
| 90/0 | 0.2500/0/0/0/0 | 0.0657 | —/0.0437 | X | 0.0000 | 0.2530 | 1 |
| 180/0 | 0.0312/0/4.0000/0/0 | 0.6059 | 0.3500/0.2352 | A | 0.2121 | 0.3484 | 1 |
| 365/0 | 0.0004/0/2.8150/0/0 | 0.4322 | 0.3500/0.1642 | S | 0.1513 | 0.3211 | 1 |

### Simultaneous interests

Day-0 raw counts C/D/F/P/N: `1/0/1/0/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 0/0/4.0000/0/0 | 0.6014 | 0.3500/0.3500 | A | 0.2105 | 0.3477 | 1 |
| 0/1 | 2.0000/0/0/0/0 | 0.3157 | 0.3500/0.3500 | A | 0.1105 | 0.3027 | 2 |
| 7/0 | 0/0/3.9472/0/0 | 0.5939 | 0.3500/0.3454 | A | 0.2079 | 0.3466 | 1 |
| 7/1 | 1.7013/0/0/0/0 | 0.2730 | 0.3500/0.2977 | A | 0.0955 | 0.2960 | 2 |
| 30/0 | 0/0/3.7785/0/0 | 0.5698 | 0.3500/0.3306 | A | 0.1994 | 0.3427 | 1 |
| 30/1 | 1.0000/0/0/0/0 | 0.1729 | 0.3500/0.1750 | A | 0.0605 | 0.2802 | 2 |
| 90/0 | 0/0/3.3716/0/0 | 0.5117 | 0.3500/0.2950 | S | 0.1791 | 0.3336 | 1 |
| 90/1 | 0.2500/0/0/0/0 | 0.0657 | —/0.0437 | X | 0.0000 | 0.2530 | 2 |
| 180/0 | 0/0/2.8419/0/0 | 0.4360 | 0.3500/0.2487 | S | 0.1526 | 0.3217 | 1 |
| 180/1 | 0.0312/0/0/0/0 | 0.0657 | —/0.0000 | X | 0.0000 | 0.2530 | 2 |
| 365/0 | 0/0/2.0000/0/0 | 0.3157 | 0.3500/0.1750 | S | 0.1105 | 0.3027 | 1 |
| 365/1 | 0.0004/0/0/0/0 | 0.0657 | —/0.0000 | X | 0.0000 | 0.2530 | 2 |

### Stable favorite versus Event burst

Day-0 raw counts C/D/F/P/N: `3/0/1/0/0`.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 0/0/4.0000/0/0 | 0.6014 | 0.3500/0.3500 | A | 0.2105 | 0.3477 | 1 |
| 0/1 | 6.0000/0/0/0/0 | 0.3757 | 0.5250/0.5250 | A | 0.1972 | 0.3417 | 2 |
| 7/0 | 0/0/3.9472/0/0 | 0.5939 | 0.3500/0.3454 | A | 0.2079 | 0.3466 | 1 |
| 7/1 | 5.1040/0/0/0/0 | 0.3330 | 0.5250/0.4466 | A | 0.1748 | 0.3317 | 2 |
| 30/0 | 0/0/3.7785/0/0 | 0.5698 | 0.3500/0.3306 | A | 0.1994 | 0.3427 | 1 |
| 30/1 | 3.0000/0/0/0/0 | 0.2329 | 0.5250/0.2625 | A | 0.1223 | 0.3080 | 2 |
| 90/0 | 0/0/3.3716/0/0 | 0.5117 | 0.3500/0.2950 | S | 0.1791 | 0.3336 | 1 |
| 90/1 | 0.7500/0/0/0/0 | 0.1257 | —/0.0656 | X | 0.0000 | 0.2530 | 2 |
| 180/0 | 0/0/2.8419/0/0 | 0.4360 | 0.3500/0.2487 | S | 0.1526 | 0.3217 | 1 |
| 180/1 | 0.0938/0/0/0/0 | 0.1257 | —/0.0000 | X | 0.0000 | 0.2530 | 2 |
| 365/0 | 0/0/2.0000/0/0 | 0.3157 | 0.3500/0.1750 | S | 0.1105 | 0.3027 | 1 |
| 365/1 | 0.0013/0/0/0/0 | 0.1257 | —/0.0000 | X | 0.0000 | 0.2530 | 2 |

### Continued strong behavior

Day-0 raw counts C/D/F/P/N: `0/0/0/1/0`. The positive-feedback clock refreshes at each observation.

| Day/group | Decayed C/D/F/P/N | Weight | Conf | State | Interest | Recommended | Rank |
| --- | --- | ---: | --- | :---: | ---: | ---: | ---: |
| 0/0 | 0/0/0/8.0000/0 | 1.0000 | 0.3500/0.3500 | A | 0.3500 | 0.4105 | 1 |
| 7/0 | 0/0/0/8.0000/0 | 1.0000 | 0.3500/0.3500 | A | 0.3500 | 0.4105 | 1 |
| 30/0 | 0/0/0/8.0000/0 | 1.0000 | 0.3500/0.3500 | A | 0.3500 | 0.4105 | 1 |
| 90/0 | 0/0/0/8.0000/0 | 1.0000 | 0.3500/0.3500 | A | 0.3500 | 0.4105 | 1 |
| 180/0 | 0/0/0/8.0000/0 | 1.0000 | 0.3500/0.3500 | A | 0.3500 | 0.4105 | 1 |
| 365/0 | 0/0/0/8.0000/0 | 1.0000 | 0.3500/0.3500 | A | 0.3500 | 0.4105 | 1 |

## Findings

- Recent evidence outweighs old evidence for every signal. Equal-age retention orders click < deep read < favorite < more-like-this. A single favorite remains active through day 365; click-only history becomes neutral by day 90. Three deep reads survive day 180 and archive by day 365. Continued strong behavior stays active throughout.
- The returning Kubernetes interest archives at day 90 and reactivates its existing ID at day 180. Its held-out interest rises from 0 to 0.2121; Recommended rises from 0.2530 to 0.3484. Replaying calibration does not move activity or archive timestamps forward.
- **Historical premature forgetting (now fixed):** mixed click + favorite archived at day 365, while favorite alone remained active. Its surviving favorite contributed 2, but lifecycle retention divided by the Article's original combined raw magnitude 6, giving lifecycle confidence ≈0.1167, below 0.12. Favorite alone had confidence 0.175. See the follow-up below for the corrected normalization.
- **Persistence plateau:** more-like-this held-out interest stays 0.35 through day 90; negative interest stays −0.35 through day 30 despite continuously decaying evidence. Existing weight clamping at ±1 and separate scoring confidence explain this. Negative interest weakens to −0.2105 by day 365, rather than remaining permanently full-strength. The one-year simulation does not establish eventual archival for every explicit preference.
- Archived unmatched Islands can retain their last persisted nonzero weight. They are excluded from active scoring: the abandoned candidate is neutral. This is historical storage, not fresh behavioral support. Staleness alone does not archive a strong Island; archival requires stale and weak support at calibration time, not an automatic daily timer.
- Stable favorite interest outlasts the Event-click burst in the same user. The burst is neutral by day 90 while the favorite remains positive through day 365. Unrelated held-outs remain neutral in every scenario. Rank is intentionally a small controlled-pool diagnostic, not a claim about a live library.

## Validation results

- MySQL: **170 tests passed across 24 files** (46.48 s), covering the new 12-test evaluation, Islands, lifecycle, decay configuration, refresh/replay, explicit-feedback refresh and recommendations.
- SQLite: **25 tests passed across 3 files** (6.85 s): evaluation, lifecycle and refresh scoping. All 66 scenario snapshots match MySQL after excluding generated IDs.
- Server ESLint passed; `git diff --check` passed. No production code changed in this task; earlier outstanding changes were preserved. Client/build checks were not applicable to this server evaluation/documentation change. These are focused checks, not a claim that the entire repository suite ran.
- Required before/after semantic traces both passed. Frozen corpus/vector fingerprints and selected model are identical. Normalized complete reports match: both phases' metrics, Article scores/paths, Event memberships/reuse, Island memberships/confidence/persistence and all **160 held-out results** are unchanged. No new or baseline trace failures.

| Trace metric (before = after) | Batch001 | Cumulative Batch002 |
| --- | ---: | ---: |
| Articles / Recommended coverage | 1,000 / 100% | 2,000 / 100% |
| Events / Eventless Articles | 128 / 520 | 315 / 864 |
| Islands / singletons | 20 / 8 | 25 / 10 |
| Unassigned behavioral profiles | 74 | 114 |
| Positive / negative / neutral interest | 43 / 6 / 951 | 169 / 42 / 1,789 |

Trace processing runtime was **113.78 → 141.51 s**; Vitest wall duration **138.78 → 168.05 s**. This is an observed slower final run, not a controlled performance benchmark; the trace does not execute the added forgetting suite, and production code was unchanged between captures. Logs, exit statuses, fingerprints, reports, focused-test logs and the normalization/comparison script are preserved under ignored `server/tests/.semantic-regression/comparisons/forgetting-evaluation/` (`before/`, `after/`, `comparison.json`).

Files added: this report and `server/tests/semantic/personalizationForgetting.test.js`.

## Mixed-signal normalization follow-up

The premature mixed-signal archival above is corrected in `islandLifecycle.js`.
For each qualifying Article, lifecycle retention now takes the strongest retained
fraction among individually meaningful signals, then multiplies by signed
agreement `abs(P - N) / (P + N)` using the full decayed evidence. A zero total
produces zero agreement. This preserves opposition/cancellation and existing
single-signal decay without letting slower-decaying favorite support be diluted
by aging clicks. The maximum across supporting Articles and the existing
cohesion/confidence calculation remain intact.

Raw behavioral weights, per-signal half-lives, meaningful-signal cutoff,
recommendation confidence/weights, matching thresholds and Events are unchanged.
Lifecycle confidence continues to feed the existing capacity tie-break; capacity
selection itself is not changed. Activity timestamps still reflect interactions,
not calibration. Previously archived Islands retain the existing new-behavior
requirement for reactivation; no historical backfill is performed.

| Mixed click + favorite, day 365 | Original evaluation | Corrected |
| --- | ---: | ---: |
| Lifecycle confidence | 0.1167 | 0.1750 |
| State | Archived | Active, behaviorally stale |
| Held-out interest | 0 | 0.1105 |
| Recommended (fixed comparison inputs) | 0.2530 | 0.3027 |

Favorite-only lifecycle confidence is also 0.1750. The persisted mixed Island
weight remains 0.3158; its raw evidence and decay have not changed. Tests also
cover capped repeated clicks with calibration at days 90, 130, 180, 210 and 365,
ensuring the Island does not archive prematurely before those clicks expire.
Repeated calibration preserves behavioral age; four-year-old favorite support
still weakens enough to archive. Meaningful negative evidence still reduces
support, and exact positive/negative cancellation yields zero confidence.

Validation: 200 server tests across 26 files passed (51.85 s); 37 SQLite tests
across four files passed (8.66 s); server lint and `git diff --check` passed.
The original regression cases were observed failing before the fix. Existing
forgetting evaluation now explicitly asserts mixed-signal survival at one year.

Both required semantic traces passed with identical corpus/vector fingerprints
and selected model. Complete normalized reports match: both phases' Article
scores/ranks/paths, Event and Island memberships, confidence diagnostics,
persistence outcomes and all 160 held-out results. Batch001 remains 1,000 Articles,
20 active Islands, 74 unassigned profiles, 43 positive / 6 negative / 951 neutral;
Batch002 remains 2,000 Articles, 20 active Islands, 114 unassigned profiles,
167 positive / 45 negative / 1,788 neutral. Recommended coverage remains 100%.
No baseline or final trace assertion failed. These week-long batches do not
contain the year-old mixed-signal case; the focused evaluation proves that fix.

Processing runtime was 118.82→105.79 s; Vitest wall duration 144.38→129.75 s.
These single runs are not a performance benchmark. Full MySQL and SQLite forgetting
snapshots match after excluding generated IDs. Logs, reports, fingerprints,
red-regression evidence and the reproducible comparison script are preserved in
ignored `server/tests/.semantic-regression/comparisons/mixed-signal-forgetting/`.
The final comparison uses `before/` and `after/`; an intermediate threshold-only
attempt is retained separately and is not the shipped fix.
