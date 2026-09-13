import { useEffect, useMemo, useState, useCallback } from 'react';
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
import { PaymentMethod, ProductUnit, ProductBatch, BatchFormData, PurchasePaymentStatus } from '@/types';
import { productSchema, ProductFormValues } from '../types';
import {
    calculateTotalSupplierStock,
    calculateWeightedAverageCost,
    getSafePackSize,
    safeCurrency,
    safeQty
} from '@/utils/unitUtils';


export type SupplierPurchaseDraft = {
    invoiceNumber: string;
    purchaseDate: string;
    referenceNumber: string;
    paymentMethod: PaymentMethod;
    paymentStatus: PurchasePaymentStatus;
    paidAmount: string;
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
    const {
        items: allBatches,
        add: addBatch,
        update: updateBatch,
        hardRemove: removeBatch,
        refresh: refreshBatches,
    } = useProductBatches();
    const { items: purchases, refresh: refreshPurchases } = usePurchases();
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

    const showPurchaseCreationSection = isNew && Boolean(decodedReturnTo && decodedReturnTo.includes('/purchases'));

    const isMultiSupplier = !hasExpiry && !hasVariants && watchedSupplierIds.length >= 2;

    const purchaseSupplierIds = useMemo(() => {
        if (watchedSupplierIds.length > 0) return watchedSupplierIds;
        return supplierIdFromQuery ? [supplierIdFromQuery] : [];
    }, [watchedSupplierIds, supplierIdFromQuery]);

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
        if (!hasExpiry || localBatches.length === 0) return purchaseRateWatch || 0;
        const totalQty = localBatches.reduce((sum, b) => sum + b.quantity, 0);
        if (totalQty === 0) return 0;
        const totalCost = localBatches.reduce((sum, b) => sum + b.purchaseRate * b.quantity, 0);
        return totalCost / totalQty;
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
                        paymentMethod: existing?.paymentMethod ?? 'cash',
                        paymentStatus: existing?.paymentStatus ?? 'unpaid',
                        paidAmount: existing?.paidAmount ?? '0',
                        notes: existing?.notes ?? '',
                    };
                }
            });
            return next;
        });
    }, [showPurchaseCreationSection, purchaseSupplierIds, purchases, supplierLookup]);

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

    // Toggles
    const handleToggleExpiry = useCallback((checked: boolean) => {
        if (checked) {
            form.setValue('hasVariants', false, { shouldValidate: true, shouldDirty: true });
            form.setValue('hasExpiry', true, { shouldValidate: true, shouldDirty: true });
            const qty = form.getValues('quantity') || 0;
            if (qty > 0) {
                const rate = form.getValues('purchaseRate') || 0;
                const ids = form.getValues('supplierIds') || [];
                const batch: ProductBatch = {
                    id: uuidv4(),
                    productId: existingProduct?.id || '',
                    batchNumber: nextBatchNumber,
                    quantity: qty,
                    purchaseRate: rate,
                    expiryDate: '',
                    supplierId: ids[0] || '',
                    manufacturingDate: null,
                    expiryMonths: null,
                    initialQuantity: qty,
                    notes: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null,
                    version: 1,
                };
                setLocalBatches([batch]);
            }
        } else {
            if (window.confirm('Are you sure you want to turn off expiry tracking? This will merge all batch stock into standard stock.')) {
                form.setValue('hasExpiry', false, { shouldValidate: true, shouldDirty: true });
                form.setValue('purchaseRate', averagePurchaseRate, { shouldValidate: true, shouldDirty: true });
                form.setValue('quantity', totalBatchQuantity, { shouldValidate: true, shouldDirty: true });
                setLocalBatches([]);
            }
        }
    }, [form, nextBatchNumber, existingProduct, averagePurchaseRate, totalBatchQuantity]);

    const handleToggleVariants = useCallback((checked: boolean) => {
        if (checked) {
            form.setValue('hasExpiry', false, { shouldValidate: true, shouldDirty: true });
            form.setValue('hasVariants', true, { shouldValidate: true, shouldDirty: true });
            setLocalBatches([]);
        } else {
            form.setValue('hasVariants', false, { shouldValidate: true, shouldDirty: true });
        }
    }, [form]);

    const updatePurchaseDraft = (supplierId: string, field: keyof SupplierPurchaseDraft, value: string) => {
        setSupplierPurchaseDrafts(prev => ({
            ...prev,
            [supplierId]: {
                ...(prev[supplierId] ?? {
                    invoiceNumber: '',
                    purchaseDate: new Date().toLocaleDateString('en-CA'),
                    referenceNumber: '',
                    paymentMethod: 'cash',
                    paymentStatus: 'unpaid',
                    paidAmount: '0',
                    notes: '',
                }),
                [field]: value,
            },
        }));
    };

    const handleAddBatch = useCallback(() => { setEditingBatch(null); setBatchDialogOpen(true); }, []);
    const handleEditBatch = useCallback((batch: ProductBatch) => { setEditingBatch(batch); setBatchDialogOpen(true); }, []);
    const handleDeleteBatch = useCallback((bid: string) => { setLocalBatches(prev => prev.filter(b => b.id !== bid)); }, []);

    const handleSaveBatch = (batchData: BatchFormData) => {
        if (editingBatch) {
            setLocalBatches(prev => prev.map(b => b.id === editingBatch.id ? { ...b, ...batchData } : b));
        } else {
            setLocalBatches(prev => [...prev, { ...batchData, id: uuidv4(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null, version: 1 }]);
        }
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
                const totalCost = Number(ss.totalPurchaseCost ?? safeCurrency(baseStock * unitCost));
                const isPrimary = ss.isPrimary ?? (idx === 0);

                return {
                    ...ss,
                    stock: baseStock,
                    baseQuantity: baseStock,
                    cost: unitCost,
                    totalPurchaseCost: totalCost,
                    packQuantity: ss.packQuantity ?? (data.packSize ? safeQty(baseStock / safeSize) : null),
                    packCost: ss.packCost ?? (data.packSize ? safeCurrency(unitCost * safeSize) : null),
                    appliedPackSize: data.packSize ? safeSize : null,
                    isPrimary,
                };
            });

            const productData = {
                ...data,
                // Intentionally keep new product quantity at zero until the opening purchase
                // adds the stock once. This avoids double-counting when the purchase logic
                // increments both product.quantity and supplier stock for the same incoming stock.
                quantity: isNew ? 0 : calculatedStock,
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
                profitPerUnit: data.sellingRate - effectivePurchaseRate,
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
                        const purchaseRequests: any[] = [];
                        const shouldCreateBatchPurchases = localBatches.length > 0;
                        const supplierPurchaseEntries = resolvedSupplierStocks.filter(entry => entry?.supplierId && Number(entry.stock) > 0);
                        const shouldCreateSupplierPurchases = supplierPurchaseEntries.length > 0;

                        if (shouldCreateBatchPurchases) {
                            for (const batch of localBatches) {
                                const qty = Number(batch.quantity || 0);
                                if (qty <= 0) continue;
                                const batchSupplierId = batch.supplierId || resolvedSupplierIds[0] || productData.supplierId || undefined;
                                const supplier = suppliers.find(c => c.id === batchSupplierId);
                                const rate = Number(batch.purchaseRate ?? productData.purchaseRate ?? 0) || 0;
                                const batchLocationId = resolvedSupplierStocks.find(ss => ss.supplierId === batchSupplierId)?.locationId || 'loc-default';
                                purchaseRequests.push({
                                    productId: newId, quantity: qty, purchaseRate: rate, supplierId: batchSupplierId,
                                    supplierName: supplier?.name, invoiceNumber: undefined,
                                    date: `${new Date().toLocaleDateString('en-CA')}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
                                    notes: batch.notes ?? 'Opening stock from product creation',
                                    batchId: batch.id, batchNumber: batch.batchNumber,
                                    manufacturingDate: batch.manufacturingDate, expiryMonths: batch.expiryMonths, expiryDate: batch.expiryDate,
                                    locationId: batchLocationId,
                                });
                            }
                        } else if (shouldCreateSupplierPurchases) {
                            for (const entry of supplierPurchaseEntries) {
                                const supplierId = entry?.supplierId;
                                const qty = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
                                if (!supplierId || qty <= 0) continue;
                                const supplier = suppliers.find(c => c.id === supplierId);
                                const rate = Number(entry?.cost ?? productData.purchaseRate ?? 0) || 0;
                                purchaseRequests.push({
                                    productId: newId, quantity: qty, purchaseRate: rate, supplierId,
                                    supplierName: supplier?.name, invoiceNumber: undefined,
                                    date: `${new Date().toLocaleDateString('en-CA')}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
                                    notes: 'Opening stock from product creation',
                                    locationId: entry.locationId || 'loc-default',
                                });
                            }
                        } else {
                            const totalQty = Number(calculatedStock || data.quantity || 0) || 0;
                            if (totalQty > 0) {
                                const fallbackSupplier = resolvedSupplierIds[0] ?? undefined;
                                const supplier = suppliers.find(c => c.id === fallbackSupplier);
                                const fallbackLocationId = resolvedSupplierStocks[0]?.locationId || 'loc-default';
                                purchaseRequests.push({
                                    productId: newId, quantity: totalQty, purchaseRate: productData.purchaseRate || undefined,
                                    supplierId: fallbackSupplier, supplierName: supplier?.name, invoiceNumber: undefined,
                                    date: `${new Date().toLocaleDateString('en-CA')}T${new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
                                    notes: 'Opening stock from product creation',
                                    locationId: fallbackLocationId,
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
        storage,
        onSubmit,
    };
}