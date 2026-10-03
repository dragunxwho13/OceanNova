"""A dependency-free prototype of test-feedback graph retrieval for Python repos.

This module indexes source structure and returns budgeted code evidence. It does
not call a language model, run tests, edit files, or claim benchmark performance.
"""
from __future__ import annotations

import argparse
import ast
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import DefaultDict, Dict, Iterable, List, Optional, Sequence, Tuple

TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z_0-9]*|[0-9]+")
SKIP_DIRS = {".git", ".venv", "venv", "__pycache__", "build", "dist", "node_modules"}
RELATION_WEIGHT = {
    "contains": 0.30,
    "imports": 0.65,
    "imported_by": 0.50,
    "calls": 0.70,
    "called_by": 0.45,
    "tests": 0.85,
    "tested_by": 0.85,
    "defines": 0.30,
}


@dataclass(frozen=True)
class Node:
    id: str
    path: str
    kind: str
    name: str
    start_line: int
    end_line: int
    text: str

    @property
    def document(self) -> str:
        return " ".join((self.path, self.kind, self.name, self.text))


@dataclass(frozen=True)
class Edge:
    target: str
    relation: str


@dataclass(frozen=True)
class Evidence:
    node: Node
    score: float
    reason: str
    estimated_tokens: int


class RepositoryIndex:
    """A small typed index over Python source and test files."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.nodes: Dict[str, Node] = {}
        self.edges: DefaultDict[str, List[Edge]] = defaultdict(list)
        self.documents: Dict[str, List[str]] = {}
        self.document_frequency: Counter[str] = Counter()
        self.average_document_length = 1.0
        self._ast_records: List[Tuple[str, ast.AST, str]] = []
        self._build()
        self._prepare_lexical_index()

    def _add_node(self, node: Node) -> None:
        self.nodes[node.id] = node

    def _add_edge(self, source: str, target: str, relation: str) -> None:
        if source == target or source not in self.nodes or target not in self.nodes:
            return
        edge = Edge(target, relation)
        if edge not in self.edges[source]:
            self.edges[source].append(edge)

    def _walk_python_files(self) -> List[Path]:
        paths: List[Path] = []
        for path in self.root.rglob("*.py"):
            if any(part in SKIP_DIRS for part in path.relative_to(self.root).parts):
                continue
            paths.append(path)
        return sorted(paths)

    @staticmethod
    def _module_name(relative_path: Path) -> str:
        parts = list(relative_path.with_suffix("").parts)
        if parts and parts[-1] == "__init__":
            parts.pop()
        return ".".join(parts)

    def _resolve_import(self, module_name: str) -> Optional[str]:
        if not module_name:
            return None
        base = self.root.joinpath(*module_name.split("."))
        candidates = [base.with_suffix(".py"), base / "__init__.py"]
        for candidate in candidates:
            if candidate.is_file():
                return candidate.relative_to(self.root).as_posix()
        return None

    def _build(self) -> None:
        paths = self._walk_python_files()
        file_nodes: Dict[str, str] = {}
        file_modules: Dict[str, str] = {}
        symbol_ids_by_name: DefaultDict[str, List[str]] = defaultdict(list)
        symbol_kinds: Dict[str, str] = {}

        for file_path in paths:
            relative = file_path.relative_to(self.root).as_posix()
            file_id = f"file:{relative}"
            file_nodes[relative] = file_id
            file_modules[relative] = self._module_name(Path(relative))
            try:
                source = file_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            lines = source.splitlines()
            self._add_node(
                Node(
                    id=file_id,
                    path=relative,
                    kind="file",
                    name=Path(relative).name,
                    start_line=1,
                    end_line=max(1, len(lines)),
                    text="\n".join(lines[:100]),
                )
            )
            try:
                tree = ast.parse(source, filename=relative)
            except SyntaxError:
                # Keep the file searchable even if the source is not parseable.
                continue

            self._ast_records.append((relative, tree, source))
            for item in ast.walk(tree):
                if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    continue
                start = getattr(item, "lineno", 1)
                end = getattr(item, "end_lineno", start)
                name = item.name
                path_lower = relative.lower()
                is_test = (
                    "/tests/" in f"/{path_lower}/"
                    or Path(relative).name.lower().startswith("test_")
                    or name.startswith("test_")
                )
                kind = "test" if is_test else ("class" if isinstance(item, ast.ClassDef) else "function")
                snippet = "\n".join(lines[max(0, start - 1) : min(len(lines), end)])
                node_id = f"{kind}:{relative}:{name}:{start}"
                self._add_node(
                    Node(
                        id=node_id,
                        path=relative,
                        kind=kind,
                        name=name,
                        start_line=start,
                        end_line=end,
                        text=snippet[:4000],
                    )
                )
                self._add_edge(file_id, node_id, "contains")
                self._add_edge(node_id, file_id, "defines")
                symbol_ids_by_name[name].append(node_id)
                symbol_kinds[node_id] = kind

        # Add local import edges after all file nodes are known.
        for relative, tree, _source in self._ast_records:
            file_id = file_nodes[relative]
            current_module = file_modules[relative]
            for item in ast.walk(tree):
                module_name = None
                if isinstance(item, ast.Import):
                    for alias in item.names:
                        target = self._resolve_import(alias.name)
                        if target in file_nodes:
                            target_id = file_nodes[target]
                            self._add_edge(file_id, target_id, "imports")
                            self._add_edge(target_id, file_id, "imported_by")
                elif isinstance(item, ast.ImportFrom):
                    if item.level:
                        package_parts = current_module.split(".")[:-1]
                        keep = max(0, len(package_parts) - item.level + 1)
                        base_parts = package_parts[:keep]
                        if item.module:
                            base_parts.extend(item.module.split("."))
                        module_name = ".".join(base_parts)
                    else:
                        module_name = item.module or ""
                    target = self._resolve_import(module_name or "")
                    if target in file_nodes:
                        target_id = file_nodes[target]
                        self._add_edge(file_id, target_id, "imports")
                        self._add_edge(target_id, file_id, "imported_by")

        # Add approximate call and test-to-code edges where a name is unique.
        for relative, tree, _source in self._ast_records:
            path_lower = relative.lower()
            file_is_test = "/tests/" in f"/{path_lower}/" or Path(relative).name.lower().startswith("test_")
            for scope in ast.walk(tree):
                if not isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    continue
                start = getattr(scope, "lineno", 1)
                kind = "test" if (file_is_test or scope.name.startswith("test_")) else (
                    "class" if isinstance(scope, ast.ClassDef) else "function"
                )
                source_id = f"{kind}:{relative}:{scope.name}:{start}"
                if source_id not in self.nodes:
                    continue
                for item in ast.walk(scope):
                    if not isinstance(item, ast.Call):
                        continue
                    called_name = self._call_name(item.func)
                    if not called_name:
                        continue
                    candidates = symbol_ids_by_name.get(called_name, [])
                    # Avoid arbitrary links when a name is ambiguous.
                    if len(candidates) != 1:
                        continue
                    target_id = candidates[0]
                    target_kind = symbol_kinds.get(target_id, "")
                    self._add_edge(source_id, target_id, "calls")
                    self._add_edge(target_id, source_id, "called_by")
                    if kind == "test" and target_kind != "test":
                        self._add_edge(source_id, target_id, "tests")
                        self._add_edge(target_id, source_id, "tested_by")

    @staticmethod
    def _call_name(node: ast.AST) -> Optional[str]:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return node.attr
        return None

    def _prepare_lexical_index(self) -> None:
        for node_id, node in self.nodes.items():
            terms = self._terms(node.document)
            self.documents[node_id] = terms
            self.document_frequency.update(set(terms))
        if self.documents:
            self.average_document_length = sum(map(len, self.documents.values())) / len(self.documents)

    @staticmethod
    def _terms(text: str) -> List[str]:
        terms: List[str] = []
        for match in TOKEN_RE.findall(text.lower()):
            terms.extend(part for part in match.split("_") if part)
        return terms

    def _bm25(self, query: str) -> Dict[str, float]:
        query_terms = Counter(self._terms(query))
        scores: Dict[str, float] = {}
        total_docs = max(1, len(self.documents))
        k1, b = 1.5, 0.75
        average_length = max(1.0, self.average_document_length)
        for node_id, terms in self.documents.items():
            frequencies = Counter(terms)
            length = len(terms)
            score = 0.0
            for term, query_frequency in query_terms.items():
                frequency = frequencies.get(term, 0)
                if not frequency:
                    continue
                doc_frequency = self.document_frequency.get(term, 0)
                inverse_frequency = math.log(1.0 + (total_docs - doc_frequency + 0.5) / (doc_frequency + 0.5))
                denominator = frequency + k1 * (1.0 - b + b * length / average_length)
                score += query_frequency * inverse_frequency * frequency * (k1 + 1.0) / denominator
            if score > 0:
                scores[node_id] = score
        return scores

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        # Deliberately simple estimate for this demo; not a model tokenizer.
        return max(1, len(text.split()))

    def retrieve(
        self,
        issue: str,
        feedback: str = "",
        limit: int = 8,
        token_budget: int = 1200,
        expansion_depth: int = 1,
        feedback_weight: float = 1.5,
    ) -> List[Evidence]:
        """Return issue-ranked and graph-expanded code excerpts.

        `feedback` is typically the latest failing-test name/assertion/traceback.
        It is scored separately and weighted so it can redirect retrieval.
        """
        issue_scores = self._bm25(issue)
        feedback_scores = self._bm25(feedback) if feedback.strip() else {}
        scores: Dict[str, float] = {}
        reasons: Dict[str, str] = {}
        for node_id in self.nodes:
            base = issue_scores.get(node_id, 0.0)
            extra = feedback_scores.get(node_id, 0.0) * feedback_weight
            if base + extra > 0:
                scores[node_id] = base + extra
                reasons[node_id] = "issue and test-feedback lexical match" if extra and base else (
                    "test-feedback lexical match" if extra else "issue lexical match"
                )

        seed_ids = [node_id for node_id, _ in sorted(scores.items(), key=lambda item: item[1], reverse=True)[: max(1, limit * 2)]]
        frontier: List[Tuple[str, float, int]] = [(node_id, scores[node_id], 0) for node_id in seed_ids]
        visited = set(seed_ids)
        while frontier:
            source_id, source_score, depth = frontier.pop(0)
            if depth >= expansion_depth:
                continue
            for edge in self.edges.get(source_id, []):
                if edge.target in visited:
                    continue
                visited.add(edge.target)
                boost = source_score * RELATION_WEIGHT.get(edge.relation, 0.25)
                if boost <= 0:
                    continue
                if boost > scores.get(edge.target, 0.0):
                    scores[edge.target] = boost
                    reasons[edge.target] = f"graph expansion: {edge.relation} from {self.nodes[source_id].name}"
                frontier.append((edge.target, boost, depth + 1))

        candidates: List[Tuple[float, str, Node, str, int]] = []
        for node_id, score in scores.items():
            node = self.nodes[node_id]
            excerpt = node.text.strip()
            estimated = self._estimate_tokens(excerpt)
            cost_adjusted = score / (estimated ** 0.35)
            candidates.append((cost_adjusted, node_id, node, reasons.get(node_id, "graph evidence"), estimated))
        candidates.sort(key=lambda row: (row[0], row[2].kind != "test"), reverse=True)

        results: List[Evidence] = []
        used = 0
        for adjusted_score, _node_id, node, reason, estimated in candidates:
            if len(results) >= limit:
                break
            available = token_budget - used
            if available <= 0:
                break
            text_tokens = node.text.split()
            if estimated > available:
                if not results:
                    clipped = " ".join(text_tokens[:available])
                    node = Node(node.id, node.path, node.kind, node.name, node.start_line, node.end_line, clipped)
                    estimated = self._estimate_tokens(clipped)
                else:
                    continue
            results.append(Evidence(node=node, score=adjusted_score, reason=reason, estimated_tokens=estimated))
            used += estimated
        return results

    def counts(self) -> Tuple[int, int]:
        return len(self.nodes), sum(len(edges) for edges in self.edges.values())


def format_evidence(items: Sequence[Evidence]) -> str:
    if not items:
        return "No matching evidence found. Try more specific identifiers or test output."
    blocks = []
    for index, item in enumerate(items, 1):
        node = item.node
        blocks.append(
            f"[{index}] {node.path}:{node.start_line}-{node.end_line} "
            f"({node.kind} {node.name}) | {item.reason} | ~{item.estimated_tokens} words\n"
            f"{node.text.strip()}"
        )
    return "\n\n".join(blocks)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build a local Python code graph and retrieve budgeted evidence.")
    parser.add_argument("repository", type=Path, help="Path to a Python repository")
    parser.add_argument("issue", help="Issue description or search query")
    parser.add_argument("--feedback", default="", help="Latest failing-test output to re-seed retrieval")
    parser.add_argument("--limit", type=int, default=8, help="Maximum excerpts to return")
    parser.add_argument("--token-budget", type=int, default=1200, help="Approximate whitespace-token budget")
    args = parser.parse_args(argv)

    if not args.repository.is_dir():
        parser.error(f"repository directory does not exist: {args.repository}")
    index = RepositoryIndex(args.repository)
    nodes, edges = index.counts()
    print(f"Indexed {nodes} nodes and {edges} directed edges from {args.repository}")
    evidence = index.retrieve(args.issue, args.feedback, args.limit, args.token_budget)
    print(format_evidence(evidence))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
