"""Tiny example module for demonstrating repository retrieval."""


def final_price(price: float, discount_rate: float) -> float:
    """Return the final price after applying a fractional discount."""
    # Intentionally incorrect example: it returns the discount amount.
    return round(price * discount_rate, 2)
