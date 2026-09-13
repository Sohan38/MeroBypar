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
  Tag,
  TrendingUp,
  Layers,
  Users,
  FlaskConical,
  Boxes,
  Save,
  Loader2,
} from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { ProductFormValues } from './types';
import { ProductBatch, Supplier } from '@/types';
import { cn } from '@/lib/utils';

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

// Small reusable row — no re-render unless props change
const Row = React.memo(({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) => (
  <div className="flex items-start justify-between gap-3 py-2">
    <span className="text-xs text-muted-foreground shrink-0 min-w-24">{label}</span>
    <span className={cn('text-xs font-medium text-right leading-snug', className)}>{value}</span>
  </div>
));
Row.displayName = 'Row';

const Section = React.memo(({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) => (
  <div className="space-y-0.5">
    <div className="flex items-center gap-1.5 mb-1">
      <Icon className="h-3.5 w-3.5 text-primary/70 shrink-0" />
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
    </div>
    <div className="bg-muted/30 rounded-xl px-3 divide-y divide-border/40">
      {children}
    </div>
  </div>
));
Section.displayName = 'Section';

export const InventoryConfirmDialog = React.memo(({
  open, onClose, onConfirm, form, suppliers, localBatches,
  hasExpiry, hasVariants, averagePurchaseRate, isSaving = false,
}: InventoryConfirmDialogProps) => {

  const values = form.getValues();

  const supplierMap = useMemo(
    () => new Map(suppliers.map(s => [s.id, s.name])),
    [suppliers]
  );

  const supplierNames = useMemo(
    () => (values.supplierIds ?? []).map(id => supplierMap.get(id) ?? id).join(', '),
    [values.supplierIds, supplierMap]
  );

  const effectivePurchaseRate = hasExpiry ? averagePurchaseRate : (values.purchaseRate ?? 0);
  const profitPerUnit = (values.sellingRate ?? 0) - effectivePurchaseRate;
  const margin = values.sellingRate > 0 ? Math.round((profitPerUnit / values.sellingRate) * 100) : 0;

  const totalStock = hasExpiry
    ? localBatches.reduce((s, b) => s + b.quantity, 0)
    : hasVariants
      ? (values.variants ?? []).reduce((s, v) => s + v.quantity, 0)
      : (values.quantity ?? 0);

  const isProfit = profitPerUnit >= 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isSaving) onClose(); }}>
      <DialogContent className="max-w-sm sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl">

        {/* Header stripe */}
        <div className="h-1 bg-gradient-to-r from-primary/70 to-primary/30" />

        <DialogHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            {values.imageBase64 ? (
              <img
                src={values.imageBase64}
                alt=""
                className="h-12 w-12 rounded-xl object-cover shrink-0 border"
              />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="h-6 w-6 text-primary/70" />
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold leading-tight truncate">
                {values.name || 'Unnamed Product'}
              </DialogTitle>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 rounded-full">
                  {values.category}
                </Badge>
                {values.brand && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full">
                    {values.brand}
                  </Badge>
                )}
                {values.barcode && (
                  <span className="text-[10px] text-muted-foreground font-mono">{values.barcode}</span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {/* Scrollable body */}
        <div className="overflow-y-auto max-h-[55vh] px-5 py-3 space-y-3">

          {/* Pricing */}
          <Section icon={Tag} title="Pricing">
            <Row label="Selling Price" value={`Rs. ${(values.sellingRate ?? 0).toFixed(2)}`} />
            <Row label="Purchase Cost" value={`Rs. ${effectivePurchaseRate.toFixed(2)}`} />
            {values.packSize && values.packPurchaseCost && (
              <Row
                label="Bulk Pack Info"
                value={`1 ${values.packUnit || 'pack'} (${values.packSize} ${values.unit || 'pcs'}) @ Rs. ${Number(values.packPurchaseCost).toFixed(2)}`}
              />
            )}
            <Row
              label="Profit / unit"
              value={`Rs. ${profitPerUnit.toFixed(2)} (${margin}%)`}
              className={isProfit ? 'text-green-600 dark:text-green-400' : 'text-destructive'}
            />
          </Section>

          {/* Stock */}
          <Section icon={Boxes} title="Stock">
            <Row label="Opening stock" value={`${totalStock} ${values.unit ?? 'pcs'}`} />
            {(values.minimumStock ?? 0) > 0 && (
              <Row label="Reorder at" value={`${values.minimumStock} ${values.unit ?? 'pcs'}`} />
            )}
          </Section>

          {/* Inventory mode badges */}
          <div className="flex flex-wrap gap-1.5">
            {hasExpiry && (
              <div className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                <FlaskConical className="h-3 w-3" /> Expiry Tracked &middot; {localBatches.length} batch{localBatches.length !== 1 ? 'es' : ''}
              </div>
            )}
            {hasVariants && (
              <div className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                <Layers className="h-3 w-3" /> {(values.variants ?? []).length} Variant{(values.variants ?? []).length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Variants list */}
          {hasVariants && (values.variants ?? []).length > 0 && (
            <Section icon={Layers} title="Variants">
              {(values.variants ?? []).map((v, i) => (
                <Row key={i} label={v.name || `Variant ${i + 1}`} value={`${v.quantity} ${values.unit ?? 'pcs'}`} />
              ))}
            </Section>
          )}

          {/* Suppliers */}
          {supplierNames && (
            <Section icon={Users} title="Suppliers">
              <Row label="Linked to" value={supplierNames} />
            </Section>
          )}

          {/* Profit banner */}
          <div className={cn(
            'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium',
            isProfit
              ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-destructive/5 text-destructive border border-destructive/20'
          )}>
            <TrendingUp className="h-4 w-4 shrink-0" />
            {isProfit
              ? `${margin}% margin — selling above cost`
              : 'Selling below cost — you will lose money on each sale'}
          </div>

        </div>

        <Separator />

        <DialogFooter className="px-5 py-4 flex-row gap-2.5 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 sm:flex-initial h-11 rounded-2xl"
          >
            Review
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSaving}
            className="flex-2 sm:flex-initial h-11 rounded-2xl font-semibold min-w-32"
          >
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving&hellip;</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Confirm &amp; Save</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

InventoryConfirmDialog.displayName = 'InventoryConfirmDialog';
