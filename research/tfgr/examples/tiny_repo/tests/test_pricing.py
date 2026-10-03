from src.pricing import final_price


def test_discount_reduces_price():
    assert final_price(100.0, 0.20) == 80.0
