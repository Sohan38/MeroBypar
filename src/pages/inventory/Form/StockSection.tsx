import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionProps } from './types';
import { ProductUnit } from '@/types';
import { useWatch } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Package, AlertTriangle, Lock, Info } from 'lucide-react';
import { UNIT_CATEGORIES, isDecimalUnit, formatQuantity, safeDiv, formatQtyDisplay } from '@/utils/unitUtils';

interface StockSectionProps extends SectionProps {
  isNew: boolean;
  hasExpiry: boolean;
  hasVariants: boolean;
  totalBatchQuantity: number;
  totalVariantQuantity: number;
  isMultiSupplier?: boolean;
  totalSupplierStockQuantity?: number;
}

// Reusable numeric field
const NumericField = ({
  form,
  name,
  label,
  hint,
  unit,
  required = false,
  readOnly = false,
}: {
  form: StockSectionProps['form'];
  name: 'quantity' | 'minimumStock';
  label: string;
  hint?: string;
  unit?: string;
  required?: boolean;
  readOnly?: boolean;
}) => {
  const value = useWatch({ control: form.control, name }) ?? 0;
  const error = form.formState.errors[name]?.message;
  const touched = form.formState.touchedFields[name];
  const isValid = touched && !error;
  const isDecimal = name === 'quantity' && isDecimalUnit(unit);

  return (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}{required && ' *'}
          {!required && <span className="font-normal normal-case tracking-normal opacity-60 ml-1">(opt.)</span>}
        </FormLabel>
        <FormControl>
          <div className="relative">
            <Input
              type="number"
              min={0}
              step={isDecimal ? "0.01" : "1"}
              placeholder="0"
              {...field}
              value={field.value === 0 ? '' : field.value}
              onFocus={e => e.target.select()}
              onChange={e => {
                let raw = e.target.value;
                if (/^0\d+/.test(raw)) {
                  raw = raw.replace(/^0+/, '');
                  e.target.value = raw;
                }
                const val = raw === '' ? 0 : Number(raw);
                field.onChange(val);
                if (val >= 0 && form.formState.errors[name]) {
                  form.clearErrors(name);
                }
              }}
              className={cn(
                'transition-colors h-11 text-base font-medium',
                readOnly && 'bg-muted/60 text-muted-foreground cursor-not-allowed pr-9',
                error && 'border-destructive focus-visible:ring-destructive/30',
                isValid && !readOnly && 'border-green-400 focus-visible:ring-green-400/30'
              )}
              readOnly={readOnly}
              disabled={readOnly}
            />
            {readOnly && (
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            )}
          </div>
        </FormControl>
        {hint && !error && <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
        <FormMessage className="text-xs" />
      </FormItem>
    )} />
  );
};

// Highlighted, modern opening stock field matching the packQuantity visual treatment
const CurrentStockField = ({
  form,
  unit,
  isNew,
  isPackActive,
  watchedPackSize,
  watchedPackQuantity,
  watchedPackUnit,
}: {
  form: StockSectionProps['form'];
  unit: string;
  isNew: boolean;
  isPackActive: boolean;
  watchedPackSize?: number | null;
  watchedPackQuantity?: number | null;
  watchedPackUnit?: string;
}) => {
  const readOnly = !isNew || isPackActive;
  const isDecimal = isDecimalUnit(unit);
  const watchedVal = useWatch({ control: form.control, name: 'quantity' });
  const numVal = Number(watchedVal) || 0;
  const error = form.formState.errors.quantity?.message;

  return (
    <FormField control={form.control} name="quantity" render={({ field }) => (
      <FormItem className="space-y-1.5">
        <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-primary" />
            <span>Current Stock</span>
          </span>
          {readOnly ? (
            isPackActive ? (
              <span className="text-[10px] text-primary font-normal normal-case tracking-normal">
                Auto from packs
              </span>
            ) : null
          ) : numVal > 0 ? (
            <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-primary/10 text-primary normal-case tracking-normal transition-colors">
              {numVal} {unit}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-300/50 dark:border-amber-800/50 flex items-center gap-1 normal-case tracking-normal transition-colors">
              <Info className="h-3 w-3 text-amber-600 dark:text-amber-400" /> 0 Stock
            </span>
          )}
        </FormLabel>

        <FormControl>
          <div className="relative">
            <Input
              type="number"
              min={0}
              step={isDecimal ? "0.01" : "1"}
              placeholder="0"
              {...field}
              value={field.value === 0 ? '' : (field.value ?? '')}
              onFocus={e => e.target.select()}
              onChange={e => {
                if (readOnly) return;
                let raw = e.target.value;
                if (/^0\d+/.test(raw)) {
                  raw = raw.replace(/^0+/, '');
                  e.target.value = raw;
                }
                const val = raw === '' ? 0 : Number(raw);
                field.onChange(val);
                if (val >= 0 && form.formState.errors.quantity) {
                  form.clearErrors('quantity');
                }
              }}
              readOnly={readOnly}
              disabled={readOnly}
              className={cn(
                'transition-colors h-11 text-base font-medium pr-10',
                readOnly && 'bg-muted/60 text-muted-foreground cursor-not-allowed',
                error && 'border-destructive focus-visible:ring-destructive/30',
                !readOnly && !error && numVal > 0 && 'border-primary/50 bg-primary/[0.03] focus-visible:border-primary',
                !readOnly && !error && numVal === 0 && 'border-amber-300/80 bg-amber-500/[0.03] focus-visible:border-amber-400'
              )}
            />
            {readOnly ? (
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            ) : (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none uppercase font-semibold">
                {unit}
              </span>
            )}
          </div>
        </FormControl>

        {!readOnly && (
          <div className="flex items-center gap-1 pt-0.5">
            <span className="text-[9px] text-muted-foreground font-medium mr-0.5">Quick:</span>
            {[0, 1, 5, 10, 25].map(q => (
              <button
                key={q}
                type="button"
                onClick={() => field.onChange(q)}
                className={cn(
                  "px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer",
                  numVal === q
                    ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                    : "bg-background text-muted-foreground hover:text-foreground border-border hover:bg-muted/50"
                )}
              >
                {q === 0 ? '0 (Out)' : q}
              </button>
            ))}
          </div>
        )}

        {!readOnly && numVal === 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-[10.5px]">
            <Info className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Starts with <strong>0 stock</strong>. Pick a quick count or type stock above.</span>
          </div>
        )}

        {isPackActive && (
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
            Locked: Auto-calculated as {watchedPackQuantity || 1} {watchedPackUnit || 'pack'}(s) × {watchedPackSize} = {form.watch('quantity') ?? 0} {unit}
          </p>
        )}

        {!isPackActive && !isNew && (
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
            Stock is managed through stock adjustments for existing products.
          </p>
        )}

        <FormMessage className="text-xs" />
      </FormItem>
    )} />
  );
};

export const StockSection = React.memo(({
  form, isNew, hasExpiry, hasVariants,
  totalBatchQuantity, totalVariantQuantity,
  isMultiSupplier, totalSupplierStockQuantity,
}: StockSectionProps) => {
  const watchedUnit = useWatch({ control: form.control, name: 'unit' }) || 'pcs';
  const watchedPackSize = useWatch({ control: form.control, name: 'packSize' });
  const watchedPackQuantity = useWatch({ control: form.control, name: 'packQuantity' });
  const watchedPackUnit = useWatch({ control: form.control, name: 'packUnit' }) || 'pack';
  const isPackActive = Boolean(watchedPackSize && Number(watchedPackSize) > 0);

  // Summary chip used in managed-stock modes
  const SummaryChip = ({ label, qty, accent = false }: { label: string; qty: number; accent?: boolean }) => {
    const safePSize = (watchedPackSize && Number(watchedPackSize) > 0) ? Number(watchedPackSize) : 1;
    const packEquivalent = isPackActive
      ? safeDiv(qty, safePSize, 2)
      : null;

    return (
      <div className={cn(
        'flex items-center justify-between rounded-2xl px-4 py-3 border',
        accent
          ? 'bg-primary/5 border-primary/20'
          : 'bg-muted/40 border-border'
      )}>
        <div className="flex items-center gap-2">
          <Package className={cn('h-4 w-4', accent ? 'text-primary' : 'text-muted-foreground')} />
          <span className={cn('text-sm', accent ? 'text-primary font-medium' : 'text-muted-foreground')}>{label}</span>
        </div>
        <div className="text-right">
          <span className={cn('text-lg font-bold tabular-nums', accent ? 'text-primary' : 'text-foreground')}>
            {qty} <span className="text-sm font-normal text-muted-foreground">{watchedUnit}</span>
          </span>
          {packEquivalent !== null && (
            <p className="text-[11px] text-muted-foreground font-normal">
              ≈ {formatQtyDisplay(packEquivalent)} {watchedPackUnit || 'pack'}(s)
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="px-4 py-4 space-y-4">
      {/* Header row: label + unit selector */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Stock & Unit</p>
        <div className="w-36">
          <FormField control={form.control} name="unit" render={({ field }) => (
            <FormItem>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="h-8 text-xs rounded-xl">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-80">
                  {UNIT_CATEGORIES.map(cat => (
                    <SelectGroup key={cat.name}>
                      <SelectLabel className="text-[10px] uppercase font-semibold text-muted-foreground px-2 py-1 tracking-wider bg-muted/30">
                        {cat.name}
                      </SelectLabel>
                      {cat.units.map(u => (
                        <SelectItem key={u.value} value={u.value} className="text-sm">
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
      </div>

      {hasExpiry ? (
        <div className="space-y-3">
          <SummaryChip label="Total stock (from batches)" qty={totalBatchQuantity} />
          <NumericField form={form} name="minimumStock" label="Low Stock Alert"
            unit={watchedUnit}
            hint={`Alert when stock ≤ this number of ${watchedUnit}`} />
        </div>

      ) : hasVariants ? (
        <div className="space-y-3">
          <SummaryChip label="Total stock (from variants)" qty={totalVariantQuantity} />
          <NumericField form={form} name="minimumStock" label="Low Stock Alert"
            unit={watchedUnit}
            hint="Alert when total variant stock hits this level." />
        </div>

      ) : isMultiSupplier ? (
        <div className="space-y-3">
          <SummaryChip label="Total stock (from all suppliers)" qty={totalSupplierStockQuantity ?? 0} accent />
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            Edit individual stock in the Suppliers step.
          </p>
          <NumericField form={form} name="minimumStock" label="Low Stock Alert"
            unit={watchedUnit}
            hint={`Alert when total stock ≤ this number of ${watchedUnit}`} />
        </div>

      ) : (
        // Normal single-supplier / no supplier mode
        <div className="grid grid-cols-2 gap-3">
          <CurrentStockField
            form={form}
            unit={watchedUnit}
            isNew={isNew}
            isPackActive={isPackActive}
            watchedPackSize={watchedPackSize ? Number(watchedPackSize) : null}
            watchedPackQuantity={watchedPackQuantity ? Number(watchedPackQuantity) : null}
            watchedPackUnit={watchedPackUnit}
          />
          <NumericField form={form} name="minimumStock" label="Low Stock Alert"
            unit={watchedUnit}
            hint={`Alert below this qty of ${watchedUnit}.`} />
        </div>
      )}
    </section>
  );
});

StockSection.displayName = 'StockSection';
