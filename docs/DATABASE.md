# Base de données — noveresto-saas

PostgreSQL 16, conteneur Docker `noveresto_db`. Migrations dans
`migrations/`, numérotées et appliquées manuellement (pas d'outil de
migration automatisé — chaque fichier `NNN_description.sql` s'applique
avec `docker exec -i noveresto_db psql -U noveresto -d noveresto < migrations/NNN_*.sql`,
une fois, dans l'ordre numérique).

## Convention fondamentale

**Pas de table `restaurants`.** `users.id` sert directement de
`restaurant_id` partout dans le système pour les comptes non-admin. Voir
`docs/ARCHITECTURE.md §3` pour le raisonnement complet et le piège
historique associé aux permissions.

## Tables principales, par domaine

### Comptes (`users` — table d'origine, hors migrations listées ici)
Champs ajoutés au fil des lots (tous nullable, à renseigner par compte) :
`country`, `tax_id`, `address`, `city`, `postal_code`. `country` pilote
la devise/fuseau affichés (`lib/currency.js`), pas de valeur par défaut
autre que "Tunisie" en fallback.

### Commandes (migration 001)
- `sales_channels` — canaux de vente de référence (sur place, à emporter,
  livraison plateforme, en ligne, téléphone, QR code, borne, saisie
  manuelle)
- `delivery_platforms` — plateformes de livraison de référence
  (`uber_eats`, `deliveroo`, `just_eat`, `none`) — **table de référence
  globale**, pas de données par restaurant (voir Deliveroo dans
  `docs/MODULES.md` pour la table par-restaurant associée)
- `orders`, `order_items`, `order_status_history`
- `menus`, `menu_categories`, `menu_items`, `menu_item_channel_overrides`
- `suppliers`
- `audit_log`

### Coûts et stocks (migration 003)
- `ingredients`, `recipe_ingredients`
- `stock_movements`
- `purchase_orders`, `purchase_order_items`

### Personnel et litiges (migration 004)
- `employees`, `shifts`
- `disputes`, `dispute_evidence`, `dispute_status_history`

### Finance (migration 005)
Pas de nouvelle table — ajoute `vat_rate` sur `order_items` (snapshot du
taux au moment de la commande, pour que l'historique reste exact même si
le taux change plus tard).

### Permissions (migration 006)
- `module_access` (`user_id`, `module_key`) — backfill automatique à la
  création d'un compte ET à l'ajout d'un nouveau module (voir piège
  documenté dans `docs/MODULES.md`)

### Prospection (migrations 007-009)
- `prospects` — `opportunity_tier` calculé, `zone_label`,
  `phone_international` (ajouté migration 009, nécessaire pour les liens
  WhatsApp — le format local seul est insuffisant)
- `prospect_interactions` — historique horodaté

### Facturation TEIF (migration 011)
- `teif_invoices` — XML généré stocké tel quel (colonne `teif_xml`),
  `status` reste à `'generated'` tant que signature/soumission réelles
  ne sont pas implémentées

## Index et contraintes notables

- `module_access` : `UNIQUE(user_id, module_key)`
- `prospects` : `UNIQUE(restaurant_id, google_place_id)` — évite les
  doublons si une même recherche est relancée
- `teif_invoices` : `UNIQUE(restaurant_id, order_id)` — une seule facture
  par commande
- `order_items.menu_item_id` : `NOT NULL REFERENCES menu_items(id)` —
  contrainte stricte, importante à connaître si vous intégrez une source
  de commandes externe (ex: Deliveroo) : impossible d'insérer une ligne
  de commande sans correspondance vers un article de menu interne réel,
  donc toute intégration externe a besoin d'une table de mapping
  (article externe → `menu_item_id`), pas d'un rapprochement par nom.

## Accès

```bash
docker exec -i noveresto_db psql -U noveresto -d noveresto
```
Connexion directe : `host=localhost port=5432 database=noveresto user=noveresto`
(mot de passe dans `.env` du serveur, jamais committé).
