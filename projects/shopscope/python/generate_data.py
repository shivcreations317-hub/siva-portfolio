"""
ShopScope — synthetic e-commerce data generator.

Builds a reproducible FY 2025 dataset for a D2C lifestyle brand:
    customers.csv  1,000 customers
    orders.csv     ~1,800 orders
    returns.csv    one row per returned order
    products.csv   24 SKUs

Run:
    python python/generate_data.py
"""

from __future__ import annotations

import csv
import random
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SEED = 2026
random.seed(SEED)

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------
PRODUCTS = [
    # Apparel
    ("P001", "Oversized Cotton Tee", "Apparel", 899, 420, 1.25),
    ("P002", "Linen Blend Shirt", "Apparel", 1499, 720, 1.10),
    ("P003", "Slim Fit Chinos", "Apparel", 1799, 860, 0.95),
    ("P004", "Floral Midi Dress", "Apparel", 2199, 1050, 1.05),
    ("P005", "Denim Jacket", "Apparel", 2499, 1250, 0.70),
    # Footwear
    ("P006", "Everyday Sneakers", "Footwear", 2999, 1550, 1.15),
    ("P007", "Leather Loafers", "Footwear", 3499, 1900, 0.70),
    ("P008", "Running Shoes", "Footwear", 4299, 2300, 0.90),
    ("P009", "Block Heels", "Footwear", 2299, 1150, 0.75),
    # Accessories
    ("P010", "Canvas Tote", "Accessories", 799, 320, 1.20),
    ("P011", "Minimal Watch", "Accessories", 3999, 2100, 0.60),
    ("P012", "Sunglasses", "Accessories", 1299, 520, 0.85),
    ("P013", "Baseball Cap", "Accessories", 599, 240, 0.95),
    # Home & Living
    ("P014", "Cotton Bedsheet Set", "Home & Living", 2499, 1250, 0.95),
    ("P015", "Ceramic Mug Set", "Home & Living", 1199, 480, 0.85),
    ("P016", "Scented Candle", "Home & Living", 899, 330, 0.90),
    ("P017", "Cushion Cover Set", "Home & Living", 1499, 620, 0.80),
    # Beauty
    ("P018", "Vitamin C Serum", "Beauty", 1299, 390, 1.25),
    ("P019", "Matte Lipstick", "Beauty", 699, 210, 1.10),
    ("P020", "Sunscreen SPF 50", "Beauty", 899, 300, 1.05),
    ("P021", "Hair Mask", "Beauty", 1099, 380, 0.90),
    # Electronics
    ("P022", "Wireless Earbuds", "Electronics", 2999, 1800, 0.95),
    ("P023", "Smart Band", "Electronics", 2499, 1450, 0.80),
    ("P024", "Portable Speaker", "Electronics", 3499, 2050, 0.65),
]

CATEGORY_WEIGHTS = {
    "Apparel": 0.28,
    "Footwear": 0.17,
    "Accessories": 0.12,
    "Home & Living": 0.17,
    "Beauty": 0.14,
    "Electronics": 0.12,
}
CATEGORY_RETURN_RATE = {
    "Apparel": 0.155,
    "Footwear": 0.185,
    "Accessories": 0.070,
    "Home & Living": 0.080,
    "Beauty": 0.050,
    "Electronics": 0.100,
}
REGION_WEIGHTS = {"North": 0.27, "West": 0.25, "South": 0.23, "East": 0.15, "Central": 0.10}
TIER_WEIGHTS = {"Metro": 0.34, "Tier 1": 0.30, "Tier 2": 0.25, "Tier 3": 0.11}
AGE_WEIGHTS = {"18-24": 0.22, "25-34": 0.34, "35-44": 0.24, "45-54": 0.14, "55+": 0.06}
GENDER_WEIGHTS = {"Female": 0.58, "Male": 0.40, "Other": 0.02}
ACQUISITION_WEIGHTS = {
    "Organic": 0.24,
    "Paid Search": 0.22,
    "Social": 0.26,
    "Referral": 0.10,
    "Marketplace": 0.12,
    "Email": 0.06,
}
CHANNEL_WEIGHTS = {"Website": 0.36, "Mobile App": 0.34, "Marketplace": 0.20, "Social Commerce": 0.10}
CHANNEL_DISCOUNT = {
    "Website": (0.00, 0.20),
    "Mobile App": (0.05, 0.25),
    "Marketplace": (0.10, 0.30),
    "Social Commerce": (0.15, 0.35),
}
PAYMENT_WEIGHTS = {"UPI": 0.34, "Credit Card": 0.24, "Debit Card": 0.15, "COD": 0.18, "Wallet": 0.09}
FIRST_MONTH_WEIGHTS = [0.88, 0.90, 0.98, 1.02, 0.96, 0.92, 1.00, 1.06, 1.16, 1.30, 1.34, 1.12]
ORDER_COUNT_WEIGHTS = [(1, 0.46), (2, 0.25), (3, 0.14), (4, 0.08), (5, 0.04), (6, 0.02), (7, 0.01)]

FIRST_NAMES = [
    "Aarav", "Aditi", "Advait", "Aisha", "Ananya", "Arjun", "Aryan", "Avni", "Dhruv", "Diya",
    "Ishaan", "Isha", "Kabir", "Kavya", "Krishna", "Meera", "Naina", "Neel", "Nisha", "Om",
    "Pari", "Pranav", "Priya", "Rahul", "Riya", "Rohan", "Saanvi", "Sahil", "Sara", "Shiv",
    "Siddharth", "Sneha", "Tanvi", "Tara", "Ved", "Vihaan", "Vikram", "Vivaan", "Yash", "Zara",
]
LAST_NAMES = [
    "Agarwal", "Bansal", "Bhat", "Chandra", "Chopra", "Desai", "Dubey", "Gandhi", "Gupta", "Iyer",
    "Jain", "Joshi", "Kapoor", "Khan", "Kulkarni", "Kumar", "Malhotra", "Mehta", "Menon", "Mishra",
    "Nair", "Nanda", "Patel", "Pillai", "Rao", "Reddy", "Roy", "Saxena", "Shah", "Sharma",
    "Shetty", "Singh", "Sinha", "Srinivasan", "Tiwari", "Tripathi", "Varma", "Verma", "Yadav", "Zutshi",
]

RETURN_REASONS_FIT = [
    ("Size / fit", 0.45),
    ("Changed mind", 0.20),
    ("Not as described", 0.14),
    ("Quality issue", 0.10),
    ("Damaged in transit", 0.06),
    ("Late delivery", 0.05),
]
RETURN_REASONS_GENERAL = [
    ("Changed mind", 0.30),
    ("Damaged in transit", 0.20),
    ("Not as described", 0.20),
    ("Quality issue", 0.15),
    ("Late delivery", 0.10),
    ("Size / fit", 0.05),
]


def weighted_choice(options):
    """Pick from [(value, weight), ...] or a dict of value -> weight."""
    if isinstance(options, dict):
        options = list(options.items())
    total = sum(weight for _, weight in options)
    pick = random.random() * total
    upto = 0.0
    for value, weight in options:
        upto += weight
        if pick <= upto:
            return value
    return options[-1][0]


def product_choices(category: str):
    return [(row, row[5]) for row in PRODUCTS if row[2] == category]


def make_customers():
    customers = []
    used_names = set()
    for index in range(1, 1001):
        # Keep names unique enough for a realistic customer master.
        for _ in range(20):
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            if (first, last) not in used_names:
                used_names.add((first, last))
                break
        else:
            first, last = random.choice(FIRST_NAMES), random.choice(LAST_NAMES) + str(index)

        region = weighted_choice(REGION_WEIGHTS)
        tier = weighted_choice(TIER_WEIGHTS)
        age_group = weighted_choice(AGE_WEIGHTS)
        gender = weighted_choice(GENDER_WEIGHTS)
        acquisition = weighted_choice(ACQUISITION_WEIGHTS)
        first_month = weighted_choice([(month, weight) for month, weight in enumerate(FIRST_MONTH_WEIGHTS, start=1)])
        first_order_date = date(2025, first_month, random.randint(1, 28))
        signup_date = first_order_date - timedelta(days=random.randint(0, 120))
        if signup_date < date(2024, 1, 1):
            signup_date = date(2024, 1, 1)

        customers.append(
            {
                "customer_id": f"CUST-{index:04d}",
                "customer_name": f"{first} {last}",
                "email": f"{first.lower()}.{last.lower()}{index}@example.com",
                "signup_date": signup_date.isoformat(),
                "region": region,
                "city_tier": tier,
                "age_group": age_group,
                "gender": gender,
                "acquisition_channel": acquisition,
                "first_order_date": first_order_date.isoformat(),
                "target_orders": weighted_choice(ORDER_COUNT_WEIGHTS),
            }
        )
    return customers


def make_orders(customers):
    orders = []
    order_number = 0
    for customer in customers:
        first_order_date = date.fromisoformat(customer["first_order_date"])
        order_dates = [first_order_date]
        current = first_order_date
        for _ in range(customer["target_orders"] - 1):
            gap = int(random.triangular(22, 155, 48))
            current = current + timedelta(days=max(12, gap))
            if current > date(2025, 12, 31):
                break
            order_dates.append(current)

        for sequence, order_date in enumerate(order_dates, start=1):
            order_number += 1
            category = weighted_choice(CATEGORY_WEIGHTS)
            product = weighted_choice(product_choices(category))
            product_id, product_name, product_category, price, cost, _ = product
            channel = weighted_choice(CHANNEL_WEIGHTS)
            units_choices = [(1, 0.70), (2, 0.20), (3, 0.07), (4, 0.03)]
            if category in ("Beauty", "Accessories"):
                units_choices = [(1, 0.58), (2, 0.27), (3, 0.10), (4, 0.05)]
            units = weighted_choice(units_choices)

            discount_low, discount_high = CHANNEL_DISCOUNT[channel]
            discount = round(random.uniform(discount_low, discount_high), 3)
            if random.random() < 0.12:
                discount = round(max(0, discount - random.uniform(0.03, 0.10)), 3)

            revenue = round(units * price * (1 - discount), 2)
            order_cost = round(units * cost, 2)
            payment = weighted_choice(PAYMENT_WEIGHTS)
            delivery_days = random.randint(2, 9) + (1 if payment == "COD" else 0)

            return_probability = CATEGORY_RETURN_RATE[category]
            if channel in ("Marketplace", "Social Commerce"):
                return_probability += 0.025
            if payment == "COD":
                return_probability += 0.030
            if discount > 0.25:
                return_probability += 0.020
            is_returned = random.random() < min(0.38, return_probability)

            reason = "Not returned"
            refund = 0.0
            if is_returned:
                reasons = RETURN_REASONS_FIT if category in ("Apparel", "Footwear") else RETURN_REASONS_GENERAL
                reason = weighted_choice(reasons)
                refund = revenue
                rating = random.choice([1, 2, 3])
            else:
                rating = random.choices([3, 4, 5], weights=[0.12, 0.38, 0.50], k=1)[0]

            net_revenue = round(revenue - refund, 2)
            profit = round(net_revenue - order_cost, 2)

            orders.append(
                {
                    "order_id": "",
                    "order_date": order_date.isoformat(),
                    "month": order_date.strftime("%b"),
                    "quarter": f"Q{(order_date.month - 1) // 3 + 1}",
                    "customer_id": customer["customer_id"],
                    "customer_name": customer["customer_name"],
                    "region": customer["region"],
                    "city_tier": customer["city_tier"],
                    "age_group": customer["age_group"],
                    "gender": customer["gender"],
                    "acquisition_channel": customer["acquisition_channel"],
                    "channel": channel,
                    "category": product_category,
                    "product_id": product_id,
                    "product": product_name,
                    "units": units,
                    "unit_price": price,
                    "unit_cost": cost,
                    "discount_pct": discount,
                    "revenue": revenue,
                    "cost": order_cost,
                    "refund_amount": refund,
                    "net_revenue": net_revenue,
                    "profit": profit,
                    "payment_method": payment,
                    "delivery_days": delivery_days,
                    "rating": rating,
                    "is_returned": int(is_returned),
                    "return_reason": reason,
                    "order_sequence": sequence,
                    "is_repeat": int(sequence > 1),
                    "cohort_month": first_order_date.strftime("%b"),
                    "cohort_index": (order_date.year - first_order_date.year) * 12 + order_date.month - first_order_date.month,
                }
            )

    orders.sort(key=lambda row: (row["order_date"], row["customer_id"]))
    for index, row in enumerate(orders, start=1):
        row["order_id"] = f"ORD-2025-{index:04d}"
    return orders


def make_returns(orders):
    returns = []
    for order in orders:
        if not order["is_returned"]:
            continue
        return_date = date.fromisoformat(order["order_date"]) + timedelta(days=random.randint(2, 14))
        if return_date > date(2025, 12, 31):
            return_date = date(2025, 12, 31)
        returns.append(
            {
                "return_id": f"RET-{len(returns) + 1:04d}",
                "order_id": order["order_id"],
                "return_date": return_date.isoformat(),
                "customer_id": order["customer_id"],
                "category": order["category"],
                "product": order["product"],
                "units": order["units"],
                "reason": order["return_reason"],
                "refund_amount": order["refund_amount"],
            }
        )
    returns.sort(key=lambda row: row["return_date"])
    for index, row in enumerate(returns, start=1):
        row["return_id"] = f"RET-{index:04d}"
    return returns


def enrich_customers(customers, orders):
    by_customer = defaultdict(list)
    for order in orders:
        by_customer[order["customer_id"]].append(order)

    rows = []
    for customer in customers:
        customer_orders = by_customer[customer["customer_id"]]
        if not customer_orders:
            continue
        total_orders = len(customer_orders)
        total_revenue = sum(order["net_revenue"] for order in customer_orders)
        total_refunds = sum(order["refund_amount"] for order in customer_orders)
        rows.append(
            {
                "customer_id": customer["customer_id"],
                "customer_name": customer["customer_name"],
                "email": customer["email"],
                "signup_date": customer["signup_date"],
                "region": customer["region"],
                "city_tier": customer["city_tier"],
                "age_group": customer["age_group"],
                "gender": customer["gender"],
                "acquisition_channel": customer["acquisition_channel"],
                "first_order_date": min(order["order_date"] for order in customer_orders),
                "last_order_date": max(order["order_date"] for order in customer_orders),
                "total_orders": total_orders,
                "total_revenue": round(total_revenue, 2),
                "total_refunds": round(total_refunds, 2),
                "avg_order_value": round(total_revenue / total_orders, 2),
                "is_repeat": int(total_orders > 1),
            }
        )
    return rows


def write_csv(path: Path, rows, fieldnames=None):
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames or list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    customers = make_customers()
    orders = make_orders(customers)
    returns = make_returns(orders)
    customer_rows = enrich_customers(customers, orders)

    write_csv(DATA_DIR / "customers.csv", customer_rows)
    write_csv(DATA_DIR / "orders.csv", orders)
    write_csv(DATA_DIR / "returns.csv", returns)
    write_csv(
        DATA_DIR / "products.csv",
        [
            {
                "product_id": product_id,
                "product": product_name,
                "category": category,
                "unit_price": price,
                "unit_cost": cost,
            }
            for product_id, product_name, category, price, cost, _ in PRODUCTS
        ],
    )

    revenue = sum(row["revenue"] for row in orders)
    net_revenue = sum(row["net_revenue"] for row in orders)
    profit = sum(row["profit"] for row in orders)
    repeat_customers = sum(1 for row in customer_rows if row["is_repeat"])
    print(f"Wrote {len(customer_rows):,} customers and {len(orders):,} orders")
    print(f"Gross revenue: INR {revenue:,.0f} | Net revenue: INR {net_revenue:,.0f} | Gross profit: INR {profit:,.0f}")
    print(f"Repeat customers: {repeat_customers:,} / {len(customer_rows):,} ({repeat_customers / len(customer_rows):.1%})")
    print(f"Returns: {len(returns):,} ({len(returns) / len(orders):.1%})")


if __name__ == "__main__":
    main()
