import React from 'react';
import { FormField } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Info, Plus, Pencil, Trash2, Boxes } from 'lucide-react';
import { SectionProps } from './types';
import { ProductBatch } from '@/types';
import { ExpiryBadge, getBatchStatus } from '@/components/BatchFormDialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatMoney, safeMul } from '@/utils/unitUtils';

interface BatchSectionProps extends SectionProps {
  isExpiryEnabled: boolean;
  isBatchesEnabled: boolean;
  hasExpiry: boolean;
  onToggleExpiry: (checked: boolean) => void;
  localBatches: ProductBatch[];
  onAddBatch: () => void;
  onEditBatch: (batch: ProductBatch) => void;
  onDeleteBatch: (id: string) => void;
  isNew: boolean;
}

export const BatchSection = React.memo(({
  form,
  isExpiryEnabled,
  isBatchesEnabled,
  hasExpiry,
  onToggleExpiry,
  localBatches,
  onAddBatch,
  onEditBatch,
  onDeleteBatch,
  isNew,
}: BatchSectionProps) => {
  if (!isExpiryEnabled || !isBatchesEnabled) return null;

  const sortedBatches = [...localBatches].sort(
    (a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? '')
  );

  const packSize = form.watch('packSize');
  const packUnit = form.watch('packUnit') || 'pack';
  const baseUnit = form.watch('unit') || 'pcs';
  const isPackPricingEnabled = form.watch('isPackPricingEnabled');
  const hasPack = Boolean((isPackPricingEnabled || packSize) && Number(packSize) > 0);
  const safePSize = hasPack ? Number(packSize) : 1;
  const totalBatchQuantity = sortedBatches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
  const totalBatchPacks = hasPack && safePSize > 0 ? Math.floor(totalBatchQuantity / safePSize) : 0;

  return (
    <section className="px-4 py-4 space-y-4">
      {/* Toggle card */}
      <FormField control={form.control} name="hasExpiry" render={({ field }) => (
        <div
          className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 transition-colors cursor-pointer ${hasExpiry
            ? 'border-primary/30 bg-primary/5'
            : 'border-border bg-muted/20'
            }`}
          onClick={() => {
            const next = !field.value;
            field.onChange(next);
            onToggleExpiry(next);
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 transition-colors ${hasExpiry ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              <FlaskConical className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Track Expiry & Batches</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {hasExpiry ? 'Stock, cost & supplier per batch' : 'For products with expiry dates'}
              </p>
            </div>
          </div>
          <Switch
            checked={field.value ?? false}
            onCheckedChange={(checked) => { field.onChange(checked); onToggleExpiry(checked); }}
            className="shrink-0 pointer-events-none"
          />
        </div>
      )} />

      {hasExpiry && (
        <>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 pl-0.5">
            <Info className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
            Sold FEFO — earliest expiry first. Purchase cost = weighted avg of all batches.
          </p>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Batches
                  {sortedBatches.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{sortedBatches.length}</Badge>
                  )}
                </span>
                {sortedBatches.length > 0 && hasPack && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Total: <strong className="text-foreground">{totalBatchPacks} {packUnit}{totalBatchPacks === 1 ? '' : 's'}</strong> ({totalBatchQuantity} {baseUnit})
                  </p>
                )}
              </div>
              {isNew && (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs rounded-xl"
                  onClick={onAddBatch}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Batch
                </Button>
              )}
            </div>

            {sortedBatches.length === 0 ? (
              <div
                className={cn(
                  "flex flex-col items-center justify-center py-7 border-2 border-dashed border-muted rounded-2xl bg-muted/10 transition-colors",
                  isNew && "cursor-pointer active:bg-muted/30"
                )}
                onClick={isNew ? onAddBatch : undefined}
              >
                <FlaskConical className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No batches yet</p>
                {isNew && <p className="text-xs text-muted-foreground/60 mt-0.5">Tap to add your first batch</p>}
              </div>
            ) : (
              <div className="space-y-2 max-h-70 overflow-y-auto pr-0.5">
                {sortedBatches.map(batch => (
                  <div key={batch.id} className="flex items-center gap-2 p-3 bg-muted/30 rounded-2xl border border-muted/60">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold">{batch.batchNumber}</span>
                        {batch.expiryDate && <ExpiryBadge expiryDate={batch.expiryDate} />}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>
                          Qty: <strong className="text-foreground">{batch.quantity} {baseUnit}</strong>
                          {hasPack && (
                            <span className="text-[11px] opacity-80 ml-1">
                              ({Math.floor(batch.quantity / safePSize)} {packUnit}{Math.floor(batch.quantity / safePSize) === 1 ? '' : 's'}
                              {batch.quantity % safePSize > 0 ? ` + ${batch.quantity % safePSize} ${baseUnit}` : ''})
                            </span>
                          )}
                        </span>
                        <span>
                          Cost: <strong className="text-foreground">Rs. {formatMoney(batch.purchaseRate)}</strong>/{baseUnit}
                          {hasPack && Number(batch.purchaseRate) > 0 && (
                            <span className="text-[11px] opacity-80 ml-1">
                              (Rs. {formatMoney(safeMul(batch.purchaseRate, safePSize))}/{packUnit})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button type="button" variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => onEditBatch(batch)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {isNew && (
                        <Button type="button" variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => onDeleteBatch(batch.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
});

BatchSection.displayName = 'BatchSection';
