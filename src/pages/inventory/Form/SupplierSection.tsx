import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionProps } from './types';
import { Supplier } from '@/types';
import { Plus, X, Truck, Users, Split, ShieldCheck, Calculator, Package, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SupplierSearchList } from '@/components/SupplierSearchList';
import { generateSupplierInvoiceNumber } from '@/utils/numbering';
import { useLocations } from '@/contexts/GlobalProviders';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  calculateTotalSupplierStock,
  calculateWeightedAverageCost,
  getSafePackSize,
  safeCurrency,
  safeQty,
  safeMul,
  safeDiv,
  formatMoney,
  computePerUnitCost
} from '@/utils/unitUtils';

interface SupplierSectionProps extends SectionProps {
  isNew: boolean;
  suppliers: Supplier[];
  existingPurchases?: Array<{ invoiceNumber?: string | null; date?: string | null }>;
  onSupplierNew: (name?: string) => void;
}

const SUPPLIER_PALETTE = [
  { bg: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-700' },
  { bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700' },
  { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700' },
  { bg: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-300 dark:border-purple-700' },
  { bg: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-300 dark:border-rose-700' },
  { bg: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-700' },
];

/**
 * Isolated debounced Supplier Stock Card to guarantee 60fps typing without whole-form lag
 */
const SupplierStockCard = React.memo(({
  sid,
  idx,
  supplier,
  stockEntry,
  isPrimary,
  isMultiSupplier,
  isNew,
  hasPackPricing,
  packUnit,
  safePackSize,
  globalPackCost,
  baseUnit,
  locationOptions,
  currentLocId,
  colorScheme,
  onUpdateRecord,
  onSetPrimary,
  onRemove,
}: {
  sid: string;
  idx: number;
  supplier: Supplier;
  stockEntry: any;
  isPrimary: boolean;
  isMultiSupplier: boolean;
  isNew: boolean;
  hasPackPricing: boolean;
  packUnit: string;
  safePackSize: number;
  globalPackCost: number;
  baseUnit: string;
  locationOptions: any[];
  currentLocId: string;
  colorScheme: typeof SUPPLIER_PALETTE[0];
  onUpdateRecord: (sid: string, partial: any, currentLocId?: string) => void;
  onSetPrimary: (sid: string) => void;
  onRemove: (sid: string) => void;
}) => {
  // Mode: 'pack' vs 'base'
  const [entryMode, setEntryMode] = useState<'pack' | 'base'>(hasPackPricing ? 'pack' : 'base');

  // Local state for 60fps input responsiveness
  const currentStock = Number(stockEntry.baseQuantity ?? stockEntry.stock ?? 0);
  const currentCost = Number(stockEntry.cost ?? 0);
  const currentTotalCost = Number(stockEntry.totalPurchaseCost ?? (currentStock * currentCost));
  const currentPacks = Number(stockEntry.packQuantity ?? (currentStock > 0 ? safeQty(currentStock / safePackSize) : 0));
  const effectivePackCost = Number(stockEntry.packCost ?? (globalPackCost > 0 ? globalPackCost : (currentCost > 0 ? safeCurrency(currentCost * safePackSize) : 0)));

  const [localPacks, setLocalPacks] = useState<string>(currentPacks > 0 ? String(currentPacks) : '');
  const [localPackCost, setLocalPackCost] = useState<string>(effectivePackCost > 0 ? String(effectivePackCost) : '');
  const [localStock, setLocalStock] = useState<string>(currentStock > 0 ? String(currentStock) : '');
  const [localCost, setLocalCost] = useState<string>(currentCost > 0 ? String(currentCost) : '');

  // Keep local state in sync when external form values change (e.g. from Split Evenly or Pack Breakdown)
  useEffect(() => {
    setLocalStock(currentStock > 0 ? String(currentStock) : '');
    setLocalCost(currentCost > 0 ? String(currentCost) : '');
    setLocalPacks(currentPacks > 0 ? String(currentPacks) : '');
    setLocalPackCost(effectivePackCost > 0 ? String(effectivePackCost) : '');
  }, [currentStock, currentCost, currentPacks, effectivePackCost]);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const commitUpdatesDebounced = useCallback((updates: any) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onUpdateRecord(sid, updates, currentLocId);
    }, 300);
  }, [sid, currentLocId, onUpdateRecord]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // When user edits in Pack Mode
  const handlePackInputChange = (newPacksStr: string, newPackCostStr: string) => {
    setLocalPacks(newPacksStr);
    setLocalPackCost(newPackCostStr);

    const packsNum = newPacksStr === '' ? 0 : Number(newPacksStr);
    const packCostNum = newPackCostStr === '' ? 0 : Number(newPackCostStr);

    const computedBaseQty = safeQty(packsNum * safePackSize);
    const computedUnitCost = safePackSize > 0 ? safeCurrency(packCostNum / safePackSize) : 0;
    const computedTotalCost = safeCurrency(packsNum * packCostNum);

    setLocalStock(computedBaseQty > 0 ? String(computedBaseQty) : '');
    setLocalCost(computedUnitCost > 0 ? String(computedUnitCost) : '');

    commitUpdatesDebounced({
      stock: computedBaseQty,
      baseQuantity: computedBaseQty,
      cost: computedUnitCost,
      totalPurchaseCost: computedTotalCost,
      packQuantity: packsNum > 0 ? packsNum : null,
      packCost: packCostNum > 0 ? packCostNum : null,
      appliedPackSize: safePackSize,
      isPrimary,
    });
  };

  // When user edits in Base Mode
  const handleBaseInputChange = (newStockStr: string, newCostStr: string) => {
    setLocalStock(newStockStr);
    setLocalCost(newCostStr);

    const stockNum = newStockStr === '' ? 0 : Number(newStockStr);
    const costNum = newCostStr === '' ? 0 : Number(newCostStr);

    const computedPacks = safePackSize > 0 ? safeQty(stockNum / safePackSize) : 0;
    const computedPackCost = safeCurrency(costNum * safePackSize);
    const computedTotalCost = safeCurrency(stockNum * costNum);

    setLocalPacks(computedPacks > 0 ? String(computedPacks) : '');
    setLocalPackCost(computedPackCost > 0 ? String(computedPackCost) : '');

    commitUpdatesDebounced({
      stock: stockNum,
      baseQuantity: stockNum,
      cost: costNum,
      totalPurchaseCost: computedTotalCost,
      packQuantity: computedPacks > 0 ? computedPacks : null,
      packCost: computedPackCost > 0 ? computedPackCost : null,
      appliedPackSize: safePackSize,
      isPrimary,
    });
  };

  const parsedPacks = Number(localPacks) || 0;
  const parsedPackCost = Number(localPackCost) || 0;
  const parsedStock = Number(localStock) || 0;
  const parsedCost = Number(localCost) || 0;

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden transition-all">
      {/* Card Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-muted/30 border-b">
        <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-white font-bold text-[11px] shrink-0', colorScheme.bg)}>
          {supplier.name.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold truncate flex-1">{supplier.name}</span>

        {/* Primary Supplier Badge */}
        {isMultiSupplier && (
          <button
            type="button"
            onClick={() => onSetPrimary(sid)}
            className={cn(
              'text-[10px] px-2.5 py-0.5 rounded-full font-medium transition-colors border flex items-center gap-1',
              isPrimary
                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            )}
          >
            {isPrimary && <Check className="h-3 w-3" />}
            {isPrimary ? 'Primary' : 'Make Primary'}
          </button>
        )}

        {isNew && (
          <button
            type="button"
            className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => onRemove(sid)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Fields */}
      <div className="p-3.5 space-y-3">
        {/* Location Dropdown */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Location</Label>
          <Select
            value={currentLocId}
            onValueChange={(nextLocationId) => onUpdateRecord(sid, { locationId: nextLocationId }, currentLocId)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              {locationOptions.map((loc: any) => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Input Fields */}
        {hasPackPricing ? (
          /* Pack-mode: The user ONLY enters cartons/packs and pack cost. Pieces & unit cost are 100% automated & read-only */
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {packUnit || 'Pack'}s from supplier {isMultiSupplier && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={localPacks}
                  onChange={e => handlePackInputChange(e.target.value, localPackCost)}
                  onBlur={() => onUpdateRecord(sid, {
                    stock: safeQty((Number(localPacks) || 0) * safePackSize),
                    baseQuantity: safeQty((Number(localPacks) || 0) * safePackSize),
                    cost: safePackSize > 0 ? safeCurrency((Number(localPackCost) || 0) / safePackSize) : 0,
                    totalPurchaseCost: safeCurrency((Number(localPacks) || 0) * (Number(localPackCost) || 0)),
                    packQuantity: Number(localPacks) || null,
                    packCost: Number(localPackCost) || null,
                    appliedPackSize: safePackSize,
                    isPrimary,
                  }, currentLocId)}
                  className="h-10 text-sm font-medium"
                  readOnly={!isNew || !isMultiSupplier}
                  disabled={!isNew || !isMultiSupplier}
                />
                <p className="text-[10px] text-muted-foreground">
                  Number of {packUnit || 'pack'}(s)
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cost per {packUnit || 'pack'} (Rs.)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={localPackCost}
                  onChange={e => handlePackInputChange(localPacks, e.target.value)}
                  onBlur={() => onUpdateRecord(sid, {
                    stock: safeQty((Number(localPacks) || 0) * safePackSize),
                    baseQuantity: safeQty((Number(localPacks) || 0) * safePackSize),
                    cost: safePackSize > 0 ? safeCurrency((Number(localPackCost) || 0) / safePackSize) : 0,
                    totalPurchaseCost: safeCurrency((Number(localPacks) || 0) * (Number(localPackCost) || 0)),
                    packQuantity: Number(localPacks) || null,
                    packCost: Number(localPackCost) || null,
                    appliedPackSize: safePackSize,
                    isPrimary,
                  }, currentLocId)}
                  className="h-10 text-sm font-medium"
                  readOnly={!isNew}
                  disabled={!isNew}
                />
                <p className="text-[10px] text-muted-foreground">
                  Wholesale pack price
                </p>
              </div>
            </div>

            {/* Auto-calculated piece breakdown: 100% automated, never manually typed */}
            <div className="flex items-center justify-between rounded-xl bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
              <span className="text-primary font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Auto-Calculated:
              </span>
              <span className="font-semibold text-foreground tabular-nums">
                {safeQty(safeMul(parsedPacks, safePackSize))} {baseUnit} @ Rs. {safePackSize > 0 ? formatMoney(safeDiv(parsedPackCost, safePackSize, 2)) : '0.00'} / {baseUnit}
                {parsedPacks > 0 && parsedPackCost > 0 && (
                  <span className="text-[10px] text-muted-foreground font-normal ml-1.5">
                    (Total Rs. {formatMoney(safeMul(parsedPacks, parsedPackCost))})
                  </span>
                )}
              </span>
            </div>
          </div>
        ) : (
          /* Standard Base-mode inputs (ONLY when Pack Pricing toggle is OFF) */
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isMultiSupplier ? `Stock (${baseUnit})` : `Supplier Stock (${baseUnit})`}
                  {isMultiSupplier && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={localStock}
                  onChange={e => handleBaseInputChange(e.target.value, localCost)}
                  onBlur={() => onUpdateRecord(sid, {
                    stock: Number(localStock) || 0,
                    baseQuantity: Number(localStock) || 0,
                    cost: Number(localCost) || 0,
                    totalPurchaseCost: safeCurrency((Number(localStock) || 0) * (Number(localCost) || 0)),
                    isPrimary,
                  }, currentLocId)}
                  className="h-10 text-sm font-medium"
                  readOnly={!isNew || !isMultiSupplier}
                  disabled={!isNew || !isMultiSupplier}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cost / {baseUnit} (Rs.)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={localCost}
                  onChange={e => handleBaseInputChange(localStock, e.target.value)}
                  onBlur={() => onUpdateRecord(sid, {
                    stock: Number(localStock) || 0,
                    baseQuantity: Number(localStock) || 0,
                    cost: Number(localCost) || 0,
                    totalPurchaseCost: safeCurrency((Number(localStock) || 0) * (Number(localCost) || 0)),
                    isPrimary,
                  }, currentLocId)}
                  className="h-10 text-sm font-medium"
                  readOnly={!isNew}
                  disabled={!isNew}
                />
              </div>
            </div>
          </div>
        )}

        {/* Invoice & Reorder */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Invoice <span className="font-normal normal-case opacity-50">(auto)</span>
            </Label>
            <Input
              type="text"
              placeholder="Auto invoice"
              value={stockEntry.supplierSku ?? ''}
              onChange={e => onUpdateRecord(sid, { supplierSku: e.target.value }, currentLocId)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reorder <span className="font-normal normal-case opacity-50">(opt.)</span>
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 10"
              value={stockEntry.reorderLevel == null ? '' : stockEntry.reorderLevel}
              onChange={e => onUpdateRecord(sid, { reorderLevel: e.target.value === '' ? undefined : Number(e.target.value) }, currentLocId)}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
});

SupplierStockCard.displayName = 'SupplierStockCard';

export const SupplierSection = React.memo(({ form, isNew, suppliers, existingPurchases = [], onSupplierNew }: SupplierSectionProps) => {
  const selectedSupplierIds: string[] = useWatch({ control: form.control, name: 'supplierIds' }) ?? [];
  const supplierStocks: any[] = useWatch({ control: form.control, name: 'supplierStocks' }) ?? [];
  const baseUnit = useWatch({ control: form.control, name: 'unit' }) || 'pcs';
  const packSize = useWatch({ control: form.control, name: 'packSize' });
  const packUnit = useWatch({ control: form.control, name: 'packUnit' }) || 'pack';

  const { items: locations } = useLocations();
  const isMultiSupplier = selectedSupplierIds.length >= 2;
  const locationOptions = locations.length > 0 ? locations : [{ id: 'loc-default', name: 'Main Location' }];

  const safePackSize = useMemo(() => getSafePackSize(packSize), [packSize]);
  const hasPackPricing = Boolean(packSize && Number(packSize) > 0);
  const watchedPackCost = useWatch({ control: form.control, name: 'packPurchaseCost' });
  const globalPackCost = Number(watchedPackCost ?? 0);

  // Aggregations
  const totalStockPieces = useMemo(() => calculateTotalSupplierStock(supplierStocks), [supplierStocks]);
  const totalPacks = useMemo(() => {
    return hasPackPricing ? safeQty(totalStockPieces / safePackSize) : 0;
  }, [totalStockPieces, safePackSize, hasPackPricing]);
  const weightedCost = useMemo(() => calculateWeightedAverageCost(supplierStocks), [supplierStocks]);

  // Primary supplier ID
  const primarySupplierId = useMemo(() => {
    const explicitlyPrimary = supplierStocks.find((ss: any) => ss.isPrimary && selectedSupplierIds.includes(ss.supplierId));
    if (explicitlyPrimary) return explicitlyPrimary.supplierId;
    return selectedSupplierIds[0] || '';
  }, [supplierStocks, selectedSupplierIds]);

  // Set primary supplier
  const handleSetPrimary = useCallback((sid: string) => {
    const currentStocks: any[] = form.getValues('supplierStocks') ?? [];
    const updated = currentStocks.map((ss: any) => ({
      ...ss,
      isPrimary: ss.supplierId === sid,
    }));
    form.setValue('supplierStocks', updated, { shouldDirty: true });
  }, [form]);

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const addSupplier = useCallback((sid: string) => {
    const next = [...selectedSupplierIds, sid];
    form.setValue('supplierIds', next, { shouldDirty: true });

    const currentStocks: any[] = form.getValues('supplierStocks') ?? [];
    const currentPurchaseRate = Number(form.getValues('purchaseRate') ?? 0);
    const defaultPackCost = Number(form.getValues('packPurchaseCost') ?? 0);
    const isFirst = next.length === 1;
    const defaultPackQty = isFirst ? (Number(form.getValues('packQuantity') ?? 0)) : 0;
    const globalStock = isFirst
      ? (form.getValues('quantity') ?? 0)
      : (hasPackPricing && defaultPackQty > 0 ? safeQty(defaultPackQty * safePackSize) : 0);
    const defaultLocationId = 'loc-default';

    const unitCost = hasPackPricing && defaultPackCost > 0 && safePackSize > 0
      ? safeCurrency(defaultPackCost / safePackSize)
      : (currentPurchaseRate > 0 ? currentPurchaseRate : 0);

    if (!currentStocks.some((ss: any) => ss.supplierId === sid && (ss.locationId || defaultLocationId) === defaultLocationId)) {
      form.setValue('supplierStocks', [
        ...currentStocks,
        {
          supplierId: sid,
          locationId: defaultLocationId,
          cost: unitCost,
          stock: globalStock,
          baseQuantity: globalStock,
          packQuantity: defaultPackQty > 0 ? defaultPackQty : null,
          packCost: defaultPackCost > 0 ? defaultPackCost : null,
          appliedPackSize: safePackSize,
          totalPurchaseCost: hasPackPricing && defaultPackQty > 0 && defaultPackCost > 0
            ? safeCurrency(defaultPackQty * defaultPackCost)
            : safeCurrency(globalStock * unitCost),
          isPrimary: isFirst,
          supplierSku: '',
          reorderLevel: undefined,
          notes: ''
        },
      ], { shouldDirty: true });
    }
  }, [selectedSupplierIds, form, hasPackPricing, safePackSize]);

  const removeSupplier = useCallback((sid: string) => {
    const next = selectedSupplierIds.filter(s => s !== sid);
    form.setValue('supplierIds', next, { shouldDirty: true });
    const currentStocks: any[] = form.getValues('supplierStocks') ?? [];
    const remaining = currentStocks.filter((ss: any) => ss.supplierId !== sid);

    // If we removed the primary supplier, make the first remaining one primary
    if (sid === primarySupplierId && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }

    form.setValue('supplierStocks', remaining, { shouldDirty: true });
  }, [selectedSupplierIds, form, primarySupplierId]);

  const updateSupplierStockRecord = useCallback((supplierId: string, partial: any, currentLocationId = 'loc-default') => {
    const currentStocks: any[] = form.getValues('supplierStocks') ?? [];
    const isPrimarySupplier = partial.isPrimary ?? (supplierId === primarySupplierId || currentStocks.length === 1);

    // If packCost was edited and this is primary or single supplier, keep packPurchaseCost in sync with pack breakdown
    if (hasPackPricing && partial.packCost !== undefined && isPrimarySupplier) {
      const pCost = Number(partial.packCost) || null;
      form.setValue('packPurchaseCost', pCost, { shouldDirty: true });
      if (pCost && safePackSize > 0) {
        form.setValue('purchaseRate', safeCurrency(pCost / safePackSize), { shouldDirty: true, shouldValidate: true });
      }
    }

    form.setValue('supplierStocks', currentStocks.map((ss: any) =>
      ss.supplierId === supplierId && (ss.locationId || 'loc-default') === currentLocationId
        ? { ...ss, ...partial }
        : ss
    ), { shouldDirty: true });
  }, [form, primarySupplierId, hasPackPricing, safePackSize]);

  // ─── Quick Stock Distribution Actions ──────────────────────────────────────────

  // Split Evenly among all selected suppliers
  const handleSplitEvenly = useCallback(() => {
    if (selectedSupplierIds.length === 0 || totalStockPieces <= 0) return;
    const currentStocks: any[] = form.getValues('supplierStocks') ?? [];
    const count = selectedSupplierIds.length;

    if (hasPackPricing) {
      // Split by integer packs first; remainder goes to primary supplier
      const totalPacksInt = Math.floor(totalStockPieces / safePackSize);
      const basePacks = Math.floor(totalPacksInt / count);
      const remainderPacks = totalPacksInt % count;

      const updated = currentStocks.map((ss: any) => {
        if (!selectedSupplierIds.includes(ss.supplierId)) return ss;
        const isThisPrimary = ss.supplierId === primarySupplierId;
        const assignedPacks = basePacks + (isThisPrimary ? remainderPacks : 0);
        const assignedBaseQty = safeQty(assignedPacks * safePackSize);
        const unitCost = Number(ss.cost || 0);
        const totalCost = safeCurrency(assignedBaseQty * unitCost);

        return {
          ...ss,
          stock: assignedBaseQty,
          baseQuantity: assignedBaseQty,
          packQuantity: assignedPacks,
          packCost: safeCurrency(unitCost * safePackSize),
          totalPurchaseCost: totalCost,
          appliedPackSize: safePackSize,
          isPrimary: isThisPrimary,
        };
      });

      form.setValue('supplierStocks', updated, { shouldDirty: true });
    } else {
      // Split base units; remainder goes to primary supplier
      const baseQty = Math.floor(totalStockPieces / count);
      const remainder = totalStockPieces % count;

      const updated = currentStocks.map((ss: any) => {
        if (!selectedSupplierIds.includes(ss.supplierId)) return ss;
        const isThisPrimary = ss.supplierId === primarySupplierId;
        const assignedBaseQty = safeQty(baseQty + (isThisPrimary ? remainder : 0));
        const unitCost = Number(ss.cost || 0);
        const totalCost = safeCurrency(assignedBaseQty * unitCost);

        return {
          ...ss,
          stock: assignedBaseQty,
          baseQuantity: assignedBaseQty,
          totalPurchaseCost: totalCost,
          isPrimary: isThisPrimary,
        };
      });

      form.setValue('supplierStocks', updated, { shouldDirty: true });
    }
  }, [selectedSupplierIds, totalStockPieces, form, hasPackPricing, safePackSize, primarySupplierId]);

  // All to Primary
  const handleAllToPrimary = useCallback(() => {
    if (selectedSupplierIds.length === 0 || totalStockPieces <= 0) return;
    const currentStocks: any[] = form.getValues('supplierStocks') ?? [];

    const updated = currentStocks.map((ss: any) => {
      if (!selectedSupplierIds.includes(ss.supplierId)) return ss;
      const isThisPrimary = ss.supplierId === primarySupplierId;
      const assignedBaseQty = isThisPrimary ? totalStockPieces : 0;
      const assignedPacks = isThisPrimary && hasPackPricing ? safeQty(totalStockPieces / safePackSize) : 0;
      const unitCost = Number(ss.cost || 0);
      const totalCost = safeCurrency(assignedBaseQty * unitCost);

      return {
        ...ss,
        stock: assignedBaseQty,
        baseQuantity: assignedBaseQty,
        packQuantity: assignedPacks > 0 ? assignedPacks : null,
        totalPurchaseCost: totalCost,
        appliedPackSize: safePackSize,
        isPrimary: isThisPrimary,
      };
    });

    form.setValue('supplierStocks', updated, { shouldDirty: true });
  }, [selectedSupplierIds, totalStockPieces, form, primarySupplierId, hasPackPricing, safePackSize]);

  // Auto invoice numbering
  useEffect(() => {
    const currentStocks: any[] = form.getValues('supplierStocks') ?? [];
    let changed = false;
    const nextStocks = currentStocks.map((stock: any) => {
      if (!selectedSupplierIds.includes(stock.supplierId)) return stock;
      const supplier = suppliers.find(candidate => candidate.id === stock.supplierId);
      const currentValue = typeof stock.supplierSku === 'string' ? stock.supplierSku.trim() : '';
      if (currentValue) return stock;

      const generatedInvoice = generateSupplierInvoiceNumber(existingPurchases, supplier?.name, new Date());
      if (generatedInvoice !== currentValue) {
        changed = true;
        return { ...stock, supplierSku: generatedInvoice };
      }
      return stock;
    });

    if (changed) {
      form.setValue('supplierStocks', nextStocks, { shouldDirty: true });
    }
  }, [existingPurchases, form, selectedSupplierIds, suppliers]);

  return (
    <section id="supplier-section" className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Suppliers</p>
          {selectedSupplierIds.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{selectedSupplierIds.length}</Badge>
          )}
        </div>
        {isNew && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5 text-primary rounded-xl hover:bg-primary/10"
            onClick={() => onSupplierNew()}
          >
            <Plus className="h-3.5 w-3.5" /> New Supplier
          </Button>
        )}
      </div>

      {suppliers.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-muted rounded-2xl bg-muted/10 cursor-pointer active:bg-muted/20 transition-colors"
          onClick={() => onSupplierNew()}
        >
          <Truck className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No suppliers yet</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Tap to create your first</p>
        </div>
      ) : (
        <>
          {isNew && (
            <SupplierSearchList
              suppliers={suppliers}
              selectedSupplierIds={selectedSupplierIds}
              onSelect={addSupplier}
              onAddNew={onSupplierNew}
              placeholder="Type to filter suppliers..."
              emptyMessage="No more suppliers to add."
              label="Suppliers"
              maxVisible={8}
            />
          )}

          {/* ── Shared Stock Distribution Toolbar (Multi-Supplier) ────────────────────── */}
          {isMultiSupplier && (
            <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-950 dark:text-blue-200">
                  <Split className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span>Shared Stock Distribution</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSplitEvenly}
                    disabled={totalStockPieces <= 0}
                    className="h-7 text-[11px] px-2 rounded-lg gap-1 border-blue-300 dark:border-blue-800 bg-background/80 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                  >
                    <Split className="h-3 w-3" /> Split Evenly
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAllToPrimary}
                    disabled={totalStockPieces <= 0}
                    className="h-7 text-[11px] px-2 rounded-lg gap-1 border-blue-300 dark:border-blue-800 bg-background/80 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                  >
                    <ShieldCheck className="h-3 w-3" /> All to Primary
                  </Button>
                </div>
              </div>

              {/* Total stock summary badge */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
                <span>Total Pool:</span>
                <span className="font-bold text-foreground tabular-nums">
                  {hasPackPricing ? `${totalPacks} ${packUnit}(s) · ` : ''}{totalStockPieces} {baseUnit}
                  <span className="text-[11px] font-normal text-muted-foreground ml-1.5">
                    (Avg: Rs. {formatMoney(weightedCost)} / {baseUnit})
                  </span>
                </span>
              </div>

              {/* Visual Allocation Breakdown Bar */}
              <div className="space-y-1.5">
                <div className="h-2.5 w-full rounded-full bg-muted/80 overflow-hidden flex shadow-inner">
                  {selectedSupplierIds.map((sid, idx) => {
                    const entry = supplierStocks.find((ss: any) => ss.supplierId === sid);
                    const stock = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
                    const pct = totalStockPieces > 0 ? (stock / totalStockPieces) * 100 : 0;
                    const color = SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length];
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={sid}
                        style={{ width: `${pct}%` }}
                        className={cn('h-full transition-all duration-300', color.bg)}
                        title={`${suppliers.find(s => s.id === sid)?.name ?? 'Supplier'}: ${stock} ${baseUnit} (${pct.toFixed(0)}%)`}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground pt-0.5">
                  {selectedSupplierIds.map((sid, idx) => {
                    const supplier = suppliers.find(s => s.id === sid);
                    const entry = supplierStocks.find((ss: any) => ss.supplierId === sid);
                    const stock = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
                    const pct = totalStockPieces > 0 ? Math.round((stock / totalStockPieces) * 100) : 0;
                    const color = SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length];
                    const isPrim = sid === primarySupplierId;

                    return (
                      <div key={sid} className="flex items-center gap-1">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', color.bg)} />
                        <span className="truncate max-w-[120px] font-medium text-foreground">
                          {supplier?.name ?? 'Supplier'}
                        </span>
                        {isPrim && <span className="text-[9px] text-primary font-bold">(Primary)</span>}
                        <span>{stock} {baseUnit} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Per-supplier cards ────────────────────────────────────────── */}
          {selectedSupplierIds.length > 0 && (
            <div className="space-y-3">
              {selectedSupplierIds.map((sid, idx) => {
                const supplier = suppliers.find(s => s.id === sid);
                if (!supplier) return null;
                const stockEntry = supplierStocks.find((ss: any) => ss.supplierId === sid)
                  ?? { supplierId: sid, locationId: 'loc-default', cost: 0, stock: 0, supplierSku: '', reorderLevel: undefined };

                const currentLocId = stockEntry.locationId || 'loc-default';
                const isPrimary = sid === primarySupplierId;
                const colorScheme = SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length];

                return (
                  <SupplierStockCard
                    key={`${sid}-${currentLocId}`}
                    sid={sid}
                    idx={idx}
                    supplier={supplier}
                    stockEntry={stockEntry}
                    isPrimary={isPrimary}
                    isMultiSupplier={isMultiSupplier}
                    isNew={isNew}
                    hasPackPricing={hasPackPricing}
                    packUnit={packUnit}
                    safePackSize={safePackSize}
                    globalPackCost={globalPackCost}
                    baseUnit={baseUnit}
                    locationOptions={locationOptions}
                    currentLocId={currentLocId}
                    colorScheme={colorScheme}
                    onUpdateRecord={updateSupplierStockRecord}
                    onSetPrimary={handleSetPrimary}
                    onRemove={removeSupplier}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
});

SupplierSection.displayName = 'SupplierSection';

