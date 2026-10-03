import unittest
from pathlib import Path

from tfgr import RepositoryIndex


FIXTURE = Path(__file__).resolve().parent / "examples" / "tiny_repo"


class RepositoryIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = RepositoryIndex(FIXTURE)

    def test_indexes_source_and_test_symbols(self):
        kinds = {node.kind for node in self.index.nodes.values()}
        names = {node.name for node in self.index.nodes.values()}
        self.assertIn("file", kinds)
        self.assertIn("function", kinds)
        self.assertIn("test", kinds)
        self.assertIn("final_price", names)
        self.assertIn("test_discount_reduces_price", names)

    def test_creates_test_to_code_relationship(self):
        test_id = next(node_id for node_id, node in self.index.nodes.items() if node.name == "test_discount_reduces_price")
        target_id = next(node_id for node_id, node in self.index.nodes.items() if node.name == "final_price")
        relations = {(edge.target, edge.relation) for edge in self.index.edges[test_id]}
        self.assertIn((target_id, "tests"), relations)

    def test_issue_retrieval_finds_relevant_source(self):
        results = self.index.retrieve(
            "final_price applies discount rate instead of returning the reduced price",
            limit=5,
            token_budget=500,
        )
        paths = {result.node.path for result in results}
        self.assertIn("src/pricing.py", paths)

    def test_test_feedback_can_retrieve_failing_test(self):
        results = self.index.retrieve(
            "final_price returns the wrong value",
            feedback="FAILED tests/test_pricing.py::test_discount_reduces_price AssertionError expected 80 got 20",
            limit=8,
            token_budget=500,
        )
        paths = {result.node.path for result in results}
        self.assertIn("tests/test_pricing.py", paths)

    def test_respects_word_based_context_budget(self):
        budget = 45
        results = self.index.retrieve(
            "final_price discount calculation test",
            feedback="FAILED test_discount_reduces_price expected 80 got 20",
            limit=10,
            token_budget=budget,
        )
        self.assertLessEqual(sum(item.estimated_tokens for item in results), budget)


if __name__ == "__main__":
    unittest.main()
