import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { addMonths, format as formatDate, parseISO } from 'date-fns';
import { usePurchases, useSuppliers, useInventory, useProductBatches, useLocations } from '@/contexts/GlobalProviders';
import { useStorageProvider } from '@/storage/StorageContext';
import { useSmartBack } from '@/contexts/NavigationContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  Save,
  PackagePlus,
  Trash2,
  AlertCircle,
  Truck,
  X,
  Boxes,
  Receipt,
  Percent,
  Tag,
  CheckCircle2,
  Calendar,
  FileText,
  MapPin,
  Hash,
  Sparkles,
  PieChart,
} from 'lucide-react';
import { toast } from 'sonner';
import { PurchaseItem, PurchasePaymentStatus, PurchaseStatus } from '@/types';
import { createPurchase, updatePurchase } from '@/services/purchaseService';
import { ProductSearchPicker } from '@/components/ProductSearchPicker';
import { SupplierSearchPicker } from '@/components/SupplierSearchPicker';
import { SupplierFormDialog } from '@/components/SupplierFormDialog';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { generateBatchNumber, generateSupplierInvoiceNumber } from '@/utils/numbering';
import { isProductPurchasable } from '@/lib/productCapabilities';
import { cn } from '@/lib/utils';
import { safeCurrency, safeQty, computePerUnitCost, getSafePackSize, safeMul, safeDiv, formatMoney, formatQtyDisplay } from '@/utils/unitUtils';

type DraftItem = PurchaseItem & {
  initialPurchaseRate?: number | null;
  expiryMode?: 'months' | 'manual';
  manufacturingDate?: string | null;
  expiryDate?: string | null;
  entryMode?: 'pack' | 'base';
};

const today = () => new Date().toLocaleDateString('en-CA');

export default function PurchaseForm() {
  const goBack = useSmartBack('/purchases');
  const [location, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const storage = useStorageProvider();
  const { settings } = useApp();
  const { items: purchases, refresh: refreshPurchases } = usePurchases();
  const { items: suppliers } = useSuppliers();
  const { items: inventory, refresh: refreshInventory } = useInventory();
  const { items: existingBatches, refresh: refreshBatches } = useProductBatches();
  const { items: locations } = useLocations();
  const { format } = useCurrency();

  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const supplierIdFromQuery = queryParams.get('supplierId') ?? '';
  const productIdFromQuery = queryParams.get('productId') ?? '';
  const locationIdFromQuery = queryParams.get('locationId') ?? '';
  const defaultLocationId = settings.defaultLocationId || locations.find(loc => loc.status !== 'inactive')?.id || locations[0]?.id || '';
  const isNew = !id || id === 'new';
  const existing = isNew ? null : purchases.find(purchase => purchase.id === id) ?? null;

  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? supplierIdFromQuery);
  const [locationId, setLocationId] = useState(existing?.locationId ?? (locationIdFromQuery || defaultLocationId));
  const [invoiceNumber, setInvoiceNumber] = useState(existing?.invoiceNumber ?? '');
  const [referenceNumber, setReferenceNumber] = useState(existing?.referenceNumber ?? '');
  const [purchaseDate, setPurchaseDate] = useState(existing?.date?.slice(0, 10) ?? today());
  const [status, setStatus] = useState<PurchaseStatus>(existing?.status ?? 'received');
  const [paymentMethod, setPaymentMethod] = useState(existing?.paymentMethod ?? 'cash');
  const [paymentStatus, setPaymentStatus] = useState<PurchasePaymentStatus>(existing?.paymentStatus ?? 'unpaid');
  const [paidAmount, setPaidAmount] = useState(String(existing?.paidAmount ?? 0));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [items, setItems] = useState<DraftItem[]>(() => (existing?.items ?? []).map(item => ({
    ...item,
    initialPurchaseRate: item.purchaseRate,
    entryMode: item.packQuantity && item.packQuantity > 0 ? 'pack' : 'base',
  })));
  // Discount state: supports both flat Rs. and % modes
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [discountAmount, setDiscountAmount] = useState(String(existing?.discount ?? 0));
  const [discountPercent, setDiscountPercent] = useState('0');

  // Tax state: supports both flat Rs. and % modes
  const [taxMode, setTaxMode] = useState<'amount' | 'percent'>('amount');
  const [taxAmount, setTaxAmount] = useState(String(existing?.tax ?? 0));
  const [taxPercent, setTaxPercent] = useState(String(settings.taxRate || 13));
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierPresetName, setSupplierPresetName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (productIdFromQuery && !items.some(item => item.productId === productIdFromQuery)) {
      const product = inventory.find(candidate => candidate.id === productIdFromQuery);
      if (product) addItem(product);
    }
    // Query parameters are a one-time handoff from Add Product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdFromQuery, inventory]);

  const selectedSupplier = suppliers.find(supplier => supplier.id === supplierId);

  function handleSupplierSelect(id: string) {
    if (id !== supplierId && items.length > 0) {
      setItems([]);
    }
    setSupplierId(id);
  }

  function handleSupplierRemove() {
    if (items.length > 0) {
      setItems([]);
    }
    setSupplierId('');
  }

  useEffect(() => {
    if (!isNew) return;

    if (!supplierId) {
      setInvoiceNumber('');
      return;
    }

    const generated = generateSupplierInvoiceNumber(purchases, selectedSupplier?.name, purchaseDate);
    setInvoiceNumber(generated);
  }, [isNew, supplierId, purchaseDate, purchases, selectedSupplier?.name]);

  const subtotal = useMemo(() => safeCurrency(items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)), [items]);

  const discountValue = useMemo(() => {
    if (discountMode === 'percent') {
      const pct = Math.max(0, Number(discountPercent) || 0);
      return safeCurrency(safeMul(subtotal, pct / 100));
    }
    return Math.max(0, Number(discountAmount) || 0);
  }, [discountMode, discountPercent, discountAmount, subtotal]);

  const taxableAmount = useMemo(() => Math.max(0, subtotal - discountValue), [subtotal, discountValue]);

  const taxValue = useMemo(() => {
    if (taxMode === 'percent') {
      const pct = Math.max(0, Number(taxPercent) || 0);
      return safeCurrency(safeMul(taxableAmount, pct / 100));
    }
    return Math.max(0, Number(taxAmount) || 0);
  }, [taxMode, taxPercent, taxAmount, taxableAmount]);

  const grandTotal = useMemo(() => safeCurrency(Math.max(0, subtotal - discountValue + taxValue)), [subtotal, discountValue, taxValue]);

  // Product picker items for ProductSearchPicker — filter out already-added products
  const addedProductIds = useMemo(() => new Set(items.map(i => i.productId)), [items]);
  const productPickerItems = useMemo(() =>
    inventory
      .filter(product => {
        if (!supplierId) return false;
        if (!isProductPurchasable(product)) return false;
        const productSuppliers = product.supplierIds ?? (product.supplierId ? [product.supplierId] : []);
        return productSuppliers.includes(supplierId);
      })
      .map(p => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        category: p.category,
        sublabel: `Stock: ${p.quantity} ${p.unit ?? ''}`.trim(),
      })),
    [inventory, supplierId],
  );
  // Only show products not yet in the cart
  const availableProductItems = useMemo(
    () => productPickerItems.filter(p => !addedProductIds.has(p.id)),
    [productPickerItems, addedProductIds],
  );

  function getComputedExpiryDate(manufacturingDate: string | null | undefined, expiryMonths: number | null | undefined) {
    if (!manufacturingDate || !expiryMonths || Number(expiryMonths) <= 0) return null;

    try {
      return addMonths(parseISO(manufacturingDate), Number(expiryMonths)).toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  function addItem(product: typeof inventory[number]) {
    if (!isProductPurchasable(product)) {
      toast.error(`${product.name} is not enabled for purchases.`);
      return;
    }

    const isBatchesEnabled = true;
    // Pick latest cost from product supplierStocks for this supplier, or fallback to product.purchaseRate
    const supplierStockEntry = product.supplierStocks?.find(ss => ss.supplierId === supplierId);
    const initialRate = supplierStockEntry?.cost && supplierStockEntry.cost > 0
      ? supplierStockEntry.cost
      : (product.purchaseRate || 0);

    const hasPack = Boolean(product.packSize && product.packSize > 0);
    const safePackSize = getSafePackSize(product.packSize);
    let initialPackCost: number | null = null;
    let initialPackQty: number | null = null;
    let initialQuantity = 1;
    let effectiveRate = initialRate;

    if (hasPack) {
      initialPackCost = supplierStockEntry?.packCost && supplierStockEntry.packCost > 0
        ? supplierStockEntry.packCost
        : (product.packPurchaseCost && product.packPurchaseCost > 0
            ? product.packPurchaseCost
            : (initialRate > 0 ? safeCurrency(safeMul(initialRate, safePackSize)) : null));

      if (initialPackCost && initialPackCost > 0 && initialRate <= 0) {
        effectiveRate = computePerUnitCost(initialPackCost, safePackSize);
      }
      initialPackQty = 1;
      initialQuantity = safeQty(safeMul(1, safePackSize));
    }

    const itemSubtotal = hasPack && initialPackCost && initialPackCost > 0
      ? safeCurrency(safeMul(initialPackCost, (initialPackQty || 1)))
      : safeCurrency(safeMul(initialQuantity, effectiveRate));

    const defaultExpiryMonths = product.hasExpiry ? 12 : null;
    const defaultManufacturingDate = product.hasExpiry ? today() : null;
    const defaultExpiryDate = product.hasExpiry ? getComputedExpiryDate(defaultManufacturingDate, defaultExpiryMonths) : null;

    setItems(prev => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        quantity: initialQuantity,
        purchaseRate: effectiveRate,
        initialPurchaseRate: effectiveRate,
        subtotal: itemSubtotal,
        packQuantity: initialPackQty,
        packCost: initialPackCost,
        packUnit: product.packUnit || null,
        packSize: product.packSize || null,
        entryMode: hasPack ? 'pack' : 'base',
        batchNumber: product.hasExpiry || isBatchesEnabled ? generateBatchNumber([...existingBatches, ...prev.map(item => ({ batchNumber: item.batchNumber }))], { productName: product.name, supplierName: selectedSupplier?.name ?? '', date: purchaseDate }) : undefined,
        manufacturingDate: defaultManufacturingDate,
        expiryMonths: defaultExpiryMonths,
        expiryDate: defaultExpiryDate,
        expiryMode: product.hasExpiry ? 'months' : undefined,
      },
    ]);
  }

  function addItemById(productId: string) {
    const product = inventory.find(p => p.id === productId);
    if (product) addItem(product);
  }

  function updateItem(index: number, field: keyof DraftItem, value: string | number | null) {
    setItems(current => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, [field]: value } as DraftItem;
      const safePackSize = getSafePackSize(next.packSize);

      if (field === 'packQuantity') {
        const packQty = Math.max(0, Number(value) || 0);
        next.packQuantity = packQty;
        next.quantity = safeQty(safeMul(packQty, safePackSize));
        const pCost = Number(next.packCost || 0);
        next.subtotal = safeCurrency(safeMul(packQty, pCost));
      } else if (field === 'packCost') {
        const pCost = Math.max(0, Number(value) || 0);
        next.packCost = pCost;
        next.purchaseRate = computePerUnitCost(pCost, safePackSize);
        const pQty = Number(next.packQuantity ?? safeDiv(next.quantity, safePackSize, 3));
        next.subtotal = safeCurrency(safeMul(pQty, pCost));
      } else if (field === 'quantity') {
        const qty = Math.max(0, Number(value) || 0);
        next.quantity = qty;
        if (next.packSize && next.packSize > 0) {
          next.packQuantity = safeQty(safeDiv(qty, safePackSize, 3));
        }
        next.subtotal = safeCurrency(safeMul(qty, Math.max(0, Number(next.purchaseRate) || 0)));
      } else if (field === 'purchaseRate') {
        const rate = Math.max(0, Number(value) || 0);
        next.purchaseRate = rate;
        if (next.packSize && next.packSize > 0) {
          next.packCost = safeCurrency(safeMul(rate, safePackSize));
        }
        next.subtotal = safeCurrency(safeMul(Math.max(0, Number(next.quantity) || 0), rate));
      } else if (field === 'entryMode') {
        next.entryMode = value as 'pack' | 'base';
      }

      if (field === 'manufacturingDate' || field === 'expiryMonths' || field === 'expiryMode') {
        const expiryMode = field === 'expiryMode' ? (value as DraftItem['expiryMode']) : (item.expiryMode ?? 'manual');
        const manufacturingDate = field === 'manufacturingDate' ? (value as string | null) : item.manufacturingDate;
        const expiryMonths = field === 'expiryMonths' ? (value as number | string | null) : item.expiryMonths;

        if (expiryMode === 'months') {
          const months = Number(expiryMonths ?? 0);
          next.expiryMode = 'months';
          next.expiryMonths = months > 0 ? months : null;
          next.expiryDate = getComputedExpiryDate(manufacturingDate, months > 0 ? months : null);
        } else {
          next.expiryMode = 'manual';
          next.expiryMonths = null;
        }
      }

      return next;
    }));
  }

  function openAddProduct() {
    const returnTo = encodeURIComponent(`/purchases/new?supplierId=${encodeURIComponent(supplierId)}`);
    setLocation(`/inventory/new?supplierId=${encodeURIComponent(supplierId)}&returnTo=${returnTo}`);
  }

  function getValidatedPaymentState(): { paymentStatus: PurchasePaymentStatus; paidAmount: number } {
    const normalizedGrandTotal = Number(grandTotal) || 0;
    const parsedPaidAmount = Number(paidAmount) || 0;

    if (paymentStatus === 'partial') {
      const normalizedPaidAmount = Math.min(Math.max(0, parsedPaidAmount), normalizedGrandTotal);
      if (normalizedPaidAmount <= 0) {
        return { paymentStatus: 'unpaid' as PurchasePaymentStatus, paidAmount: 0 };
      }
      if (normalizedPaidAmount >= normalizedGrandTotal && normalizedGrandTotal > 0) {
        return { paymentStatus: 'paid' as PurchasePaymentStatus, paidAmount: normalizedGrandTotal };
      }
      return { paymentStatus: 'partial' as PurchasePaymentStatus, paidAmount: normalizedPaidAmount };
    }

    if (paymentStatus === 'paid') {
      return { paymentStatus: 'paid' as PurchasePaymentStatus, paidAmount: normalizedGrandTotal };
    }

    return { paymentStatus: 'unpaid' as PurchasePaymentStatus, paidAmount: 0 };
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!supplierId) {
      toast.error('Select a supplier before saving.');
      return;
    }
    if (items.length === 0) {
      toast.error('Add at least one product.');
      return;
    }
    if (items.some(item => Number(item.quantity) <= 0)) {
      toast.error('Every item must have a quantity greater than zero.');
      return;
    }
    if (items.some(item => Number(item.purchaseRate) < 0)) {
      toast.error('Purchase costs cannot be negative.');
      return;
    }

    const expiryProductMissingDates = items.some(item => {
      const product = inventory.find(candidate => candidate.id === item.productId);
      if (!product?.hasExpiry) return false;

      const expiryMode = item.expiryMode ?? (item.expiryMonths ? 'months' : 'manual');
      if (expiryMode === 'months') {
        return !item.manufacturingDate || !item.expiryMonths || Number(item.expiryMonths) <= 0;
      }

      return !item.manufacturingDate || !item.expiryDate;
    });

    if (expiryProductMissingDates) {
      toast.error('Expiry-tracked items need both manufactured and expiry dates before saving.');
      return;
    }

    setSaving(true);
    try {
      const validatedPayment = getValidatedPaymentState();
      const buildPurchaseDate = () => {
        const datePart = purchaseDate;
        const localTime = new Date().toLocaleTimeString('en-GB', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        if (isNew) {
          return new Date(`${datePart}T${localTime}`);
        }

        const priorDate = existing?.date ? parseISO(existing.date) : null;
        const priorTime = priorDate && Number.isFinite(priorDate.getTime())
          ? priorDate.toTimeString().slice(0, 8)
          : localTime;

        return new Date(`${datePart}T${priorTime}`);
      };

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        supplierId,
        supplierName: selectedSupplier?.name ?? null,
        date: buildPurchaseDate().toISOString(),
        locationId: locationId || undefined,
        items: items.map(item => {
          const expiryMode = item.expiryMode ?? (item.expiryMonths ? 'months' : 'manual');
          const resolvedExpiryDate = expiryMode === 'months'
            ? getComputedExpiryDate(item.manufacturingDate, item.expiryMonths)
            : item.expiryDate ?? null;

          return {
            ...item,
            quantity: Number(item.quantity),
            purchaseRate: Number(item.purchaseRate),
            subtotal: Number(item.quantity) * Number(item.purchaseRate),
            expiryMode,
            expiryMonths: expiryMode === 'months' ? (Number(item.expiryMonths) > 0 ? Number(item.expiryMonths) : null) : null,
            expiryDate: resolvedExpiryDate,
            manufacturingDate: item.manufacturingDate ?? null,
          };
        }),
        discount: discountValue,
        tax: taxValue,
        grandTotal,
        paymentMethod,
        paymentStatus: validatedPayment.paymentStatus,
        paidAmount: validatedPayment.paidAmount,
        referenceNumber: referenceNumber.trim(),
        notes: notes.trim(),
        status,
      } as any;

      if (isNew) {
        await createPurchase(storage, payload);
      } else if (existing) {
        await updatePurchase(storage, existing.id, payload);
      }
      refreshPurchases();
      refreshInventory();
      refreshBatches();
      toast.success(
        isNew
          ? (status === 'received' ? 'Purchase received and inventory updated' : 'Purchase saved as draft')
          : 'Purchase updated successfully'
      );
      setLocation('/purchases');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save purchase');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto pb-28 md:pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isNew ? 'New Purchase' : 'Edit Purchase'}</h1>
          <p className="text-sm text-muted-foreground">
            {isNew ? 'Receive stock from a supplier' : existing?.invoiceNumber || 'Update purchase details'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="space-y-6 min-w-0">
          {/* ── Section 1: Supplier & Invoice Details ─── */}
          <Card>
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Supplier</p>
                  <p className="text-xs text-muted-foreground">Select a supplier or add a new one.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-primary rounded-xl hover:bg-primary/10"
                  onClick={() => {
                    setSupplierPresetName('');
                    setSupplierDialogOpen(true);
                  }}
                >
                  <Truck className="h-3.5 w-3.5" /> New Supplier
                </Button>
              </div>

              <SupplierSearchPicker
                suppliers={suppliers}
                selectedSupplierId={supplierId}
                onSelect={handleSupplierSelect}
                onRemove={handleSupplierRemove}
                onAddNewSupplier={query => {
                  setSupplierPresetName(query);
                  setSupplierDialogOpen(true);
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" /> Purchase Date
                  </span>
                  <Input type="date" value={purchaseDate} onChange={event => setPurchaseDate(event.target.value)} className="h-10 text-sm font-medium" />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" /> Supplier Invoice #
                  </span>
                  <Input value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} placeholder="e.g. SUP-2026-001" className="h-10 text-sm font-medium" />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> Receiving Location
                  </span>
                  <Select value={locationId || defaultLocationId || undefined} onValueChange={setLocationId}>
                    <SelectTrigger className="h-10 text-sm font-medium"><SelectValue placeholder="Select receiving location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-primary" /> Reference Number
                  </span>
                  <Input value={referenceNumber} onChange={event => setReferenceNumber(event.target.value)} placeholder="Optional PO or delivery ref" className="h-10 text-sm font-medium" />
                </label>
                <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide sm:col-span-2">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Inventory Receiving Status
                  </span>
                  <Select value={status} onValueChange={value => setStatus(value as PurchaseStatus)}>
                    <SelectTrigger className="h-10 text-sm font-medium"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="received">Received — update physical inventory & batches</SelectItem>
                      <SelectItem value="draft">Draft — save without updating physical stock</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* ── Section 2: Products ───────────────────── */}
          <Card>
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Products received</h2>
                  <p className="text-xs text-muted-foreground">Search and tap to add, then enter quantity and cost.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={openAddProduct} disabled={!supplierId}>
                  <PackagePlus className="h-4 w-4 mr-1" /> New product
                </Button>
              </div>

              <ProductSearchPicker
                items={availableProductItems}
                onSelect={addItemById}
                disabled={!supplierId}
                placeholder={supplierId ? 'Search by product name or barcode...' : 'Select a supplier first'}
                emptyMessage="No products in inventory yet."
                defaultLimit={8}
              />

              {/* Cart items */}
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Search for products above or tap <strong>New product</strong> to create one.
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => {
                    const product = inventory.find(candidate => candidate.id === item.productId);
                    const priceChanged = item.initialPurchaseRate != null && Number(item.purchaseRate) !== Number(item.initialPurchaseRate);
                    const expiryMode = item.expiryMode ?? (item.expiryMonths ? 'months' : 'manual');
                    const previewExpiry = expiryMode === 'months' && item.manufacturingDate && item.expiryMonths && Number(item.expiryMonths) > 0
                      ? getComputedExpiryDate(item.manufacturingDate, Number(item.expiryMonths))
                      : null;
                    const batchDateIncomplete = Boolean(product?.hasExpiry) && (
                      expiryMode === 'months'
                        ? (!item.manufacturingDate || !item.expiryMonths || Number(item.expiryMonths) <= 0)
                        : (!item.manufacturingDate || !item.expiryDate)
                    );
                    return (
                      <div key={`${item.productId}-${index}`} className="rounded-lg border p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">{product?.unit ?? 'unit'} · Current stock {product?.quantity ?? 0}</p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {/* Pack Mode Header / Ratio Pill */}
                        {product?.packSize && product.packSize > 0 && (
                          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/40 border text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Boxes className="h-3.5 w-3.5 text-primary shrink-0" />
                              <span className="font-semibold text-foreground truncate">
                                1 {product.packUnit || 'pack'} = {product.packSize} {product.unit}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border shrink-0">
                              <button
                                type="button"
                                onClick={() => updateItem(index, 'entryMode', 'pack')}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all",
                                  (item.entryMode ?? 'pack') === 'pack'
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                By {product.packUnit || 'Pack'}
                              </button>
                              <button
                                type="button"
                                onClick={() => updateItem(index, 'entryMode', 'base')}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all",
                                  item.entryMode === 'base'
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                By {product.unit}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {product?.packSize && product.packSize > 0 ? (
                            (item.entryMode ?? 'pack') === 'pack' ? (
                              <>
                                <label className="space-y-1 text-xs font-medium">
                                  <div className="flex items-center justify-between">
                                    <span className="capitalize">{product.packUnit || 'Pack'}s</span>
                                    <span className="text-[10px] text-muted-foreground font-normal tabular-nums">
                                      = {item.quantity} {product.unit}
                                    </span>
                                  </div>
                                  <Input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    value={item.packQuantity ?? ''}
                                    onChange={event => updateItem(index, 'packQuantity', event.target.value)}
                                    placeholder="e.g. 5"
                                  />
                                </label>
                                <label className="space-y-1 text-xs font-medium">
                                  <div className="flex items-center justify-between">
                                    <span className="capitalize">Cost / {product.packUnit || 'pack'}</span>
                                    <span className="text-[10px] text-muted-foreground font-normal tabular-nums">
                                      Rs. {formatMoney(item.purchaseRate)}/{product.unit}
                                    </span>
                                  </div>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.packCost ?? ''}
                                    onChange={event => updateItem(index, 'packCost', event.target.value)}
                                    placeholder="e.g. 3000"
                                  />
                                </label>
                              </>
                            ) : (
                              <>
                                <label className="space-y-1 text-xs font-medium">
                                  <div className="flex items-center justify-between">
                                    <span className="capitalize">Qty ({product.unit})</span>
                                    <span className="text-[10px] text-muted-foreground font-normal tabular-nums">
                                      = {formatQtyDisplay(item.packQuantity ?? safeDiv(item.quantity || 0, product.packSize, 2))} {product.packUnit || 'pack'}s
                                    </span>
                                  </div>
                                  <Input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    value={item.quantity}
                                    onChange={event => updateItem(index, 'quantity', event.target.value)}
                                  />
                                </label>
                                <label className="space-y-1 text-xs font-medium">
                                  <div className="flex items-center justify-between">
                                    <span>Unit cost</span>
                                    <span className="text-[10px] text-muted-foreground font-normal tabular-nums">
                                      Rs. {formatMoney(item.packCost || safeMul(item.purchaseRate, product.packSize))}/{product.packUnit || 'pack'}
                                    </span>
                                  </div>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.purchaseRate}
                                    onChange={event => updateItem(index, 'purchaseRate', event.target.value)}
                                  />
                                </label>
                              </>
                            )
                          ) : (
                            <>
                              <label className="space-y-1 text-xs font-medium">Quantity
                                <Input type="number" min="0.01" step="any" value={item.quantity} onChange={event => updateItem(index, 'quantity', event.target.value)} />
                              </label>
                              <label className="space-y-1 text-xs font-medium">Unit cost
                                <Input type="number" min="0" step="0.01" value={item.purchaseRate} onChange={event => updateItem(index, 'purchaseRate', event.target.value)} />
                              </label>
                            </>
                          )}
                          {product?.hasVariants && (product.variants?.length ?? 0) > 0 && (
                            <label className="space-y-1 text-xs font-medium">Variant
                              <Select value={item.variantName ?? ''} onValueChange={value => updateItem(index, 'variantName', value)}>
                                <SelectTrigger><SelectValue placeholder="Select variant" /></SelectTrigger>
                                <SelectContent>
                                  {product.variants?.map(variant => (
                                    <SelectItem key={variant.name} value={variant.name}>{variant.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          )}
                          <div className={`flex items-end justify-end font-bold text-primary pb-2 ${product?.hasVariants ? '' : 'col-span-2'}`}>{format(item.subtotal)}</div>
                        </div>
                        {priceChanged && (
                          <Alert className="border-blue-200 bg-blue-50/70 text-blue-950">
                            <AlertCircle className="h-4 w-4 text-blue-600" />
                            <AlertDescription>
                              Price changed from {format(Number(item.initialPurchaseRate ?? 0))} to {format(Number(item.purchaseRate))} for now.
                            </AlertDescription>
                          </Alert>
                        )}
                        {product?.hasExpiry && (
                          <div className="space-y-2 border-t pt-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="space-y-1 text-xs font-medium">Batch number
                                <Input value={item.batchNumber ?? ''} onChange={event => updateItem(index, 'batchNumber', event.target.value)} placeholder="Optional batch #" />
                              </label>
                              <label className="space-y-1 text-xs font-medium">Manufactured
                                <Input type="date" value={item.manufacturingDate ?? ''} onChange={event => updateItem(index, 'manufacturingDate', event.target.value || null)} />
                              </label>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium">Expiry mode</label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateItem(index, 'expiryMode', 'months')}
                                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${expiryMode === 'months' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}
                                >
                                  Auto (months)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItem(index, 'expiryMode', 'manual')}
                                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${expiryMode === 'manual' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'}`}
                                >
                                  Manual date
                                </button>
                              </div>
                            </div>
                            {expiryMode === 'months' ? (
                              <label className="space-y-1 text-xs font-medium">Months after manufacturing
                                <Input type="number" min="1" max="120" value={item.expiryMonths ?? ''} onChange={event => updateItem(index, 'expiryMonths', event.target.value === '' ? null : Number(event.target.value))} placeholder="e.g. 12" />
                              </label>
                            ) : (
                              <label className="space-y-1 text-xs font-medium">Expiry
                                <Input type="date" value={item.expiryDate ?? ''} onChange={event => updateItem(index, 'expiryDate', event.target.value || null)} />
                              </label>
                            )}
                            {previewExpiry && (
                              <p className="text-xs text-muted-foreground">
                                Estimated expiry: <span className="font-semibold text-foreground">{formatDate(parseISO(previewExpiry), 'dd MMM yyyy')}</span>
                              </p>
                            )}
                            {batchDateIncomplete && (
                              <Alert className="border-amber-200 bg-amber-50/70 text-amber-950">
                                <AlertCircle className="h-4 w-4 text-amber-600" />
                                <AlertDescription>
                                  {expiryMode === 'months'
                                    ? (!item.manufacturingDate || !item.expiryMonths || Number(item.expiryMonths) <= 0)
                                      ? 'Manufactured date and shelf life in months are required before saving.'
                                      : 'Manufactured date is required for the expiry calculation.'
                                    : (!item.manufacturingDate && !item.expiryDate)
                                      ? 'Manufactured and expiry dates are required for this batch before saving.'
                                      : !item.manufacturingDate
                                        ? 'Manufactured date is required for this batch.'
                                        : 'Expiry date is required for this batch.'}
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Section 3: Notes ─────────────────────── */}
          <Card>
            <CardContent className="p-4 md:p-6 space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Delivery notes, condition, or payment terms" rows={3} />
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar: Purchase summary ──────────────── */}
        <div>
          <Card className="lg:sticky lg:top-20 shadow-sm border-border/80 rounded-2xl overflow-hidden">
            <CardContent className="p-4 md:p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base leading-none">Purchase Summary</h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Payment & tax breakdown</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Subtotal Row */}
              <div className="flex justify-between items-center text-sm py-0.5">
                <span className="text-muted-foreground font-medium">Subtotal</span>
                <span className="font-bold text-foreground tabular-nums text-base">{format(subtotal)}</span>
              </div>

              {/* Discount Section */}
              <div className="space-y-2 rounded-xl bg-muted/40 p-3 border border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-primary" /> Discount
                  </span>
                  {/* Mode Toggle: Rs. vs % */}
                  <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs font-medium shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (discountMode !== 'amount') {
                          setDiscountMode('amount');
                          setDiscountAmount(String(discountValue));
                        }
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded-md transition-all text-[11px]',
                        discountMode === 'amount'
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Rs.
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (discountMode !== 'percent') {
                          setDiscountMode('percent');
                          const pct = subtotal > 0 ? ((discountValue / subtotal) * 100).toFixed(1) : '0';
                          setDiscountPercent(pct);
                        }
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded-md transition-all text-[11px]',
                        discountMode === 'percent'
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      %
                    </button>
                  </div>
                </div>

                {/* Input with inline preview */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none pointer-events-none">
                      {discountMode === 'amount' ? 'Rs.' : '%'}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step={discountMode === 'amount' ? '0.01' : '0.1'}
                      value={discountMode === 'amount' ? discountAmount : discountPercent}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const val = e.target.value;
                        if (discountMode === 'amount') {
                          setDiscountAmount(val);
                        } else {
                          setDiscountPercent(val);
                        }
                      }}
                      placeholder="0"
                      className="pl-8 h-9 text-xs font-medium text-right pr-2.5 bg-background"
                    />
                  </div>
                  <div className="text-right min-w-[75px]">
                    <span className={cn('text-xs font-bold tabular-nums', discountValue > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                      -{format(discountValue)}
                    </span>
                    {discountMode === 'amount' && subtotal > 0 && discountValue > 0 && (
                      <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                        ({((discountValue / subtotal) * 100).toFixed(1)}%)
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick presets */}
                {discountMode === 'percent' ? (
                  <div className="flex items-center gap-1 pt-0.5">
                    <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Quick:</span>
                    {[0, 5, 10, 15, 20].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPercent(String(pct))}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                          Number(discountPercent) === pct
                            ? 'bg-primary text-primary-foreground font-semibold border-primary'
                            : 'bg-background hover:bg-muted text-muted-foreground border-border'
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 pt-0.5">
                    <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Quick:</span>
                    {[0, 100, 250, 500, 1000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDiscountAmount(String(amt))}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                          Number(discountAmount) === amt
                            ? 'bg-primary text-primary-foreground font-semibold border-primary'
                            : 'bg-background hover:bg-muted text-muted-foreground border-border'
                        )}
                      >
                        {amt === 0 ? 'Clear' : `Rs.${amt}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tax Section */}
              <div className="space-y-2 rounded-xl bg-muted/40 p-3 border border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-primary" /> Tax / VAT
                  </span>
                  {/* Mode Toggle: Rs. vs % */}
                  <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs font-medium shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (taxMode !== 'amount') {
                          setTaxMode('amount');
                          setTaxAmount(String(taxValue));
                        }
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded-md transition-all text-[11px]',
                        taxMode === 'amount'
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Rs.
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (taxMode !== 'percent') {
                          setTaxMode('percent');
                          const base = Math.max(0, subtotal - discountValue);
                          const pct = base > 0 ? ((taxValue / base) * 100).toFixed(1) : String(settings.taxRate || 13);
                          setTaxPercent(pct);
                        }
                      }}
                      className={cn(
                        'px-2 py-0.5 rounded-md transition-all text-[11px]',
                        taxMode === 'percent'
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      %
                    </button>
                  </div>
                </div>

                {/* Input with inline preview */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none pointer-events-none">
                      {taxMode === 'amount' ? 'Rs.' : '%'}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step={taxMode === 'amount' ? '0.01' : '0.1'}
                      value={taxMode === 'amount' ? taxAmount : taxPercent}
                      onFocus={e => e.target.select()}
                      onChange={e => {
                        const val = e.target.value;
                        if (taxMode === 'amount') {
                          setTaxAmount(val);
                        } else {
                          setTaxPercent(val);
                        }
                      }}
                      placeholder="0"
                      className="pl-8 h-9 text-xs font-medium text-right pr-2.5 bg-background"
                    />
                  </div>
                  <div className="text-right min-w-[75px]">
                    <span className="text-xs font-bold tabular-nums text-foreground">
                      +{format(taxValue)}
                    </span>
                    {taxMode === 'amount' && taxableAmount > 0 && taxValue > 0 && (
                      <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                        ({((taxValue / taxableAmount) * 100).toFixed(1)}%)
                      </p>
                    )}
                  </div>
                </div>

                {/* Quick presets for tax */}
                {taxMode === 'percent' && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Quick:</span>
                    {[
                      { label: '0%', val: 0 },
                      { label: '5%', val: 5 },
                      { label: '13% VAT', val: 13 },
                    ].map(preset => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setTaxPercent(String(preset.val))}
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                          Number(taxPercent) === preset.val
                            ? 'bg-primary text-primary-foreground font-semibold border-primary'
                            : 'bg-background hover:bg-muted text-muted-foreground border-border'
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Grand Total Box */}
              <div className="rounded-2xl bg-primary/[0.06] dark:bg-primary/[0.12] border border-primary/25 p-4 space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>Grand Total</span>
                  {items.length > 0 && (
                    <span className="text-[10px] font-normal text-primary">
                      {items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} units total
                    </span>
                  )}
                </div>
                <div className="text-2xl font-black text-primary tracking-tight tabular-nums">
                  {format(grandTotal)}
                </div>
              </div>

              {/* Payment Method - using PaymentMethodPicker */}
              <div className="border-t pt-3 space-y-3">
                <PaymentMethodPicker
                  label="Payment Method"
                  selectedMethod={paymentMethod}
                  onSelect={setPaymentMethod}
                  methods={['cash', 'qr', 'card', 'bank', 'split', 'other']}
                />

                {/* Payment Status Segmented Picker */}
                <div className="space-y-2 pt-1">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">
                    Payment Status
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted/60 border">
                    <button
                      type="button"
                      onClick={() => setPaymentStatus('unpaid')}
                      className={cn(
                        'py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center justify-center gap-0.5',
                        paymentStatus === 'unpaid'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      )}
                    >
                      <span>Unpaid</span>
                      <span className="text-[9px] opacity-85 font-normal">On Credit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentStatus('partial');
                        if (!paidAmount || Number(paidAmount) === 0) {
                          setPaidAmount(String(safeCurrency(grandTotal / 2)));
                        }
                      }}
                      className={cn(
                        'py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center justify-center gap-0.5',
                        paymentStatus === 'partial'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      )}
                    >
                      <span>Partial</span>
                      <span className="text-[9px] opacity-85 font-normal">Split / Due</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentStatus('paid')}
                      className={cn(
                        'py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center justify-center gap-0.5',
                        paymentStatus === 'paid'
                          ? 'bg-green-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      )}
                    >
                      <span>Paid</span>
                      <span className="text-[9px] opacity-85 font-normal">In Full</span>
                    </button>
                  </div>

                  {/* Status-specific breakdown & Partial input */}
                  {paymentStatus === 'partial' ? (
                    <div className="space-y-2 rounded-xl border p-3 bg-muted/30">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground">Amount Paid</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                          Due: {format(Math.max(0, grandTotal - (Number(paidAmount) || 0)))}
                        </span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none select-none">
                          Rs.
                        </span>
                        <Input
                          type="number"
                          min="0"
                          max={grandTotal}
                          step="0.01"
                          value={paidAmount}
                          onFocus={e => e.target.select()}
                          onChange={event => setPaidAmount(event.target.value)}
                          className="pl-9 h-9 text-xs font-semibold bg-background"
                        />
                      </div>
                      {/* Quick partial chips */}
                      <div className="flex items-center gap-1 pt-0.5">
                        <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Preset:</span>
                        {[
                          { label: '25%', factor: 0.25 },
                          { label: '50%', factor: 0.5 },
                          { label: '75%', factor: 0.75 },
                        ].map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setPaidAmount(String(safeCurrency(grandTotal * preset.factor)))}
                            className="text-[10px] px-2 py-0.5 rounded border bg-background hover:bg-muted text-muted-foreground"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : paymentStatus === 'unpaid' ? (
                    <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-semibold leading-tight">Supplier Payable</p>
                        <p className="text-[11px] opacity-90 mt-0.5">
                          Full {format(grandTotal)} will be added to {selectedSupplier?.name ? `${selectedSupplier.name}'s` : "supplier's"} credit balance.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-green-200/60 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900/50 p-2.5 text-xs text-green-800 dark:text-green-300 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                      <span className="font-medium text-[11px]">Paid in full via {paymentMethod.toUpperCase()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit CTA */}
              <Button type="submit" size="lg" className="w-full h-12 text-sm font-semibold rounded-xl shadow-sm transition-all" disabled={saving}>
                <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : status === 'received' ? 'Save & receive stock' : 'Save draft'}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground leading-snug">
                Received purchases automatically update inventory stock, location stock, and supplier costs.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>

      <SupplierFormDialog
        open={supplierDialogOpen}
        onClose={() => {
          setSupplierDialogOpen(false);
          setSupplierPresetName('');
        }}
        defaultName={supplierPresetName}
        onSuccess={(newSupplierId) => {
          if (newSupplierId && newSupplierId !== supplierId) {
            setSupplierId(newSupplierId);
            if (items.length > 0) {
              setItems([]);
            }
          }
          setSupplierDialogOpen(false);
          setSupplierPresetName('');
        }}
      />
    </div>
  );
}