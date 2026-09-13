/**
 * receiptTemplate.ts
 * ─────────────────
 * Pure function that generates a complete, print-ready HTML receipt document.
 * Platform-agnostic — no DOM or React dependencies.
 * Optimised for 58 mm and 80 mm thermal paper but also renders well on screen.
 *
 * Future extension points:
 *   • Multiple receipt templates (gift receipt, full invoice, KOT, etc.)
 *   • QR-code injection (add a <canvas> or <img data-qr> placeholder)
 *   • Logo injection (base64 <img> in header)
 *   • Custom paper sizes via ReceiptOptions
 */

import { format as formatDate, parseISO } from 'date-fns';
import type { SaleInvoice, AppSettings } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptData {
  sale: SaleInvoice;
  settings: AppSettings;
  customerName?: string;
}

export interface ReceiptOptions {
  /** 'narrow' = 58 mm (~220 px body), 'standard' = 80 mm (~302 px body) */
  paperWidth?: 'narrow' | 'standard';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a complete HTML string (<!DOCTYPE html> … </html>) ready to be
 * injected into a new window / iframe and printed.
 */
export function generateReceiptHTML(
  data: ReceiptData,
  options: ReceiptOptions = {},
): string {
  const { sale, settings, customerName } = data;
  const { paperWidth = 'standard' } = options;

  const bodyWidth = paperWidth === 'narrow' ? '220px' : '302px';

  // ── Derived values ──────────────────────────────────────────────────────
  const subtotal = sale.items.reduce((s, i) => s + i.subtotal, 0);
  const change =
    sale.paidAmount > sale.grandTotal ? sale.paidAmount - sale.grandTotal : 0;
  const billId = sale.id.slice(-8).toUpperCase();

  let billDate = '';
  let billTime = '';
  try {
    const d = parseISO(sale.date);
    billDate = formatDate(d, 'dd/MM/yyyy');
    billTime = formatDate(d, 'hh:mm a');
  } catch {
    const d = new Date(sale.date);
    billDate = formatDate(d, 'dd/MM/yyyy');
    billTime = formatDate(d, 'hh:mm a');
  }

  const sym = settings.currencySymbol || 'Rs';
  const fmt = (n: number) => `${sym}\u00a0${n.toFixed(2)}`;

  const paymentLabel: Record<string, string> = {
    cash: 'Cash',
    qr: 'QR / Mobile Pay',
    card: 'Card',
    bank: 'Bank Transfer',
    split: 'Split Payment',
    credit: 'Credit / Udharo',
  };
  const pmtLabel = paymentLabel[sale.paymentMethod] ?? sale.paymentMethod;

  // ── Item rows ────────────────────────────────────────────────────────────
  const itemRows = sale.items
    .map(
      (item) => `
    <tr>
      <td class="col-name">${esc(item.productName)}${item.variantName ? `<span class="sub">${esc(item.variantName)}</span>` : ''}</td>
      <td class="col-qty">${item.quantity}${item.unit ? ` ${esc(item.unit)}` : ''}</td>
      <td class="col-price">${item.sellingRate.toFixed(2)}</td>
      <td class="col-total">${item.subtotal.toFixed(2)}</td>
    </tr>`,
    )
    .join('\n');

  // ── Optional header lines ────────────────────────────────────────────────
  const addressLine = settings.address
    ? `<div class="sub">${esc(settings.address)}</div>`
    : '';
  const phoneLine = settings.phone
    ? `<div class="sub">Tel: ${esc(settings.phone)}</div>`
    : '';
  const vatLine = settings.vatNumber
    ? `<div class="sub">VAT/PAN: ${esc(settings.vatNumber)}</div>`
    : '';

  const customerRow = customerName
    ? `<tr><td class="lbl">Customer</td><td class="val">${esc(customerName)}</td></tr>`
    : '';

  const discountRow =
    sale.discount > 0
      ? `<tr><td class="lbl">Discount</td><td class="val">- ${fmt(sale.discount)}</td></tr>`
      : '';
  const taxRow =
    sale.tax > 0
      ? `<tr><td class="lbl">Tax</td><td class="val">${fmt(sale.tax)}</td></tr>`
      : '';
  const changeRow =
    change > 0
      ? `<tr class="change-row"><td class="lbl">Change</td><td class="val">${fmt(change)}</td></tr>`
      : '';

  const inquiryLine = settings.phone
    ? `<div>Inquiries: ${esc(settings.phone)}</div>`
    : '';

  // ── Full document ────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Receipt #${billId}</title>
  <style>
    /* ── Reset ─────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page / Print setup ─────────────────────────────────── */
    @page {
      size: ${paperWidth === 'narrow' ? '58mm' : '80mm'} auto;
      margin: 4mm 2mm;
    }

    /* ── Body ───────────────────────────────────────────────── */
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.45;
      color: #000;
      background: #fff;
      width: 100%;
      max-width: ${bodyWidth};
      margin: 0 auto;
      padding: 6px 8px;
    }

    /* ── Store header ───────────────────────────────────────── */
    .header        { text-align: center; margin-bottom: 6px; }
    .store-name    {
      font-size: 15px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      line-height: 1.2;
      margin-bottom: 3px;
    }
    .sub           { font-size: 10px; color: #333; line-height: 1.5; }

    /* ── Dividers ───────────────────────────────────────────── */
    .dash   { border: none; border-top: 1px dashed #000; margin: 5px 0; }
    .solid  { border: none; border-top: 1px solid  #000; margin: 5px 0; }
    .double { border: none; border-top: 3px double #000; margin: 5px 0; }

    /* ── Meta table (receipt #, date, customer…) ────────────── */
    .meta         { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 2px; }
    .meta td      { padding: 1px 0; vertical-align: top; }
    .meta .lbl    { color: #555; width: 48%; }
    .meta .val    { font-weight: 700; text-align: right; }

    /* ── Items table ────────────────────────────────────────── */
    .items              { width: 100%; border-collapse: collapse; }
    .items thead th     {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 3px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }
    .items .th-name     { text-align: left; }
    .items .th-qty      { text-align: center; width: 26px; }
    .items .th-price    { text-align: right; width: 50px; }
    .items .th-total    { text-align: right; width: 54px; }

    .items tbody td     { padding: 2px 0; font-size: 10px; vertical-align: top; }
    .col-name           { text-align: left; word-break: break-word; padding-right: 3px; }
    .col-qty            { text-align: center; width: 26px; }
    .col-price          { text-align: right; width: 50px; }
    .col-total          { text-align: right; width: 54px; font-weight: 700; }

    /* ── Totals table ───────────────────────────────────────── */
    .totals           { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .totals td        { padding: 1.5px 0; vertical-align: top; }
    .totals .lbl      { }
    .totals .val      { text-align: right; font-weight: 600; }

    /* ── Grand total ─────────────────────────────────────────── */
    .grand-total      { width: 100%; border-collapse: collapse; }
    .grand-total td   { padding: 3px 0; font-size: 14px; font-weight: 900; }
    .grand-total .val { text-align: right; }

    /* ── Payment rows ────────────────────────────────────────── */
    .payment     { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .payment td  { padding: 1.5px 0; }
    .payment .lbl { }
    .payment .val { text-align: right; font-weight: 600; }
    .change-row td { font-weight: 900; font-size: 12px; }

    /* ── Footer ─────────────────────────────────────────────── */
    .footer       { text-align: center; font-size: 10px; color: #333; line-height: 1.7; margin-top: 4px; }
    .footer .ty   { font-size: 11px; font-weight: 700; color: #000; }

    /* ── Print overrides ─────────────────────────────────────── */
    @media print {
      body { max-width: 100%; padding: 0; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- ── STORE HEADER ──────────────────────────────────────── -->
  <div class="header">
    <div class="store-name">${esc(settings.businessName || 'Business')}</div>
    ${addressLine}
    ${phoneLine}
    ${vatLine}
  </div>

  <hr class="dash" />

  <!-- ── TRANSACTION META ──────────────────────────────────── -->
  <table class="meta">
    <tr><td class="lbl">Receipt #</td><td class="val">${billId}</td></tr>
    <tr><td class="lbl">Date</td><td class="val">${billDate}</td></tr>
    <tr><td class="lbl">Time</td><td class="val">${billTime}</td></tr>
    ${customerRow}
    <tr><td class="lbl">Payment</td><td class="val">${pmtLabel}</td></tr>
  </table>

  <hr class="dash" />

  <!-- ── ITEMS ─────────────────────────────────────────────── -->
  <table class="items">
    <thead>
      <tr>
        <th class="th-name">Item</th>
        <th class="th-qty">Qty</th>
        <th class="th-price">Price</th>
        <th class="th-total">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <hr class="dash" />

  <!-- ── SUBTOTALS ──────────────────────────────────────────── -->
  <table class="totals">
    <tr><td class="lbl">Subtotal</td><td class="val">${fmt(subtotal)}</td></tr>
    ${discountRow}
    ${taxRow}
  </table>

  <hr class="double" />

  <!-- ── GRAND TOTAL ────────────────────────────────────────── -->
  <table class="grand-total">
    <tr><td>TOTAL</td><td class="val">${fmt(sale.grandTotal)}</td></tr>
  </table>

  <hr class="dash" />

  <!-- ── PAYMENT / CHANGE ───────────────────────────────────── -->
  <table class="payment">
    <tr>
      <td class="lbl">Paid (${pmtLabel})</td>
      <td class="val">${fmt(sale.paidAmount)}</td>
    </tr>
    ${changeRow}
  </table>

  <hr class="dash" />

  <!-- ── FOOTER ─────────────────────────────────────────────── -->
  <div class="footer">
    <div class="ty">Thank you for your purchase!</div>
    <div>Please visit us again</div>
    ${inquiryLine}
  </div>

  <!-- Blank lines so thermal paper tears cleanly -->
  <br /><br /><br />

</body>
</html>`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
