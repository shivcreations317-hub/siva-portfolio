"""
ShopScope — analysis layer.

Reads the synthetic e-commerce extract, runs data-quality checks, builds the
RFM customer segments and cohort retention matrix, then writes:

    data/summary.json         machine-readable analysis
    data/dashboard-data.js    embedded payload for the live dashboard

Run:
    python python/analyze.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SNAPSHOT = pd.Timestamp("2025-12-31")
MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SEGMENT_ORDER = ["Champions", "Loyal Customers", "New / Potential", "Need Attention", "At Risk", "Hibernating"]


def inr(value: float) -> str:
    if abs(value) >= 1_00_00_000:
        return f"INR {value / 1_00_00_000:.2f} Cr"
    if abs(value) >= 1_00_000:
        return f"INR {value / 1_00_000:.2f} L"
    return f"INR {value:,.0f}"


def rfm_segment(row) -> str:
    r, f, m = int(row["r_score"]), int(row["f_score"]), int(row["m_score"])
    if r >= 4 and f >= 4 and m >= 4:
        return "Champions"
    if r >= 3 and f >= 3:
        return "Loyal Customers"
    if r >= 4 and f <= 2:
        return "New / Potential"
    if r <= 2 and f >= 3:
        return "At Risk"
    if r <= 2 and f <= 2:
        return "Hibernating"
    return "Need Attention"


def main() -> None:
    customers = pd.read_csv(DATA_DIR / "customers.csv", parse_dates=["signup_date", "first_order_date", "last_order_date"])
    orders = pd.read_csv(DATA_DIR / "orders.csv", parse_dates=["order_date"])
    returns = pd.read_csv(DATA_DIR / "returns.csv", parse_dates=["return_date"])
    products = pd.read_csv(DATA_DIR / "products.csv")

    # -----------------------------------------------------------------------
    # Data quality
    # -----------------------------------------------------------------------
    checks = {
        "duplicate_order_ids": int(orders["order_id"].duplicated().sum()),
        "duplicate_customer_ids": int(customers["customer_id"].duplicated().sum()),
        "missing_order_values": int(orders.isna().sum().sum()),
        "negative_net_revenue_rows": int((orders["net_revenue"] < 0).sum()),
        "refund_mismatch_rows": int(
            (
                orders["refund_amount"]
                != orders.apply(lambda row: row["revenue"] if row["is_returned"] else 0, axis=1)
            ).sum()
        ),
        "returns_without_order": int((~returns["order_id"].isin(orders["order_id"])).sum()),
    }

    # -----------------------------------------------------------------------
    # Core KPIs
    # -----------------------------------------------------------------------
    total_revenue = float(orders["revenue"].sum())
    net_revenue = float(orders["net_revenue"].sum())
    total_profit = float(orders["profit"].sum())
    total_orders = int(len(orders))
    total_units = int(orders["units"].sum())
    total_refunds = float(orders["refund_amount"].sum())
    repeat_customers = int(customers["is_repeat"].sum())
    total_customers = int(len(customers))
    returned_orders = int(orders["is_returned"].sum())
    margin = total_profit / net_revenue if net_revenue else 0

    kpis = {
        "gross_revenue": total_revenue,
        "net_revenue": net_revenue,
        "gross_profit": total_profit,
        "margin": margin,
        "orders": total_orders,
        "units": total_units,
        "refunds": total_refunds,
        "aov": net_revenue / total_orders if total_orders else 0,
        "customers": total_customers,
        "repeat_customers": repeat_customers,
        "repeat_customer_rate": repeat_customers / total_customers if total_customers else 0,
        "returned_orders": returned_orders,
        "return_rate": returned_orders / total_orders if total_orders else 0,
    }

    # -----------------------------------------------------------------------
    # Monthly performance
    # -----------------------------------------------------------------------
    monthly = (
        orders.groupby(orders["order_date"].dt.strftime("%b"), as_index=False)
        .agg(
            revenue=("revenue", "sum"),
            net_revenue=("net_revenue", "sum"),
            profit=("profit", "sum"),
            orders=("order_id", "count"),
            returns=("is_returned", "sum"),
        )
    )
    monthly["month"] = pd.Categorical(monthly["order_date"], categories=MONTH_ORDER, ordered=True)
    monthly = monthly.sort_values("month").rename(columns={"order_date": "month_name"})
    monthly["margin"] = monthly["profit"] / monthly["net_revenue"]
    monthly["return_rate"] = monthly["returns"] / monthly["orders"]

    # -----------------------------------------------------------------------
    # Category / product / channel / region performance
    # -----------------------------------------------------------------------
    def performance(frame: pd.DataFrame, key: str) -> pd.DataFrame:
        result = (
            frame.groupby(key, as_index=False)
            .agg(
                revenue=("revenue", "sum"),
                net_revenue=("net_revenue", "sum"),
                profit=("profit", "sum"),
                orders=("order_id", "count"),
                units=("units", "sum"),
                returns=("is_returned", "sum"),
            )
        )
        result["margin"] = result["profit"] / result["net_revenue"]
        result["share"] = result["net_revenue"] / net_revenue
        result["return_rate"] = result["returns"] / result["orders"]
        result["aov"] = result["net_revenue"] / result["orders"]
        return result.sort_values("net_revenue", ascending=False)

    by_category = performance(orders, "category")
    by_product = performance(orders, "product")
    by_channel = performance(orders, "channel")
    by_region = performance(orders, "region")
    by_acquisition = performance(orders, "acquisition_channel")

    # -----------------------------------------------------------------------
    # RFM segmentation
    # -----------------------------------------------------------------------
    customers = customers.copy()
    customers["recency_days"] = (SNAPSHOT - customers["last_order_date"]).dt.days
    customers["frequency"] = customers["total_orders"]
    customers["monetary"] = customers["total_revenue"]

    customers["r_score"] = pd.qcut(
        customers["recency_days"].rank(method="first"), 5, labels=[5, 4, 3, 2, 1]
    ).astype(int)
    customers["f_score"] = pd.qcut(
        customers["frequency"].rank(method="first"), 5, labels=[1, 2, 3, 4, 5]
    ).astype(int)
    customers["m_score"] = pd.qcut(
        customers["monetary"].rank(method="first"), 5, labels=[1, 2, 3, 4, 5]
    ).astype(int)
    customers["rfm_score"] = customers["r_score"].astype(str) + customers["f_score"].astype(str) + customers["m_score"].astype(str)
    customers["segment"] = customers.apply(rfm_segment, axis=1)

    segment_summary = (
        customers.groupby("segment", as_index=False)
        .agg(
            customers=("customer_id", "count"),
            revenue=("total_revenue", "sum"),
            avg_orders=("total_orders", "mean"),
            avg_aov=("avg_order_value", "mean"),
            avg_recency=("recency_days", "mean"),
        )
    )
    segment_summary["revenue_share"] = segment_summary["revenue"] / net_revenue
    segment_summary["customer_share"] = segment_summary["customers"] / total_customers
    segment_summary["segment"] = pd.Categorical(segment_summary["segment"], categories=SEGMENT_ORDER, ordered=True)
    segment_summary = segment_summary.sort_values("segment")

    # Merge segment back onto orders for dashboard filtering.
    orders = orders.merge(
        customers[["customer_id", "segment", "rfm_score"]],
        on="customer_id",
        how="left",
    )

    # -----------------------------------------------------------------------
    # Cohort retention
    # -----------------------------------------------------------------------
    cohort_sizes = (
        customers.groupby(customers["first_order_date"].dt.strftime("%b"))["customer_id"]
        .nunique()
        .reindex(MONTH_ORDER, fill_value=0)
    )
    cohort_rows = []
    for cohort in MONTH_ORDER:
        cohort_customers = customers[customers["first_order_date"].dt.strftime("%b") == cohort]["customer_id"]
        if cohort_customers.empty:
            continue
        cohort_orders = orders[orders["customer_id"].isin(cohort_customers)]
        row = {"cohort": cohort, "size": int(cohort_customers.nunique()), "retention": []}
        for period in range(12):
            retained = cohort_orders[cohort_orders["cohort_index"] == period]["customer_id"].nunique()
            row["retention"].append(round(retained / row["size"], 4) if row["size"] else 0)
        cohort_rows.append(row)

    # -----------------------------------------------------------------------
    # Returns
    # -----------------------------------------------------------------------
    return_reasons = (
        returns.groupby("reason", as_index=False)
        .agg(returns=("return_id", "count"), refund=("refund_amount", "sum"))
        .assign(share=lambda d: d["returns"] / len(returns))
        .sort_values("returns", ascending=False)
    )
    return_by_category = by_category[["category", "orders", "returns", "return_rate", "revenue", "net_revenue"]].copy()
    return_by_category["refund"] = return_by_category["category"].map(
        returns.groupby("category")["refund_amount"].sum()
    ).fillna(0)

    top_customers = customers.sort_values("total_revenue", ascending=False).head(10)

    # -----------------------------------------------------------------------
    # Outputs
    # -----------------------------------------------------------------------
    summary = {
        "meta": {
            "project": "ShopScope",
            "brand": "NovaCart",
            "period": "FY 2025",
            "currency": "INR",
            "as_of": "2025-12-31",
            "source": "Synthetic e-commerce extract",
        },
        "data_quality": checks,
        "kpis": kpis,
        "monthly": monthly.to_dict(orient="records"),
        "by_category": by_category.to_dict(orient="records"),
        "by_product": by_product.to_dict(orient="records"),
        "by_channel": by_channel.to_dict(orient="records"),
        "by_region": by_region.to_dict(orient="records"),
        "by_acquisition": by_acquisition.to_dict(orient="records"),
        "segments": segment_summary.to_dict(orient="records"),
        "cohorts": cohort_rows,
        "return_reasons": return_reasons.to_dict(orient="records"),
        "return_by_category": return_by_category.to_dict(orient="records"),
        "top_customers": top_customers.to_dict(orient="records"),
    }

    (DATA_DIR / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

    scored_customers = customers.assign(
        signup_date=customers["signup_date"].dt.strftime("%Y-%m-%d"),
        first_order_date=customers["first_order_date"].dt.strftime("%Y-%m-%d"),
        last_order_date=customers["last_order_date"].dt.strftime("%Y-%m-%d"),
    )
    scored_customers.to_csv(DATA_DIR / "customers_scored.csv", index=False)

    payload = {
        "meta": summary["meta"],
        "transactions": orders.assign(
            order_date=orders["order_date"].dt.strftime("%Y-%m-%d")
        ).to_dict(orient="records"),
        "customers": scored_customers.to_dict(orient="records"),
        "returns": returns.assign(
            return_date=returns["return_date"].dt.strftime("%Y-%m-%d")
        ).to_dict(orient="records"),
        "products": products.to_dict(orient="records"),
        "summary": summary,
    }
    (DATA_DIR / "dashboard-data.js").write_text(
        "window.SHOPSCOPE_DATA = " + json.dumps(payload, separators=(",", ":"), default=str) + ";\n",
        encoding="utf-8",
    )

    # -----------------------------------------------------------------------
    # Console narrative
    # -----------------------------------------------------------------------
    top_category = by_category.iloc[0]
    best_margin = by_category.sort_values("margin", ascending=False).iloc[0]
    worst_margin = by_category.sort_values("margin").iloc[0]
    top_reason = return_reasons.iloc[0]
    best_month = monthly.loc[monthly["net_revenue"].idxmax()]

    print("ShopScope — FY 2025 analysis")
    print("=" * 62)
    print(f"Gross revenue      {inr(total_revenue)}")
    print(f"Net revenue        {inr(net_revenue)}")
    print(f"Gross profit       {inr(total_profit)}  ({margin:.1%} margin)")
    print(f"Orders             {total_orders:,}  |  Units {total_units:,}")
    print(f"AOV                {inr(kpis['aov'])}")
    print(f"Repeat customers   {repeat_customers:,} / {total_customers:,} ({kpis['repeat_customer_rate']:.1%})")
    print(f"Return rate        {kpis['return_rate']:.1%} ({returned_orders:,} orders)")
    print(f"Top category       {top_category['category']} ({top_category['share']:.1%} of net revenue)")
    print(f"Best margin        {best_margin['category']} ({best_margin['margin']:.1%})")
    print(f"Weakest margin     {worst_margin['category']} ({worst_margin['margin']:.1%})")
    print(f"Top return reason  {top_reason['reason']} ({top_reason['share']:.1%})")
    print(f"Peak month         {best_month['month_name']} ({inr(best_month['net_revenue'])})")
    print(f"Data checks        {checks}")
    print("\nRFM segments")
    for row in segment_summary.itertuples():
        print(f"  {row.segment:<18} {row.customers:>4} customers  {row.revenue_share:>6.1%} revenue  AOV {inr(row.avg_aov)}")
    print(f"\nWrote {DATA_DIR / 'summary.json'}")
    print(f"Wrote {DATA_DIR / 'customers_scored.csv'}")
    print(f"Wrote {DATA_DIR / 'dashboard-data.js'}")


if __name__ == "__main__":
    main()
