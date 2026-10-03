# Test-Feedback Graph Retrieval (TFGR) — Prototype

This public artifact is a **small, runnable prototype** of the repository-retrieval idea described in the Kaggle Writeup. It is not a complete coding agent and it has not been evaluated on SWE-bench or with Gemma 4. It reports no benchmark results.

## What it demonstrates

- Indexes Python files, classes, functions, and tests with the Python standard-library AST.
- Builds lightweight import, call, and test-to-code links where static analysis can resolve them.
- Ranks evidence with a compact BM25 implementation and bounded one-hop graph expansion.
- Accepts failing-test output as additional retrieval evidence.
- Packs code snippets under a simple word-based budget and explains why each snippet was selected.

The prototype does not load a language model, apply patches, execute tests, or contact a network service. The toy repository only demonstrates retrieval behavior; it is not an evaluation of issue-resolution performance.

## Requirements

- Python 3.9 or later
- No third-party packages

## Run the demonstration

From this directory:

```bash
python3 demo.py
```

The demonstration first searches a toy pricing repository using an issue description, then searches again after adding a simulated failing-test message. It prints the selected file/symbol snippets and their retrieval reasons.

## Run tests

```bash
python3 -m unittest -v test_tfgr.py
```

## Use the indexer on a repository

```bash
python3 tfgr.py /path/to/python/repository \
  "discount calculation returns the wrong final price" \
  --feedback "FAILED tests/test_pricing.py::test_discount; expected 80 got 20" \
  --limit 8 \
  --token-budget 1200
```

The `--token-budget` is a whitespace-token estimate for this prototype, not a Gemma tokenizer count. Results depend on static Python structure and lexical overlap. Dynamic dispatch, generated code, and unresolved imports are not modeled completely.

## Research status

This is an implementation artifact for the proposed retrieval method only. The Gemma 4 agent integration, controlled ablations, hardware measurements, and SWE-bench evaluation described in the paper remain future work. Do not interpret the toy demo as evidence of an improvement in issue-resolution rate.
