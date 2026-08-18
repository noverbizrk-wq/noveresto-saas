BEGIN;

DO $$
DECLARE
  v_restaurant_id INTEGER := 2;  -- demo@noveresto.app
  v_cat_id INTEGER;
  v_supplier_id INTEGER;
  v_tacos_id INTEGER;
  v_burger_id INTEGER;
  v_salade_id INTEGER;
  v_ing_poulet INTEGER;
  v_ing_tortilla INTEGER;
  v_ing_pain INTEGER;
  v_ing_steak INTEGER;
  v_ing_salade INTEGER;
  v_order_id INTEGER;
  v_employee_id INTEGER;
BEGIN

  INSERT INTO menu_categories (restaurant_id, name, position)
  VALUES (v_restaurant_id, 'Plats', 1)
  RETURNING id INTO v_cat_id;

  INSERT INTO suppliers (restaurant_id, name, contact_phone, payment_terms)
  VALUES (v_restaurant_id, 'Metro Tunisie', '+216 71 000 000', '30 jours')
  RETURNING id INTO v_supplier_id;

  INSERT INTO ingredients (restaurant_id, supplier_id, name, unit, current_stock, min_stock, unit_cost)
  VALUES (v_restaurant_id, v_supplier_id, 'Poulet', 'kg', 15, 5, 12.000)
  RETURNING id INTO v_ing_poulet;

  INSERT INTO ingredients (restaurant_id, supplier_id, name, unit, current_stock, min_stock, unit_cost)
  VALUES (v_restaurant_id, v_supplier_id, 'Tortilla', 'unite', 80, 20, 0.400)
  RETURNING id INTO v_ing_tortilla;

  INSERT INTO ingredients (restaurant_id, supplier_id, name, unit, current_stock, min_stock, unit_cost)
  VALUES (v_restaurant_id, v_supplier_id, 'Pain burger', 'unite', 8, 20, 0.800)
  RETURNING id INTO v_ing_pain;

  INSERT INTO ingredients (restaurant_id, supplier_id, name, unit, current_stock, min_stock, unit_cost)
  VALUES (v_restaurant_id, v_supplier_id, 'Steak hache 150g', 'unite', 40, 10, 3.200)
  RETURNING id INTO v_ing_steak;

  INSERT INTO ingredients (restaurant_id, supplier_id, name, unit, current_stock, min_stock, unit_cost)
  VALUES (v_restaurant_id, v_supplier_id, 'Salade + legumes', 'kg', 6, 3, 4.500)
  RETURNING id INTO v_ing_salade;

  INSERT INTO menu_items (restaurant_id, category_id, name, price, vat_rate)
  VALUES (v_restaurant_id, v_cat_id, 'Tacos Poulet', 9.500, 19)
  RETURNING id INTO v_tacos_id;

  INSERT INTO menu_items (restaurant_id, category_id, name, price, vat_rate)
  VALUES (v_restaurant_id, v_cat_id, 'Classic Burger', 12.500, 19)
  RETURNING id INTO v_burger_id;

  INSERT INTO menu_items (restaurant_id, category_id, name, price, vat_rate)
  VALUES (v_restaurant_id, v_cat_id, 'Salade Cesar', 8.000, 7)
  RETURNING id INTO v_salade_id;

  INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity) VALUES (v_tacos_id, v_ing_poulet, 0.2);
  INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity) VALUES (v_tacos_id, v_ing_tortilla, 2);

  INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity) VALUES (v_burger_id, v_ing_pain, 1);
  INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity) VALUES (v_burger_id, v_ing_steak, 1);

  INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity) VALUES (v_salade_id, v_ing_salade, 0.3);
  INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity) VALUES (v_salade_id, v_ing_poulet, 0.15);

  INSERT INTO orders (restaurant_id, channel_id, status, received_at, gross_amount, created_by)
  VALUES (
    v_restaurant_id,
    (SELECT id FROM sales_channels WHERE code = 'dine_in'),
    'completed',
    now(),
    2 * 9.500 + 1 * 12.500,
    v_restaurant_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, vat_rate)
  VALUES
    (v_order_id, v_tacos_id, 'Tacos Poulet', 2, 9.500, 19),
    (v_order_id, v_burger_id, 'Classic Burger', 1, 12.500, 19);

  INSERT INTO disputes (restaurant_id, order_id, platform, reason, amount_requested, status, created_by)
  VALUES (v_restaurant_id, v_order_id, 'uber_eats', 'Commande incomplete - tortilla manquante', 9.500, 'to_analyze', v_restaurant_id);

  INSERT INTO employees (restaurant_id, name, role, hourly_cost)
  VALUES (v_restaurant_id, 'Sami Bouazizi', 'cuisinier', 8.500)
  RETURNING id INTO v_employee_id;

  INSERT INTO shifts (restaurant_id, employee_id, starts_at, ends_at, created_by)
  VALUES (v_restaurant_id, v_employee_id, now() + interval '1 day', now() + interval '1 day 6 hours', v_restaurant_id);

  RAISE NOTICE 'Seed complet applique pour restaurant_id=%', v_restaurant_id;
END $$;

COMMIT;
