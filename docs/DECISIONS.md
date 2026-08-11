# Décisions d'architecture — noveresto-saas

> Format court par décision : **Contexte** (le problème), **Décision**
> (ce qui a été choisi), **Conséquence** (ce que ça implique, y compris
> les compromis assumés). Inclut des décisions corrigées après coup —
> les erreurs font partie de l'historique utile pour un nouveau
> développeur.

---

## `restaurant_id` = `users.id`, pas de table `restaurants`

**Contexte** : chaque compte NoveResto représente un seul restaurant —
pas de gestion multi-restaurants par compte à la conception initiale.

**Décision** : ne pas créer de table `restaurants` séparée. Toutes les
tables métier référencent directement `users.id` comme `restaurant_id`.

**Conséquence** : simplifie énormément les requêtes (pas de jointure
supplémentaire), mais rend structurellement impossible qu'un compte
gère plusieurs restaurants sans changement de schéma. Si NoveResto vend
un jour à des chaînes multi-établissements avec un compte unique, cette
convention devra être revue — actuellement un compte = un restaurant,
point final. Le module Admin s'appuie explicitement sur cette convention
(`SELECT * FROM users WHERE role != 'admin'` = liste des restaurants).

## Permissions vérifiées route par route, jamais via `router.use()` global

**Contexte** : plusieurs routers Express partagent le même préfixe de
montage (`/api/v1/restaurant`).

**Erreur initiale** (corrigée) : appliquer `moduleAccessMiddleware` en
`router.use()` sur un router — Express exécute ce middleware pour
**toutes** les requêtes qui matchent le préfixe partagé, y compris
celles destinées à un *autre* router monté sur le même préfixe. Un
utilisateur avec accès au module A se voyait bloqué sur des routes du
module B, ou l'inverse selon l'ordre de montage.

**Décision** : `moduleAccessMiddleware(pool, 'clé')` s'applique
individuellement sur chaque route qui en a besoin, jamais en middleware
global de router.

**Conséquence** : plus verbeux (répété sur chaque route), mais correct.
Toute nouvelle route protégée doit suivre ce pattern — ne pas être tenté
de "simplifier" en remontant la vérification en middleware global.

## JWT_SECRET obligatoire, sans valeur par défaut

**Contexte** : le code avait initialement un secret de repli codé en dur
si la variable d'environnement était absente — faille de sécurité
évidente en cas d'oubli de configuration.

**Décision** : le serveur refuse de démarrer (`process.exit(1)`) si
`JWT_SECRET` est absent ou trop court. Pas de valeur par défaut,
silencieuse ou non.

**Conséquence** : un déploiement mal configuré échoue bruyamment au
démarrage plutôt que de tourner silencieusement avec une faille de
sécurité. Génération recommandée :
`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

## Devise dérivée du pays du compte, jamais de la localisation de qui est connecté

**Contexte** : deux besoins différents ont été confondus au départ —
adapter la devise affichée dans le dashboard (données financières
réelles d'un restaurant) et adapter la devise affichée sur une page
marketing publique (prix indicatifs pour un visiteur).

**Décision** : pour le **dashboard**, la devise vient du `country`
enregistré sur le compte (`users.country`), jamais de la position
actuelle de la personne connectée — un restaurateur tunisien qui
consulte son dashboard depuis la France doit toujours voir du TND, pas
de l'EUR. Pour la **page de tarifs publique** (`/app/pricing`, et sa
contrepartie sur le site vitrine), la région est devinée depuis le
fuseau horaire du navigateur (`Intl.DateTimeFormat`), avec sélecteur
manuel — logique différente et volontairement séparée, aucune donnée
réseau externe utilisée dans les deux cas.

**Conséquence** : deux systèmes de détection de région distincts dans le
code (`lib/currency.js` côté compte vs `guessRegion()` côté page
publique) — ne pas les fusionner, ils répondent à des besoins différents.

## Pas de rapprochement approximatif par nom pour les intégrations externes

**Contexte** : en connectant une source de commandes externe (Deliveroo),
la question s'est posée de faire correspondre les articles par
similarité de nom plutôt que par un identifiant explicite.

**Décision** : refuser tout rapprochement par nom. `order_items.menu_item_id`
est une contrainte `NOT NULL` stricte — une table de mapping explicite
(`menu_item_external_refs`) associe chaque article externe à un article
interne réel, configurée manuellement par l'utilisateur.

**Conséquence** : une commande dont un article n'a pas encore de mapping
échoue proprement (tracée dans un journal, pas perdue) plutôt que de
créer une correspondance incorrecte silencieuse. Coût : configuration
manuelle initiale par restaurant avant que l'intégration soit pleinement
opérationnelle.

## WhatsApp : lien `wa.me` manuel, pas l'API WhatsApp Business

**Contexte** : envoyer des messages de prospection par WhatsApp.

**Décision** : utiliser des liens `wa.me/<numéro>?text=<message pré-rempli>`
qui ouvrent WhatsApp avec un brouillon prêt — l'utilisateur clique
"Envoyer" lui-même. Pas d'intégration à l'API WhatsApp Business (compte
Meta Business, validation, coût par conversation).

**Conséquence** : fonctionne immédiatement, gratuitement, sans
dépendance externe — mais l'envoi reste un geste manuel, pas automatisé.
Si un volume important justifie l'automatisation un jour, l'API WhatsApp
Business Cloud reste l'option à évaluer, avec son propre coût
d'intégration.

## Facturation TEIF : génération XML sur demande, pas bulk automatique

**Contexte** : l'obligation légale tunisienne de facturation électronique
(TEIF/TTN El Fatoora, en vigueur depuis janvier 2026) — portée exacte
ambiguë entre sources trouvées (B2C inclus ou seulement B2B ?).

**Décision** : construire uniquement la génération à la demande, pour
une commande spécifique avec un client B2B identifié (matricule fiscal
requis) — pas de génération automatique pour chaque commande.

**Conséquence** : couvre le scénario le moins ambigu (facture demandée
par un client professionnel) sans sur-construire pour un usage qui n'est
peut-être pas légalement requis. **Ce point doit être confirmé par un
expert-comptable tunisien avant d'étendre la portée.**

## Site vitrine statique, hors dépôt git

**Contexte** : `/var/www/html/index.html` (le site marketing public) a
été créé indépendamment des deux dépôts applicatifs, directement sur le
serveur.

**État actuel (dette technique assumée, pas une décision délibérée)** :
ce fichier n'est suivi par aucun système de version — chaque modification
passe par un script Python avec sauvegarde horodatée locale
(`fichier.backup-YYYYMMDD-HHMMSS`), pas par des commits. Pas d'historique
de changements consultable, pas de rollback autre que restaurer la
dernière sauvegarde locale sur le serveur.

**Recommandation non appliquée à ce jour** : mettre ce fichier sous git
(nouveau petit dépôt ou intégré à l'un des deux existants) pour avoir un
vrai historique.
