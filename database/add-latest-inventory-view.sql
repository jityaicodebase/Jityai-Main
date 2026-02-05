-- View: Latest Inventory State per SKU
CREATE OR REPLACE VIEW v_latest_inventory AS
SELECT DISTINCT ON (store_id, store_item_id)
    store_id,
    store_item_id,
    quantity_on_hand,
    unit,
    selling_price,
    cost_price,
    as_of_date,
    as_of_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' as as_of_ist,
    source,
    onboarding_batch_id
FROM onboarding_handoff
ORDER BY store_id, store_item_id, as_of_date DESC;
