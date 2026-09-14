import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useWatch, useForm } from 'react-hook-form';
import { useLocation, useParams } from 'wouter';
import { v4 as uuidv4 } from 'uuid';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInventory, useSuppliers, useProductBatches, usePurchases } from '@/contexts/GlobalProviders';
import { useFeature } from '@/hooks/useFeature';
import { toast } from 'sonner';
import { getBatchStatus } from '@/components/BatchFormDialog';
import { generateSupplierInvoiceNumber, generateBatchNumber } from '@/utils/numbering';
import { useStorageProvider } from '@/storage/StorageContext';
import { createPurchasesForNewItem } from '@/services/purchaseHelpers';
import { PaymentMethod, PaymentSplitEntry, ProductUnit, ProductBatch, BatchFormData, PurchasePaymentStatus } from '@/types';
import { useApp } from '@/contexts/AppContext';
import { productSchema, ProductFormValues } from '../types';
import {
    calculateTotalSupplierStock,
    calculateWeightedAverageCost,
    getSafePackSize,
    safeCurrency,
    safeQty,
    safeMul,
    safeDiv,
} from '@/utils/unitUtils';


export type SupplierPurchaseDraft = {
    invoiceNumber: string;
    purchaseDate: string;
    referenceNumber: string;
    discountMode: 'amount' | 'percent';
    discountAmount: string;
    discountPercent: string;
    taxMode: 'amount' | 'percent';
    taxAmount: string;
    taxPercent: string;
    paymentMethod: PaymentMethod | string;
    paymentStatus: PurchasePaymentStatus;
    paidAmount: string;
    bankAccountId?: string | null;
    splitPayments?: PaymentSplitEntry[];
    notes: string;
};

export function useInventoryForm(
    supplierIdFromQuery: string | null,
    returnTo: string | null,
) {
    const isBatchesEnabled = useFeature('inventory', 'batches');
    const isExpiryEnabled = useFeature('inventory', 'expiry');
    const isVariantsEnabled = useFeature('inventory', 'variants');

    const { id } = useParams();
    const { items: allInventory, add, update } = useInventory();
    const { items: suppliers } = useSuppliers();
    const { items: allBatches, add: addBatch, update: updateBatch, remove: removeBatch, refresh: refreshBatches } = useProductBatches();
    const { items: purchases, refresh: refreshPurchases } = usePurchases();
    const { settings } = useApp();
    const storage = useStorageProvider();
    const [, setLocation] = useLocation();

    const isNew = !id || id === 'new';

    const existingProduct = useMemo(
        () => (!isNew ? allInventory.find(i => i.id === id) ?? null : null),
        [allInventory, id, isNew]
    );

    // Local state
    const [localBatches, setLocalBatches] = useState<ProductBatch[]>([]);
    const [batchDialogOpen, setBatchDialogOpen] = useState(false);
    const [editingBatch, setEditingBatch] = useState<ProductBatch | null>(null);
    const [supplierAutoSelected, setSupplierAutoSelected] = useState(false);
    const [supplierPresetName, setSupplierPresetName] = useState('');
    const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
    const [supplierPurchaseDrafts, setSupplierPurchaseDrafts] = useState<Record<string, SupplierPurchaseDraft>>({});

    // Load existing batches for editing
    useEffect(() => {
        if (!isNew && existingProduct) {
            setLocalBatches(allBatches.filter(b => b.productId === existingProduct.id));
        }
    }, [allBatches, existingProduct, isNew]);

    // Form setup
    const form = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        mode: 'onTouched',
        reValidateMode: 'onChange',
        defaultValues: existingProduct ? {
            ...existingProduct,
            supplierIds: existingProduct.supplierIds ?? (existingProduct.supplierId ? [existingProduct.supplierId] : []),
            supplierStocks: existingProduct.supplierStocks?.length
                ? existingProduct.supplierStocks.map((stock: any) => ({
                    ...stock,
                    locationId: stock.locationId || 'loc-default',
                }))
                : existingProduct.supplierId
                    ? [{
                        supplierId: existingProduct.supplierId,
                        locationId: 'loc-default',
                        cost: existingProduct.purchaseRate || 0,
                        stock: existingProduct.quantity || 0,
                        supplierSku: '',
                        reorderLevel: existingProduct.minimumStock,
                        notes: '',
                    }]
                    : [],
            hasExpiry: existingProduct.hasExpiry ?? false,
            hasVariants: existingProduct.hasVariants ?? false,
            variants: existingProduct.variants ?? [],
            brand: existingProduct.brand ?? '',
            notes: existingProduct.notes ?? '',
            imageBase64: existingProduct.imageBase64 ?? '',
            isPackPricingEnabled: Boolean(existingProduct.packSize && existingProduct.packSize > 0),
            packSize: existingProduct.packSize ?? null,
            packUnit: existingProduct.packUnit ?? '',
            packPurchaseCost: existingProduct.packPurchaseCost ?? null,
            packQuantity: existingProduct.packQuantity ?? null,
            // Product capabilities — backward compat: existing products default to purchasable + POS-enabled
            purchasable: existingProduct.purchasable ?? true,
            availableForPOS: existingProduct.availableForPOS ?? true,
            consumable: existingProduct.consumable ?? false,
            productionOutput: existingProduct.productionOutput ?? false,
            availableInMenu: existingProduct.availableInMenu ?? false,
        } : {
            name: '', barcode: '', category: '', brand: '',
            supplierIds: supplierIdFromQuery ? [supplierIdFromQuery] : [],
            supplierStocks: supplierIdFromQuery
                ? [{ supplierId: supplierIdFromQuery, locationId: 'loc-default', cost: 0, stock: 0, supplierSku: '', reorderLevel: undefined, notes: '' }]
                : [],
            unit: 'pcs',
            isPackPricingEnabled: false,
            packSize: null,
            packUnit: '',
            packPurchaseCost: null,
            packQuantity: null,
            quantity: 0,
            minimumStock: 5,
            purchaseRate: 0,
            sellingRate: 0,
            hasExpiry: false,
            hasVariants: false,
            variants: [],
            notes: '',
            imageBase64: '',
            // New products default to purchasable + POS-enabled, others off
            purchasable: true,
            availableForPOS: true,
            consumable: false,
            productionOutput: false,
            availableInMenu: false,
        },
    });

    // Watches
    const rawHasExpiry = useWatch({ control: form.control, name: 'hasExpiry' });
    const rawHasVariants = useWatch({ control: form.control, name: 'hasVariants' });
    const watchedVariants = useWatch({ control: form.control, name: 'variants' }) || [];
    const purchaseRateWatch = useWatch({ control: form.control, name: 'purchaseRate' });
    const sellingRateWatch = useWatch({ control: form.control, name: 'sellingRate' });
    const quantityWatch = useWatch({ control: form.control, name: 'quantity' });
    const minimumStockWatch = useWatch({ control: form.control, name: 'minimumStock' });
    const watchedSupplierIds = useWatch({ control: form.control, name: 'supplierIds' }) ?? [];
    const watchedSupplierStocks = useWatch({ control: form.control, name: 'supplierStocks' }) ?? [];

    const hasExpiry = (isExpiryEnabled && isBatchesEnabled) ? (rawHasExpiry ?? false) : false;
    const hasVariants = isVariantsEnabled ? (rawHasVariants ?? false) : false;

    // Auto-select supplier from query param
    useEffect(() => {
        if (supplierIdFromQuery && isNew && !supplierAutoSelected) {
            const currentIds = form.getValues('supplierIds') ?? [];
            if (!currentIds.includes(supplierIdFromQuery)) {
                const stocks = form.getValues('supplierStocks') ?? [];
                const rate = Number(form.getValues('purchaseRate') ?? 0);
                const newStocks = [
                    ...stocks,
                    { supplierId: supplierIdFromQuery, locationId: 'loc-default', cost: rate > 0 ? rate : 0, stock: 0, supplierSku: '', reorderLevel: undefined, notes: '' }
                ];
                form.setValue('supplierIds', [...currentIds, supplierIdFromQuery], { shouldDirty: true });
                form.setValue('supplierStocks', newStocks, { shouldDirty: true });
                setSupplierAutoSelected(true);
            }
        }
    }, [supplierIdFromQuery, isNew, form, supplierAutoSelected]);

    const decodedReturnTo = useMemo(() => {
        if (!returnTo) return '';
        try { return decodeURIComponent(returnTo); } catch { return returnTo; }
    }, [returnTo]);

    const isMultiSupplier = !hasExpiry && !hasVariants && watchedSupplierIds.length >= 2;

    const purchaseSupplierIds = useMemo(() => {
        const ids = new Set<string>();
        if (watchedSupplierIds && watchedSupplierIds.length > 0) {
            watchedSupplierIds.forEach(id => { if (id) ids.add(id); });
        }
        if (hasExpiry && localBatches && localBatches.length > 0) {
            localBatches.forEach(b => { if (b.supplierId) ids.add(b.supplierId); });
        }
        if (supplierIdFromQuery) {
            ids.add(supplierIdFromQuery);
        }
        return Array.from(ids);
    }, [watchedSupplierIds, hasExpiry, localBatches, supplierIdFromQuery]);

    const showPurchaseCreationSection = isNew && purchaseSupplierIds.length > 0;

    const packSizeWatch = useWatch({ control: form.control, name: 'packSize' });

    const totalSupplierStockQuantity = useMemo(() => {
        if (!isMultiSupplier) return 0;
        return calculateTotalSupplierStock(watchedSupplierStocks);
    }, [isMultiSupplier, watchedSupplierStocks]);

    const supplierLookup = useMemo(() => {
        const map = new Map(suppliers.map(s => [s.id, s]));
        return map;
    }, [suppliers]);

    const existingCategories = useMemo(() => {
        const cats = new Set(['Beverages', 'Snacks', 'Groceries', 'Bakery', 'Electronics', 'Services']);
        allInventory.forEach(item => { if (item.category) cats.add(item.category.trim()); });
        return Array.from(cats).sort().slice(0, 12);
    }, [allInventory]);

    const existingBrands = useMemo(() => {
        const brands = new Set<string>();
        allInventory.forEach(item => { if (item.brand?.trim()) brands.add(item.brand.trim()); });
        return Array.from(brands).sort();
    }, [allInventory]);

    const existingProductNameLookup = useMemo(() => {
        const lookup = new Set<string>();
        allInventory.forEach(item => {
            if (!item.deletedAt && item.name) lookup.add(item.name.trim().toLowerCase());
        });
        return lookup;
    }, [allInventory]);

    const barcodeLookup = useMemo(() => {
        const map = new Map<string, typeof allInventory[number]>();
        allInventory.forEach(item => {
            const barcode = item.barcode?.trim().toLowerCase();
            if (barcode) map.set(barcode, item);
        });
        return map;
    }, [allInventory]);

    const existingBarcodes = useMemo(
        () => allInventory.map(item => item.barcode ?? ''),
        [allInventory],
    );

    const totalBatchQuantity = useMemo(() => localBatches.reduce((sum, b) => sum + b.quantity, 0), [localBatches]);
    const totalVariantQuantity = useMemo(() => watchedVariants.reduce((sum, v) => sum + (v.quantity || 0), 0), [watchedVariants]);

    const averagePurchaseRate = useMemo(() => {
        if (!hasExpiry) return purchaseRateWatch || 0;
        if (localBatches.length === 0) return 0;
        const totalQty = localBatches.reduce((sum, b) => sum + b.quantity, 0);
        if (totalQty > 0) {
            const totalCost = localBatches.reduce((sum, b) => sum + safeMul(Number(b.purchaseRate || 0), Number(b.quantity || 0), 6), 0);
            return safeDiv(totalCost, totalQty, 6);
        }
        // If all batches have 0 stock, average the non-zero purchase rates
        const nonZeroRates = localBatches.map(b => Number(b.purchaseRate || 0)).filter(r => r > 0);
        if (nonZeroRates.length > 0) {
            return safeDiv(nonZeroRates.reduce((a, b) => a + b, 0), nonZeroRates.length, 6);
        }
        return 0;
    }, [hasExpiry, localBatches, purchaseRateWatch]);

    // Sync purchaseRate from supplierStocks
    useEffect(() => {
        if (hasExpiry || watchedSupplierIds.length === 0) return;
        const stocks = watchedSupplierStocks as any[];
        let computed = 0;
        if (watchedSupplierIds.length === 1) {
            computed = Number(stocks[0]?.cost) || 0;
        } else {
            computed = calculateWeightedAverageCost(stocks);
        }
        const current = form.getValues('purchaseRate');
        if (Math.abs(computed - current) > 0.001) form.setValue('purchaseRate', computed, { shouldDirty: false });
    }, [watchedSupplierIds, watchedSupplierStocks, hasExpiry, form]);

    // Quantity & Pack sync
    useEffect(() => {
        if (hasExpiry) form.setValue('quantity', totalBatchQuantity, { shouldDirty: true });
        else if (hasVariants) form.setValue('quantity', totalVariantQuantity, { shouldDirty: true });
        else if (isMultiSupplier) {
            form.setValue('quantity', totalSupplierStockQuantity, { shouldDirty: true });
            if (packSizeWatch && Number(packSizeWatch) > 0) {
                const safeSize = getSafePackSize(packSizeWatch);
                const computedPacks = safeQty(totalSupplierStockQuantity / safeSize);
                if (form.getValues('packQuantity') !== computedPacks) {
                    form.setValue('packQuantity', computedPacks, { shouldDirty: false });
                }
            }
        }
    }, [hasExpiry, hasVariants, isMultiSupplier, totalBatchQuantity, totalVariantQuantity, totalSupplierStockQuantity, packSizeWatch, form]);


    // Purchase drafts
    const supplierPurchaseDraftsRef = useRef(supplierPurchaseDrafts);
    supplierPurchaseDraftsRef.current = supplierPurchaseDrafts;
    const purchaseSupplierIdsRef = useRef(purchaseSupplierIds);
    purchaseSupplierIdsRef.current = purchaseSupplierIds;

    useEffect(() => {
        if (!showPurchaseCreationSection) return;
        setSupplierPurchaseDrafts(prev => {
            const next = { ...prev };
            const validIds = new Set(purchaseSupplierIds);
            Object.keys(next).forEach(id => { if (!validIds.has(id)) delete next[id]; });
            purchaseSupplierIds.forEach(supplierId => {
                const existing = next[supplierId];
                const supplier = supplierLookup.get(supplierId);
                const defaultDate = new Date().toLocaleDateString('en-CA');
                if (!existing || !existing.invoiceNumber?.trim()) {
                    next[supplierId] = {
                        invoiceNumber: generateSupplierInvoiceNumber(purchases, supplier?.name, defaultDate),
                        purchaseDate: existing?.purchaseDate || defaultDate,
                        referenceNumber: existing?.referenceNumber ?? '',
                        discountMode: existing?.discountMode ?? 'amount',
                        discountAmount: existing?.discountAmount ?? '0',
                        discountPercent: existing?.discountPercent ?? '0',
                        taxMode: existing?.taxMode ?? 'amount',
                        taxAmount: existing?.taxAmount ?? '0',
                        taxPercent: existing?.taxPercent ?? String(settings.taxRate || 13),
                        paymentMethod: existing?.paymentMethod ?? 'cash',
                        paymentStatus: existing?.paymentStatus ?? 'unpaid',
                        paidAmount: existing?.paidAmount ?? '0',
                        bankAccountId: existing?.bankAccountId ?? null,
                        notes: existing?.notes ?? '',
                    };
                }
            });
            return next;
        });
    }, [showPurchaseCreationSection, purchaseSupplierIds, purchases, supplierLookup, settings.taxRate]);

    const buildBatchNumberForSupplier = useCallback(
        (supplierId: string | null | undefined, existingList: ProductBatch[] = localBatches) => {
            const name = suppliers.find(c => c.id === supplierId)?.name ?? '';
            return generateBatchNumber(existingList, { productName: form.getValues('name') ?? '', supplierName: name, date: new Date() });
        },
        [form, localBatches, suppliers]
    );

    const nextBatchNumber = useMemo(() => {
        const all = isNew ? localBatches : allBatches.filter(b => b.productId === (existingProduct?.id ?? ''));
        const supplierId = watchedSupplierIds[0] ?? purchaseSupplierIds[0] ?? '';
        return buildBatchNumberForSupplier(supplierId, all);
    }, [allBatches, buildBatchNumberForSupplier, existingProduct, isNew, localBatches, purchaseSupplierIds, watchedSupplierIds]);

    const warnings = useMemo(() => {
        const w: string[] = [];
        if (sellingRateWatch > 0 && purchaseRateWatch > 0 && sellingRateWatch < purchaseRateWatch)
            w.push('Selling rate is below purchase rate — you will sell at a loss.');
        if (minimumStockWatch > quantityWatch && quantityWatch > 0)
            w.push('Minimum stock alert is higher than current stock — this product will immediately appear as low stock.');
        if (hasExpiry && localBatches.length === 0 && isNew)
            w.push('No batches added yet. Add at least one batch to track expiry.');
        const expired = localBatches.filter(b => getBatchStatus(b.expiryDate) === 'expired');
        if (expired.length > 0) w.push(`${expired.length} batch(es) are already expired.`);
        return w;
    }, [sellingRateWatch, purchaseRateWatch, minimumStockWatch, quantityWatch, hasExpiry, localBatches, isNew]);

    const preBatchStockRef = useRef<{
        quantity: number;
        packQuantity: number | null;
        purchaseRate: number;
        packPurchaseCost: number | null;
    }>({
        quantity: 0,
        packQuantity: null,
        purchaseRate: 0,
        packPurchaseCost: null,
    });

    // Toggles
    const handleToggleExpiry = useCallback((checked: boolean) => {
        if (checked) {
            // Snapshot current stock and rates before enabling batch tracking
            const curQty = Number(form.getValues('quantity')) || 0;
            const curPackQty = form.getValues('packQuantity');
            const curRate = Number(form.getValues('purchaseRate')) || 0;
            const curPackCost = form.getValues('packPurchaseCost');
            preBatchStockRef.current = {
                quantity: curQty,
                packQuantity: curPackQty !== undefined && curPackQty !== null ? Number(curPackQty) : null,
                purchaseRate: curRate,
                packPurchaseCost: curPackCost !== undefined && curPackCost !== null ? Number(curPackCost) : null,
            };

            form.setValue('hasVariants', false, { shouldValidate: true, shouldDirty: true });
            form.setValue('hasExpiry', true, { shouldValidate: true, shouldDirty: true });
            // Do NOT auto-create a phantom batch without expiry date or supplier!
        } else {
            form.setValue('hasExpiry', false, { shouldValidate: true, shouldDirty: true });
            if (localBatches.length > 0) {
                form.setValue('purchaseRate', averagePurchaseRate, { shouldValidate: true, shouldDirty: true });
                form.setValue('quantity', totalBatchQuantity, { shouldValidate: true, shouldDirty: true });
                setLocalBatches([]);
            } else {
                // Revert to pre-batch stock/rates if available
                if (preBatchStockRef.current.quantity > 0) {
                    form.setValue('quantity', preBatchStockRef.current.quantity, { shouldValidate: true, shouldDirty: true });
                }
                if (preBatchStockRef.current.purchaseRate > 0) {
                    form.setValue('purchaseRate', preBatchStockRef.current.purchaseRate, { shouldValidate: true, shouldDirty: true });
                }
                if (preBatchStockRef.current.packQuantity !== null) {
                    form.setValue('packQuantity', preBatchStockRef.current.packQuantity, { shouldDirty: true });
                }
                if (preBatchStockRef.current.packPurchaseCost !== null) {
                    form.setValue('packPurchaseCost', preBatchStockRef.current.packPurchaseCost, { shouldDirty: true });
                }
            }
        }
    }, [form, localBatches.length, averagePurchaseRate, totalBatchQuantity]);

    const [draftBatchDefaults, setDraftBatchDefaults] = useState<{
        defaultQuantity?: number;
        defaultPurchaseRate?: number;
        defaultPackQuantity?: number | null;
        defaultPackPurchaseCost?: number | null;
        defaultSupplierId?: string;
    }>({});

    const getDraftBatchDefaults = useCallback(() => {
        const safePSize = Number(form.getValues('packSize')) || 1;
        const pCost = form.getValues('packPurchaseCost');
        const rate = form.getValues('purchaseRate');
        const supplierIds = form.getValues('supplierIds') || [];

        // Cost logic (preserved without changes)
        const packCostNum = (pCost !== null && pCost !== undefined && Number(pCost) > 0)
            ? Number(pCost)
            : (preBatchStockRef.current.packPurchaseCost && preBatchStockRef.current.packPurchaseCost > 0
                ? preBatchStockRef.current.packPurchaseCost
                : null);

        const effectiveRate = (packCostNum !== null && packCostNum > 0 && safePSize > 0)
            ? safeDiv(packCostNum, safePSize, 6)
            : (preBatchStockRef.current.purchaseRate > 0
                ? preBatchStockRef.current.purchaseRate
                : (rate && Number(rate) > 0 ? Number(rate) : undefined));

        // Intelligent opening stock allocation across batches
        const targetPacks = preBatchStockRef.current.packQuantity;
        const targetQty = preBatchStockRef.current.quantity;
        const allocatedQty = localBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
        const allocatedPacks = safePSize > 0 ? Math.floor(allocatedQty / safePSize) : 0;

        let packQtyNum: number | null = null;
        let effectiveQty: number | undefined = undefined;

        if (localBatches.length === 0) {
            // First batch: allocate initial opening stock if set
            packQtyNum = (targetPacks !== null && targetPacks > 0)
                ? targetPacks
                : 1;
            effectiveQty = (targetQty > 0)
                ? targetQty
                : (safePSize > 0 ? safeQty(safeMul(packQtyNum, safePSize)) : 1);
        } else {
            // Subsequent batches (2nd, 3rd, etc.):
            // Check if there is remaining unallocated opening stock
            const remainingPacks = (targetPacks !== null && targetPacks > 0)
                ? Math.max(0, targetPacks - allocatedPacks)
                : 0;
            const remainingQty = (targetQty > 0)
                ? Math.max(0, targetQty - allocatedQty)
                : 0;

            if (remainingPacks > 0) {
                packQtyNum = remainingPacks;
                effectiveQty = remainingQty > 0 ? remainingQty : safeQty(safeMul(remainingPacks, safePSize));
            } else if (remainingQty > 0) {
                effectiveQty = remainingQty;
                packQtyNum = safePSize > 0 ? Math.floor(remainingQty / safePSize) : 1;
            } else {
                // All opening stock has been accounted for; default to 1 pack (or 1 base unit)
                packQtyNum = 1;
                effectiveQty = safePSize > 0 ? safePSize : 1;
            }
        }

        return {
            defaultQuantity: effectiveQty,
            defaultPurchaseRate: effectiveRate,
            defaultPackQuantity: packQtyNum,
            defaultPackPurchaseCost: packCostNum,
            defaultSupplierId: supplierIds[0] || undefined,
        };
    }, [form, localBatches]);

    const handleToggleVariants = useCallback((checked: boolean) => {
        if (checked) {
            form.setValue('hasExpiry', false, { shouldValidate: true, shouldDirty: true });
            form.setValue('hasVariants', true, { shouldValidate: true, shouldDirty: true });
            setLocalBatches([]);
        } else {
            form.setValue('hasVariants', false, { shouldValidate: true, shouldDirty: true });
        }
    }, [form]);

    const updatePurchaseDraft = useCallback((supplierId: string, field: keyof SupplierPurchaseDraft, value: any) => {
        setSupplierPurchaseDrafts(prev => {
            const supplier = supplierLookup.get(supplierId);
            const defaultDate = new Date().toLocaleDateString('en-CA');
            const base: SupplierPurchaseDraft = prev[supplierId] ?? {
                invoiceNumber: generateSupplierInvoiceNumber(purchases, supplier?.name, defaultDate),
                purchaseDate: defaultDate,
                referenceNumber: '',
                discountMode: 'amount',
                discountAmount: '0',
                discountPercent: '0',
                taxMode: 'amount',
                taxAmount: '0',
                taxPercent: String(settings.taxRate || 13),
                paymentMethod: 'cash',
                paymentStatus: 'unpaid',
                paidAmount: '0',
                bankAccountId: null,
                notes: '',
            };
            const updated = {
                ...base,
                [field]: value,
            };
            return {
                ...prev,
                [supplierId]: updated,
            };
        });
    }, [purchases, settings.taxRate, supplierLookup]);

    const syncBatchPacksToForm = useCallback((batches: ProductBatch[]) => {
        const pSize = Number(form.getValues('packSize'));
        if (pSize > 0) {
            const totalQty = batches.reduce((s, b) => s + Number(b.quantity || 0), 0);
            const totalPacks = Math.floor(totalQty / pSize);
            form.setValue('packQuantity', totalPacks, { shouldDirty: true });

            const totalCost = batches.reduce((s, b) => s + safeMul(Number(b.quantity || 0), Number(b.purchaseRate || 0), 6), 0);
            if (totalQty > 0) {
                const avgRate = safeDiv(totalCost, totalQty, 6);
                form.setValue('packPurchaseCost', safeCurrency(safeMul(avgRate, pSize, 6)), { shouldDirty: true });
            }
        }
    }, [form]);

    const handleAddBatch = useCallback(() => {
        setDraftBatchDefaults(getDraftBatchDefaults());
        setEditingBatch(null);
        setBatchDialogOpen(true);
    }, [getDraftBatchDefaults]);

    const handleEditBatch = useCallback((batch: ProductBatch) => { setEditingBatch(batch); setBatchDialogOpen(true); }, []);
    const handleDeleteBatch = useCallback((bid: string) => {
        setLocalBatches(prev => {
            const updated = prev.filter(b => b.id !== bid);
            syncBatchPacksToForm(updated);
            return updated;
        });
    }, [syncBatchPacksToForm]);

    const handleSaveBatch = (batchData: BatchFormData) => {
        let updated: ProductBatch[];
        if (editingBatch) {
            updated = localBatches.map(b => b.id === editingBatch.id ? { ...b, ...batchData } : b);
        } else {
            updated = [...localBatches, { ...batchData, id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null, version: 1 }];
        }
        setLocalBatches(updated);
        syncBatchPacksToForm(updated);
        setBatchDialogOpen(false);
        setEditingBatch(null);
    };

    // Big onSubmit function (identical to original, now using correct existingProduct)
    const onSubmit = useCallback(async (data: ProductFormValues) => {
        try {
            const normalizedName = (data.name ?? '').trim().toLowerCase();
            if (isNew && normalizedName && existingProductNameLookup.has(normalizedName)) {
                form.setError('name', { type: 'duplicateName', message: `A product named "${data.name}" already exists.` });
                return;
            }

            const normalizedBarcode = data.barcode?.trim().toLowerCase();
            if (normalizedBarcode) {
                const duplicate = barcodeLookup.get(normalizedBarcode);
                if (duplicate && duplicate.id !== existingProduct?.id) {
                    form.setError('barcode', { message: `Barcode already used by "${duplicate.name}"` });
                    return;
                }
            }

            let resolvedSupplierIds = data.supplierIds ?? [];
            if (hasExpiry && resolvedSupplierIds.length === 0 && localBatches.length > 0) {
                resolvedSupplierIds = Array.from(new Set(localBatches.map(b => b.supplierId).filter(Boolean)));
            }
            const resolvedSupplierStocks = data.supplierStocks ?? [];
            const isMultiSup = !data.hasExpiry && !data.hasVariants && resolvedSupplierIds.length >= 2;

            const calculatedStock = data.hasExpiry
                ? localBatches.reduce((total, batch) => total + batch.quantity, 0)
                : data.hasVariants
                    ? (data.variants || []).reduce((total, v) => total + v.quantity, 0)
                    : isMultiSup
                        ? calculateTotalSupplierStock(resolvedSupplierStocks)
                        : data.quantity;

            const effectivePurchaseRate = (() => {
                if (isMultiSup && resolvedSupplierStocks.length > 0) {
                    return calculateWeightedAverageCost(resolvedSupplierStocks);
                }
                return averagePurchaseRate;
            })();

            const safeSize = getSafePackSize(data.packSize);
            const normalizedSupplierStocks = resolvedSupplierStocks.map((ss: any, idx: number) => {
                const baseStock = isMultiSup ? Number(ss.baseQuantity ?? ss.stock ?? 0) : calculatedStock;
                const unitCost = Number(ss.cost || effectivePurchaseRate || 0);
                const totalCost = Number(ss.totalPurchaseCost ?? safeCurrency(safeMul(baseStock, unitCost)));
                const isPrimary = ss.isPrimary ?? (idx === 0);

                return {
                    ...ss,
                    stock: safeQty(baseStock),
                    baseQuantity: safeQty(baseStock),
                    cost: safeCurrency(unitCost),
                    totalPurchaseCost: safeCurrency(totalCost),
                    packQuantity: ss.packQuantity ?? (data.packSize ? safeQty(safeDiv(baseStock, safeSize, 3)) : null),
                    packCost: ss.packCost ?? (data.packSize ? safeCurrency(safeMul(unitCost, safeSize)) : null),
                    appliedPackSize: data.packSize ? safeSize : null,
                    isPrimary,
                };
            });

            const calculatedPacksCount = (data.hasExpiry && safeSize > 0)
                ? Math.floor(calculatedStock / safeSize)
                : data.packQuantity;
            const calculatedPackCostVal = (data.hasExpiry && safeSize > 0 && effectivePurchaseRate > 0)
                ? safeCurrency(safeMul(effectivePurchaseRate, safeSize))
                : data.packPurchaseCost;

            const productData = {
                ...data,
                // Intentionally keep new product quantity at zero until the opening purchase
                // adds the stock once. This avoids double-counting when the purchase logic
                // increments both product.quantity and supplier stock for the same incoming stock.
                quantity: isNew ? 0 : calculatedStock,
                packQuantity: calculatedPacksCount,
                packPurchaseCost: calculatedPackCostVal,
                barcode: data.barcode?.trim() ?? '',
                brand: data.brand ?? '',
                supplierId: resolvedSupplierIds[0] ?? '',
                supplierIds: resolvedSupplierIds,
                supplierStocks: isNew
                    ? normalizedSupplierStocks.map(stock => ({ ...stock, stock: 0, baseQuantity: 0 }))
                    : normalizedSupplierStocks,
                notes: data.notes ?? '',
                hasExpiry: data.hasExpiry ?? false,
                hasVariants: data.hasVariants ?? false,
                variants: data.variants ?? [],
                purchaseRate: (isMultiSup || data.hasExpiry) ? effectivePurchaseRate : data.purchaseRate,
                profitPerUnit: safeCurrency(data.sellingRate - effectivePurchaseRate),
                unit: data.unit as ProductUnit,
                imageBase64: data.imageBase64 ?? '',
            };

            const newId = isNew ? uuidv4() : null;
            if (isNew) {
                const createdPurchaseIds: string[] = [];
                await add({ ...productData, id: newId! } as any);

                for (const batch of localBatches) {
                    await storage.save('productBatches', { ...batch, productId: newId, quantity: 0, initialQuantity: 0 } as any);
                }
                try { await refreshBatches(); } catch { }

                try {
                    if (newId) {
                        const currentDrafts = supplierPurchaseDraftsRef.current || supplierPurchaseDrafts;
                        const activeSupplierFallback = purchaseSupplierIdsRef.current[0] || purchaseSupplierIds[0] || '';
                        const purchaseRequests: any[] = [];
                        const shouldCreateBatchPurchases = localBatches.length > 0;
                        const supplierPurchaseEntries = resolvedSupplierStocks.filter(entry => entry?.supplierId && Number(entry.stock) > 0);
                        const shouldCreateSupplierPurchases = supplierPurchaseEntries.length > 0;

                        if (shouldCreateBatchPurchases) {
                            for (const batch of localBatches) {
                                const qty = Number(batch.quantity || 0);
                                if (qty <= 0) continue;
                                const batchSupplierId = batch.supplierId || resolvedSupplierIds[0] || productData.supplierId || activeSupplierFallback || undefined;
                                const supplier = suppliers.find(c => c.id === batchSupplierId);
                                const rate = Number(batch.purchaseRate ?? productData.purchaseRate ?? 0) || 0;
                                const batchLocationId = resolvedSupplierStocks.find(ss => ss.supplierId === batchSupplierId)?.locationId || 'loc-default';

                                // Calculate subtotal for this supplier's batches to derive discount & tax
                                const supplierBatches = localBatches.filter(b => (b.supplierId || resolvedSupplierIds[0] || productData.supplierId || activeSupplierFallback) === batchSupplierId);
                                const supplierSubtotal = safeCurrency(supplierBatches.reduce((sum, b) => sum + safeMul(Number(b.quantity || 0), Number(b.purchaseRate || 0), 6), 0));
                                const draft = (batchSupplierId && currentDrafts[batchSupplierId])
                                    || (activeSupplierFallback && currentDrafts[activeSupplierFallback])
                                    || Object.values(currentDrafts)[0];

                                let discountAmount = 0;
                                let taxAmount = 0;
                                if (draft) {
                                    if (draft.discountMode === 'percent') {
                                        const pct = Math.max(0, Number(draft.discountPercent) || 0);
                                        discountAmount = safeCurrency(safeMul(supplierSubtotal, pct / 100));
                                    } else {
                                        discountAmount = Math.max(0, Number(draft.discountAmount) || 0);
                                    }
                                    const taxable = Math.max(0, supplierSubtotal - discountAmount);
                                    if (draft.taxMode === 'percent') {
                                        const pct = Math.max(0, Number(draft.taxPercent) || 0);
                                        taxAmount = safeCurrency(safeMul(taxable, pct / 100));
                                    } else {
                                        taxAmount = Math.max(0, Number(draft.taxAmount) || 0);
                                    }
                                }

                                const paymentStatus = draft?.paymentStatus || 'unpaid';
                                const paidAmount = paymentStatus === 'paid'
                                    ? supplierSubtotal
                                    : Number(draft?.paidAmount || 0);

                                purchaseRequests.push({
                                    productId: newId,
                                    quantity: qty,
                                    purchaseRate: rate,
                                    supplierId: batchSupplierId,
                                    supplierName: supplier?.name,
                                    invoiceNumber: draft?.invoiceNumber?.trim() || undefined,
                                    date: draft?.purchaseDate
                                        ? `${draft.purchaseDate}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                        : `${new Date().toLocaleDateString('en-CA')}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
                                    referenceNumber: draft?.referenceNumber || undefined,
                                    notes: draft?.notes || batch.notes || 'Opening stock from product creation',
                                    batchId: batch.id,
                                    batchNumber: batch.batchNumber,
                                    manufacturingDate: batch.manufacturingDate,
                                    expiryMonths: batch.expiryMonths,
                                    expiryDate: batch.expiryDate,
                                    locationId: batchLocationId,
                                    packQuantity: data.packSize && safeSize > 0 ? Math.floor(qty / safeSize) : undefined,
                                    packCost: data.packSize && safeSize > 0 ? safeCurrency(rate * safeSize) : undefined,
                                    packUnit: data.packUnit || undefined,
                                    packSize: data.packSize || undefined,
                                    discount: discountAmount,
                                    tax: taxAmount,
                                    paymentMethod: draft?.paymentMethod || 'cash',
                                    paymentStatus,
                                    paidAmount,
                                    bankAccountId: draft?.paymentMethod === 'bank' ? (draft?.bankAccountId || null) : null,
                                });
                            }
                        } else if (shouldCreateSupplierPurchases) {
                            for (const entry of supplierPurchaseEntries) {
                                const supplierId = entry?.supplierId;
                                const qty = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
                                if (!supplierId || qty <= 0) continue;
                                const supplier = suppliers.find(c => c.id === supplierId);
                                const rate = Number(entry?.cost ?? productData.purchaseRate ?? 0) || 0;
                                const supplierSubtotal = safeCurrency(safeMul(qty, rate));
                                const draft = (supplierId && currentDrafts[supplierId])
                                    || (activeSupplierFallback && currentDrafts[activeSupplierFallback])
                                    || Object.values(currentDrafts)[0];

                                let discountAmount = 0;
                                let taxAmount = 0;
                                if (draft) {
                                    if (draft.discountMode === 'percent') {
                                        const pct = Math.max(0, Number(draft.discountPercent) || 0);
                                        discountAmount = safeCurrency(safeMul(supplierSubtotal, pct / 100));
                                    } else {
                                        discountAmount = Math.max(0, Number(draft.discountAmount) || 0);
                                    }
                                    const taxable = Math.max(0, supplierSubtotal - discountAmount);
                                    if (draft.taxMode === 'percent') {
                                        const pct = Math.max(0, Number(draft.taxPercent) || 0);
                                        taxAmount = safeCurrency(safeMul(taxable, pct / 100));
                                    } else {
                                        taxAmount = Math.max(0, Number(draft.taxAmount) || 0);
                                    }
                                }

                                const paymentStatus = draft?.paymentStatus || 'unpaid';
                                const paidAmount = paymentStatus === 'paid'
                                    ? supplierSubtotal
                                    : Number(draft?.paidAmount || 0);

                                purchaseRequests.push({
                                    productId: newId,
                                    quantity: qty,
                                    purchaseRate: rate,
                                    supplierId,
                                    supplierName: supplier?.name,
                                    invoiceNumber: draft?.invoiceNumber?.trim() || undefined,
                                    date: draft?.purchaseDate
                                        ? `${draft.purchaseDate}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                        : `${new Date().toLocaleDateString('en-CA')}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
                                    referenceNumber: draft?.referenceNumber || undefined,
                                    notes: draft?.notes || 'Opening stock from product creation',
                                    locationId: entry.locationId || 'loc-default',
                                    discount: discountAmount,
                                    tax: taxAmount,
                                    paymentMethod: draft?.paymentMethod || 'cash',
                                    paymentStatus,
                                    paidAmount,
                                    bankAccountId: draft?.paymentMethod === 'bank' ? (draft?.bankAccountId || null) : null,
                                });
                            }
                        } else {
                            const totalQty = Number(calculatedStock || data.quantity || 0) || 0;
                            if (totalQty > 0) {
                                const fallbackSupplier = resolvedSupplierIds[0] || activeSupplierFallback || productData.supplierId || undefined;
                                const supplier = suppliers.find(c => c.id === fallbackSupplier);
                                const fallbackLocationId = resolvedSupplierStocks[0]?.locationId || 'loc-default';
                                const rate = Number(productData.purchaseRate || 0);
                                const subtotal = safeCurrency(safeMul(totalQty, rate));
                                const draft = (fallbackSupplier && currentDrafts[fallbackSupplier])
                                    || (activeSupplierFallback && currentDrafts[activeSupplierFallback])
                                    || Object.values(currentDrafts)[0];

                                let discountAmount = 0;
                                let taxAmount = 0;
                                if (draft) {
                                    if (draft.discountMode === 'percent') {
                                        const pct = Math.max(0, Number(draft.discountPercent) || 0);
                                        discountAmount = safeCurrency(safeMul(subtotal, pct / 100));
                                    } else {
                                        discountAmount = Math.max(0, Number(draft.discountAmount) || 0);
                                    }
                                    const taxable = Math.max(0, subtotal - discountAmount);
                                    if (draft.taxMode === 'percent') {
                                        const pct = Math.max(0, Number(draft.taxPercent) || 0);
                                        taxAmount = safeCurrency(safeMul(taxable, pct / 100));
                                    } else {
                                        taxAmount = Math.max(0, Number(draft.taxAmount) || 0);
                                    }
                                }

                                const paymentStatus = draft?.paymentStatus || 'unpaid';
                                const paidAmount = paymentStatus === 'paid'
                                    ? subtotal
                                    : Number(draft?.paidAmount || 0);

                                purchaseRequests.push({
                                    productId: newId,
                                    quantity: totalQty,
                                    purchaseRate: productData.purchaseRate || undefined,
                                    supplierId: fallbackSupplier,
                                    supplierName: supplier?.name,
                                    invoiceNumber: draft?.invoiceNumber?.trim() || undefined,
                                    date: draft?.purchaseDate
                                        ? `${draft.purchaseDate}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                        : `${new Date().toLocaleDateString('en-CA')}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
                                    referenceNumber: draft?.referenceNumber || undefined,
                                    notes: draft?.notes || 'Opening stock from product creation',
                                    locationId: fallbackLocationId,
                                    discount: discountAmount,
                                    tax: taxAmount,
                                    paymentMethod: draft?.paymentMethod || 'cash',
                                    paymentStatus,
                                    paidAmount,
                                    bankAccountId: draft?.paymentMethod === 'bank' ? (draft?.bankAccountId || null) : null,
                                });
                            }
                        }

                        const createdPurchases = await createPurchasesForNewItem(storage, purchaseRequests as any);
                        createdPurchases.forEach(p => { if (p?.id) createdPurchaseIds.push(p.id); });
                    }
                } catch (purchaseError) {
                    const rollbackInventory = await storage.get<any>('inventory');
                    const rollbackBatches = await storage.get<any>('productBatches');
                    const rollbackPurchases = await storage.get<any>('purchases');
                    await storage.set('inventory', rollbackInventory.filter((r: any) => r.id !== newId));
                    await storage.set('productBatches', rollbackBatches.filter((b: any) => b.productId !== newId));
                    await storage.set('purchases', rollbackPurchases.filter((p: any) => !createdPurchaseIds.includes(p.id)));
                    console.error('Failed to create purchase for new product:', purchaseError);
                    toast.error('Failed to create purchase. Product was not saved.');
                    return;
                }

                try {
                    await refreshPurchases();
                    toast.success('Product added successfully');
                } catch (err) {
                    console.warn('InventoryForm: refreshPurchases failed', err);
                }
            } else if (existingProduct) {
                update(existingProduct.id, productData);
                const currentSavedBatches = allBatches.filter(b => b.productId === existingProduct.id);
                const localBatchIds = new Set(localBatches.map(b => b.id));
                for (const saved of currentSavedBatches) {
                    if (!localBatchIds.has(saved.id)) removeBatch(saved.id);
                }
                for (const batch of localBatches) {
                    const exists = currentSavedBatches.some(ab => ab.id === batch.id);
                    if (exists) updateBatch(batch.id, batch);
                    else addBatch({ ...batch, productId: existingProduct.id } as any);
                }
                toast.success('Product updated successfully');
            }

            if (isNew && returnTo) {
                const target = new URL(decodeURIComponent(returnTo), window.location.origin);
                target.searchParams.set('productId', newId!);
                setLocation(`${target.pathname}${target.search}`);
            } else {
                setLocation('/inventory');
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to save product');
        }
    }, [
        isNew, existingProductNameLookup, barcodeLookup, existingProduct, hasExpiry, hasVariants,
        localBatches, suppliers, averagePurchaseRate, add, storage, refreshBatches, refreshPurchases,
        allBatches, update, removeBatch, updateBatch, addBatch, purchases, returnTo, setLocation,
        supplierPurchaseDrafts, purchaseSupplierIds,
    ]);

    return {
        form,
        isNew,
        existingProduct,
        hasExpiry,
        hasVariants,
        isMultiSupplier,
        showPurchaseCreationSection,
        suppliers,
        purchases,
        watchedSupplierIds,
        watchedSupplierStocks,
        purchaseSupplierIds,
        totalSupplierStockQuantity,
        supplierLookup,
        existingCategories,
        existingBrands,
        existingProductNameLookup,
        barcodeLookup,
        existingBarcodes,
        purchaseRateWatch,
        sellingRateWatch,
        quantityWatch,
        minimumStockWatch,
        averagePurchaseRate,
        totalBatchQuantity,
        totalVariantQuantity,
        warnings,
        localBatches,
        batchDialogOpen,
        editingBatch,
        nextBatchNumber,
        handleToggleExpiry,
        handleToggleVariants,
        handleAddBatch,
        handleEditBatch,
        handleDeleteBatch,
        handleSaveBatch,
        setBatchDialogOpen,
        supplierPresetName,
        setSupplierPresetName,
        supplierDialogOpen,
        setSupplierDialogOpen,
        supplierPurchaseDrafts,
        updatePurchaseDraft,
        isBatchesEnabled,
        isExpiryEnabled,
        isVariantsEnabled,
        draftBatchDefaults,
        storage,
        onSubmit,
    };
}