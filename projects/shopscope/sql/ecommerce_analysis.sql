/* ============================================================================
   ShopScope — E-Commerce Sales & Customer Analysis
   SQL Server 2008 compatible analysis layer
   ----------------------------------------------------------------------------
   Tables expected:
     dbo.Customers  (customer_id, customer_name, signup_date, region, city_tier,
                     age_group, gender, acquisition_channel)
                     -- load data/customers_scored.csv; extra RFM columns are fine
     dbo.Products   (product_id, product, category, unit_price, unit_cost)
     dbo.Orders     (order_id, order_date, customer_id, channel, product_id,
                     units, unit_price, unit_cost, discount_pct, revenue, cost,
                     refund_amount, net_revenue, profit, payment_method,
                     delivery_days, rating, is_returned, return_reason,
                     order_sequence, is_repeat, cohort_month, cohort_index)
     dbo.Returns    (return_id, order_id, return_date, customer_id, category,
                     product, units, reason, refund_amount)

   Snapshot date: 2025-12-31
   ============================================================================ */


/* ----------------------------------------------------------------------------
   1. DATA QUALITY — run this before trusting any number
   ---------------------------------------------------------------------------- */
SELECT
    (SELECT COUNT(*) FROM dbo.Orders)                         AS order_rows,
    (SELECT COUNT(DISTINCT order_id) FROM dbo.Orders)         AS distinct_orders,
    (SELECT COUNT(*) FROM dbo.Customers)                      AS customer_rows,
    (SELECT COUNT(DISTINCT customer_id) FROM dbo.Customers)   AS distinct_customers,
    (SELECT COUNT(*) FROM dbo.Orders WHERE revenue < 0)       AS negative_revenue_rows,
    (SELECT COUNT(*) FROM dbo.Orders
      WHERE refund_amount <> CASE WHEN is_returned = 1 THEN revenue ELSE 0 END)
                                                              AS refund_mismatch_rows,
    (SELECT COUNT(*) FROM dbo.Returns r
      WHERE NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.order_id = r.order_id))
                                                              AS orphan_returns;


/* ----------------------------------------------------------------------------
   2. MONTHLY SALES, MARGIN AND RETURN RATE
   ---------------------------------------------------------------------------- */
SELECT
    DATEPART(month, order_date) AS month_no,
    DATENAME(month, order_date) AS month_name,
    SUM(revenue)                AS gross_revenue,
    SUM(net_revenue)            AS net_revenue,
    SUM(profit)                 AS gross_profit,
    COUNT(*)                    AS orders,
    SUM(is_returned)            AS returned_orders,
    CAST(SUM(profit) * 1.0 / NULLIF(SUM(net_revenue), 0) AS DECIMAL(6,4)) AS margin,
    CAST(SUM(is_returned) * 1.0 / NULLIF(COUNT(*), 0) AS DECIMAL(6,4))    AS return_rate
FROM dbo.Orders
GROUP BY DATEPART(month, order_date), DATENAME(month, order_date)
ORDER BY month_no;


/* ----------------------------------------------------------------------------
   3. CATEGORY PERFORMANCE — revenue, margin, returns
   ---------------------------------------------------------------------------- */
SELECT
    p.category,
    SUM(o.net_revenue)                                      AS net_revenue,
    SUM(o.profit)                                           AS gross_profit,
    COUNT(*)                                                AS orders,
    SUM(o.is_returned)                                      AS returned_orders,
    CAST(SUM(o.profit) * 1.0 / NULLIF(SUM(o.net_revenue), 0) AS DECIMAL(6,4)) AS margin,
    CAST(SUM(o.is_returned) * 1.0 / NULLIF(COUNT(*), 0) AS DECIMAL(6,4))      AS return_rate,
    CAST(SUM(o.net_revenue) * 1.0 /
         NULLIF((SELECT SUM(net_revenue) FROM dbo.Orders), 0) AS DECIMAL(6,4)) AS revenue_share
FROM dbo.Orders o
JOIN dbo.Products p ON p.product_id = o.product_id
GROUP BY p.category
ORDER BY net_revenue DESC;


/* ----------------------------------------------------------------------------
   4. TOP 10 PRODUCTS BY NET REVENUE
   ---------------------------------------------------------------------------- */
SELECT TOP 10
    p.product,
    p.category,
    SUM(o.net_revenue)                                      AS net_revenue,
    SUM(o.profit)                                           AS gross_profit,
    COUNT(*)                                                AS orders,
    SUM(o.is_returned)                                      AS returned_orders,
    CAST(SUM(o.profit) * 1.0 / NULLIF(SUM(o.net_revenue), 0) AS DECIMAL(6,4)) AS margin,
    CAST(SUM(o.is_returned) * 1.0 / NULLIF(COUNT(*), 0) AS DECIMAL(6,4))      AS return_rate
FROM dbo.Orders o
JOIN dbo.Products p ON p.product_id = o.product_id
GROUP BY p.product, p.category
ORDER BY net_revenue DESC;


/* ----------------------------------------------------------------------------
   5. NEW VS REPEAT CUSTOMER REVENUE
      Repeat = an order after the customer's first order.
   ---------------------------------------------------------------------------- */
SELECT
    CASE WHEN o.order_sequence = 1 THEN 'New' ELSE 'Repeat' END AS customer_type,
    COUNT(*)                    AS orders,
    COUNT(DISTINCT o.customer_id) AS customers,
    SUM(o.net_revenue)          AS net_revenue,
    CAST(SUM(o.net_revenue) * 1.0 /
         NULLIF((SELECT SUM(net_revenue) FROM dbo.Orders), 0) AS DECIMAL(6,4)) AS revenue_share,
    CAST(AVG(o.net_revenue) AS DECIMAL(12,2)) AS avg_order_value
FROM dbo.Orders o
GROUP BY CASE WHEN o.order_sequence = 1 THEN 'New' ELSE 'Repeat' END
ORDER BY customer_type;


/* ----------------------------------------------------------------------------
   6. RFM SEGMENTATION — SQL Server 2008 (NTILE is available)
      Recency: lower days = better, so score is reversed.
   ---------------------------------------------------------------------------- */
WITH customer_rollup AS (
    SELECT
        c.customer_id,
        c.customer_name,
        DATEDIFF(day, MAX(o.order_date), '2025-12-31') AS recency_days,
        COUNT(DISTINCT o.order_id)                     AS frequency,
        SUM(o.net_revenue)                             AS monetary
    FROM dbo.Customers c
    JOIN dbo.Orders o ON o.customer_id = c.customer_id
    GROUP BY c.customer_id, c.customer_name
),
scored AS (
    SELECT
        customer_id,
        customer_name,
        recency_days,
        frequency,
        monetary,
        6 - NTILE(5) OVER (ORDER BY recency_days ASC) AS r_score,
        NTILE(5) OVER (ORDER BY frequency ASC)        AS f_score,
        NTILE(5) OVER (ORDER BY monetary ASC)         AS m_score
    FROM customer_rollup
),
segmented AS (
    SELECT
        *,
        CASE
            WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
            WHEN r_score >= 3 AND f_score >= 3                  THEN 'Loyal Customers'
            WHEN r_score >= 4 AND f_score <= 2                  THEN 'New / Potential'
            WHEN r_score <= 2 AND f_score >= 3                  THEN 'At Risk'
            WHEN r_score <= 2 AND f_score <= 2                  THEN 'Hibernating'
            ELSE 'Need Attention'
        END AS segment
    FROM scored
)
SELECT
    segment,
    COUNT(*)                    AS customers,
    SUM(monetary)               AS net_revenue,
    CAST(AVG(frequency) AS DECIMAL(8,2)) AS avg_orders,
    CAST(AVG(monetary / frequency) AS DECIMAL(12,2)) AS avg_order_value,
    CAST(AVG(recency_days) AS DECIMAL(8,1)) AS avg_recency_days
FROM segmented
GROUP BY segment
ORDER BY net_revenue DESC;


/* ----------------------------------------------------------------------------
   7. COHORT RETENTION — long format
      Month 0 = the customer's first order month.
   ---------------------------------------------------------------------------- */
WITH first_orders AS (
    SELECT
        customer_id,
        MIN(order_date) AS first_order_date
    FROM dbo.Orders
    GROUP BY customer_id
),
cohort_base AS (
    SELECT
        o.customer_id,
        DATEADD(month, DATEDIFF(month, 0, f.first_order_date), 0) AS cohort_month,
        DATEDIFF(month, f.first_order_date, o.order_date)          AS month_index
    FROM dbo.Orders o
    JOIN first_orders f ON f.customer_id = o.customer_id
),
cohort_size AS (
    SELECT
        cohort_month,
        COUNT(DISTINCT customer_id) AS cohort_customers
    FROM cohort_base
    WHERE month_index = 0
    GROUP BY cohort_month
)
SELECT
    CONVERT(char(7), cb.cohort_month, 120) AS cohort,
    cs.cohort_customers,
    cb.month_index,
    COUNT(DISTINCT cb.customer_id) AS retained_customers,
    CAST(COUNT(DISTINCT cb.customer_id) * 1.0 /
         NULLIF(cs.cohort_customers, 0) AS DECIMAL(6,4)) AS retention_rate
FROM cohort_base cb
JOIN cohort_size cs ON cs.cohort_month = cb.cohort_month
GROUP BY cb.cohort_month, cs.cohort_customers, cb.month_index
ORDER BY cb.cohort_month, cb.month_index;


/* ----------------------------------------------------------------------------
   8. RETURN REASONS
   ---------------------------------------------------------------------------- */
SELECT
    reason,
    COUNT(*)                    AS returns,
    SUM(refund_amount)          AS refund_value,
    CAST(COUNT(*) * 1.0 /
         NULLIF((SELECT COUNT(*) FROM dbo.Returns), 0) AS DECIMAL(6,4)) AS share_of_returns
FROM dbo.Returns
GROUP BY reason
ORDER BY returns DESC;


/* ----------------------------------------------------------------------------
   9. RETURN RATE BY CATEGORY
   ---------------------------------------------------------------------------- */
SELECT
    p.category,
    COUNT(*)                    AS orders,
    SUM(o.is_returned)          AS returned_orders,
    SUM(o.refund_amount)        AS refund_value,
    CAST(SUM(o.is_returned) * 1.0 / NULLIF(COUNT(*), 0) AS DECIMAL(6,4)) AS return_rate
FROM dbo.Orders o
JOIN dbo.Products p ON p.product_id = o.product_id
GROUP BY p.category
ORDER BY return_rate DESC;


/* ----------------------------------------------------------------------------
   10. CHANNEL PERFORMANCE
   ---------------------------------------------------------------------------- */
SELECT
    channel,
    COUNT(*)                    AS orders,
    COUNT(DISTINCT customer_id) AS customers,
    SUM(net_revenue)            AS net_revenue,
    CAST(AVG(net_revenue) AS DECIMAL(12,2)) AS avg_order_value,
    CAST(SUM(is_returned) * 1.0 / NULLIF(COUNT(*), 0) AS DECIMAL(6,4)) AS return_rate
FROM dbo.Orders
GROUP BY channel
ORDER BY net_revenue DESC;


/* ----------------------------------------------------------------------------
   11. TOP CUSTOMERS BY LIFETIME NET REVENUE
   ---------------------------------------------------------------------------- */
SELECT TOP 10
    c.customer_id,
    c.customer_name,
    c.region,
    COUNT(DISTINCT o.order_id) AS orders,
    SUM(o.net_revenue)         AS lifetime_revenue,
    CAST(AVG(o.net_revenue) AS DECIMAL(12,2)) AS avg_order_value,
    MAX(o.order_date)          AS last_order_date
FROM dbo.Customers c
JOIN dbo.Orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_name, c.region
ORDER BY lifetime_revenue DESC;


/* ----------------------------------------------------------------------------
   12. MONTH-OVER-MONTH GROWTH — SQL Server 2008 (self-join, no LAG)
   ---------------------------------------------------------------------------- */
WITH monthly AS (
    SELECT
        DATEPART(month, order_date) AS month_no,
        SUM(net_revenue)            AS net_revenue
    FROM dbo.Orders
    GROUP BY DATEPART(month, order_date)
)
SELECT
    m.month_no,
    m.net_revenue,
    p.net_revenue AS prior_month_revenue,
    CAST((m.net_revenue - p.net_revenue) * 100.0 /
         NULLIF(p.net_revenue, 0) AS DECIMAL(8,2)) AS mom_growth_pct
FROM monthly m
LEFT JOIN monthly p ON p.month_no = m.month_no - 1
ORDER BY m.month_no;


/* ----------------------------------------------------------------------------
   13. ACQUISITION CHANNEL QUALITY
       Which source brings customers who stay and spend?
   ---------------------------------------------------------------------------- */
SELECT
    c.acquisition_channel,
    COUNT(DISTINCT c.customer_id) AS customers,
    COUNT(DISTINCT o.order_id)    AS orders,
    SUM(o.net_revenue)            AS net_revenue,
    CAST(AVG(o.net_revenue) AS DECIMAL(12,2)) AS avg_order_value,
    CAST(SUM(CASE WHEN o.is_repeat = 1 THEN 1 ELSE 0 END) * 1.0 /
         NULLIF(COUNT(*), 0) AS DECIMAL(6,4)) AS repeat_order_share,
    CAST(SUM(o.is_returned) * 1.0 / NULLIF(COUNT(*), 0) AS DECIMAL(6,4)) AS return_rate
FROM dbo.Customers c
JOIN dbo.Orders o ON o.customer_id = c.customer_id
GROUP BY c.acquisition_channel
ORDER BY net_revenue DESC;
