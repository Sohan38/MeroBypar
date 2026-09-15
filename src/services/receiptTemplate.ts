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
import type { SaleInvoice, AppSettings, ReceiptCustomization } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptData {
  sale: SaleInvoice;
  settings: AppSettings;
  customerName?: string;
  cashierName?: string;
}

export interface ReceiptOptions {
  /** 'narrow' = 58 mm (~48 mm printable), 'standard' = 80 mm (~72 mm printable) */
  paperWidth?: 'narrow' | 'standard';
  customization?: ReceiptCustomization;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a complete HTML string (<!DOCTYPE html> … </html>) ready to be
 * injected into a new window / iframe / Android print manager and printed.
 */
export function generateReceiptHTML(
  data: ReceiptData,
  options: ReceiptOptions = {},
): string {
  const { sale, settings, customerName, cashierName } = data;
  const { paperWidth = 'standard', customization } = options;

  const isNarrow = paperWidth === 'narrow';
  const printableWidth = isNarrow ? '48mm' : '72mm';
  const baseFontSize = isNarrow ? '10px' : '11px';

  // ── Derived values ──────────────────────────────────────────────────────
  const subtotal = sale.items.reduce((s, i) => s + i.subtotal, 0);
  const totalUnits = sale.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
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

  // ── Customization flags ──────────────────────────────────────────────────
  const cfg = customization || settings.printerSettings?.receiptCustomization || {};
  const showPanVat = cfg.showPanVat !== false;
  const showCustomer = cfg.showCustomerName !== false;
  const showCashier = cfg.showCashier !== false;
  const showItemCount = cfg.showItemCount !== false;
  const showTaxBreakdown = cfg.showTaxBreakdown !== false;
  const invoiceTitle = cfg.invoiceTitle?.trim() || (settings.vatNumber ? 'TAX INVOICE' : 'SALES RECEIPT');
  const footerMessage = cfg.footerMessage?.trim() || settings.receiptFooter || 'Thank you for your visit!';

  // ── Item rows ────────────────────────────────────────────────────────────
  const itemRows = sale.items
    .map(
      (item) => `
    <tr>
      <td class="col-name">${esc(item.productName)}${item.variantName ? `<span class="sub-variant">${esc(item.variantName)}</span>` : ''}</td>
      <td class="col-qty">${item.quantity}${item.unit ? ` ${esc(item.unit)}` : ''}</td>
      <td class="col-price">${item.sellingRate.toFixed(2)}</td>
      <td class="col-total">${item.subtotal.toFixed(2)}</td>
    </tr>`,
    )
    .join('\n');

  // ── Optional header lines ────────────────────────────────────────────────
  const addressLine = settings.address
    ? `<div class="sub-line">${esc(settings.address)}</div>`
    : '';
  const phoneLine = settings.phone
    ? `<div class="sub-line">Tel: ${esc(settings.phone)}</div>`
    : '';
  const vatLine = showPanVat && settings.vatNumber
    ? `<div class="sub-line font-bold">PAN/VAT: ${esc(settings.vatNumber)}</div>`
    : '';

  const customerRow = showCustomer && customerName
    ? `<tr><td class="lbl">Customer</td><td class="val">${esc(customerName)}</td></tr>`
    : '';

  const cashierRow = showCashier && cashierName
    ? `<tr><td class="lbl">Cashier</td><td class="val">${esc(cashierName)}</td></tr>`
    : '';

  const discountRow =
    sale.discount > 0
      ? `<tr><td class="lbl">Discount</td><td class="val">- ${fmt(sale.discount)}</td></tr>`
      : '';
  const taxRow =
    showTaxBreakdown && sale.tax > 0
      ? `<tr><td class="lbl">VAT / Tax</td><td class="val">${fmt(sale.tax)}</td></tr>`
      : '';
  const changeRow =
    change > 0
      ? `<tr class="highlight-row"><td class="lbl">Change</td><td class="val">${fmt(change)}</td></tr>`
      : '';
  const dueRow =
    (sale.dueAmount ?? 0) > 0
      ? `<tr class="highlight-row"><td class="lbl">Due Balance</td><td class="val">${fmt(sale.dueAmount ?? 0)}</td></tr>`
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

    /* ── Page / Print setup (Industry Thermal POS) ─────────── */
    @page {
      size: ${isNarrow ? '58mm' : '80mm'} auto;
      margin: 0;
    }

    /* ── Body (Tabular nums & Crisp thermal font) ───────────── */
    body {
      font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', 'Segoe UI Mono', Menlo, Monaco, Consolas, monospace;
      font-size: ${baseFontSize};
      line-height: 1.35;
      color: #000;
      background: #fff;
      width: 100%;
      max-width: ${printableWidth};
      margin: 0 auto;
      padding: ${isNarrow ? '2mm 1mm' : '3mm 2mm'};
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Store header ───────────────────────────────────────── */
    .header         { text-align: center; margin-bottom: 4px; }
    .store-name     {
      font-size: ${isNarrow ? '13px' : '15px'};
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      line-height: 1.2;
      margin-bottom: 2px;
    }
    .sub-line       { font-size: 9.5px; color: #222; line-height: 1.3; }
    .doc-title      {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 1px;
      margin: 3px 0 1px 0;
      text-transform: uppercase;
    }

    /* ── Dividers ───────────────────────────────────────────── */
    .dash   { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    .double { border: none; border-top: 2px solid #000; margin: 4px 0; }

    /* ── Meta table (receipt #, date, cashier, customer…) ──── */
    .meta         { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 2px; }
    .meta td      { padding: 1px 0; vertical-align: top; }
    .meta .lbl    { color: #444; width: 42%; }
    .meta .val    { font-weight: 700; text-align: right; }

    /* ── Items table ────────────────────────────────────────── */
    .items              { width: 100%; border-collapse: collapse; }
    .items thead th     {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 3px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    }
    .items .th-name     { text-align: left; }
    .items .th-qty      { text-align: center; width: ${isNarrow ? '24px' : '28px'}; }
    .items .th-price    { text-align: right; width: ${isNarrow ? '44px' : '52px'}; }
    .items .th-total    { text-align: right; width: ${isNarrow ? '48px' : '56px'}; }

    .items tbody td     { padding: 2px 0; font-size: 9.5px; vertical-align: top; }
    .col-name           { text-align: left; word-break: break-word; padding-right: 2px; }
    .sub-variant        { display: block; font-size: 8.5px; color: #555; }
    .col-qty            { text-align: center; width: ${isNarrow ? '24px' : '28px'}; }
    .col-price          { text-align: right; width: ${isNarrow ? '44px' : '52px'}; }
    .col-total          { text-align: right; width: ${isNarrow ? '48px' : '56px'}; font-weight: 700; }

    /* ── Unit Count Line ────────────────────────────────────── */
    .item-count-bar     {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      font-weight: 600;
      color: #333;
      padding: 2px 0;
    }

    /* ── Totals table ───────────────────────────────────────── */
    .totals           { width: 100%; border-collapse: collapse; font-size: 10px; }
    .totals td        { padding: 1px 0; vertical-align: top; }
    .totals .lbl      { }
    .totals .val      { text-align: right; font-weight: 600; }

    /* ── Grand total ─────────────────────────────────────────── */
    .grand-total      {
      width: 100%;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      margin: 3px 0;
      padding: 3px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: ${isNarrow ? '12px' : '14px'};
      font-weight: 900;
    }

    /* ── Payment rows ────────────────────────────────────────── */
    .payment          { width: 100%; border-collapse: collapse; font-size: 10px; }
    .payment td       { padding: 1px 0; }
    .payment .lbl     { }
    .payment .val     { text-align: right; font-weight: 600; }
    .highlight-row td { font-weight: 800; }

    /* ── Footer ─────────────────────────────────────────────── */
    .footer       { text-align: center; font-size: 9.5px; color: #222; line-height: 1.4; margin-top: 4px; }
    .footer-note  { font-weight: 700; }
    .powered-by   { font-size: 8px; color: #777; margin-top: 3px; letter-spacing: 0.3px; }

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
    <div class="store-name">${esc(settings.businessName || 'MeroByapar Store')}</div>
    ${addressLine}
    ${phoneLine}
    ${vatLine}
    <div class="doc-title">*** ${esc(invoiceTitle)} ***</div>
  </div>

  <hr class="dash" />

  <!-- ── TRANSACTION META ──────────────────────────────────── -->
  <table class="meta">
    <tr><td class="lbl">Invoice #</td><td class="val">${billId}</td></tr>
    <tr><td class="lbl">Date &amp; Time</td><td class="val">${billDate} ${billTime}</td></tr>
    ${cashierRow}
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
        <th class="th-price">Rate</th>
        <th class="th-total">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <hr class="dash" />

  ${showItemCount ? `
  <div class="item-count-bar">
    <span>Total Items: ${sale.items.length}</span>
    <span>Total Qty: ${totalUnits}</span>
  </div>
  <hr class="dash" />
  ` : ''}

  <!-- ── SUBTOTALS ──────────────────────────────────────────── -->
  <table class="totals">
    <tr><td class="lbl">Subtotal</td><td class="val">${fmt(subtotal)}</td></tr>
    ${discountRow}
    ${taxRow}
  </table>

  <!-- ── GRAND TOTAL ────────────────────────────────────────── -->
  <div class="grand-total">
    <span>TOTAL</span>
    <span>${fmt(sale.grandTotal)}</span>
  </div>

  <!-- ── PAYMENT / CHANGE ───────────────────────────────────── -->
  <table class="payment">
    <tr>
      <td class="lbl">Paid (${pmtLabel})</td>
      <td class="val">${fmt(sale.paidAmount)}</td>
    </tr>
    ${changeRow}
    ${dueRow}
  </table>

  <hr class="dash" />

  <!-- ── FOOTER ─────────────────────────────────────────────── -->
  <div class="footer">
    <div class="footer-note">${esc(footerMessage)}</div>
    <div class="powered-by">Powered by MeroByapar POS</div>
  </div>

  <!-- Space for clean thermal tear ──────────────────────────── -->
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
