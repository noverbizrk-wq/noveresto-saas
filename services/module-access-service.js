// module-access-service.js
// Gère les permissions par module pour les comptes clients.
// Modèle : présence d'une ligne (user_id, module_key) = accès activé.

const ALL_MODULES = [
  { key: 'overview',  label: 'Pilotage restaurant' },
  { key: 'orders',    label: 'Commandes' },
  { key: 'kds',       label: 'Écran cuisine' },
  { key: 'menus',     label: 'Menus et produits' },
  { key: 'recipes',   label: 'Recettes et marges' },
  { key: 'stocks',    label: 'Stocks' },
  { key: 'purchases', label: 'Achats et fournisseurs' },
  { key: 'staff',     label: 'Équipe et planning' },
  { key: 'disputes',  label: 'Litiges' },
  { key: 'finance',   label: 'Finance et TVA' },
  { key: 'copilot',   label: 'Copilote IA' },
];

const VALID_KEYS = new Set(ALL_MODULES.map(m => m.key));

/**
 * Liste des modules activés pour un utilisateur (juste les clés).
 */
async function getUserModules(pool, userId) {
  const result = await pool.query(
    'SELECT module_key FROM module_access WHERE user_id = $1',
    [userId]
  );
  return result.rows.map(r => r.module_key);
}

/**
 * Vérifie si un utilisateur a accès à un module donné.
 */
async function hasModuleAccess(pool, userId, moduleKey) {
  const result = await pool.query(
    'SELECT 1 FROM module_access WHERE user_id = $1 AND module_key = $2',
    [userId, moduleKey]
  );
  return result.rows.length > 0;
}

/**
 * Remplace intégralement la liste des modules activés pour un utilisateur
 * (utilisé par l'écran admin — on envoie la liste complète souhaitée).
 */
async function setUserModules(pool, userId, moduleKeys, grantedBy) {
  const invalid = moduleKeys.filter(k => !VALID_KEYS.has(k));
  if (invalid.length > 0) {
    const err = new Error(`Modules inconnus: ${invalid.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM module_access WHERE user_id = $1', [userId]);
    for (const key of moduleKeys) {
      await client.query(
        'INSERT INTO module_access (user_id, module_key, granted_by) VALUES ($1,$2,$3)',
        [userId, key, grantedBy || null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ALL_MODULES, VALID_KEYS, getUserModules, hasModuleAccess, setUserModules };
