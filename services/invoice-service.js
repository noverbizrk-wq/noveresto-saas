// invoice-service.js
//
// Orchestre la génération de facture selon le pays du restaurant :
//   - Tunisie      -> format TEIF (XML), via teif-service.js
//   - tout le reste -> PDF simple, via pdf-invoice-service.js
//
// Les deux formats sont stockés dans la même table `teif_invoices`
// (colonne document_format distingue lequel) — cf. migration 025. Le nom
// de la table/route reste "teif" pour raisons historiques (déjà utilisé
// par le frontend), mais ce module gère tous les pays.

const teifService = require('./teif-service');
const pdfInvoiceService = require('./pdf-invoice-service');
const { normalizeCountry, currencyForCountry, DEFAULT_COUNTRY } = require('../lib/currency');

async function createInvoice(pool, restaurantId, orderId, customer, userId) {
  const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2', [orderId, restaurantId]);
  const order = orderResult.rows[0];
  if (!order) {
    const err = new Error('Commande introuvable');
    err.statusCode = 404;
    throw err;
  }

  const existing = await pool.query('SELECT id FROM teif_invoices WHERE restaurant_id = $1 AND order_id = $2', [restaurantId, orderId]);
  if (existing.rows.length > 0) {
    const err = new Error('Une facture existe déjà pour cette commande');
    err.statusCode = 409;
    throw err;
  }

  const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  const supplierResult = await pool.query('SELECT restaurant, name, tax_id, address, city, postal_code, country FROM users WHERE id = $1', [restaurantId]);
  const supplier = supplierResult.rows[0] || {};

  const country = normalizeCountry(supplier.country) || DEFAULT_COUNTRY;
  const format = country === 'Tunisie' ? 'teif_xml' : 'pdf';
  const invoiceNumber = `NR-${restaurantId}-${orderId}-${Date.now()}`;

  let teifXml = null;
  let pdfBuffer = null;
  let totals;
  const currency = currencyForCountry(supplier.country);

  if (format === 'teif_xml') {
    const generated = teifService.generateTEIF(order, itemsResult.rows, supplier, customer, invoiceNumber);
    teifXml = generated.xml;
    totals = generated.totals;
  } else {
    const generated = await pdfInvoiceService.generateInvoicePDF(order, itemsResult.rows, supplier, customer, invoiceNumber, currency);
    pdfBuffer = generated.buffer;
    totals = generated.totals;
  }

  const result = await pool.query(
    `INSERT INTO teif_invoices
      (restaurant_id, order_id, invoice_number, customer_tax_id, customer_name, customer_address, customer_city, customer_postal_code, customer_email, teif_xml, document_format, document_pdf, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, invoice_number, status, created_at, customer_email, document_format`,
    [restaurantId, orderId, invoiceNumber, customer.tax_id || null, customer.name, customer.address || null, customer.city || null, customer.postal_code || null, customer.email || null, teifXml, format, pdfBuffer, userId || null]
  );

  return { ...result.rows[0], totals, xml: teifXml, pdf: pdfBuffer, currency };
}

async function getInvoice(pool, restaurantId, orderId) {
  const result = await pool.query('SELECT * FROM teif_invoices WHERE restaurant_id = $1 AND order_id = $2', [restaurantId, orderId]);
  return result.rows[0] || null;
}

async function listInvoices(pool, restaurantId) {
  const result = await pool.query(
    `SELECT id, order_id, invoice_number, customer_name, status, document_format, created_at FROM teif_invoices WHERE restaurant_id = $1 ORDER BY created_at DESC`,
    [restaurantId]
  );
  return result.rows;
}

module.exports = { createInvoice, getInvoice, listInvoices };
