-- ============================================================
-- wipe.sql — Vide TOUTES les tables et réinitialise les séquences.
-- Ne touche PAS au schéma (colonnes, index, contraintes restent intacts).
-- Un backup complet doit exister avant exécution (pg_dump).
-- ============================================================

TRUNCATE TABLE
  ad_campaigns, audit_log, contacts, delivery_platforms, delivery_webhook_log,
  dispute_evidence, dispute_status_history, disputes, editorial_calendars,
  employees, ingredient_forecasts, ingredients, inventory_counts,
  menu_categories, menu_item_channel_overrides, menu_item_external_refs,
  menu_items, menus, ml_forecasts, module_access, order_items,
  order_status_history, orders, organizations, post_analytics,
  prospect_interactions, prospects, purchase_order_items, purchase_orders,
  purchase_suggestions, recipe_ingredients, restaurant_delivery_connections,
  restaurant_social_profiles, restaurants, reviews, sales_channels,
  sales_data, sessions, shifts, social_accounts, social_audit_log,
  social_comments, social_posts, social_token_usage, stock_movements,
  suppliers, teif_invoices, users
RESTART IDENTITY CASCADE;
