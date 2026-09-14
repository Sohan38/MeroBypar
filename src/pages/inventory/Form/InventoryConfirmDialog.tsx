import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Package,
  TrendingUp,
  TrendingDown,
  Layers,
  Users,
  FlaskConical,
  Boxes,
  Save,
  Loader2,
  Calendar,
  Sparkles,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { ProductFormValues } from './types';
import { ProductBatch, Supplier } from '@/types';
import { formatMoney } from '@/utils/unitUtils';
import { cn } from '@/lib/utils';
import { safeCurrency, safeQty, safeMul, getSafePackSize, calculateTotalSupplierStock, calculateWeightedAverageCost } from '@/utils/unitUtils';

interface InventoryConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  form: UseFormReturn<ProductFormValues>;
  suppliers: Supplier[];
  localBatches: ProductBatch[];
  hasExpiry: boolean;
  hasVariants: boolean;
  averagePurchaseRate: number;
  isSaving?: boolean;
}

const SUPPLIER_PALETTE = [
  { bg: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300', light: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-800' },
  { bg: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', light: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-800' },
  { bg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', light: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800' },
  { bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', light: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800' },
  { bg: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', light: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-800' },
  { bg: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300', light: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800' },
];

const SectionCard = React.memo(({
  icon: Icon,
  title,
  badge,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("rounded-2xl border bg-card shadow-xs overflow-hidden", className)}>
    <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{title}</span>
      </div>
      {badge}
    </div>
    <div className="p-2.5 space-y-2">
      {children}
    </div>
  </div>
));
SectionCard.displayName = 'SectionCard';

export const InventoryConfirmDialog = React.memo(({
  open,
  onClose,
  onConfirm,
  form,
  suppliers,
  localBatches,
  hasExpiry,
  hasVariants,
  averagePurchaseRate,
  isSaving = false,
}: InventoryConfirmDialogProps) => {
  const values = form.getValues();

  const baseUnit = values.unit || 'pcs';
  const packUnit = values.packUnit || 'pack';
  const packSize = values.packSize ? Number(values.packSize) : null;
  const hasPackPricing = Boolean(packSize && packSize > 0);
  const safePackSize = getSafePackSize(packSize);

  const supplierMap = useMemo(
    () => new Map(suppliers.map(s => [s.id, s.name])),
    [suppliers]
  );

  const selectedSupplierIds = values.supplierIds ?? [];
  const supplierStocks = values.supplierStocks ?? [];
  const isMultiSupplier = selectedSupplierIds.length >= 2;

  // Effective Purchase & Margins
  const effectivePurchaseRate = hasExpiry
    ? averagePurchaseRate
    : (isMultiSupplier ? calculateWeightedAverageCost(supplierStocks) : (values.purchaseRate ?? 0));
  const sellingRate = values.sellingRate ?? 0;
  const profitPerUnit = sellingRate - effectivePurchaseRate;
  const margin = sellingRate > 0 ? Math.round((profitPerUnit / sellingRate) * 100) : 0;
  const isProfit = profitPerUnit >= 0;

  // Stocks
  const totalStock = hasExpiry
    ? localBatches.reduce((s, b) => s + b.quantity, 0)
    : hasVariants
      ? (values.variants ?? []).reduce((s, v) => s + v.quantity, 0)
      : isMultiSupplier
        ? calculateTotalSupplierStock(supplierStocks)
        : (values.quantity ?? 0);

  const totalPacks = hasPackPricing ? safeQty(totalStock / safePackSize) : null;

  // Pack Pricing info
  const effectivePackCost = hasPackPricing
    ? ((isMultiSupplier || hasExpiry)
        ? safeCurrency(safeMul(effectivePurchaseRate, safePackSize, 6))
        : Number(values.packPurchaseCost ?? safeCurrency(safeMul(effectivePurchaseRate, safePackSize, 6))))
    : null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isSaving) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-1.5rem)] sm:max-w-xl md:max-w-3xl lg:max-w-4xl p-0 gap-0 overflow-hidden rounded-3xl sm:rounded-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-2xl border border-border"
      >
        {/* Sticky Header with integrated clean close button */}
        <DialogHeader className="px-4 sm:px-6 pt-3.5 pb-3 shrink-0 bg-background border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {values.imageBase64 ? (
                <img
                  src={values.imageBase64}
                  alt=""
                  className="h-11 w-11 rounded-xl object-cover shrink-0 border border-border shadow-xs"
                />
              ) : (
                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-xs">
                  <Package className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm sm:text-base font-bold leading-tight truncate">
                  {values.name || 'Unnamed Product'}
                </DialogTitle>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {values.category && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 h-4 rounded-full font-medium">
                      {values.category}
                    </Badge>
                  )}
                  {values.brand && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0 h-4 rounded-full font-medium">
                      {values.brand}
                    </Badge>
                  )}
                  {values.barcode && (
                    <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0 rounded">
                      {values.barcode}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Embedded Close Button (never overlaps header or edge) */}
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        {/* Modal Body: 2-Column on Desktop (PC) & 1-Column on Mobile */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-3.5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">

            {/* ── Left Column: Financials, Pricing & Packaging ── */}
            <div className="space-y-3">
              {/* Quick Metrics KPI Bar */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-muted/30 border">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">Selling (MRP)</span>
                  <span className="text-xs sm:text-sm font-bold text-foreground tabular-nums">
                    Rs. {formatMoney(sellingRate)}
                  </span>
                </div>

                <div className="p-2 rounded-xl bg-muted/30 border">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block tracking-wider">
                    {isMultiSupplier || hasExpiry ? 'Avg. Cost' : 'Cost'}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-foreground tabular-nums">
                    Rs. {formatMoney(effectivePurchaseRate)}
                  </span>
                </div>

                <div className={cn(
                  'p-2 rounded-xl border transition-colors',
                  isProfit
                    ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300'
                    : 'bg-destructive/10 border-destructive/20 text-destructive'
                )}>
                  <span className="text-[9px] uppercase font-bold block tracking-wider">Margin</span>
                  <span className="text-xs sm:text-sm font-bold tabular-nums flex items-center justify-center gap-0.5">
                    {isProfit ? <TrendingUp className="h-3 w-3 shrink-0" /> : <TrendingDown className="h-3 w-3 shrink-0" />}
                    {margin}%
                  </span>
                </div>
              </div>

              {/* Packaging & Stock Card */}
              {hasPackPricing ? (
                <SectionCard
                  icon={Boxes}
                  title="Packaging & Stock"
                  badge={
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" /> 1 {packUnit} = {packSize} {baseUnit}
                    </Badge>
                  }
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-muted/20 border space-y-0.5">
                      <span className="text-[9px] text-muted-foreground uppercase font-semibold">Total Stock</span>
                      <p className="font-bold text-xs text-foreground tabular-nums">
                        {totalPacks} <span className="text-[10px] font-normal text-muted-foreground">{packUnit}(s)</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        = {totalStock} {baseUnit}
                      </p>
                    </div>

                    <div className="p-2 rounded-xl bg-muted/20 border space-y-0.5">
                      <span className="text-[9px] text-muted-foreground uppercase font-semibold">
                        {isMultiSupplier ? 'Avg. Pack Cost' : 'Cost per Pack'}
                      </span>
                      <p className="font-bold text-xs text-foreground tabular-nums">
                        Rs. {formatMoney(effectivePackCost)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Rs. {formatMoney(effectivePurchaseRate)} / {baseUnit}
                      </p>
                    </div>
                  </div>

                  {(values.minimumStock ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 pt-0.5">
                      <span>Low stock alert:</span>
                      <span className="font-semibold text-foreground">{values.minimumStock} {baseUnit}</span>
                    </div>
                  )}
                </SectionCard>
              ) : (
                /* Standard Stock (No Packs) */
                <SectionCard icon={Boxes} title="Stock & Inventory">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Opening Stock:</span>
                    <span className="font-bold text-xs text-foreground tabular-nums">
                      {totalStock} {baseUnit}
                    </span>
                  </div>
                  {(values.minimumStock ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Low stock alert:</span>
                      <span className="font-semibold text-foreground">{values.minimumStock} {baseUnit}</span>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Product Variants (If Enabled) */}
              {hasVariants && (values.variants ?? []).length > 0 && (
                <SectionCard
                  icon={Layers}
                  title="Variants"
                  badge={<Badge variant="outline" className="text-[9px] px-1.5 py-0">{(values.variants ?? []).length}</Badge>}
                >
                  <div className="grid grid-cols-2 gap-1.5 text-xs max-h-28 overflow-y-auto pr-1">
                    {(values.variants ?? []).map((v, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border">
                        <span className="truncate text-muted-foreground text-[11px] pr-1">{v.name || `Variant ${i + 1}`}</span>
                        <span className="font-bold text-foreground tabular-nums text-[11px]">{v.quantity} {baseUnit}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Warnings / Alerts */}
              {totalStock === 0 && (
                <div className="flex items-center gap-2 p-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs">
                  <Info className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span><strong>0 Stock:</strong> Created with zero stock count.</span>
                </div>
              )}

              {!isProfit && sellingRate > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Selling below cost (Cost: Rs. {formatMoney(effectivePurchaseRate)})</span>
                </div>
              )}

              {/* Notes (if provided) */}
              {values.notes && values.notes.trim().length > 0 && (
                <div className="p-2.5 rounded-xl bg-muted/20 border text-xs">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Notes:</span>
                  <p className="text-muted-foreground italic line-clamp-2 text-[11px]">{values.notes}</p>
                </div>
              )}
            </div>

            {/* ── Right Column: Suppliers Distribution OR Batches ── */}
            <div className="space-y-3">
              {/* Suppliers Breakdown */}
              {!hasExpiry && selectedSupplierIds.length > 0 && (
                <SectionCard
                  icon={Users}
                  title={isMultiSupplier ? 'Suppliers Distribution' : 'Supplier Allocation'}
                  badge={
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-background font-medium">
                      {selectedSupplierIds.length} {selectedSupplierIds.length === 1 ? 'Supplier' : 'Suppliers'}
                    </Badge>
                  }
                >
                  {/* Visual Distribution Mini Bar (Multi-Supplier) */}
                  {isMultiSupplier && totalStock > 0 && (
                    <div className="space-y-1 pb-1">
                      <div className="h-2 w-full rounded-full bg-muted/80 overflow-hidden flex shadow-inner">
                        {selectedSupplierIds.map((sid, idx) => {
                          const entry = supplierStocks.find((ss: any) => ss.supplierId === sid);
                          const sStock = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
                          const pct = totalStock > 0 ? (sStock / totalStock) * 100 : 0;
                          const palette = SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length];
                          if (pct <= 0) return null;
                          return (
                            <div
                              key={sid}
                              style={{ width: `${pct}%` }}
                              className={cn('h-full transition-all', palette.bg)}
                              title={`${supplierMap.get(sid) || 'Supplier'}: ${pct.toFixed(0)}%`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Per-supplier Cards (Max height with bounded scroll for 10s of suppliers) */}
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {selectedSupplierIds.map((sid, idx) => {
                      const supplierName = supplierMap.get(sid) || 'Supplier';
                      const entry = supplierStocks.find((ss: any) => ss.supplierId === sid);
                      const sBaseQty = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
                      const sUnitCost = Number(entry?.cost ?? (hasPackPricing && entry?.packCost && safePackSize > 0 ? safeCurrency(entry.packCost / safePackSize) : effectivePurchaseRate));
                      const sPacks = Number(entry?.packQuantity ?? (hasPackPricing && sBaseQty > 0 ? safeQty(sBaseQty / safePackSize) : 0));
                      const sPackCost = Number(entry?.packCost ?? (hasPackPricing && sUnitCost > 0 ? safeCurrency(sUnitCost * safePackSize) : (effectivePackCost || 0)));
                      const sTotalCost = Number(entry?.totalPurchaseCost ?? (hasPackPricing && sPacks > 0 ? safeCurrency(sPacks * sPackCost) : safeCurrency(sBaseQty * sUnitCost)));
                      const palette = SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length];
                      const isPrimary = entry?.isPrimary || (selectedSupplierIds.length === 1);

                      return (
                        <div
                          key={sid}
                          className="flex items-center justify-between p-2 rounded-xl bg-muted/20 border text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <div className={cn('h-6 w-6 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0', palette.bg)}>
                              {supplierName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-semibold text-foreground truncate max-w-[110px] sm:max-w-[140px] text-[11px]">
                                  {supplierName}
                                </span>
                                {isPrimary && (
                                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-primary/40 text-primary bg-primary/5 font-semibold">
                                    Primary
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {hasPackPricing
                                  ? `@ Rs. ${formatMoney(sPackCost)} / ${packUnit}`
                                  : `@ Rs. ${formatMoney(sUnitCost)} / ${baseUnit}`}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {hasPackPricing ? (
                              <>
                                <span className="font-bold tabular-nums text-foreground text-[11px]">
                                  {sPacks} {packUnit}(s)
                                </span>
                                <p className="text-[10px] text-muted-foreground tabular-nums">
                                  {sBaseQty} {baseUnit} · Rs. {formatMoney(sTotalCost)}
                                </p>
                              </>
                            ) : (
                              <>
                                <span className="font-bold tabular-nums text-foreground text-[11px]">
                                  {sBaseQty} {baseUnit}
                                </span>
                                <p className="text-[10px] text-muted-foreground tabular-nums">
                                  Rs. {formatMoney(sTotalCost)}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Batches Breakdown (When Expiry / Batches are Enabled) */}
              {hasExpiry && (
                <SectionCard
                  icon={FlaskConical}
                  title="Batches & Expiry"
                  badge={
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                      {localBatches.length} {localBatches.length === 1 ? 'Batch' : 'Batches'}
                    </Badge>
                  }
                >
                  {localBatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-1">No batches recorded.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {localBatches.map((batch, idx) => {
                        const batchSupplierName = batch.supplierId ? supplierMap.get(batch.supplierId) : null;
                        const bCost = Number(batch.purchaseRate || 0);
                        const bQty = Number(batch.quantity || 0);

                        return (
                          <div
                            key={batch.id || idx}
                            className="flex items-center justify-between p-2 rounded-xl bg-muted/20 border text-xs"
                          >
                            <div className="min-w-0 pr-2 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold font-mono text-foreground text-[11px]">
                                  #{batch.batchNumber || `Batch-${idx + 1}`}
                                </span>
                                {batch.expiryDate ? (
                                  <span className="text-[9px] px-1.5 py-0 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium flex items-center gap-0.5">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {batch.expiryDate}
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-muted-foreground">No expiry</span>
                                )}
                              </div>
                              {batchSupplierName && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {batchSupplierName}
                                </p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-bold tabular-nums text-foreground text-[11px]">
                                {bQty} {baseUnit}
                              </span>
                              <p className="text-[10px] text-muted-foreground tabular-nums">
                                @ Rs. {formatMoney(bCost)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>
              )}
            </div>

          </div>
        </div>

        <Separator className="shrink-0" />

        {/* Sticky Action Footer */}
        <DialogFooter className="px-4 sm:px-6 py-3 shrink-0 bg-background flex-row gap-2.5 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 sm:flex-initial h-10 rounded-xl text-xs font-semibold"
          >
            Back to Edit
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="flex-2 sm:flex-initial h-10 rounded-xl text-xs font-bold min-w-36 shadow-sm gap-1.5"
          >
            {isSaving ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving Product&hellip;</>
            ) : (
              <><Save className="h-3.5 w-3.5" /> Confirm &amp; Save</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

InventoryConfirmDialog.displayName = 'InventoryConfirmDialog';
