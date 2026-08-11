# NoveResto — Backend (noveresto-saas)

API Express.js du SaaS de gestion de restaurant NoveResto. Pour la vue
d'ensemble du système complet (avec le frontend), voir
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — à lire en premier.

## Documentation

| Document | Contenu |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Vue d'ensemble du système, backend + frontend, conventions partagées — **à lire en premier** |
| [`docs/MODULES.md`](docs/MODULES.md) | Chaque module expliqué en détail, avec ses endpoints |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schéma complet, conventions de nommage |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Pourquoi le système est construit ainsi — y compris les erreurs corrigées |

## Stack

Node.js · Express.js · PostgreSQL 16 (Docker) · JWT · Claude API
(Anthropic) · Google Places API · Facebook Graph API

## Démarrage local

### Prérequis
- Node.js 18+
- Docker (pour PostgreSQL) ou accès à une instance PostgreSQL 16
  existante

### Installation

```bash
git clone https://github.com/noverbizrk-wq/noveresto-saas.git
cd noveresto-saas
npm install
```

### Base de données

⚠️ **La connexion PostgreSQL est actuellement codée en dur dans
`server.js`** (host, port, nom de base, utilisateur, mot de passe — pas
de variable d'environnement `DATABASE_URL`). Pour un environnement local
différent de la configuration serveur par défaut, modifier directement
le bloc `new Pool({...})` en haut de `server.js`.

Appliquer les migrations dans l'ordre numérique :

```bash
docker exec -i noveresto_db psql -U noveresto -d noveresto < migrations/001_restaurant_management_mvp.sql
# ... puis chaque fichier suivant, dans l'ordre
```

### Variables d'environnement

Créer un fichier `.env` à la racine :

```bash
# Obligatoire — le serveur refuse de démarrer sans ceci (voir docs/DECISIONS.md)
JWT_SECRET=<générer avec la commande ci-dessous>

# Recommandé en production
CORS_ORIGIN=https://noveresto.app

# Nécessaires pour les fonctionnalités IA / avis / prospection
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_PLACES_API_KEY=...
GOOGLE_PLACE_ID=...

# Optionnel — active le mode réel du module Réputation pour Facebook
# (sinon fallback démo automatique, aucune erreur)
FACEBOOK_ACCESS_TOKEN=...
FACEBOOK_PAGE_ID=...
```

Générer un `JWT_SECRET` fort :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Lancer le serveur

```bash
node server.js
# ou avec rechargement automatique en dev :
npx nodemon server.js
```

Le serveur écoute sur le port `3000`. `GET /api/v1/health` pour
vérifier qu'il tourne.

## Comptes de démonstration (base de production)

| Email | Mot de passe | Rôle |
|---|---|---|
| admin@noveresto.app | Admin2025! | admin |
| demo@noveresto.app | Demo2025! | client |

## Déploiement (production)

Voir [`docs/ARCHITECTURE.md §7`](docs/ARCHITECTURE.md#7-déploiement)
pour la topologie complète (PM2, Nginx). Workflow court :

```bash
git checkout main && git pull origin main
git checkout -b feature/ma-fonctionnalite
# ... développement, commits ...
# tests manuels sur le serveur avant de pousser
git push origin feature/ma-fonctionnalite
# une fois validé :
git checkout main && git merge feature/ma-fonctionnalite && git push origin main
git branch -d feature/ma-fonctionnalite
git push origin --delete feature/ma-fonctionnalite
```

Pas de CI/CD automatisé — chaque changement est testé manuellement
(`node -c` pour la syntaxe, requêtes `curl` ciblées, vérification que
les routes existantes ne régressent pas) avant `pm2 restart`.

## Dépôt lié

Frontend : [noveresto-app](https://github.com/noverbizrk-wq/noveresto-app)
