# Modules — Backend (noveresto-saas)

> Explication de chaque module : ce qu'il fait, où le trouver, ses choix
> spécifiques. Voir `docs/ARCHITECTURE.md` pour les conventions
> partagées (auth, `restaurant_id`, permissions).

Tous les endpoints ci-dessous sont préfixés par `/api/v1/restaurant`
sauf mention contraire.

---

## Commandes (`restaurant-orders-routes.js`)

Gestion des commandes clients, de la prise à la clôture.

- `GET/POST /orders`, `GET /orders/:id`, `PATCH /orders/:id/status`
- `GET /kds/queue` — file d'attente écran cuisine
- `GET /dashboard/summary`, `GET /channels`, `GET /delivery-platforms`
- `GET /context` — restaurant(s) du compte connecté (id, nom, **devise
  et fuseau dérivés dynamiquement du `country` en base**, cf.
  `lib/currency.js`)
- `GET /my-modules` — modules autorisés pour le compte connecté (utilisé
  par la sidebar frontend pour filtrer la navigation)

**Machine à statuts** : 12 statuts de commande (`orders-service.js`),
avec déduction automatique de stock à la validation
(`deductStockForOrder`).

## Recettes et coûts (`restaurant-costing-routes.js`)

Ingrédients, recettes, calcul de coût matière par article de menu.

- `GET/POST /ingredients`, `PATCH /ingredients/:id`
- `GET /ingredients/alerts/low-stock`
- `GET/POST/DELETE /recipe-ingredients`
- `GET /menu-items/:id/cost` — coût calculé à partir des ingrédients liés
- `GET /costs/summary`

## Personnel (`restaurant-staff-routes.js`)

- `GET/POST /employees`, `PATCH /employees/:id`
- `GET/POST/PATCH/DELETE /shifts`

## Litiges (`restaurant-disputes-routes.js`)

- `GET /disputes`, `GET /disputes/summary`, `GET /disputes/:id`
- `POST /disputes`, `PATCH /disputes/:id/status`
- `POST /disputes/:id/evidence`

Machine à 10 statuts (`disputes-service.js`).

## Finance et TVA (`restaurant-finance-routes.js`)

- `GET /finance/vat-breakdown` — ventilation par taux de TVA
- `GET /finance/channel-breakdown` — ventilation par canal de vente
- `GET /finance/export.csv`

**Hypothèse assumée** : les prix enregistrés sont TTC (convention point
de vente) — le calcul HT se fait par `HT = TTC / (1 + taux/100)`. Cette
hypothèse est affichée à l'utilisateur dans l'interface (pas une donnée
cachée) et devrait être validée par un comptable avant usage fiscal réel.

## Copilote IA (`restaurant-copilot-routes.js`)

- `GET /copilot/context` — contexte injecté dans le prompt (données
  réelles du restaurant)
- `GET /copilot/recommendations` — règles heuristiques, **pas d'appel
  Claude** (gratuit, calculé côté serveur)
- `POST /copilot/ask` — conversation libre, appel Claude réel

Rate limité (10/min). Limite de 500 caractères par question. Réutilise
`lib/claude-client.js` (même client que Social Media IA et le pitch de
prospection).

## Menus (`restaurant-menu-routes.js`)

- `GET/POST /menu-categories`
- `GET/POST /menu-items`, `PATCH /menu-items/:id`,
  `PATCH /menu-items/:id/availability`

## Stocks et achats (`restaurant-stock-routes.js`)

- `GET /stock-movements`, `POST /stock-movements/adjust`
- `GET/POST /purchase-orders`, `GET /purchase-orders/:id`,
  `PATCH /purchase-orders/:id/receive`
- `GET/POST /suppliers`

## Prospection commerciale (`restaurant-prospection-routes.js`)

Le module le plus riche du système — trouver de nouveaux clients pour
NoveResto (pas pour les restaurants clients).

- `POST /prospection/search` — recherche Google Places (texte OU
  coordonnées/rayon), scoring automatique (`invisible` /
  `presence_faible` / `etabli`) via `computeOpportunityTier`
- `POST /prospects/:id/pitch` — génère un message WhatsApp personnalisé
  par IA (Claude), à partir des vraies données du prospect
- `GET /prospection/list`, `GET /prospection/export.csv`
- `PATCH /prospection/:id` — statut, contact, date de relance
- `GET/POST /prospection/:id/interactions` — historique horodaté

**Convention de scoring** (`computeOpportunityTier`, dans
`services/prospection-service.js`) : pas de site + moins de 20 avis =
`invisible`. Site OU 20+ avis = `presence_faible`. Site ET 20+ avis =
`etabli`.

**Diagnostic public** (`public-diagnostic-routes.js`, endpoint
`/api/v1/public/diagnostic`) : réutilise ce même moteur de scoring,
retourné vers l'extérieur comme aimant à prospects — voir la page
`/app/diagnostic` côté frontend. Non authentifié, rate limité (5/heure).

## Facturation électronique TEIF (`restaurant-teif-routes.js`)

⚠️ **Portée limitée — à lire avant de considérer ce module "fini"** :
génère un document XML conforme à la structure TEIF, **ne signe rien et
ne soumet rien** à l'administration tunisienne (TTN El Fatoora).
Nécessite un certificat TUNTRUST et des identifiants API obtenus après
inscription sur El Fatoora — aucun des deux n'est géré par ce code.

- `POST /orders/:orderId/teif-invoice` — génère la facture pour une
  commande (matricule fiscal client obligatoire — scénario B2B)
- `GET /orders/:orderId/teif-invoice`,
  `GET /orders/:orderId/teif-invoice/download`
- `GET /teif-invoices` — liste des factures générées
- `PATCH /tax-profile` — coordonnées fiscales du restaurant (émetteur)

**Point de droit non tranché** : l'obligation TEIF couvre-t-elle chaque
commande B2C ou seulement les factures B2B ? Les sources trouvées se
contredisent. À faire confirmer par un expert-comptable tunisien avant
usage réel.

## Réputation (`reputation-routes.js`, monté sur `/api/v1/reputation`)

- `GET /` — avis agrégés (Google **live**, Facebook **live si
  configuré sinon démo**, Uber Eats/Deliveroo/Glovo **toujours démo,
  aucune vraie intégration**)
- `POST /reply` — réponse à un avis via Claude (validation humaine
  obligatoire pour les avis critiques)
- `POST /sync`, `GET /stats`

## Social Media IA (`social-routes.js`, monté sur `/api/v1/social`)

7 fonctions Claude : stratégie, calendrier éditorial, génération de
post, génération multi-plateformes, analyse analytics, réponse à
commentaire, génération de campagne publicitaire.

## Permissions (`admin-module-access-routes.js`)

- `GET /modules` — liste des modules disponibles
- `GET /clients-access` — matrice client × module (vue admin)
- `PUT /clients/:userId/modules` — modifier les accès d'un client

⚠️ Piège déjà rencontré en production : modifier les accès d'un compte
depuis cette interface **réécrit la liste complète** de ses modules — si
un nouveau module a été ajouté au système après le dernier enregistrement
d'un compte, il faut le re-cocher explicitement, sinon il disparaît
silencieusement de ses accès (arrivé une fois avec le module
`prospection`, corrigé manuellement).

---

## Modules côté infrastructure (pas des routes métier)

| Fichier | Rôle |
|---|---|
| `lib/claude-client.js` | Client Claude partagé — un seul point de config pour tous les appels IA du système |
| `lib/currency.js` | Correspondance pays → devise/fuseau, utilisée par `/context` |
| `middleware/restaurant-scope-middleware.js` | Protection IDOR |
| `middleware/module-access-middleware.js` | Vérification des permissions par module |
| `services/audit-log-service.js` | Journal d'audit |
