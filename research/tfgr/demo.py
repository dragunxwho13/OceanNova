"""Show how a failing-test message can redirect a repository search."""
from pathlib import Path

from tfgr import RepositoryIndex, format_evidence


ROOT = Path(__file__).resolve().parent
TOY_REPOSITORY = ROOT / "examples" / "tiny_repo"
ISSUE = "final_price applies the discount rate as the remaining price; return the reduced final price"
FAILURE = (
    "FAILED tests/test_pricing.py::test_discount_reduces_price "
    "AssertionError: expected 80.0, got 20.0"
)


def main() -> None:
    index = RepositoryIndex(TOY_REPOSITORY)
    node_count, edge_count = index.counts()
    print("TFGR retrieval-only prototype")
    print(f"Indexed {node_count} nodes and {edge_count} directed edges. No model or tests are run.\n")

    print("=== Initial retrieval from issue ===")
    initial = index.retrieve(ISSUE, limit=5, token_budget=450)
    print(format_evidence(initial))

    print("\n=== Retrieval after simulated failing-test feedback ===")
    updated = index.retrieve(ISSUE, feedback=FAILURE, limit=5, token_budget=450)
    print(format_evidence(updated))


if __name__ == "__main__":
    main()
