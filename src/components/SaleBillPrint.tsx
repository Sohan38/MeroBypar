/**
 * SaleBillPrint
 * ─────────────
 * Receipt preview dialog + print trigger.
 *
 * • Shows a professional thermal-receipt-style preview inside the dialog.
 * • On Print: generates clean receipt HTML via receiptTemplate and dispatches
 *   to printService, which picks the correct strategy (popup on web,
 *   iframe on Capacitor mobile) automatically.
 * • Existing web printing is fully preserved — web callers work identically.
 * • Props are unchanged from the original component.
 */

import { useState, useCallback, useEffect } from 'react';
import { format as formatDate, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Printer, X, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';

import type { SaleInvoice, AppSettings } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { useBackModal } from '@/contexts/NavigationContext';
import { generateReceiptHTML } from '@/services/receiptTemplate';
import { 
  printHTMLDocument, 
  getPrintPlatform, 
  getSystemPrinters, 
  SystemPrinterInfo, 
  NoPrintersDetectedError 
} from '@/services/printService';
import { NoPrinterDialog } from '@/components/NoPrinterDialog';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SaleBillPrintProps {
  sale: SaleInvoice;
  settings: AppSettings;
  customerName?: string;
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  qr: 'QR / Mobile Pay',
  card: 'Card',
  bank: 'Bank Transfer',
  split: 'Split Payment',
  credit: 'Credit / Udharo',
};

function parseSaleDate(dateStr: string): Date {
  try {
    return parseISO(dateStr);
  } catch {
    return new Date(dateStr);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SaleBillPrint({
  sale,
  settings,
  customerName,
  open,
  onClose,
}: SaleBillPrintProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinterInfo[]>([]);
  const [showNoPrinterDialog, setShowNoPrinterDialog] = useState(false);
  const { settings: currentSettings, updateSettings, currentUser } = useApp();
  const isDesktop = getPrintPlatform() === 'desktop';
  
  // Always use the latest settings from AppContext if available
  const activeSettings = currentSettings || settings;
  const printerConfig = activeSettings.printerSettings;
  const customization = printerConfig?.receiptCustomization;

  useBackModal(open, onClose, 'sale-bill-print');

  // Load available printers when preview opens on desktop
  useEffect(() => {
    if (isDesktop && open) {
      getSystemPrinters()
        .then(printers => setSystemPrinters(printers))
        .catch(() => {});
    }
  }, [isDesktop, open]);

  // ── Print handler ──────────────────────────────────────────────────────────
  const handlePrint = useCallback(async (forceDialog = false, overrideDevice?: string) => {
    setIsPrinting(true);
    try {
      const paperWidth = printerConfig?.paperWidth === '58mm' ? 'narrow' : 'standard';
      const html = generateReceiptHTML(
        { 
          sale, 
          settings: activeSettings, 
          customerName, 
          cashierName: currentUser?.name 
        }, 
        { 
          paperWidth,
          customization,
        }
      );
      
      const isSilent = forceDialog ? false : (printerConfig?.silentPrint ?? true);
      const deviceName = forceDialog 
        ? undefined 
        : (overrideDevice !== undefined ? overrideDevice : (printerConfig?.deviceName || undefined));

      await printHTMLDocument(html, {
        title: `Receipt #${sale.id.slice(-8).toUpperCase()}`,
        silent: isSilent,
        deviceName,
        paperWidth: printerConfig?.paperWidth || '80mm',
      });
    } catch (err) {
      if (err instanceof NoPrintersDetectedError || (err instanceof Error && err.name === 'NoPrintersDetectedError')) {
        toast.error('No printer detected on this computer.');
        setShowNoPrinterDialog(true);
        return;
      }
      const msg =
        err instanceof Error ? err.message : 'Print failed. Please try again.';
      toast.error(msg);
    } finally {
      setIsPrinting(false);
    }
  }, [sale, activeSettings, customerName, printerConfig, customization, currentUser]);

  // ── Derived display values ─────────────────────────────────────────────────
  const subtotal = sale.items.reduce((s, i) => s + i.subtotal, 0);
  const totalUnits = sale.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const change =
    sale.paidAmount > sale.grandTotal ? sale.paidAmount - sale.grandTotal : 0;
  const billId = sale.id.slice(-8).toUpperCase();
  const sym = activeSettings.currencySymbol || 'Rs';
  const fmt = (n: number) => `${sym}\u00a0${n.toFixed(2)}`;
  const pmtLabel = PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod;

  const saleDate = parseSaleDate(sale.date);
  const billDate = formatDate(saleDate, 'dd/MM/yyyy');
  const billTime = formatDate(saleDate, 'hh:mm a');

  const invoiceTitle = customization?.invoiceTitle?.trim() || (activeSettings.vatNumber ? 'TAX INVOICE' : 'SALES RECEIPT');
  const footerMessage = customization?.footerMessage?.trim() || activeSettings.receiptFooter || 'Thank you for your visit!';
  const showPanVat = customization?.showPanVat !== false;
  const showCustomer = customization?.showCustomerName !== false;
  const showCashier = customization?.showCashier !== false;
  const showItemCount = customization?.showItemCount !== false;
  const showTaxBreakdown = customization?.showTaxBreakdown !== false;

  const isNarrow = printerConfig?.paperWidth === '58mm';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm w-[95vw] p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Printer className="h-4 w-4" />
              Receipt Preview ({printerConfig?.paperWidth || '80mm'})
            </DialogTitle>
          </DialogHeader>

          {/* ── Quick Printer Selector on Desktop ─────────────────────────────── */}
          {isDesktop && (
            <div className="px-3 py-1.5 bg-muted/40 border-b flex items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 font-medium">
                <Printer className="h-3.5 w-3.5 text-primary" />
                <span>Printer:</span>
              </div>
              <select
                value={printerConfig?.deviceName || ''}
                onChange={(e) => {
                  const deviceName = e.target.value;
                  updateSettings({
                    printerSettings: {
                      paperWidth: printerConfig?.paperWidth || '80mm',
                      silentPrint: printerConfig?.silentPrint ?? true,
                      autoPrintOnSale: printerConfig?.autoPrintOnSale ?? false,
                      deviceName,
                      receiptCustomization: customization,
                    },
                  });
                }}
                className="bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground outline-none focus:border-primary truncate max-w-[190px]"
              >
                <option value="">⚡ System Default</option>
                {systemPrinters.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Scrollable receipt preview ─────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-neutral-800 p-3 min-h-0 flex justify-center">
            {/*
             * The preview uses the exact visual structure as the printed HTML
             * with true POS thermal roll proportions.
             */}
            <div
              className="
                bg-white text-black rounded shadow font-mono text-[10px] leading-[1.35]
                border border-gray-200 w-full select-none
              "
              style={{ 
                maxWidth: isNarrow ? '200px' : '280px', 
                padding: isNarrow ? '8px 10px' : '12px 14px' 
              }}
            >
              {/* ── Store header ─────────────────────────────────────────── */}
              <div className="text-center mb-1.5">
                <div className="font-black text-[13px] uppercase tracking-wide leading-tight">
                  {activeSettings.businessName || 'MeroByapar Store'}
                </div>
                {activeSettings.address && (
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    {activeSettings.address}
                  </div>
                )}
                {activeSettings.phone && (
                  <div className="text-[9px] text-gray-600">
                    Tel: {activeSettings.phone}
                  </div>
                )}
                {showPanVat && activeSettings.vatNumber && (
                  <div className="text-[9px] text-gray-700 font-bold">
                    PAN/VAT: {activeSettings.vatNumber}
                  </div>
                )}
                <div className="text-[10px] font-extrabold uppercase mt-1 tracking-wider">
                  *** {invoiceTitle} ***
                </div>
              </div>

              <Divider dashed />

              {/* ── Transaction meta ──────────────────────────────────────── */}
              <table className="w-full text-[9px]">
                <tbody>
                  <MetaRow label="Invoice #" value={billId} />
                  <MetaRow label="Date & Time" value={`${billDate} ${billTime}`} />
                  {showCashier && currentUser?.name && (
                    <MetaRow label="Cashier" value={currentUser.name} />
                  )}
                  {showCustomer && customerName && (
                    <MetaRow label="Customer" value={customerName} />
                  )}
                  <MetaRow label="Payment" value={pmtLabel} />
                </tbody>
              </table>

              <Divider dashed />

              {/* ── Items table ───────────────────────────────────────────── */}
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr className="border-y border-dashed border-gray-400">
                    <th className="text-left py-0.5 font-bold uppercase">Item</th>
                    <th className="text-center py-0.5 font-bold uppercase w-7">Qty</th>
                    <th className="text-right py-0.5 font-bold uppercase w-11">Rate</th>
                    <th className="text-right py-0.5 font-bold uppercase w-12">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, i) => (
                    <tr key={i}>
                      <td className="text-left py-0.5 pr-1 wrap-break-word align-top">
                        {item.productName}
                        {item.variantName && (
                          <span className="block text-[8px] text-gray-500">{item.variantName}</span>
                        )}
                      </td>
                      <td className="text-center min-w-7 align-top py-0.5 whitespace-nowrap">
                        {item.quantity}{item.unit ? `\u00a0${item.unit}` : ''}
                      </td>
                      <td className="text-right w-11 align-top py-0.5">
                        {item.sellingRate.toFixed(2)}
                      </td>
                      <td className="text-right w-12 font-bold align-top py-0.5">
                        {item.subtotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Divider dashed />

              {/* ── Unit Count Line ──────────────────────────────────────── */}
              {showItemCount && (
                <>
                  <div className="flex justify-between text-[8.5px] font-semibold text-gray-700 py-0.5">
                    <span>Total Items: {sale.items.length}</span>
                    <span>Total Qty: {totalUnits}</span>
                  </div>
                  <Divider dashed />
                </>
              )}

              {/* ── Sub-totals ────────────────────────────────────────────── */}
              <table className="w-full text-[9px]">
                <tbody>
                  <TotalRow label="Subtotal" value={fmt(subtotal)} />
                  {sale.discount > 0 && (
                    <TotalRow
                      label="Discount"
                      value={`- ${fmt(sale.discount)}`}
                    />
                  )}
                  {showTaxBreakdown && sale.tax > 0 && (
                    <TotalRow label="VAT / Tax" value={fmt(sale.tax)} />
                  )}
                </tbody>
              </table>

              {/* Grand total */}
              <div className="border-y-2 border-black my-1 py-1 flex justify-between font-black text-[12px] sm:text-[13px]">
                <span>TOTAL</span>
                <span>{fmt(sale.grandTotal)}</span>
              </div>

              {/* ── Payment / Change ──────────────────────────────────────── */}
              <table className="w-full text-[9px]">
                <tbody>
                  <TotalRow
                    label={`Paid (${pmtLabel})`}
                    value={fmt(sale.paidAmount)}
                  />
                  {change > 0 && (
                    <tr>
                      <td className="font-bold">Change</td>
                      <td className="text-right font-bold">{fmt(change)}</td>
                    </tr>
                  )}
                  {sale.dueAmount > 0 && (
                    <tr className="text-red-600 font-bold">
                      <td>Due Balance</td>
                      <td className="text-right">{fmt(sale.dueAmount)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <Divider dashed />

              {/* ── Footer ───────────────────────────────────────────────── */}
              <div className="text-center text-[8.5px] text-gray-600 leading-tight pt-0.5 space-y-1">
                <div className="font-bold text-[9px] text-black">
                  {footerMessage}
                </div>
                <div className="text-[7.5px] text-gray-400">Powered by MeroByapar POS</div>
              </div>
            </div>
          </div>

          {/* ── Action buttons ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 p-3 border-t bg-muted/10 shrink-0">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isPrinting}
            >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>

          {isDesktop && (
            <Button
              variant="outline"
              size="icon"
              title="Print via Windows System Dialog / Save to PDF"
              onClick={() => handlePrint(true)}
              disabled={isPrinting}
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <FileText className="h-4 w-4" />
            </Button>
          )}

          <Button
            className="flex-1"
            onClick={() => handlePrint(false)}
            disabled={isPrinting}
          >
            {isPrinting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Printing…
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                {isDesktop && (printerConfig?.silentPrint ?? true) ? 'Print (Instant)' : 'Print'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <NoPrinterDialog
      open={showNoPrinterDialog}
      onClose={() => setShowNoPrinterDialog(false)}
      onRetryPrint={(selectedPrinter) => handlePrint(false, selectedPrinter)}
      onFallbackSystemPrint={() => handlePrint(true)}
    />
  </>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function Divider({ dashed = false }: { dashed?: boolean }) {
  return (
    <div
      className={`my-1.5 border-t ${dashed ? 'border-dashed border-gray-400' : 'border-gray-300'}`}
    />
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="text-gray-500 py-px">{label}</td>
      <td className="text-right font-bold py-px">{value}</td>
    </tr>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-px">{label}</td>
      <td className="text-right font-semibold py-px">{value}</td>
    </tr>
  );
}
