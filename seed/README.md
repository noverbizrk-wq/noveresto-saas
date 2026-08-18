# Seed — jeux de données de démo

Utilitaires d'exploitation pour peupler une base NoveResto avec des
données de test réalistes (démos, développement, recette). Ne touchent
jamais le schéma — table `TRUNCATE` uniquement dans `wipe.sql`.

⚠️ Destructif. À n'exécuter que sur une base de dev/démo, jamais en
production sans backup (`pg_dump`) préalable.

## Utilisation

```bash
# 1. Vide toutes les tables (schéma intact, séquences réinitialisées)
docker exec -i noveresto_db psql -U noveresto -d noveresto < seed/wipe.sql

# 2. Génère un jeu complet et réaliste : comptes, organisation multi-sites,
#    catalogue, 90 jours de commandes, achats, inventaire, prévisions,
#    prospects, personnel, litiges, TEIF. Réutilise les vrais services de
#    prod (stock-service, inventory-service, forecast-service...) plutôt
#    que de dupliquer la logique métier.
node seed/run-seed.js
```

Comptes créés par `run-seed.js` (mêmes identifiants que ceux affichés
publiquement sur la page de login/le site vitrine) :

| Email | Rôle | Restaurant |
|---|---|---|
| `admin@noveresto.app` | admin | — |
| `demo@noveresto.app` | client | Le Grill Marsa |
| `client@noveresto.app` | client | Sushi Corner |
| `tacos-lac2@noveresto.app` | client | Tacos Avenue — Lac 2 |
| `tacos-ariana@noveresto.app` | client | Tacos Avenue — Ariana |
| `franchise@noveresto.app` | franchise_owner | (organisation Tacos Avenue Group) |

Mots de passe : voir l'en-tête de `run-seed.js`.

## Scripts ponctuels (legacy)

`demo_copilot_data.sql` et `sales_data.sql` sont des seeds plus anciens et
plus ciblés (un seul restaurant, `restaurant_id = 2`), utiles pour tester
rapidement le Copilote IA ou les prévisions Prophet sans repasser par le
seed complet. Redondants avec `run-seed.js` sur le fond — conservés pour
compatibilité avec des scripts/habitudes existants, pas pour un nouvel
usage.
