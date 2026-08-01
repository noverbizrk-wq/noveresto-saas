-- Seed démo — à exécuter après 001_restaurant_management_mvp.sql
-- Utilise le premier compte non-admin trouvé dans `users` (= le premier
-- restaurant, selon la convention réelle restaurant_id = users.id).

BEGIN;

DO $$
DECLARE
  v_user_id INTEGER;
  v_burger_cat_id INTEGER;
  v_side_cat_id INTEGER;
  v_order_id INTEGER;
  v_burger_item_id INTEGER;
  v_fries_item_id INTEGER;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE role != 'admin' ORDER BY id LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Aucun compte non-admin trouvé — seed ignoré.';
    RETURN;
  END IF;

  INSERT INTO menu_categories (restaurant_id, name, position)
  VALUES (v_user_id, 'Burgers', 1)
  RETURNING id INTO v_burger_cat_id;

  INSERT INTO menu_categories (restaurant_id, name, position)
  VALUES (v_user_id, 'Accompagnements', 2)
  RETURNING id INTO v_side_cat_id;

  INSERT INTO menu_items (restaurant_id, category_id, name, price, vat_rate)
  VALUES (v_user_id, v_burger_cat_id, 'Classic Burger', 12.500, 19)
  RETURNING id INTO v_burger_item_id;

  INSERT INTO menu_items (restaurant_id, category_id, name, price, vat_rate)
  VALUES (v_user_id, v_side_cat_id, 'Frites', 4.500, 19)
  RETURNING id INTO v_fries_item_id;

  INSERT INTO orders (restaurant_id, channel_id, status, promised_at, gross_amount, created_by)
  VALUES (
    v_user_id,
    (SELECT id FROM sales_channels WHERE code = 'dine_in'),
    'in_preparation',
    now() + interval '10 minutes',
    29.500,
    v_user_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, station)
  VALUES
    (v_order_id, v_burger_item_id, 'Classic Burger', 2, 12.500, 'grill'),
    (v_order_id, v_fries_item_id, 'Frites', 1, 4.500, 'fry');

  RAISE NOTICE 'Seed appliqué pour restaurant_id (users.id) = %', v_user_id;
END $$;

COMMIT;
