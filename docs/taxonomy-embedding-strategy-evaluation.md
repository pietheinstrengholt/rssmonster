# Taxonomy Embedding Strategy Evaluation

Date: 2026-08-21

## Recommendation

Keep the current symmetric production embedding behavior for now. Continue using the
enriched taxonomy representation with category, display name, description, and aliases.
Do not add `query:`, `passage:`, or `document:` prefixes.

Qwen's supported query instruction is promising specifically with the taxonomy as the
query: it retained the current Top-1 accuracy and increased average separation margin
from `0.1278` to `0.1617`. That is not yet sufficient production evidence because
RSSMonster does not directly classify articles into taxonomy concepts. It uses taxonomy
vectors to name aggregate Interest Island/profile vectors, and there is no manually
labeled island fixture against which to verify the instruction.

Do not switch stored article vectors to query semantics. The same article vector is
also used for symmetric duplicate detection, event clustering, topic construction, and
recommendations. A taxonomy benchmark cannot establish that an instructed article
vector is safe for those consumers.

## Current behavior

### Actual taxonomy flow

The production relationship is indirect:

```text
article vectors -> events/topics/behavioral profiles -> Interest Island vector
Interest Island vector <-> nearest active taxonomy vector -> island display label
```

`resolveTaxonomyDisplayName` performs an exhaustive cosine comparison against active
taxonomy rows and selects the nearest display name. It has no taxonomy-specific minimum
similarity or margin check. Island profile matching and topic enrichment have separate
thresholds, but they do not govern taxonomy-label selection.

### Article embeddings

`buildArticleEventEmbeddingText` constructs the stored article-vector input from:

- a normalized title;
- unique description/summary sentences; and
- up to two substantial plain-text body paragraphs.

It removes common news/source affixes, URLs, boilerplate, and near-duplicate text. The
server caps the input at an estimated 512 whitespace-delimited tokens and normally skips
inputs shorter than 60 characters. `embedArticle` can also request a temporary, longer
topic-oriented vector when at least 120 characters of usable content are available, but
only the event vector is stored as `articleVector` with `embedding_model`.

### Taxonomy embeddings

Taxonomy vectors use `buildTaxonomyEmbeddingText`:

```text
Category: <categoryName>
Topic: <displayName>
Description: <description>
Aliases: <comma-separated aliases>
```

Descriptions are persisted. Aliases are definition-time metadata and are included only
when constructing the vector input. Taxonomy vectors and their model identifier are
stored in `island_taxonomy`.

### Shared server/inference path

Article and taxonomy text use the same server `embedTexts` client, HTTP endpoint,
configured provider, model instance, pooling, normalization, and output dimension.
Their input builders differ, but no query/document role or task intent crosses the API.

The active endpoint reported:

- provider: `qwen3-embedding`;
- model: `onnx-community/Qwen3-Embedding-0.6B-ONNX`;
- task: `feature-extraction`;
- dimensions: 1024;
- maximum API batch size: 8.

## Provider and model semantics

### Local Qwen3

The local provider uses `@huggingface/transformers` 4.2.0 on CPU with FP32,
`pooling: 'last_token'`, and `normalize: true`. The feature-extraction pipeline left-pads,
tokenizes with truncation enabled, selects the last token, and L2-normalizes the result.
The local tokenizer appends the model's end-of-document token. The benchmark observed
vector norms from `0.9999993` to `1.0000006`, confirming effective unit normalization.

The provider advertises a 32,768-token maximum, matching the model's configured position
limit. The Transformers.js pipeline does not explicitly receive that limit, and the
downloaded tokenizer metadata currently advertises 131,072 tokens. This mismatch is not
material for taxonomy or stored article inputs because the server bounds them to roughly
512 tokens, but it should not be interpreted as an enforced 32K provider guard.

The official Qwen3 model card describes the model as instruction-aware. For retrieval,
it recommends adding a one-sentence English instruction to the query only:

```text
Instruct: <task description>
Query: <query text>
```

Documents receive no instruction. The model card does not recommend generic
`query:`, `passage:`, or `document:` prefixes for this model. Qwen reports a typical
1%-5% retrieval improvement from a suitable query instruction, but task-specific
evaluation remains necessary.

Authoritative source: [Qwen3-Embedding-0.6B model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).

### OpenAI

The supported OpenAI provider calls the embeddings API with only `model` and raw `input`.
RSSMonster does not send task types, query/document roles, or model-specific prefixes.
`text-embedding-3-small` exposes one embedding representation for search,
classification, clustering, and relatedness; the API does not define separate query and
document modes. OpenAI states that its embedding outputs are L2-normalized.

Authoritative sources:
[text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small),
[OpenAI Embeddings FAQ](https://help.openai.com/en/articles/6824809-embeddings-faq).

## Evaluation dataset

The standalone fixture contains 23 manually labeled, article-like inputs and 23 nearby
taxonomy candidates across:

- Artificial Intelligence, Machine Learning, Generative AI, Large Language Models,
  and AI Agents;
- Data Warehousing, Data Lakes, Lakehouse, and Data Engineering;
- Cybersecurity, Cloud Security, and Application Security;
- Finance, Banking, Fintech, and Insurance;
- American football and association football/soccer;
- Game Development and Software Development; and
- Climate Science, Climate Change, and Sustainability.

Each concept has one positive article. Nearby concepts form hard negatives; concepts in
other groups form clear negatives. This is a controlled diagnostic set, not a calibrated
estimate of production accuracy.

Run it without database access or writes:

```bash
cd server
npm run taxonomy:evaluate
```

## Query/document strategy results

All values use the active local Qwen model. Margin is expected-topic cosine minus the
strongest incorrect cosine.

| Strategy | Top-1 | Top-3 | MRR | Expected cosine | Best wrong cosine | Average margin | Minimum margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Current production | 95.65% | 100% | 0.9783 | 0.4799 | 0.3521 | 0.1278 | -0.0124 |
| Enriched symmetric | 95.65% | 100% | 0.9783 | 0.4799 | 0.3521 | 0.1278 | -0.0124 |
| Taxonomy query / article document | 95.65% | 100% | 0.9783 | 0.5086 | 0.3469 | **0.1617** | -0.0035 |
| Article query / taxonomy document | **100%** | 100% | **1.0000** | 0.6277 | 0.4971 | 0.1306 | **0.0376** |
| Article query with classification wording | 95.65% | 100% | 0.9783 | 0.6477 | 0.5466 | 0.1012 | -0.0059 |

Current production and enriched symmetric are identical because the current working tree
already uses the enriched taxonomy representation without role-specific instructions.

The results do not identify one unambiguous winner. Taxonomy-as-query has the strongest
average margin. Article-as-query has the best Top-1 and minimum margin. The alternative
classification wording raises absolute cosines while reducing separation, demonstrating
that higher cosine alone does not indicate a better strategy.

## Taxonomy representation results

These runs keep both sides symmetric and vary only taxonomy text.

| Taxonomy representation | Top-1 | Top-3 | MRR | Expected cosine | Best wrong cosine | Average margin | Minimum margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Display name | 95.65% | 100% | 0.9710 | 0.5331 | 0.4288 | 0.1044 | -0.1705 |
| Category + display name | 95.65% | 100% | 0.9783 | 0.5247 | 0.4204 | 0.1043 | -0.0089 |
| Category + display name + description | 91.30% | 100% | 0.9565 | 0.4878 | 0.3635 | 0.1243 | -0.0152 |
| Category + display name + description + aliases | 95.65% | 100% | **0.9783** | 0.4799 | 0.3521 | **0.1278** | -0.0124 |

Descriptions reduce both correct and incorrect absolute cosine, but improve average
separation. Aliases recover the Top-1 loss seen with descriptions alone and produce the
best average margin. Display name alone has a severe `-0.1705` worst-case margin for the
confusable Lakehouse/Data Lakes example. This supports retaining descriptions and aliases.

## Vector compatibility and regeneration

Changing input instructions changes the embedding space even when the model identifier
and dimension remain unchanged. RSSMonster currently stores only `embedding_model`, so a
partial prompt transition could silently mix incompatible semantic profiles under the
same model name.

If taxonomy-as-query is adopted later, all taxonomy vectors must be regenerated together;
existing article vectors can remain document-like. If article-as-query replaces the
stored article representation, all article vectors and every derived semantic structure
(duplicates, Events, Topics, Interest Islands, memberships, and scores) require a guarded
rebuild. A safer design would avoid repurposing the shared article vector and would first
establish whether a separate classification vector is justified.

No threshold change is recommended. Representation must be selected and evaluated on
labeled production-like Interest Island vectors first. Taxonomy label selection itself
currently has no threshold to tune.

## Production changes

None. The only additions from this audit are the standalone evaluation fixture, runner,
package command, and fixture-integrity test.
