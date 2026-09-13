import React, { useMemo, useState, useEffect } from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SectionProps } from './types';
import { useWatch } from 'react-hook-form';
import { computePerUnitCost, calculateTotalSupplierStock, calculateWeightedAverageCost, getSafePackSize, safeCurrency, safeQty } from '@/utils/unitUtils';
import { cn } from '@/lib/utils';
import {
  PackageCheck,
  Calculator,
  Lock,
  Boxes,
  Sparkles,
} from 'lucide-react';

const COMMON_PACK_UNITS = ['carton', 'box', 'case', 'strip', 'pack', 'crate', 'bundle', 'bag'];

interface PackPricingSectionProps extends SectionProps {
  hasExpiry: boolean;
  averagePurchaseRate: number;
  isMultiSupplier: boolean;
  isNew: boolean;
  totalBatchQuantity: number;
}

export const PackPricingSection = React.memo(({
  form,
  hasExpiry,
  averagePurchaseRate,
  isMultiSupplier,
  isNew,
  totalBatchQuantity,
}: PackPricingSectionProps) => {
  const purchaseRate = useWatch({ control: form.control, name: 'purchaseRate' }) ?? 0;
  const baseUnit = useWatch({ control: form.control, name: 'unit' }) || 'pcs';
  const packSize = useWatch({ control: form.control, name: 'packSize' });
  const packUnit = useWatch({ control: form.control, name: 'packUnit' }) ?? '';
  const packPurchaseCost = useWatch({ control: form.control, name: 'packPurchaseCost' });
  const packQuantity = useWatch({ control: form.control, name: 'packQuantity' });

  const initialHasPack = Boolean(
    form.watch('isPackPricingEnabled') ||
    (form.getValues('packSize') && Number(form.getValues('packSize')) > 0) ||
    (form.getValues('packPurchaseCost') && Number(form.getValues('packPurchaseCost')) > 0)
  );
  const [isPackPricingEnabled, setIsPackPricingEnabled] = useState(initialHasPack);

  const watchedPackEnabled = form.watch('isPackPricingEnabled');
  useEffect(() => {
    if (watchedPackEnabled !== undefined && watchedPackEnabled !== isPackPricingEnabled) {
      setIsPackPricingEnabled(watchedPackEnabled);
    }
  }, [watchedPackEnabled, isPackPricingEnabled]);

  const computedPerUnit = (packSize && packPurchaseCost && Number(packSize) > 0 && Number(packPurchaseCost) > 0)
    ? computePerUnitCost(Number(packPurchaseCost), Number(packSize), 2)
    : null;

  const computedTotalStock = (packSize && Number(packSize) > 0)
    ? Math.round(((packQuantity ? Number(packQuantity) : 1) * Number(packSize)) * 1000) / 1000
    : null;

  const watchedSupplierStocks = useWatch({ control: form.control, name: 'supplierStocks' }) ?? [];

  const multiSupplierTotalStock = useMemo(() => {
    return calculateTotalSupplierStock(watchedSupplierStocks);
  }, [watchedSupplierStocks]);

  const multiSupplierWeightedCost = useMemo(() => {
    return calculateWeightedAverageCost(watchedSupplierStocks);
  }, [watchedSupplierStocks]);

  const safePSize = useMemo(() => getSafePackSize(packSize), [packSize]);

  const multiSupplierAveragePackCost = useMemo(() => {
    if (!isMultiSupplier || !Array.isArray(watchedSupplierStocks) || watchedSupplierStocks.length === 0) {
      return 0;
    }
    // 1. If stock exists, compute weighted average pack cost
    if (multiSupplierTotalStock > 0 && multiSupplierWeightedCost > 0 && safePSize > 0) {
      return safeCurrency(multiSupplierWeightedCost * safePSize);
    }
    // 2. If no stock or total stock is 0, average the non-zero packCost across suppliers
    const validPackCosts = watchedSupplierStocks
      .map((s: any) => {
        if (s.packCost && Number(s.packCost) > 0) return Number(s.packCost);
        if (s.cost && Number(s.cost) > 0 && safePSize > 0) return safeCurrency(Number(s.cost) * safePSize);
        return null;
      })
      .filter((cost): cost is number => cost !== null && cost > 0);

    if (validPackCosts.length > 0) {
      const sum = validPackCosts.reduce((a, b) => a + b, 0);
      return safeCurrency(sum / validPackCosts.length);
    }

    // 3. Fallback to form packPurchaseCost or purchaseRate * safePSize
    if (packPurchaseCost && Number(packPurchaseCost) > 0) return Number(packPurchaseCost);
    if (purchaseRate > 0 && safePSize > 0) return safeCurrency(purchaseRate * safePSize);
    return 0;
  }, [isMultiSupplier, watchedSupplierStocks, multiSupplierTotalStock, multiSupplierWeightedCost, safePSize, packPurchaseCost, purchaseRate]);

  // Keep form's packPurchaseCost in sync with multi-supplier average when in multi-supplier mode
  useEffect(() => {
    if (isMultiSupplier && multiSupplierAveragePackCost > 0) {
      const currentVal = form.getValues('packPurchaseCost');
      if (currentVal !== multiSupplierAveragePackCost) {
        form.setValue('packPurchaseCost', multiSupplierAveragePackCost, { shouldDirty: false });
      }
    }
  }, [isMultiSupplier, multiSupplierAveragePackCost, form]);

  // Keep form's packPurchaseCost in sync with batch average when in expiry mode
  useEffect(() => {
    if (hasExpiry && averagePurchaseRate > 0 && safePSize > 0) {
      const batchAvgPackCost = safeCurrency(averagePurchaseRate * safePSize);
      const currentVal = form.getValues('packPurchaseCost');
      if (currentVal !== batchAvgPackCost) {
        form.setValue('packPurchaseCost', batchAvgPackCost, { shouldDirty: false });
      }
    }
  }, [hasExpiry, averagePurchaseRate, safePSize, form]);

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

      if (hasExpiry) {
        // In expiry mode, stock and rate are driven by batches
        if (effectiveCostVal !== null && effectiveCostVal > 0) {
          form.setValue('packPurchaseCost', effectiveCostVal, { shouldDirty: true });
        }
        return;
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
          const supplierPackCost = isMultiSupplier
            ? Number(ss.packCost || effectiveCostVal || 0)
            : ((effectiveCostVal !== null && effectiveCostVal > 0) ? effectiveCostVal : Number(ss.packCost || 0));
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
    form.setValue('isPackPricingEnabled', checked, { shouldDirty: true });
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
      if (!hasExpiry && !form.getValues('packQuantity')) {
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

  return (
    <section className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Packaging</p>
          <p className="text-xs text-muted-foreground mt-0.5">Bulk boxes, cartons, or packs</p>
        </div>
        {isNew && (
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
            <FormField control={form.control} name="packPurchaseCost" render={({ field }) => {
              const isBatchAutoAveraged = hasExpiry && averagePurchaseRate > 0;
              const isCostLocked = isMultiSupplier || isBatchAutoAveraged;
              const displayCost = isBatchAutoAveraged
                ? (safePSize > 0 ? (averagePurchaseRate * safePSize).toFixed(2) : '')
                : (isMultiSupplier
                    ? (multiSupplierAveragePackCost > 0 ? multiSupplierAveragePackCost.toFixed(2) : (field.value ?? ''))
                    : (field.value ?? ''));

              return (
                <FormItem>
                  <FormLabel className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                    <span>{isMultiSupplier ? `Avg. Cost for 1 ${packUnit || 'pack'} (Rs.)` : isBatchAutoAveraged ? `Avg. Cost for 1 ${packUnit || 'pack'}` : `Cost for 1 ${packUnit || 'pack'} (Rs.) *`}</span>
                    {isMultiSupplier && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">Auto-averaged</span>}
                    {isBatchAutoAveraged && <span className="text-[10px] text-primary font-normal">From Batches</span>}
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
                        value={displayCost}
                        onChange={e => {
                          if (isCostLocked) return;
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          field.onChange(val);
                          handlePackCalculationSync(packSize ? Number(packSize) : null, val, packQuantity ? Number(packQuantity) : 1);
                        }}
                        readOnly={isCostLocked}
                        disabled={isCostLocked}
                        className={cn(
                          "pl-9 h-9 text-xs font-medium",
                          isCostLocked && "bg-muted/60 text-muted-foreground cursor-not-allowed pr-8"
                        )}
                      />
                      {isCostLocked && (
                        <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                      )}
                    </div>
                  </FormControl>
                  {isMultiSupplier ? (
                    <p className="text-[10px] text-muted-foreground">
                      Weighted avg. across suppliers (set individual rates in Suppliers step).
                    </p>
                  ) : isBatchAutoAveraged ? (
                    <p className="text-[10px] text-muted-foreground">
                      Auto-averaged from batch purchase rates (Rs. {averagePurchaseRate.toFixed(2)} × {safePSize}).
                    </p>
                  ) : (
                    <FormMessage className="text-xs" />
                  )}
                </FormItem>
              );
            }} />

            {/* Number of packs in stock */}
            <FormField control={form.control} name="packQuantity" render={({ field }) => {
              const isPacksFromBatches = hasExpiry;
              const batchPacks = hasExpiry && safePSize > 0 ? Math.floor(totalBatchQuantity / safePSize) : 0;

              return (
                <FormItem>
                  <FormLabel className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                    <span>{isMultiSupplier ? `Total ${packUnit || 'Pack'}s Pool` : isPacksFromBatches ? `Total ${packUnit || 'Pack'}s` : 'Packs in Stock'}</span>
                    {isPacksFromBatches && <span className="text-[10px] text-primary font-normal">From Batches</span>}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="1"
                        {...field}
                        value={isPacksFromBatches ? batchPacks : (field.value ?? '')}
                        onChange={e => {
                          if (isPacksFromBatches) return;
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          field.onChange(val);
                          handlePackCalculationSync(packSize ? Number(packSize) : null, packPurchaseCost ? Number(packPurchaseCost) : null, val);
                        }}
                        readOnly={isPacksFromBatches}
                        disabled={isPacksFromBatches}
                        className={cn(
                          "h-9 text-xs font-medium",
                          isPacksFromBatches && "bg-muted/60 text-muted-foreground cursor-not-allowed pr-8"
                        )}
                      />
                      {isPacksFromBatches && (
                        <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                      )}
                    </div>
                  </FormControl>
                  {isPacksFromBatches ? (
                    <p className="text-[10px] text-muted-foreground">
                      Derived from batch stock ({totalBatchQuantity} {baseUnit}).
                    </p>
                  ) : (
                    <FormMessage className="text-xs" />
                  )}
                </FormItem>
              );
            }} />
          </div>

          {/* Packaging live calculation banner */}
          {hasExpiry ? (
            <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20 space-y-1 text-xs text-primary">
              <div className="flex items-center justify-between font-medium">
                <span className="flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5" />
                  Packaging Ratio:
                </span>
                <span className="font-bold">
                  1 {packUnit || 'pack'} = {safePSize} {baseUnit}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground opacity-90">
                💡 You can enter quantities and wholesale rates directly by {packUnit || 'pack'} when adding batches below.
              </p>
            </div>
          ) : !isMultiSupplier ? (
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
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Avg. Cost / {packUnit || 'Carton'}</span>
                  <span className="text-sm font-bold text-foreground">
                    {multiSupplierAveragePackCost > 0 ? `Rs. ${multiSupplierAveragePackCost.toFixed(2)}` : 'Rs. 0.00'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Total Sourced Packs</span>
                  <span className="text-sm font-bold text-foreground">
                    {safePSize > 0 ? (multiSupplierTotalStock / safePSize).toFixed(1) : 0} {packUnit || 'pack'}s
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                <span>💡 Stock is partitioned across suppliers. Enter {packUnit || 'carton'}s per supplier in the Suppliers step.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
});

PackPricingSection.displayName = 'PackPricingSection';
