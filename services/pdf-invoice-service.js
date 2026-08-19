// pdf-invoice-service.js
//
// Génère une facture PDF simple pour les restaurants HORS Tunisie (TEIF
// est spécifique au fisc tunisien — cf. teif-service.js). Utilisé par
// invoice-service.js comme alternative selon le pays du restaurant.
//
// ⚠️ CE N'EST PAS UN DOCUMENT CONFORME "FACTURE ÉLECTRONIQUE" — en
// particulier pour la France, la réforme de facturation électronique
// obligatoire (déploiement 2026-2027) exige un format structuré
// (Factur-X/UBL) transmis via une Plateforme de Dématérialisation
// Partenaire (PDP) agréée, pas un simple PDF. Ce module produit une
// facture PDF classique (HT/TVA/TTC, mentions commerciales standard),
// suffisante comme document commercial de base, mais à faire valider
// par un expert-comptable avant tout usage B2B officiel.

const PDFDocument = require('pdfkit');

function fmt(amount) {
  return Number(amount).toFixed(2);
}

/**
 * @param {object} order - ligne de la table `orders`
 * @param {array} items - lignes de `order_items` (is_cancelled déjà filtré par l'appelant si besoin)
 * @param {object} supplier - infos du restaurant (name/restaurant, tax_id, address, city, postal_code, country)
 * @param {object} customer - infos du client (name obligatoire, tax_id/address/city/postal_code optionnels)
 * @param {string} invoiceNumber
 * @param {string} currency - code devise (TND, EUR, ...) affiché sur le document
 * @returns {Promise<{buffer: Buffer, totals: object}>}
 */
function generateInvoicePDF(order, items, supplier, customer, invoiceNumber, currency) {
  const activeItems = items.filter(i => !i.is_cancelled);
  if (activeItems.length === 0) {
    const err = new Error('Aucune ligne active sur cette commande — impossible de générer une facture');
    err.statusCode = 400;
    throw err;
  }
  if (!customer.name) {
    const err = new Error('Le nom du client est requis');
    err.statusCode = 400;
    throw err;
  }

  const lineCalcs = activeItems.map(item => {
    const lineTotalTTC = Number(item.unit_price) * item.quantity;
    const vatRate = Number(item.vat_rate) || 0;
    const lineTotalHT = vatRate > 0 ? lineTotalTTC / (1 + vatRate / 100) : lineTotalTTC;
    const vatAmount = lineTotalTTC - lineTotalHT;
    return { name: item.item_name, quantity: item.quantity, vatRate, unitPrice: Number(item.unit_price), lineTotalHT, vatAmount, lineTotalTTC };
  });

  const subtotalHT = lineCalcs.reduce((s, l) => s + l.lineTotalHT, 0);
  const totalVAT = lineCalcs.reduce((s, l) => s + l.vatAmount, 0);
  const totalTTC = lineCalcs.reduce((s, l) => s + l.lineTotalTTC, 0);
  const totals = { subtotalHT: fmt(subtotalHT), totalVAT: fmt(totalVAT), totalTTC: fmt(totalTTC) };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), totals }));
      doc.on('error', reject);

      const navy = '#0D2137';
      const teal = '#00C48C';
      const muted = '#6A8FAB';

      // Header
      doc.fontSize(20).fillColor(navy).font('Helvetica-Bold').text('Nover', 50, 50, { continued: true });
      doc.fillColor(teal).text('Resto');
      doc.fontSize(9).fillColor(muted).font('Helvetica').text('noveresto.app', 50, 74);

      doc.fontSize(22).fillColor(navy).font('Helvetica-Bold').text('FACTURE', 350, 50, { align: 'right' });
      doc.fontSize(10).fillColor(muted).font('Helvetica')
        .text(`N° ${invoiceNumber}`, 350, 78, { align: 'right' })
        .text(`Date : ${new Date(order.received_at || Date.now()).toLocaleDateString('fr-FR')}`, 350, 92, { align: 'right' });

      doc.moveTo(50, 115).lineTo(545, 115).strokeColor('#E2E8F0').stroke();

      // Emetteur / Client
      const blockY = 135;
      doc.fontSize(9).fillColor(muted).font('Helvetica-Bold').text('ÉMETTEUR', 50, blockY);
      doc.fontSize(11).fillColor(navy).font('Helvetica-Bold').text(supplier.restaurant || supplier.name || '', 50, blockY + 14);
      doc.fontSize(9).fillColor(navy).font('Helvetica')
        .text(supplier.address || '', 50, blockY + 30)
        .text([supplier.postal_code, supplier.city].filter(Boolean).join(' '), 50, blockY + 43);
      if (supplier.tax_id) doc.text(`Identifiant fiscal : ${supplier.tax_id}`, 50, blockY + 58);

      doc.fontSize(9).fillColor(muted).font('Helvetica-Bold').text('CLIENT', 320, blockY);
      doc.fontSize(11).fillColor(navy).font('Helvetica-Bold').text(customer.name, 320, blockY + 14);
      doc.fontSize(9).fillColor(navy).font('Helvetica')
        .text(customer.address || '', 320, blockY + 30)
        .text([customer.postal_code, customer.city].filter(Boolean).join(' '), 320, blockY + 43);
      if (customer.tax_id) doc.text(`Identifiant fiscal : ${customer.tax_id}`, 320, blockY + 58);

      // Tableau lignes
      let y = blockY + 95;
      doc.rect(50, y, 495, 22).fill('#F1F5F9');
      doc.fontSize(9).fillColor(muted).font('Helvetica-Bold')
        .text('DÉSIGNATION', 58, y + 7)
        .text('QTÉ', 300, y + 7, { width: 40, align: 'right' })
        .text('PU HT', 350, y + 7, { width: 60, align: 'right' })
        .text('TVA', 415, y + 7, { width: 50, align: 'right' })
        .text('TOTAL TTC', 470, y + 7, { width: 68, align: 'right' });
      y += 22;

      doc.font('Helvetica').fontSize(9).fillColor(navy);
      for (const line of lineCalcs) {
        doc.text(line.name, 58, y + 6, { width: 235 });
        doc.text(String(line.quantity), 300, y + 6, { width: 40, align: 'right' });
        doc.text(`${fmt(line.unitPrice / (1 + line.vatRate / 100))}`, 350, y + 6, { width: 60, align: 'right' });
        doc.text(`${line.vatRate}%`, 415, y + 6, { width: 50, align: 'right' });
        doc.text(`${fmt(line.lineTotalTTC)}`, 470, y + 6, { width: 68, align: 'right' });
        y += 20;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#E2E8F0').stroke();
      }

      // Totaux
      y += 15;
      const totalsX = 380;
      doc.font('Helvetica').fontSize(10).fillColor(navy)
        .text('Total HT', totalsX, y, { width: 90 })
        .text(`${totals.subtotalHT} ${currency}`, totalsX + 90, y, { width: 75, align: 'right' });
      y += 16;
      doc.text('TVA', totalsX, y, { width: 90 })
        .text(`${totals.totalVAT} ${currency}`, totalsX + 90, y, { width: 75, align: 'right' });
      y += 18;
      doc.moveTo(totalsX, y).lineTo(545, y).strokeColor(navy).stroke();
      y += 6;
      doc.font('Helvetica-Bold').fontSize(12).fillColor(teal)
        .text('Total TTC', totalsX, y, { width: 90 })
        .text(`${totals.totalTTC} ${currency}`, totalsX + 90, y, { width: 75, align: 'right' });

      // Pied de page — avertissement honnête, meme esprit que teif-service.js
      doc.fontSize(8).fillColor(muted).font('Helvetica')
        .text(
          "Document commercial simple, généré automatiquement. Ne constitue pas une facture électronique structurée " +
          "(Factur-X/UBL) au sens de la réforme de facturation électronique obligatoire — à faire valider par un " +
          "expert-comptable avant tout usage B2B officiel.",
          50, 720, { width: 495, align: 'center' }
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateInvoicePDF };
