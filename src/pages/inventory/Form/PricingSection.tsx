import React, { useCallback, useEffect } from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CheckCircle2, TrendingUp, TrendingDown, Lock } from 'lucide-react';
import { SectionProps } from './types';
import { useWatch } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/unitUtils';

interface PricingSectionProps extends SectionProps {
  hasExpiry: boolean;
  averagePurchaseRate: number;
  hasSupplier: boolean;
  isMultiSupplier: boolean;
  isNew: boolean;
}

export const PricingSection = React.memo(({
  form,
  hasExpiry,
  averagePurchaseRate,
  hasSupplier,
  isMultiSupplier,
  isNew,
}: PricingSectionProps) => {
  const sellingRate = useWatch({ control: form.control, name: 'sellingRate' }) ?? 0;
  const purchaseRate = useWatch({ control: form.control, name: 'purchaseRate' }) ?? 0;
  const baseUnit = useWatch({ control: form.control, name: 'unit' }) || 'pcs';
  const isPackPricingEnabled = useWatch({ control: form.control, name: 'isPackPricingEnabled' }) ||
    Boolean(form.getValues('packSize') && Number(form.getValues('packSize')) > 0);

  const effectivePurchase = hasExpiry ? averagePurchaseRate : purchaseRate;
  const profitPerUnit = sellingRate - effectivePurchase;
  const profitMargin = sellingRate > 0 ? Math.round((profitPerUnit / sellingRate) * 100) : 0;

  const rawSellingError = form.formState.errors.sellingRate?.message;
  // If sellingRate is a valid positive number (>= 0.01), any remaining error in formState is stale and ignored
  const sellingError = sellingRate >= 0.01 ? undefined : rawSellingError;
  const rawPurchaseError = form.formState.errors.purchaseRate?.message;
  const purchaseError = purchaseRate >= 0 ? undefined : rawPurchaseError;

  const sellingValid = !sellingError && sellingRate >= 0.01;
  const purchaseValid = !purchaseError && purchaseRate >= 0;
  const isProfit = profitPerUnit >= 0;

  const isPurchaseLocked = hasSupplier || !isNew || isPackPricingEnabled;

  // Auto-clear stale errors when valid values are in state
  useEffect(() => {
    if (sellingRate >= 0.01 && form.formState.errors.sellingRate) {
      form.clearErrors('sellingRate');
    }
  }, [sellingRate, form]);

  useEffect(() => {
    if (purchaseRate >= 0 && form.formState.errors.purchaseRate) {
      form.clearErrors('purchaseRate');
    }
  }, [purchaseRate, form]);

  const handleSellingRateChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    fieldOnChange: (val: number) => void
  ) => {
    let raw = e.target.value;
    if (/^0\d+/.test(raw)) {
      raw = String(Number(raw));
    }
    const val = raw === '' ? 0 : Number(raw);
    fieldOnChange(val);
    if (val >= 0.01) {
      if (form.formState.errors.sellingRate) {
        form.clearErrors('sellingRate');
      }
    } else if (raw !== '') {
      form.trigger('sellingRate');
    }
  }, [form]);

  const handlePurchaseRateChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    fieldOnChange: (val: number) => void
  ) => {
    let raw = e.target.value;
    if (/^0\d+/.test(raw)) {
      raw = String(Number(raw));
    }
    const val = raw === '' ? 0 : Number(raw);
    fieldOnChange(val);
    if (val >= 0 && form.formState.errors.purchaseRate) {
      form.clearErrors('purchaseRate');
    }
  }, [form]);

  return (
    <section className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pricing</p>
          <p className="text-xs text-muted-foreground mt-0.5">Set selling prices and verify margins</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Pricing Inputs (Selling Rate & Purchase Rate) */}
        {hasExpiry ? (
          <div className="space-y-3">
            <FormField control={form.control} name="sellingRate" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selling Price (MRP) *</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none select-none">Rs.</span>
                    <Input
                      type="number" step="0.01" min={0.01} placeholder="0.00"
                      {...field}
                      value={field.value === 0 ? '' : field.value}
                      onFocus={e => e.target.select()}
                      onChange={e => handleSellingRateChange(e, field.onChange)}
                      className={cn(
                        'pl-11 h-11 text-base font-medium transition-colors',
                        sellingError && 'border-destructive focus-visible:ring-destructive/30',
                        sellingValid && 'border-green-400 focus-visible:ring-green-400/30'
                      )}
                    />
                    {sellingValid && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />}
                  </div>
                </FormControl>
                {sellingError && <FormMessage className="text-xs">{sellingError}</FormMessage>}
              </FormItem>
            )} />

            {averagePurchaseRate > 0 && (
              <div className="flex items-center justify-between bg-muted/50 rounded-2xl px-4 py-3 text-sm border border-muted/60">
                <span className="text-muted-foreground text-xs">Avg. purchase cost (from batches)</span>
                <span className="font-bold">Rs. {formatMoney(averagePurchaseRate)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {/* Purchase cost — locked when supplier active, editing, or pack pricing enabled */}
            <FormField control={form.control} name="purchaseRate" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Purchase Cost / {baseUnit}
                  {!hasSupplier && !isPackPricingEnabled && <span className="font-normal normal-case tracking-normal opacity-60 ml-1">(opt.)</span>}
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none select-none">Rs.</span>
                    <Input
                      type="number" step="0.01" min={0} placeholder="0.00"
                      {...field}
                      value={field.value === 0 ? '' : (hasSupplier ? formatMoney(field.value) : field.value)}
                      onFocus={e => e.target.select()}
                      onChange={e => handlePurchaseRateChange(e, field.onChange)}
                      readOnly={isPurchaseLocked}
                      disabled={isPurchaseLocked}
                      className={cn(
                        'pl-11 h-11 text-base font-medium transition-colors',
                        isPurchaseLocked && 'bg-muted/60 text-muted-foreground cursor-not-allowed pr-9',
                        !isPurchaseLocked && purchaseError && 'border-destructive focus-visible:ring-destructive/30',
                        !isPurchaseLocked && purchaseValid && purchaseRate > 0 && 'border-green-400 focus-visible:ring-green-400/30'
                      )}
                    />
                    {isPurchaseLocked && <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />}
                  </div>
                </FormControl>
                {isPackPricingEnabled ? (
                  <p className="text-[10px] text-primary font-medium leading-snug mt-1 flex items-center gap-1">
                    <Lock className="h-3 w-3 inline shrink-0" /> Locked: Auto-calculated from packaging
                  </p>
                ) : !isNew ? (
                  <p className="text-[10px] text-muted-foreground leading-snug mt-1">
                    Purchase cost is locked during edits. Create a purchase transaction to record new rates.
                  </p>
                ) : hasSupplier ? (
                  <p className="text-[10px] text-muted-foreground leading-snug mt-1">
                    {isMultiSupplier ? 'Weighted avg. from suppliers' : 'Set in Suppliers section below'}
                  </p>
                ) : (
                  purchaseError && <FormMessage className="text-xs">{purchaseError}</FormMessage>
                )}
              </FormItem>
            )} />

            {/* Selling price */}
            <FormField control={form.control} name="sellingRate" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selling Price *</FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none select-none">Rs.</span>
                    <Input
                      type="number" step="0.01" min={0.01} placeholder="0.00"
                      {...field}
                      value={field.value === 0 ? '' : field.value}
                      onFocus={e => e.target.select()}
                      onChange={e => handleSellingRateChange(e, field.onChange)}
                      className={cn(
                        'pl-11 h-11 text-base font-medium transition-colors',
                        sellingError && 'border-destructive focus-visible:ring-destructive/30',
                        sellingValid && 'border-green-400 focus-visible:ring-green-400/30'
                      )}
                    />
                    {sellingValid && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />}
                  </div>
                </FormControl>
                {sellingError && <FormMessage className="text-xs">{sellingError}</FormMessage>}
              </FormItem>
            )} />
          </div>
        )}
      </div>

      {/* Live profit card */}
      {sellingRate > 0 && (
        <div className={cn(
          'flex items-center justify-between px-4 py-3 rounded-2xl border transition-all',
          isProfit
            ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
            : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
        )}>
          <div className="flex items-center gap-2">
            {isProfit
              ? <TrendingUp className="h-4 w-4 text-green-600" />
              : <TrendingDown className="h-4 w-4 text-red-600" />}
            <span className={cn('text-sm font-medium', isProfit ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300')}>
              Profit per {baseUnit}
            </span>
          </div>
          <div className="text-right leading-tight">
            <span className={cn('text-base font-bold tabular-nums', isProfit ? 'text-green-700' : 'text-red-600')}>
              {isProfit ? '+' : ''}{formatMoney(profitPerUnit)}
            </span>
            {effectivePurchase > 0 && (
              <span className="text-xs text-muted-foreground ml-1.5">({profitMargin}%)</span>
            )}
          </div>
        </div>
      )}

      {/* Below-cost warning */}
      {sellingRate > 0 && effectivePurchase > 0 && !isProfit && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5 -mt-1">
          <span>⚠️</span> Selling below cost — you'll lose money on each sale.
        </p>
      )}
    </section>
  );
});

PricingSection.displayName = 'PricingSection';
