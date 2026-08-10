// teif-service.js
//
// Génère un document XML conforme à la structure TEIF (Tunisian Electronic
// Invoice Format), à partir d'une commande NoveResto réelle. Structure
// basée sur la documentation technique disponible publiquement (schéma
// TEIF v1.8.x, dérivé UN/EDIFACT/UBL) — PAS vérifiée directement auprès
// de la documentation officielle TTN, à faire valider par un expert-
// comptable ou un intégrateur TTN agréé avant tout usage réel.
//
// ⚠️ CE MODULE NE FAIT QUE GÉNÉRER LE XML. Il ne signe pas (nécessite un
// certificat TUNTRUST/ANCE, non disponible) et ne soumet rien à l'API TTN
// (nécessite des identifiants obtenus après inscription sur El Fatoora,
// non disponibles). Le document produit ici n'a donc PAS de valeur légale
// tant qu'il n'a pas été signé et soumis avec de vrais identifiants.

const { create } = require('xmlbuilder2');

function fmt(amount) {
  return Number(amount).toFixed(3);
}

/**
 * @param {object} order - ligne de la table `orders`
 * @param {array} items - lignes de `order_items` (avec vat_rate déjà snapshoté, cf. Lot 4)
 * @param {object} supplier - infos fiscales du restaurant (users.tax_id, restaurant, address, city, postal_code)
 * @param {object} customer - infos du client B2B saisies au moment de la génération
 * @param {string} invoiceNumber - identifiant interne NoveResto de la facture
 */
function generateTEIF(order, items, supplier, customer, invoiceNumber) {
  const missing = [];
  if (!supplier.tax_id) missing.push('matricule fiscal du restaurant (compte non configuré)');
  if (!customer.tax_id) missing.push('matricule fiscal du client');
  if (!customer.name) missing.push('nom du client');
  if (missing.length > 0) {
    const err = new Error(`Champs obligatoires manquants pour générer la facture TEIF : ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const activeItems = items.filter(i => !i.is_cancelled);
  if (activeItems.length === 0) {
    const err = new Error('Aucune ligne active sur cette commande — impossible de générer une facture');
    err.statusCode = 400;
    throw err;
  }

  const lineCalcs = activeItems.map((item, idx) => {
    const lineTotalTTC = Number(item.unit_price) * item.quantity;
    const vatRate = Number(item.vat_rate) || 19;
    const lineTotalHT = lineTotalTTC / (1 + vatRate / 100);
    const vatAmount = lineTotalTTC - lineTotalHT;
    return { id: idx + 1, name: item.item_name, quantity: item.quantity, vatRate, lineTotalHT, vatAmount, lineTotalTTC };
  });

  const subtotalHT = lineCalcs.reduce((s, l) => s + l.lineTotalHT, 0);
  const totalVAT = lineCalcs.reduce((s, l) => s + l.vatAmount, 0);
  const totalTTC = lineCalcs.reduce((s, l) => s + l.lineTotalTTC, 0);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Invoice', {
      xmlns: 'urn:tn:gov:dgi:teif:1.8',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    });

  const header = doc.ele('Header');
  header.ele('InvoiceID').txt(invoiceNumber);
  header.ele('IssueDate').txt(new Date(order.received_at).toISOString().slice(0, 10));
  header.ele('InvoiceTypeCode').txt('380'); // 380 = facture commerciale standard
  header.ele('DocumentCurrencyCode').txt('TND');

  const parties = doc.ele('Parties');

  const supplierEl = parties.ele('Supplier');
  supplierEl.ele('PartyIdentification').ele('ID', { schemeID: 'TN_MF' }).txt(supplier.tax_id);
  supplierEl.ele('PartyName').ele('Name').txt(supplier.restaurant || supplier.name || '');
  const supplierAddr = supplierEl.ele('PostalAddress');
  supplierAddr.ele('StreetName').txt(supplier.address || '');
  supplierAddr.ele('CityName').txt(supplier.city || '');
  supplierAddr.ele('PostalZone').txt(supplier.postal_code || '');
  supplierAddr.ele('Country').ele('IdentificationCode').txt('TN');

  const customerEl = parties.ele('Customer');
  customerEl.ele('PartyIdentification').ele('ID', { schemeID: 'TN_MF' }).txt(customer.tax_id);
  customerEl.ele('PartyName').ele('Name').txt(customer.name);
  const customerAddr = customerEl.ele('PostalAddress');
  customerAddr.ele('StreetName').txt(customer.address || '');
  customerAddr.ele('CityName').txt(customer.city || '');
  customerAddr.ele('PostalZone').txt(customer.postal_code || '');
  customerAddr.ele('Country').ele('IdentificationCode').txt('TN');

  const lines = doc.ele('InvoiceLines');
  for (const line of lineCalcs) {
    const lineEl = lines.ele('InvoiceLine');
    lineEl.ele('ID').txt(String(line.id));
    lineEl.ele('InvoicedQuantity', { unitCode: 'C62' }).txt(String(line.quantity));
    lineEl.ele('LineExtensionAmount', { currencyID: 'TND' }).txt(fmt(line.lineTotalHT));
    const item = lineEl.ele('Item');
    item.ele('Name').txt(line.name);
    const taxCat = item.ele('ClassifiedTaxCategory');
    taxCat.ele('ID').txt('S');
    taxCat.ele('Percent').txt(String(line.vatRate));
    taxCat.ele('TaxScheme').ele('ID').txt('TVA');
  }

  const taxTotal = doc.ele('TaxTotal');
  taxTotal.ele('TaxAmount', { currencyID: 'TND' }).txt(fmt(totalVAT));

  const monetary = doc.ele('LegalMonetaryTotal');
  monetary.ele('LineExtensionAmount', { currencyID: 'TND' }).txt(fmt(subtotalHT));
  monetary.ele('TaxExclusiveAmount', { currencyID: 'TND' }).txt(fmt(subtotalHT));
  monetary.ele('TaxInclusiveAmount', { currencyID: 'TND' }).txt(fmt(totalTTC));
  monetary.ele('PayableAmount', { currencyID: 'TND' }).txt(fmt(totalTTC));

  return {
    xml: doc.end({ prettyPrint: true }),
    totals: { subtotalHT: fmt(subtotalHT), totalVAT: fmt(totalVAT), totalTTC: fmt(totalTTC) },
  };
}

async function createInvoice(pool, restaurantId, orderId, customer, userId) {
  const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2', [orderId, restaurantId]);
  const order = orderResult.rows[0];
  if (!order) {
    const err = new Error('Commande introuvable');
    err.statusCode = 404;
    throw err;
  }

  const existing = await pool.query('SELECT * FROM teif_invoices WHERE restaurant_id = $1 AND order_id = $2', [restaurantId, orderId]);
  if (existing.rows.length > 0) {
    const err = new Error('Une facture TEIF existe déjà pour cette commande');
    err.statusCode = 409;
    throw err;
  }

  const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  const supplierResult = await pool.query('SELECT restaurant, name, tax_id, address, city, postal_code FROM users WHERE id = $1', [restaurantId]);
  const supplier = supplierResult.rows[0] || {};

  const invoiceNumber = `NR-${restaurantId}-${orderId}-${Date.now()}`;
  const { xml, totals } = generateTEIF(order, itemsResult.rows, supplier, customer, invoiceNumber);

  const result = await pool.query(
    `INSERT INTO teif_invoices
      (restaurant_id, order_id, invoice_number, customer_tax_id, customer_name, customer_address, customer_city, customer_postal_code, teif_xml, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, invoice_number, status, created_at`,
    [restaurantId, orderId, invoiceNumber, customer.tax_id, customer.name, customer.address || null, customer.city || null, customer.postal_code || null, xml, userId || null]
  );

  return { ...result.rows[0], totals };
}

async function getInvoice(pool, restaurantId, orderId) {
  const result = await pool.query('SELECT * FROM teif_invoices WHERE restaurant_id = $1 AND order_id = $2', [restaurantId, orderId]);
  return result.rows[0] || null;
}

async function listInvoices(pool, restaurantId) {
  const result = await pool.query(
    `SELECT id, order_id, invoice_number, customer_name, status, created_at FROM teif_invoices WHERE restaurant_id = $1 ORDER BY created_at DESC`,
    [restaurantId]
  );
  return result.rows;
}

async function updateSupplierTaxInfo(pool, userId, { tax_id, address, city, postal_code }) {
  const updates = [];
  const params = [];
  let idx = 1;
  if (tax_id !== undefined) { updates.push(`tax_id = $${idx++}`); params.push(tax_id); }
  if (address !== undefined) { updates.push(`address = $${idx++}`); params.push(address); }
  if (city !== undefined) { updates.push(`city = $${idx++}`); params.push(city); }
  if (postal_code !== undefined) { updates.push(`postal_code = $${idx++}`); params.push(postal_code); }
  if (updates.length === 0) {
    const err = new Error('Aucun champ à mettre à jour');
    err.statusCode = 400;
    throw err;
  }
  params.push(userId);
  const result = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, email, name, restaurant, tax_id, address, city, postal_code`,
    params
  );
  return result.rows[0];
}

module.exports = { generateTEIF, createInvoice, getInvoice, listInvoices, updateSupplierTaxInfo };
