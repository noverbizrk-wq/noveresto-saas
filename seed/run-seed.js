// run-seed.js
// Génère un jeu de données de test complet et réaliste : comptes,
// organisation multi-sites, catalogue, 90 jours de commandes réelles,
// achats, inventaire, prévisions, prospects, personnel, litiges, TEIF.
//
// Réutilise les VRAIS services de prod (stock-service, inventory-service,
// forecast-service, purchase-suggestion-service) plutôt que de dupliquer
// la logique métier — les données générées passent par le même code que
// de vraies commandes.
//
// Usage : node seed/run-seed.js
// Prérequis : wipe.sql déjà exécuté (base vide, schéma intact).

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'noveresto', user: 'noveresto', password: 'NoveResto2025!'
});

const { deductStockForOrder, receivePurchaseOrder } = require('../services/stock-service');
const { recordCount } = require('../services/inventory-service');
const { persistIngredientForecast } = require('../services/forecast-service');
const { generateForRestaurant } = require('../services/purchase-suggestion-service');

const ALL_MODULES = ['overview', 'orders', 'kds', 'menus', 'recipes', 'stocks', 'purchases', 'staff', 'disputes', 'finance', 'copilot'];

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function choice(arr) { return arr[randInt(0, arr.length - 1)]; }
function daysAgo(n, hour = 12) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, randInt(0, 59), 0, 0); return d; }

async function main() {
  console.log('=== SEED NoveResto — démarrage ===\n');

  // ============================================================
  // PHASE 1 — Référentiels globaux (canaux, plateformes livraison)
  // ============================================================
  console.log('[1/12] Référentiels globaux...');
  await pool.query(`
    INSERT INTO sales_channels (code, label) VALUES
      ('dine_in', 'Sur place'), ('takeaway', 'A emporter'), ('delivery', 'Livraison')
  `);
  const channels = (await pool.query('SELECT id, code FROM sales_channels')).rows;
  const chanMap = Object.fromEntries(channels.map(c => [c.code, c.id]));

  await pool.query(`
    INSERT INTO delivery_platforms (code, label, commission_rate, connector_status) VALUES
      ('deliveroo', 'Deliveroo', 25.00, 'active'),
      ('glovo', 'Glovo', 22.00, 'sandbox')
  `);
  const platforms = (await pool.query('SELECT id, code FROM delivery_platforms')).rows;
  const platMap = Object.fromEntries(platforms.map(p => [p.code, p.id]));

  // ============================================================
  // PHASE 2 — Organisation + comptes
  // ============================================================
  console.log('[2/12] Organisation et comptes...');

  const orgRes = await pool.query(`INSERT INTO organizations (name) VALUES ('Tacos Avenue Group') RETURNING id`);
  const orgId = orgRes.rows[0].id;

  const pw = (p) => bcrypt.hashSync(p, 10);

  const usersToCreate = [
    { email: 'admin@noveresto.app', password: 'Admin2025!', name: 'Ridha Khaskhoussy', restaurant: 'NoveResto HQ', role: 'admin', country: 'Tunisie', org: null },
    { email: 'demo@noveresto.app', password: 'Demo2025!', name: 'Karim Ben Ali', restaurant: 'Le Grill Marsa', role: 'client', country: 'Tunisie', org: null, city: 'La Marsa' },
    { email: 'client@noveresto.app', password: 'Client2025!', name: 'Sarra Mansouri', restaurant: 'Sushi Corner', role: 'client', country: 'Tunisie', org: null, city: 'Sousse' },
    { email: 'tacos-lac2@noveresto.app', password: 'Tacos2025!', name: 'Mehdi Trabelsi', restaurant: 'Tacos Avenue — Lac 2', role: 'client', country: 'Tunisie', org: orgId, city: 'Tunis' },
    { email: 'tacos-ariana@noveresto.app', password: 'Tacos2025!', name: 'Yassine Gharbi', restaurant: 'Tacos Avenue — Ariana', role: 'client', country: 'Tunisie', org: orgId, city: 'Ariana' },
    { email: 'franchise@noveresto.app', password: 'Franchise2025!', name: 'Amel Bouazizi', restaurant: null, role: 'franchise_owner', country: 'Tunisie', org: orgId }
  ];

  const userIds = {};
  for (const u of usersToCreate) {
    const res = await pool.query(
      `INSERT INTO users (email, password, name, restaurant, country, city, role, organization_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [u.email, pw(u.password), u.name, u.restaurant, u.country, u.city || null, u.role, u.org]
    );
    userIds[u.email] = res.rows[0].id;
    console.log(`  ${u.email} -> id ${res.rows[0].id} (${u.role})`);
  }

  const restaurants = [
    { key: 'demo@noveresto.app', theme: 'burger' },
    { key: 'client@noveresto.app', theme: 'sushi' },
    { key: 'tacos-lac2@noveresto.app', theme: 'tacos' },
    { key: 'tacos-ariana@noveresto.app', theme: 'tacos' }
  ].map(r => ({ ...r, id: userIds[r.key] }));

  // module_access : tous les modules pour chaque restaurant (compte client)
  for (const r of restaurants) {
    for (const m of ALL_MODULES) {
      await pool.query(`INSERT INTO module_access (user_id, module_key) VALUES ($1, $2)`, [r.id, m]);
    }
  }
  console.log(`  module_access accordé (${ALL_MODULES.length} modules) sur ${restaurants.length} restaurants`);

  // ============================================================
  // PHASE 3 — Catalogue (fournisseurs, ingrédients, menus)
  // ============================================================
  console.log('[3/12] Catalogue (fournisseurs, ingrédients, menus)...');

  const THEMES = {
    burger: {
      supplier: 'Metro Tunisie',
      ingredients: [
        { name: 'Viande hachée', unit: 'kg', cost: 22, stock: 15, min: 5 },
        { name: 'Pain burger', unit: 'unite', cost: 0.4, stock: 120, min: 40 },
        { name: 'Fromage cheddar', unit: 'kg', cost: 18, stock: 6, min: 2 },
        { name: 'Salade + légumes', unit: 'kg', cost: 4.5, stock: 8, min: 3 },
        { name: 'Sauce burger', unit: 'l', cost: 6, stock: 12, min: 3 }
      ],
      items: [
        { name: 'Classic Burger', price: 12.5, recipe: [['Viande hachée', 0.15], ['Pain burger', 1], ['Fromage cheddar', 0.05], ['Salade + légumes', 0.08], ['Sauce burger', 0.03]] },
        { name: 'Double Cheese', price: 16.0, recipe: [['Viande hachée', 0.30], ['Pain burger', 1], ['Fromage cheddar', 0.10], ['Salade + légumes', 0.08], ['Sauce burger', 0.04]] },
        { name: 'Veggie Burger', price: 11.0, recipe: [['Pain burger', 1], ['Fromage cheddar', 0.05], ['Salade + légumes', 0.15], ['Sauce burger', 0.03]] }
      ]
    },
    sushi: {
      supplier: 'Ocean Fresh Import',
      ingredients: [
        { name: 'Saumon frais', unit: 'kg', cost: 45, stock: 8, min: 3 },
        { name: 'Riz à sushi', unit: 'kg', cost: 5, stock: 20, min: 5 },
        { name: 'Algue nori', unit: 'unite', cost: 0.3, stock: 200, min: 50 },
        { name: 'Avocat', unit: 'kg', cost: 8, stock: 6, min: 2 },
        { name: 'Sauce soja', unit: 'l', cost: 4, stock: 10, min: 3 }
      ],items: [
        { name: 'California Roll', price: 14.0, recipe: [['Riz à sushi', 0.12], ['Algue nori', 2], ['Avocat', 0.05], ['Sauce soja', 0.02]] },
        { name: 'Saumon Roll', price: 18.5, recipe: [['Saumon frais', 0.08], ['Riz à sushi', 0.12], ['Algue nori', 2], ['Sauce soja', 0.02]] },
        { name: 'Plateau Mixte', price: 32.0, recipe: [['Saumon frais', 0.15], ['Riz à sushi', 0.25], ['Algue nori', 4], ['Avocat', 0.08], ['Sauce soja', 0.04]] }
      ]
    },
    tacos: {
      supplier: 'Metro Tunisie',
      ingredients: [
        { name: 'Viande hachée', unit: 'kg', cost: 22, stock: 12, min: 4 },
        { name: 'Escalope poulet', unit: 'kg', cost: 16, stock: 10, min: 4 },
        { name: 'Galette tacos', unit: 'unite', cost: 0.5, stock: 100, min: 30 },
        { name: 'Fromage fondu', unit: 'kg', cost: 15, stock: 5, min: 2 },
        { name: 'Sauce algérienne', unit: 'l', cost: 7, stock: 8, min: 2 }
      ],
      items: [
        { name: 'Tacos Viande', price: 10.5, recipe: [['Viande hachée', 0.18], ['Galette tacos', 1], ['Fromage fondu', 0.08], ['Sauce algérienne', 0.04]] },
        { name: 'Tacos Poulet', price: 10.5, recipe: [['Escalope poulet', 0.18], ['Galette tacos', 1], ['Fromage fondu', 0.08], ['Sauce algérienne', 0.04]] },
        { name: 'Tacos Mixte', price: 13.0, recipe: [['Viande hachée', 0.10], ['Escalope poulet', 0.10], ['Galette tacos', 1], ['Fromage fondu', 0.10], ['Sauce algérienne', 0.05]] }
      ]
    }
  };

  for (const r of restaurants) {
    const theme = THEMES[r.theme];

    const supRes = await pool.query(
      `INSERT INTO suppliers (restaurant_id, name, contact_phone, payment_terms) VALUES ($1,$2,$3,$4) RETURNING id`,
      [r.id, theme.supplier, '+216 71 000 000', '30 jours net']
    );
    const supplierId = supRes.rows[0].id;

    const ingredientIds = {};
    for (const ing of theme.ingredients) {
      const res = await pool.query(
        `INSERT INTO ingredients (restaurant_id, supplier_id, name, unit, current_stock, min_stock, unit_cost, lead_time_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,2) RETURNING id`,
        [r.id, supplierId, ing.name, ing.unit, ing.stock, ing.min, ing.cost]
      );
      ingredientIds[ing.name] = res.rows[0].id;
    }

    const catRes = await pool.query(
      `INSERT INTO menu_categories (restaurant_id, name) VALUES ($1, 'Plats') RETURNING id`,
      [r.id]
    );
    const catId = catRes.rows[0].id;

    r.menuItemIds = [];
    for (const item of theme.items) {
      const itemRes = await pool.query(
        `INSERT INTO menu_items (restaurant_id, category_id, name, price, vat_rate, is_available)
         VALUES ($1,$2,$3,$4,19,true) RETURNING id`,
        [r.id, catId, item.name, item.price]
      );
      const menuItemId = itemRes.rows[0].id;
      r.menuItemIds.push({ id: menuItemId, price: item.price });

      for (const [ingName, qty] of item.recipe) {
        await pool.query(
          `INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity) VALUES ($1,$2,$3)`,
          [menuItemId, ingredientIds[ingName], qty]
        );
      }
    }

    r.supplierId = supplierId;
    r.ingredientIds = ingredientIds;
    console.log(`  ${r.theme} (restaurant ${r.id}): ${theme.ingredients.length} ingrédients, ${theme.items.length} articles`);
  }

  // ============================================================
  // PHASE 4 — Connexions livraison (Deliveroo actif, Glovo sandbox)
  // ============================================================
  console.log('[4/12] Connexions livraison...');
  for (const r of restaurants) {
    await pool.query(
      `INSERT INTO restaurant_delivery_connections (restaurant_id, delivery_platform_id, external_site_id, webhook_secret, status)
       VALUES ($1,$2,$3,$4,'active')`,
      [r.id, platMap.deliveroo, `site-${r.id}-deliveroo`, `secret-test-${r.id}`]
    );
    await pool.query(
      `INSERT INTO restaurant_delivery_connections (restaurant_id, delivery_platform_id, external_site_id, status)
       VALUES ($1,$2,$3,'inactive')`,
      [r.id, platMap.glovo, `site-${r.id}-glovo`]
    );
  }

  // ============================================================
  // PHASE 5 — 90 jours de commandes réelles (avec saisonnalité vendredi)
  // ============================================================
  console.log('[5/12] Génération de 90 jours de commandes (peut prendre 1-2 min)...');
  const HORIZON_DAYS = 90;

  for (const r of restaurants) {
    let totalOrders = 0;
    for (let d = HORIZON_DAYS; d >= 1; d--) {
      const date = daysAgo(d);
      const isFriday = date.getDay() === 5;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const baseOrders = isFriday ? 22 : (isWeekend ? 16 : 11);
      const nbOrders = randInt(Math.round(baseOrders * 0.8), Math.round(baseOrders * 1.2));

      for (let o = 0; o < nbOrders; o++) {
        const channelCode = choice(['dine_in', 'dine_in', 'takeaway', 'delivery', 'delivery']);
        const isDelivery = channelCode === 'delivery';
        const platformId = isDelivery ? choice([platMap.deliveroo, platMap.glovo]) : null;
        const orderTime = daysAgo(d, randInt(11, 22));

        const nbItems = randInt(1, 3);
        let gross = 0;
        const itemsToInsert = [];
        for (let i = 0; i < nbItems; i++) {
          const item = choice(r.menuItemIds);
          const qty = randInt(1, 2);
          itemsToInsert.push({ menuItemId: item.id, qty, price: item.price });
          gross += item.price * qty;
        }
        const commission = isDelivery ? gross * 0.24 : 0;

        const orderRes = await pool.query(
          `INSERT INTO orders (restaurant_id, channel_id, delivery_platform_id, status, received_at, gross_amount, commission_amount, payment_method)
           VALUES ($1,$2,$3,'completed',$4,$5,$6,$7) RETURNING id`,
          [r.id, chanMap[channelCode], platformId, orderTime, gross, commission, isDelivery ? 'online' : choice(['cash', 'card'])]
        );
        const orderId = orderRes.rows[0].id;

        for (const it of itemsToInsert) {
          await pool.query(
            `INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price)

VALUES ($1,$2,(SELECT name FROM menu_items WHERE id=$2),$3,$4)`,
            [orderId, it.menuItemId, it.qty, it.price]
          );
        }

        // Réutilise le VRAI service de déduction de stock — pas de duplication de logique.
        await deductStockForOrder(pool, orderId, { restaurantId: r.id, userId: r.id });
        totalOrders++;
      }
    }
    console.log(`  restaurant ${r.id}: ${totalOrders} commandes générées sur ${HORIZON_DAYS} jours`);
  }

  // ============================================================
  // PHASE 6 — Historique d'achats fournisseurs (reçus + 1 en cours)
  // ============================================================
  console.log('[6/12] Historique d\'achats fournisseurs...');
  for (const r of restaurants) {
    const ingList = Object.entries(r.ingredientIds);

    // 2 commandes déjà reçues (historique)
    for (let i = 0; i < 2; i++) {
      const poRes = await pool.query(
        `INSERT INTO purchase_orders (restaurant_id, supplier_id, status, ordered_at, total_amount, created_by)
         VALUES ($1,$2,'sent',$3,0,$4) RETURNING id`,
        [r.id, r.supplierId, daysAgo(randInt(10, 60)), r.id]
      );
      const poId = poRes.rows[0].id;
      const chosen = ingList.slice(0, 2 + randInt(0, ingList.length - 2));
      let total = 0;
      for (const [name, ingId] of chosen) {
        const qty = randInt(10, 50);
        const unitPrice = rand(0.3, 25);
        total += qty * unitPrice;
        await pool.query(
          `INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
          [poId, ingId, qty, unitPrice]
        );
      }
      await pool.query(`UPDATE purchase_orders SET total_amount = $1 WHERE id = $2`, [total, poId]);
      await receivePurchaseOrder(pool, poId, { userId: r.id });
    }

    // 1 commande en cours (pas encore reçue) — visible dans les tests de suggestions
    const pendingPoRes = await pool.query(
      `INSERT INTO purchase_orders (restaurant_id, supplier_id, status, ordered_at, total_amount, created_by)
       VALUES ($1,$2,'sent',$3,0,$4) RETURNING id`,
      [r.id, r.supplierId, daysAgo(1), r.id]
    );
    const pendingIng = ingList[0];
    await pool.query(
      `INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
      [pendingPoRes.rows[0].id, pendingIng[1], 20, 10]
    );
    await pool.query(`UPDATE purchase_orders SET total_amount = 200 WHERE id = $1`, [pendingPoRes.rows[0].id]);
  }

  // ============================================================
  // PHASE 7 — Comptages d'inventaire (avec écarts volontaires)
  // ============================================================
  console.log('[7/12] Comptages d\'inventaire (écarts volontaires)...');
  for (const r of restaurants) {
    const ingList = Object.values(r.ingredientIds);
    // 2 comptages avec perte volontaire (10-20% en moins que le stock théorique)
    for (let i = 0; i < 2; i++) {
      const ingId = choice(ingList);
      const currentRes = await pool.query('SELECT current_stock FROM ingredients WHERE id = $1', [ingId]);
      const theoretical = Number(currentRes.rows[0].current_stock);
      const counted = Math.max(0, theoretical * rand(0.8, 0.92));
      await recordCount(pool, ingId, Math.round(counted * 1000) / 1000, {
        restaurantId: r.id, userId: r.id, note: 'Inventaire hebdomadaire'
      });
    }
  }

  // ============================================================
  // PHASE 8 — Prévisions Prophet (ml_forecasts) sur 14 jours à venir
  // ============================================================
  console.log('[8/12] Prévisions ml_forecasts (14 jours)...');
  for (const r of restaurants) {
    const histRes = await pool.query(
      `SELECT date_trunc('day', received_at) AS day, SUM(gross_amount) AS revenue, COUNT(*) AS covers
       FROM orders WHERE restaurant_id = $1 AND received_at >= now() - INTERVAL '30 days'
       GROUP BY date_trunc('day', received_at)`,
      [r.id]
    );
    const avgRevenue = histRes.rows.reduce((s, row) => s + Number(row.revenue), 0) / (histRes.rows.length || 1);
    const avgCovers = histRes.rows.reduce((s, row) => s + Number(row.covers), 0) / (histRes.rows.length || 1);

    for (let d = 1; d <= 14; d++) {
      const date = new Date(); date.setDate(date.getDate() + d);
      const isFriday = date.getDay() === 5;
      const factor = isFriday ? 1.5 : (date.getDay() === 0 || date.getDay() === 6 ? 1.2 : 0.9);
      await pool.query(
        `INSERT INTO ml_forecasts (restaurant_id, forecast_date, revenue_tnd, revenue_min, revenue_max, covers_est, mape, model_version)
         VALUES ($1,$2,$3,$4,$5,$6,12.71,'prophet-v1')`,
        [r.id, date.toISOString().slice(0, 10),
         Math.round(avgRevenue * factor), Math.round(avgRevenue * factor * 0.85), Math.round(avgRevenue * factor * 1.15),
         Math.round(avgCovers * factor)]
      );
    }
  }

  // ============================================================
  // PHASE 9 — Décomposition ingrédient + suggestions (réutilise le vrai job cron)
  // ============================================================
  console.log('[9/12] Décomposition ingrédient + suggestions de commande (vrai code de prod)...');
  for (const r of restaurants) {
    const forecastResult = await persistIngredientForecast(pool, r.id, 14);
    const suggestions = await generateForRestaurant(pool, r.id);
    console.log(`  restaurant ${r.id}: ${forecastResult.persisted || 0} prévisions, ${suggestions.length} suggestions`);
  }

  // ============================================================
  // PHASE 10 — Prospects (module commercial NoverProspect)
  // ============================================================
  console.log('[10/12] Prospects...');
  const PROSPECT_ZONES = [
    { name: 'Café Manouba Centre', lat: 36.8083, lng: 10.0972, tier: 'invisible', status: 'nouveau' },
    { name: 'Restaurant Ariana Palace', lat: 36.8625, lng: 10.1956, tier: 'presence_faible', status: 'contacte' },
    { name: 'Snack Ben Arous', lat: 36.7531, lng: 10.2189, tier: 'invisible', status: 'nouveau' },
    { name: 'Pizzeria Sidi Bouzid', lat: 35.0381, lng: 9.4858, tier: 'etabli', status: 'rejete' },
    { name: 'Fast Food La Goulette', lat: 36.8189, lng: 10.3053, tier: 'presence_faible', status: 'qualifie' }
  ];
  for (const r of restaurants.slice(0, 2)) {
    for (const p of PROSPECT_ZONES) {
      const prospRes = await pool.query(
        `INSERT INTO prospects (restaurant_id, google_place_id, name, address, phone, rating, review_count, latitude, longitude, category, zone_label, opportunity_tier, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'restaurant',$10,$11,$12) RETURNING id`,
        [r.id, `place_${r.id}_${p.name.replace(/\s+/g, '_')}`, p.name, `${p.name}, Tunisie`, '+216 2' + randInt(0, 9) + ' ' + randInt(100000, 999999),p.tier === 'etabli' ? 4.2 : null, p.tier === 'etabli' ? randInt(50, 200) : 0,
         p.lat, p.lng, p.name.split(' ')[1] || 'Zone', p.tier, p.status]
      );
      if (p.status !== 'nouveau') {
        await pool.query(
          `INSERT INTO prospect_interactions (prospect_id, restaurant_id, note, created_by) VALUES ($1,$2,$3,$4)`,
          [prospRes.rows[0].id, r.id, `Contact effectué — visite terrain 15h-17h, ${p.status === 'qualifie' ? 'intéressé par une démo' : p.status === 'rejete' ? 'déjà équipé' : 'à recontacter'}`, r.id]
        );
      }
    }
  }

  // ============================================================
  // PHASE 11 — Personnel et plannings
  // ============================================================
  console.log('[11/12] Personnel et plannings...');
  const EMPLOYEE_NAMES = [
    ['Amine Cherni', 'manager'], ['Nour Jendoubi', 'cuisinier'], ['Rania Tlili', 'equipier'], ['Sami Khadhraoui', 'equipier']
  ];
  for (const r of restaurants) {
    const empIds = [];
    for (const [name, role] of EMPLOYEE_NAMES) {
      const res = await pool.query(
        `INSERT INTO employees (restaurant_id, name, role, phone, hourly_cost) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [r.id, name, role, '+216 9' + randInt(0, 9) + ' ' + randInt(100000, 999999), role === 'manager' ? 12 : 8]
      );
      empIds.push(res.rows[0].id);
    }
    // Planning de la semaine à venir
    for (let d = 0; d < 7; d++) {
      for (const empId of empIds.slice(0, 2)) {
        const start = new Date(); start.setDate(start.getDate() + d); start.setHours(11, 0, 0, 0);
        const end = new Date(start); end.setHours(19, 0, 0, 0);
        await pool.query(
          `INSERT INTO shifts (restaurant_id, employee_id, starts_at, ends_at, status, created_by) VALUES ($1,$2,$3,$4,'scheduled',$5)`,
          [r.id, empId, start, end, r.id]
        );
      }
    }
  }

  // ============================================================
  // PHASE 12 — Litiges (disputes) et facturation TEIF
  // ============================================================
  console.log('[12/12] Litiges et facturation TEIF...');
  for (const r of restaurants) {
    const someOrders = await pool.query(
      `SELECT id, gross_amount FROM orders WHERE restaurant_id = $1 ORDER BY received_at DESC LIMIT 5`,
      [r.id]
    );
    if (someOrders.rows.length > 0) {
      const disputeOrder = someOrders.rows[0];
      const disputeRes = await pool.query(
        `INSERT INTO disputes (restaurant_id, order_id, platform, reason, amount_requested, status, created_by)
         VALUES ($1,$2,'deliveroo','Commande non livrée',$3,'to_analyze',$4) RETURNING id`,
        [r.id, disputeOrder.id, disputeOrder.gross_amount, r.id]
      );
      await pool.query(
        `INSERT INTO dispute_status_history (dispute_id, to_status, changed_by) VALUES ($1,'to_analyze',$2)`,
        [disputeRes.rows[0].id, r.id]
      );

      // Facture TEIF B2B d'exemple sur une autre commande
      if (someOrders.rows.length > 1) {
        const invoiceOrder = someOrders.rows[1];
        await pool.query(
          `INSERT INTO teif_invoices (restaurant_id, order_id, invoice_number, customer_tax_id, customer_name, customer_city, teif_xml, status, created_by)
           VALUES ($1,$2,$3,'0000000A','Client B2B Test','Tunis',$4,'generated',$5)`,
          [r.id, invoiceOrder.id, `TEIF-${r.id}-${Date.now()}`, '<TEIF><InvoiceHeader>Test</InvoiceHeader></TEIF>', r.id]
        );
      }
    }
  }

  console.log('\n=== SEED TERMINÉ AVEC SUCCÈS ===');
  console.log('\nComptes créés :');
  usersToCreate.forEach(u => console.log(`  ${u.email} / ${u.password} (${u.role})`));

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n=== ERREUR SEED ===');
  console.error(err);
  pool.end().finally(() => process.exit(1));
});
