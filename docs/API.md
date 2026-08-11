# Référence API — noveresto-saas

> Table de recherche rapide. Pour le détail (paramètres, logique
> métier), voir `docs/MODULES.md`. Tous les endpoints préfixés
> `/api/v1/restaurant` sauf mention contraire — authentification JWT
> requise (`Authorization: Bearer <token>`) sauf mention "public".

## Auth
| Méthode | Route | 
|---|---|
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/register` |
| GET | `/api/v1/auth/me` |

## Commandes
| Méthode | Route |
|---|---|
| GET, POST | `/orders` |
| GET | `/orders/:id` |
| PATCH | `/orders/:id/status` |
| GET | `/kds/queue` |
| GET | `/dashboard/summary` |
| GET | `/channels`, `/delivery-platforms` |
| GET | `/context` — restaurant(s), devise, fuseau |
| GET | `/my-modules` |

## Menus
| Méthode | Route |
|---|---|
| GET, POST | `/menu-categories` |
| GET, POST | `/menu-items` |
| PATCH | `/menu-items/:id`, `/menu-items/:id/availability` |

## Recettes et coûts
| Méthode | Route |
|---|---|
| GET, POST | `/ingredients` |
| PATCH | `/ingredients/:id` |
| GET | `/ingredients/alerts/low-stock` |
| GET, POST, DELETE | `/recipe-ingredients` |
| GET | `/menu-items/:id/cost`, `/costs/summary` |

## Stocks et achats
| Méthode | Route |
|---|---|
| GET | `/stock-movements` |
| POST | `/stock-movements/adjust` |
| GET, POST | `/purchase-orders`, `/suppliers` |
| GET | `/purchase-orders/:id` |
| PATCH | `/purchase-orders/:id/receive` |

## Personnel
| Méthode | Route |
|---|---|
| GET, POST | `/employees`, `/shifts` |
| PATCH | `/employees/:id`, `/shifts/:id` |
| DELETE | `/shifts/:id` |

## Litiges
| Méthode | Route |
|---|---|
| GET | `/disputes`, `/disputes/summary`, `/disputes/:id` |
| POST | `/disputes`, `/disputes/:id/evidence` |
| PATCH | `/disputes/:id/status` |

## Finance
| Méthode | Route |
|---|---|
| GET | `/finance/vat-breakdown`, `/finance/channel-breakdown`, `/finance/export.csv` |

## Copilote IA
| Méthode | Route |
|---|---|
| GET | `/copilot/context`, `/copilot/recommendations` |
| POST | `/copilot/ask` |

## Prospection
| Méthode | Route |
|---|---|
| POST | `/prospection/search` |
| POST | `/prospects/:id/pitch` — pitch IA |
| GET | `/prospection/list`, `/prospection/export.csv` |
| PATCH | `/prospection/:id` |
| GET, POST | `/prospection/:id/interactions` |

## Facturation TEIF
| Méthode | Route |
|---|---|
| POST | `/orders/:orderId/teif-invoice` |
| GET | `/orders/:orderId/teif-invoice`, `/orders/:orderId/teif-invoice/download`, `/teif-invoices` |
| PATCH | `/tax-profile` |

## Réputation (préfixe `/api/v1/reputation`)
| Méthode | Route |
|---|---|
| GET | `/` |
| POST | `/reply`, `/sync` |
| GET | `/stats` |

## Social Media IA (préfixe `/api/v1/social`)
| Méthode | Route |
|---|---|
| POST | `/strategy`, `/calendar`, `/post/generate`, `/post/generate-all`, `/analytics/analyze`, `/comment/reply`, `/campaign/generate` |
| GET | `/health` |

## Admin
| Méthode | Route |
|---|---|
| GET | `/modules`, `/clients-access` |
| PUT | `/clients/:userId/modules` |

## Public (préfixe `/api/v1/public`, sans authentification)
| Méthode | Route |
|---|---|
| POST | `/diagnostic` — rate limité 5/heure |
