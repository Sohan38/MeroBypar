import React, { useState, useEffect, useMemo } from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, TrendingUp, TrendingDown, Lock, PackageCheck, Calculator, Sparkles, Boxes } from 'lucide-react';
import { SectionProps } from './types';
import { useWatch } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { computePerUnitCost, calculateTotalSupplierStock, calculateWeightedAverageCost, getSafePackSize, safeCurrency, safeQty } from '@/utils/unitUtils';

interface PricingSectionProps extends SectionProps {
  hasExpiry: boolean;
  averagePurchaseRate: number;
  hasSupplier: boolean;
  isMultiSupplier: boolean;
  isNew: boolean;
}

const COMMON_PACK_UNITS = ['pack', 'carton', 'box', 'case', 'bundle', 'strip', 'bag'];

export const PricingSection = React.memo(({ form, hasExpiry, averagePurchaseRate, hasSupplier, isMultiSupplier, isNew }: PricingSectionProps) => {
  const sellingRate = useWatch({ control: form.control, name: 'sellingRate' }) ?? 0;
  const purchaseRate = useWatch({ control: form.control, name: 'purchaseRate' }) ?? 0;
  const baseUnit = useWatch({ control: form.control, name: 'unit' }) || 'pcs';
  const packSize = useWatch({ control: form.control, name: 'packSize' });
  const packUnit = useWatch({ control: form.control, name: 'packUnit' }) ?? '';
  const packPurchaseCost = useWatch({ control: form.control, name: 'packPurchaseCost' });
  const packQuantity = useWatch({ control: form.control, name: 'packQuantity' });

  const initialHasPack = Boolean(
    (form.getValues('packSize') && Number(form.getValues('packSize')) > 0) ||
    (form.getValues('packPurchaseCost') && Number(form.getValues('packPurchaseCost')) > 0)
  );
  const [isPackPricingEnabled, setIsPackPricingEnabled] = useState(initialHasPack);

  const effectivePurchase = hasExpiry ? averagePurchaseRate : purchaseRate;
  const profitPerUnit = sellingRate - effectivePurchase;
  const profitMargin = sellingRate > 0 ? Math.round((profitPerUnit / sellingRate) * 100) : 0;

  const sellingError = form.formState.errors.sellingRate?.message;
  const purchaseError = form.formState.errors.purchaseRate?.message;
  const sellingValid = !sellingError && sellingRate > 0;
  const purchaseValid = !purchaseError && purchaseRate >= 0;
  const isProfit = profitPerUnit >= 0;

  const computedPerUnit = (packSize && packPurchaseCost && Number(packSize) > 0 && Number(packPurchaseCost) > 0)
    ? computePerUnitCost(Number(packPurchaseCost), Number(packSize), 2)
    : null;

  const computedTotalStock = (packSize && Number(packSize) > 0)
    ? Math.round(((packQuantity ? Number(packQuantity) : 1) * Number(packSize)) * 1000) / 1000
    : null;

  const watchedSupplierIds = useWatch({ control: form.control, name: 'supplierIds' }) ?? [];
  const watchedSupplierStocks = useWatch({ control: form.control, name: 'supplierStocks' }) ?? [];

  const multiSupplierTotalStock = useMemo(() => {
    return calculateTotalSupplierStock(watchedSupplierStocks);
  }, [watchedSupplierStocks]);

  const multiSupplierWeightedCost = useMemo(() => {
    return calculateWeightedAverageCost(watchedSupplierStocks);
  }, [watchedSupplierStocks]);

  // Sync computed pack unit cost & stock quantity to form & all suppliers
  const handlePackCalculationSync = (
    sizeVal: number | null,
    costVal: number | null,
    qtyVal: number | null
  ) => {
    if (sizeVal && sizeVal > 0) {
      // If costVal is not given yet, but purchaseRate already exists (> 0), derive costVal
      let effectiveCostVal = costVal;
      const curPurchaseRate = Number(form.getValues('purchaseRate') ?? 0);
      if ((effectiveCostVal === null || effectiveCostVal <= 0) && curPurchaseRate > 0) {
        effectiveCostVal = safeCurrency(curPurchaseRate * sizeVal);
        form.setValue('packPurchaseCost', effectiveCostVal, { shouldDirty: true });
      }

      const perUnit = (effectiveCostVal !== null && effectiveCostVal >= 0)
        ? computePerUnitCost(effectiveCostVal, sizeVal, 2)
        : curPurchaseRate;
      const packs = (qtyVal && qtyVal > 0) ? qtyVal : 1;
      const totalUnits = Math.round(packs * sizeVal * 1000) / 1000;

      if (effectiveCostVal !== null && effectiveCostVal >= 0 && isNew) {
        form.setValue('purchaseRate', perUnit, { shouldValidate: true, shouldDirty: true });
      }

      // Update global quantity if single supplier or no supplier
      if (!isMultiSupplier && isNew) {
        form.setValue('quantity', totalUnits, { shouldValidate: true, shouldDirty: true });
      }

      // Sync with ANY existing suppliers in supplierStocks (single or multi-supplier)
      const currentStocks = form.getValues('supplierStocks') ?? [];
      if (currentStocks.length > 0 && isNew) {
        const updated = currentStocks.map((ss: any) => {
          const supplierPacks = Number(ss.packQuantity ?? (currentStocks.length === 1 ? packs : (ss.stock ? safeQty(ss.stock / sizeVal) : 0)));
          const supplierPackCost = (effectiveCostVal !== null && effectiveCostVal > 0) ? effectiveCostVal : Number(ss.packCost || 0);
          const supplierUnitCost = supplierPackCost > 0 ? safeCurrency(supplierPackCost / sizeVal) : perUnit;
          const supplierStock = supplierPacks > 0 ? safeQty(supplierPacks * sizeVal) : Number(ss.stock || 0);
          const supplierTotalCost = safeCurrency(supplierPacks * supplierPackCost);

          return {
            ...ss,
            stock: supplierStock,
            baseQuantity: supplierStock,
            cost: supplierUnitCost,
            totalPurchaseCost: supplierTotalCost,
            packQuantity: supplierPacks > 0 ? supplierPacks : null,
            packCost: supplierPackCost > 0 ? supplierPackCost : null,
            appliedPackSize: sizeVal,
          };
        });
        form.setValue('supplierStocks', updated, { shouldDirty: true });
      }
    }
  };

  // Handle pack toggle
  const handleTogglePack = (checked: boolean) => {
    setIsPackPricingEnabled(checked);
    if (!checked) {
      form.setValue('packSize', null, { shouldDirty: true });
      form.setValue('packUnit', '', { shouldDirty: true });
      form.setValue('packPurchaseCost', null, { shouldDirty: true });
      form.setValue('packQuantity', null, { shouldDirty: true });
      const currentStocks = form.getValues('supplierStocks') ?? [];
      if (currentStocks.length > 0) {
        const updated = currentStocks.map((ss: any) => ({
          ...ss,
          packQuantity: null,
          packCost: null,
          appliedPackSize: undefined,
        }));
        form.setValue('supplierStocks', updated, { shouldDirty: true });
      }
    } else {
      if (!form.getValues('packUnit')) {
        form.setValue('packUnit', 'pack', { shouldDirty: true });
      }
      if (!form.getValues('packQuantity')) {
        form.setValue('packQuantity', 1, { shouldDirty: true });
      }
      // Trigger sync with current values
      const curSize = form.getValues('packSize');
      const curCost = form.getValues('packPurchaseCost');
      if (curSize) {
        handlePackCalculationSync(Number(curSize), curCost ? Number(curCost) : null, form.getValues('packQuantity') ? Number(form.getValues('packQuantity')) : 1);
      }
    }
  };

  const isPurchaseLocked = hasSupplier || !isNew || isPackPricingEnabled;

  return (
    <section className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pricing</p>
        {!hasExpiry && isNew && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Pack / Bulk Pricing</span>
            <Switch
              checked={isPackPricingEnabled}
              onCheckedChange={handleTogglePack}
              aria-label="Toggle pack bulk pricing"
            />
          </div>
        )}
      </div>

      {hasExpiry ? (
        /* Expiry mode — only selling price editable */
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
                    onChange={e => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                    className={cn(
                      'pl-11 h-11 text-base font-medium transition-colors',
                      sellingError && 'border-destructive focus-visible:ring-destructive/30',
                      sellingValid && 'border-green-400 focus-visible:ring-green-400/30'
                    )}
                  />
                  {sellingValid && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />}
                </div>
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )} />

          {averagePurchaseRate > 0 && (
            <div className="flex items-center justify-between bg-muted/50 rounded-2xl px-4 py-3 text-sm border border-muted/60">
              <span className="text-muted-foreground text-xs">Avg. purchase cost (from batches)</span>
              <span className="font-bold">Rs. {averagePurchaseRate.toFixed(2)}</span>
            </div>
          )}
        </div>
      ) : (
        /* Normal / supplier mode */
        <div className="space-y-3">
          {/* Pack / Bulk Pricing Card (Collapsible) */}
          {isPackPricingEnabled && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-3 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Pack / Carton Cost Breakdown</span>
                </div>
                <span className="text-[10px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Locks & auto-computes rates
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Pack Unit with suggestions */}
                <FormField control={form.control} name="packUnit" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-medium text-muted-foreground">Pack Type</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. pack, carton"
                        {...field}
                        value={field.value ?? ''}
                        className="h-9 text-xs"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />

                {/* Pack Size */}
                <FormField control={form.control} name="packSize" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-medium text-muted-foreground">
                      Units per Pack ({baseUnit}) *
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 30"
                        {...field}
                        value={field.value ?? ''}
                        onChange={e => {
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          field.onChange(val);
                          const curCost = form.getValues('packPurchaseCost');
                          handlePackCalculationSync(val, curCost ? Number(curCost) : null, packQuantity ? Number(packQuantity) : 1);
                        }}
                        className="h-9 text-xs"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
              </div>

              {/* Quick suggestions for pack type */}
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[10px] text-muted-foreground mr-1">Quick:</span>
                {COMMON_PACK_UNITS.slice(0, 5).map(unitSuggestion => (
                  <button
                    key={unitSuggestion}
                    type="button"
                    onClick={() => form.setValue('packUnit', unitSuggestion, { shouldDirty: true })}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-md border transition-colors',
                      packUnit?.toLowerCase() === unitSuggestion
                        ? 'bg-primary text-primary-foreground border-primary font-semibold'
                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                    )}
                  >
                    {unitSuggestion}
                  </button>
                ))}
              </div>

              {/* Pack Purchase Cost & Packs in Stock */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Total Pack Purchase Cost */}
                <FormField control={form.control} name="packPurchaseCost" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-medium text-muted-foreground">
                      Cost for 1 {packUnit || 'pack'} (Rs.) *
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium pointer-events-none select-none">Rs.</span>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="e.g. 500"
                          {...field}
                          value={field.value ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? null : Number(e.target.value);
                            field.onChange(val);
                            handlePackCalculationSync(packSize ? Number(packSize) : null, val, packQuantity ? Number(packQuantity) : 1);
                          }}
                          className="pl-9 h-9 text-xs font-medium"
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />

                {/* Number of packs in stock */}
                <FormField control={form.control} name="packQuantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-medium text-muted-foreground">
                      {isMultiSupplier ? `Total ${packUnit || 'Pack'}s Pool` : 'Packs in Stock'}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="1"
                        {...field}
                        value={field.value ?? ''}
                        onChange={e => {
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          field.onChange(val);
                          handlePackCalculationSync(packSize ? Number(packSize) : null, packPurchaseCost ? Number(packPurchaseCost) : null, val);
                        }}
                        className="h-9 text-xs font-medium"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )} />
              </div>

              {/* Single-supplier live calculation banner */}
              {!isMultiSupplier ? (
                computedPerUnit !== null && (
                  <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-primary font-medium">
                        <Calculator className="h-3.5 w-3.5" />
                        <span>Auto Purchase Cost / {baseUnit}:</span>
                      </div>
                      <div className="font-bold text-primary tabular-nums">
                        Rs. {computedPerUnit.toFixed(2)}
                        <span className="text-[10px] font-normal opacity-80 ml-1">
                          (Rs. {packPurchaseCost} ÷ {packSize})
                        </span>
                      </div>
                    </div>

                    {computedTotalStock !== null && (
                      <div className="flex items-center justify-between border-t border-primary/15 pt-1 text-[11px]">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Boxes className="h-3 w-3 text-primary" /> Auto Current Stock:
                        </span>
                        <span className="font-bold text-foreground tabular-nums">
                          {computedTotalStock} {baseUnit}
                          <span className="text-[10px] font-normal text-muted-foreground ml-1">
                            ({packQuantity || 1} {packUnit || 'pack'}(s) × {packSize})
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* Multi-Supplier Pack Procurement Summary Card */
                <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 p-3 space-y-2.5 text-xs text-blue-900 dark:text-blue-200">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Boxes className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Multi-Supplier Pack Procurement
                    </span>
                    <span className="text-[11px] bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
                      1 {packUnit || 'pack'} = {Number(packSize) > 0 ? packSize : 1} {baseUnit}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-background/80 dark:bg-background/40 p-2.5 rounded-lg border border-blue-200/50 dark:border-blue-800/40">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Aggregated Stock</p>
                      <p className="text-sm font-bold text-foreground">
                        {Math.round(((multiSupplierTotalStock / (Number(packSize) > 0 ? Number(packSize) : 1))) * 100) / 100} {packUnit || 'pack'}(s)
                        <span className="text-[11px] font-normal text-muted-foreground ml-1">
                          ({multiSupplierTotalStock} {baseUnit})
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Weighted Avg. Cost</p>
                      <p className="text-sm font-bold text-foreground">
                        Rs. {multiSupplierWeightedCost.toFixed(2)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">
                          / {baseUnit}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                    <span>💡 Stock is partitioned across suppliers. Enter {packUnit || 'carton'}s per supplier in the Suppliers step.</span>
                  </div>
                </div>
              )}
            </div>
          )}

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
                      value={field.value === 0 ? '' : Number(field.value).toFixed(hasSupplier ? 2 : undefined)}
                      onChange={e => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
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
                    <Lock className="h-3 w-3 inline shrink-0" /> Locked: Auto-calculated from pack breakdown above
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
                  <FormMessage className="text-xs" />
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
                      onChange={e => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                      className={cn(
                        'pl-11 h-11 text-base font-medium transition-colors',
                        sellingError && 'border-destructive focus-visible:ring-destructive/30',
                        sellingValid && 'border-green-400 focus-visible:ring-green-400/30'
                      )}
                    />
                    {sellingValid && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />}
                  </div>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )} />
          </div>
        </div>
      )}

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
              {isProfit ? '+' : ''}{profitPerUnit.toFixed(2)}
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
