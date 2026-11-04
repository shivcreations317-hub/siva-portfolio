// ShopScope — Power Query M template
// Load orders.csv, customers.csv, products.csv and returns.csv from the data folder.
// Update the folder path in the Source step before refreshing.

let
    Source = Csv.Document(
        File.Contents("C:\Users\sivad\shiva-Portfolio\projects\shopscope\data\orders.csv"),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),
    ChangedTypes = Table.TransformColumnTypes(
        PromotedHeaders,
        {
            {"order_id", type text},
            {"order_date", type date},
            {"customer_id", type text},
            {"customer_name", type text},
            {"region", type text},
            {"city_tier", type text},
            {"age_group", type text},
            {"gender", type text},
            {"acquisition_channel", type text},
            {"channel", type text},
            {"category", type text},
            {"product_id", type text},
            {"product", type text},
            {"units", Int64.Type},
            {"unit_price", type number},
            {"unit_cost", type number},
            {"discount_pct", type number},
            {"revenue", type number},
            {"cost", type number},
            {"refund_amount", type number},
            {"net_revenue", type number},
            {"profit", type number},
            {"payment_method", type text},
            {"delivery_days", Int64.Type},
            {"rating", Int64.Type},
            {"is_returned", Int64.Type},
            {"return_reason", type text},
            {"order_sequence", Int64.Type},
            {"is_repeat", Int64.Type},
            {"cohort_month", type text},
            {"cohort_index", Int64.Type}
        }
    ),
    AddedMonth = Table.AddColumn(ChangedTypes, "Month", each Date.MonthName([order_date]), type text),
    AddedMonthNumber = Table.AddColumn(AddedMonth, "Month Number", each Date.Month([order_date]), Int64.Type),
    AddedQuarter = Table.AddColumn(
        AddedMonthNumber,
        "Quarter",
        each "Q" & Text.From(Date.QuarterOfYear([order_date])),
        type text
    ),
    AddedReturnedText = Table.AddColumn(
        AddedQuarter,
        "Returned",
        each if [is_returned] = 1 then "Returned" else "Kept",
        type text
    ),
    RemovedHelper = Table.RemoveColumns(AddedReturnedText, {"Month Number"})
in
    RemovedHelper
