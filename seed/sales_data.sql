INSERT INTO sales_data (restaurant_id, date, revenue_tnd, covers, food_cost_pct, avg_ticket)
SELECT
  2 AS restaurant_id,
  d::date AS date,
  ROUND((600 + (CASE EXTRACT(DOW FROM d)
      WHEN 5 THEN 400
      WHEN 6 THEN 350
      WHEN 0 THEN 200
      WHEN 1 THEN -100
      ELSE 0 END) + (random()*100 - 50))::numeric, 2) AS revenue_tnd,
  (40 + (random()*20)::int) AS covers,
  ROUND((28 + random()*6)::numeric, 2) AS food_cost_pct,
  ROUND((12 + random()*4)::numeric, 2) AS avg_ticket
FROM generate_series(CURRENT_DATE - INTERVAL '119 days', CURRENT_DATE - INTERVAL '1 day', INTERVAL '1 day') AS d
ON CONFLICT (restaurant_id, date) DO NOTHING;
