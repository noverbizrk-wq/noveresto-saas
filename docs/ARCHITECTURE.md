# Architecture NoveResto

> Document de référence global. Explique comment les deux dépôts
> ([noveresto-saas](https://github.com/noverbizrk-wq/noveresto-saas) et
> [noveresto-app](https://github.com/noverbizrk-wq/noveresto-app))
> s'articulent, et les décisions qui structurent tout le système.
> Pour le détail module par module, voir `docs/MODULES.md` dans chaque
> dépôt.

## 1. Vue d'ensemble

NoveResto est un SaaS de gestion de restaurant à destination du marché
MENA (Tunisie en priorité, expansion Maghreb/Afrique/Europe en cours),
avec IA intégrée (Copilote conversationnel, prospection commerciale,
génération de contenu). Deux dépôts séparés, un seul système :

```
┌─────────────────────┐         ┌──────────────────────┐
│   noveresto-app      │  HTTP   │   noveresto-saas       │
│   Next.js 16          │◄───────►│   Express.js           │
│   (frontend + site     │  JSON   │   (API REST)            │
│    vitrine)             │         │                          │
└─────────────────────┘         └───────────┬──────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        │                     │                     │
                 ┌──────▼──────┐     ┌────────▼────────┐   ┌────────▼────────┐
                 │ PostgreSQL 16 │     │  Prophet ML       │   │  APIs externes    │
                 │ (Docker)       │     │  (Python/Flask)   │   │  Anthropic,        │
                 │                │     │  prévisions        │   │  Google Places,     │
                 │                │     │                    │   │  Facebook Graph      │
                 └────────────────┘     └────────────────────┘   └─────────────────────┘
```

## 2. Pourquoi deux dépôts séparés (pas un monorepo)

Décision d'origine (avant les lots construits dans ce projet) : backend
et frontend déployés indépendamment sur le même serveur, chacun avec son
propre process PM2 et son propre cycle de déploiement (`git pull` +
`pm2 restart`, séparément). Avantage principal : un changement backend
seul (ex: nouvelle route API) ne nécessite pas de rebuild Next.js, et
inversement. Inconvénient assumé : pas de partage de types
TypeScript entre les deux — les contrats d'API sont implicites (à
maintenir en cohérence manuellement entre les routes Express et les
fonctions `lib/api.ts` côté frontend).

## 3. Convention architecturale la plus importante à connaître

**`restaurant_id` == `users.id`**. Il n'existe pas de table `restaurants`
séparée. Chaque compte utilisateur non-admin représente directement un
restaurant. Cette convention traverse tout le système :
- Le token JWT contient l'id utilisateur, qui sert directement de
  `restaurant_id` dans toutes les requêtes.
- Le module Admin (vue tous-restaurants) fait simplement
  `SELECT * FROM users WHERE role != 'admin'`.
- **Piège historique** (déjà corrigé, à ne pas réintroduire) : au tout
  début du projet, les permissions de module étaient vérifiées par
  `router.use()` global sur un router monté sur un préfixe partagé
  (`/api/v1/restaurant`) — cela interceptait les requêtes destinées à
  *d'autres* routers montés sur le même préfixe. La règle actuelle :
  **toujours appliquer `moduleAccessMiddleware` route par route**,
  jamais en middleware global de router.

## 4. Authentification et autorisation

- **JWT**, 7 jours, payload `{ id, email, role, name, restaurant }` —
  **ne contient PAS `country`** (ajouté après coup pour la devise ;
  toute route qui a besoin du pays fait un lookup DB, ne suppose jamais
  que c'est dans le token).
- **Deux niveaux de contrôle d'accès** :
  1. `restaurantScopeMiddleware` — garantit qu'un compte ne peut agir
     que sur ses propres données (protection IDOR). Un admin bypasse
     cette contrainte.
  2. `moduleAccessMiddleware(pool, 'clé_module')` — vérifie que le
     compte a explicitement accès à un module donné (table
     `module_access`). Un admin bypasse aussi cette contrainte.
- **JWT_SECRET obligatoire et fort** — le serveur refuse de démarrer si
  absent ou trop court (`process.exit(1)`), pas de valeur par défaut
  silencieuse (durcissement sécurité, cf. `docs/DECISIONS.md`).

## 5. Où vivent les données

| Domaine | Table(s) principale(s) | Notes |
|---|---|---|
| Comptes / restaurants | `users` | `country`, `tax_id`, `address` ajoutés au fil des lots (nullable, à configurer par compte) |
| Commandes clients | `orders`, `order_items` | `vat_rate` snapshoté par ligne (Lot 4) |
| Recettes / coûts | `ingredients`, `recipe_ingredients` | |
| Stocks | `stock_movements` | |
| Achats fournisseurs | `purchase_orders`, `purchase_order_items` | |
| Personnel | `employees`, `shifts` | |
| Litiges | `disputes`, `dispute_evidence`, `dispute_status_history` | Machine à 10 statuts |
| Permissions | `module_access` | `(user_id, module_key)`, backfill auto à la création d'un nouveau module |
| Prospection | `prospects`, `prospect_interactions` | Scoring : `invisible` / `presence_faible` / `etabli` |
| Facturation électronique | `teif_invoices` | Génération XML uniquement — voir `docs/MODULES.md#teif` |
| Réputation | Pas de table dédiée — lecture live via API Google/Facebook | |

## 6. Intégrations externes — état réel (pas ce qui est prévu, ce qui EST branché)

| Service | Statut | Détail |
|---|---|---|
| **Anthropic (Claude)** | ✅ Live | Copilote IA, génération de contenu Social Media, pitch de prospection. Un seul client partagé : `lib/claude-client.js` |
| **Google Places** | ✅ Live | Avis Google (Réputation), recherche de prospects, diagnostic public |
| **Facebook Graph** | ⚙️ Code prêt, à activer par compte | Bascule automatiquement en mode réel dès que `FACEBOOK_ACCESS_TOKEN`/`FACEBOOK_PAGE_ID` sont configurés — sinon fallback démo |
| **Uber Eats, Glovo** | ❌ Non intégré | Accès API restreint (Uber Eats sur candidature, pas de portail Glovo trouvé) |
| **Deliveroo** | 🔧 Construit, jamais confirmé déployé | Webhook de réception de commandes avec vérification HMAC — voir `docs/MODULES.md#deliveroo`. **Vérifier si mergé dans `main` avant de s'y fier** |
| **Prophet (prévisions ML)** | ✅ Live | Microservice Python/Flask séparé, port 5000, appelé en HTTP interne par le backend |
| **TTN El Fatoora (facturation Tunisie)** | ❌ Non intégré | Génération XML TEIF prête, mais **pas de signature électronique ni de soumission réelle** — nécessite un certificat TUNTRUST que l'équipe doit obtenir |

## 7. Déploiement

- **Serveur** : Hetzner CPX12, Ubuntu, `167.233.198.162`
- **Process manager** : PM2, 3 process — `noveresto-api` (Express,
  port 3000), `noveresto-next` (Next.js, port 3001),
  `prophet-ml` (Flask, port 5000)
- **Reverse proxy** : Nginx — `/` sert le site vitrine statique
  (`/var/www/html/index.html`, **hors git**, pas de suivi de version —
  voir `docs/DECISIONS.md`), `/app` route vers Next.js (`basePath`
  configuré dans `next.config.ts`), `/api` route vers Express
- **Workflow de déploiement** : branche de fonctionnalité → tests
  manuels sur le serveur → merge dans `main` → suppression de la
  branche. Pas de CI/CD automatisé à ce jour — chaque déploiement est
  vérifié manuellement (`npm run build`, requêtes `curl` de test) avant
  bascule en production.

## 8. Pour aller plus loin

- `docs/MODULES.md` (dans chaque dépôt) — explication détaillée de
  chaque module, avec ses choix spécifiques
- `docs/DECISIONS.md` (noveresto-saas) — décisions d'architecture
  documentées avec leur raisonnement, y compris celles qui ont été
  corrigées après coup
- `docs/DATABASE.md` (noveresto-saas) — schéma complet, conventions de
  nommage
- `docs/API.md` (noveresto-saas) — référence des endpoints par module
