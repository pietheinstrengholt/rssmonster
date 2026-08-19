# Semantic regression reports

The semantic regression suite evaluates the complete fixture through duplicate detection, events, topics, and interest islands. Vector fixtures retain the active inference provider, model, dimensions, and embedding task when they are generated.

Run the concise report suite with:

```bash
npm run test:semantic-report
```

Each successful run writes a timestamped, model-agnostic Markdown report to `tests/.semantic-regression/`, for example:

```text
Qwen3-Embedding-0.6B-ONNX-20260818120000.md
```

The same directory contains `trace.json` with article-level data for deeper analysis. Normal reports keep console output and Markdown manageable by summarizing events, topics, islands, duplicate groups, and incremental outcomes. To print the full article-level console trace, run:

```bash
npm run test:semantic-trace
```

Reports are generated from metadata stored in the vector fixture and do not contain provider- or model-specific branching. This allows reports from any future embedding model to use the same format.

## Model-specific vector caches

Vector generation stores a separate file for every model instead of overwriting a shared fixture. The full model ID is converted to a safe filename, for example:

```text
semantic-regression.onnx-community--Qwen3-Embedding-0.6B-ONNX.vectors.json
semantic-regression.text-embedding-3-small.vectors.json
```

Generating any fixture records the active model in `tests/.semantic-regression/active-vector-model.json`. Tests read that local selection and never contact inference to discover the active model.

To switch to a complete vector set that was generated previously:

```bash
npm run fixture:semantic-select -- --model=onnx-community/Qwen3-Embedding-0.6B-ONNX
```

The selector checks that baseline, incremental, unread, and taxonomy vectors all exist for that model. If one is missing, run its existing fixture generation command while that model is configured. Existing files for other models remain untouched.
