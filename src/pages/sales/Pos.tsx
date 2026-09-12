import { useState, useMemo, useRef, lazy, Suspense, useEffect, useCallback } from 'react';
import { isAfter, isBefore, parseISO, startOfDay } from 'date-fns';
import { useInventory, useSales, useCustomers, useProductBatches, useCredit, useInventoryLocationStocks, useProductBatchLocations } from '@/contexts/GlobalProviders';
import { useCurrency } from '@/hooks/useCurrency';
import { useApp } from '@/contexts/AppContext';
import { rankSearch } from '@/utils/search/rank';
import { useBackModal, useSmartBack } from '@/contexts/NavigationContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ShoppingCart, ArrowLeft, X, ChevronUp, Package } from 'lucide-react';
import { toast } from 'sonner';
import { PaymentMethod, ProductBatch, SaleInvoice } from '@/types';
import { BarcodeScanner } from '@/components/BarcodeScanner';
const SaleBillPrint = lazy(() => import('@/components/SaleBillPrint').then(m => ({ default: m.SaleBillPrint })));

import { useFeature } from '@/hooks/useFeature';
import { ProductCard } from '@/components/pos/ProductCard';
import { CartPanel } from '@/components/pos/CartPanel';
import { VariantPicker } from '@/components/pos/VariantPicker';
import { CartItem, Product } from '@/types';
import { isProductAvailableForPOS } from '@/lib/productCapabilities';
import { InventoryLedgerService } from '@/services/inventoryLedgerService';
import { useStorageProvider } from '@/storage/StorageContext';
import { FinancialPostingService } from '@/services/financialPostingService';

interface VariantDraft {
  productId: string;
  product: Product;
  expanded: boolean;
}

type BatchCostAllocation = {
  batchId: string;
  quantity: number;
  purchaseRate: number;
};

function isBatchSellable(batch: ProductBatch): boolean {
  if (batch.quantity <= 0) return false;
  if (!batch.expiryDate) return true;

  try {
    const expiry = startOfDay(parseISO(batch.expiryDate));
    return !isBefore(expiry, startOfDay(new Date()));
  } catch {
    return true;
  }
}

function getSellableBatches(batches: ProductBatch[]): ProductBatch[] {
  return [...batches]
    .filter(isBatchSellable)
    .sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.localeCompare(b.expiryDate);
    });
}

function getSellableBatchQuantity(batches: ProductBatch[]) {
  return getSellableBatches(batches).reduce((sum, batch) => sum + batch.quantity, 0);
}

function allocateSellableBatches(batches: ProductBatch[], needed: number): { allocations: BatchCostAllocation[]; totalAllocated: number } {
  const eligible = getSellableBatches(batches);
  const allocations: BatchCostAllocation[] = [];
  let remaining = needed;

  for (const batch of eligible) {
    if (remaining <= 0) break;
    const deduction = Math.min(batch.quantity, remaining);
    if (deduction <= 0) continue;
    allocations.push({ batchId: batch.id, quantity: deduction, purchaseRate: batch.purchaseRate });
    remaining -= deduction;
  }

  return { allocations, totalAllocated: needed - remaining };
}

export default function SalesPos() {
  const isDiscountsEnabled = useFeature('sales', 'discounts');
  const goBack = useSmartBack('/sales');
  const { items: inventory, update: updateInventory } = useInventory();
  const { add: addSale } = useSales();
  const { add: addCredit } = useCredit();
  const { items: customers } = useCustomers();
  const { items: batches, update: updateBatch } = useProductBatches();
  const { items: locationStocks, update: updateLocationStock, add: addLocationStock } = useInventoryLocationStocks();
  const { items: batchLocations, update: updateBatchLocation, add: addBatchLocation } = useProductBatchLocations();
  const { format, symbol } = useCurrency();
  const { settings } = useApp();
  const storage = useStorageProvider();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountType, setDiscountType] = useState<'flat' | 'percent'>('flat');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [showCustomer, setShowCustomer] = useState(false);
  const [printSale, setPrintSale] = useState<SaleInvoice | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Mobile-specific state
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const overlaySearchRef = useRef<HTMLInputElement>(null);

  useBackModal(showCustomer, () => setShowCustomer(false), 'pos-customer-sheet');

  // When cart drawer opens/closes, prevent body scroll
  useEffect(() => {
    if (cartOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [cartOpen]);

  // Focus overlay search input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => overlaySearchRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 120);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const availableProducts = useMemo(() => {
    return inventory
      .filter(p => p.quantity > 0 && isProductAvailableForPOS(p))
      .map(product => ({
        ...product,
        _search:
          [
            product.name,
            product.barcode,
            product.category,
            product.unit,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
      }));
  }, [inventory]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of availableProducts) {
      if (product.category) counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category]) => category);
  }, [availableProducts]);

  const visibleCategories = useMemo(() => categories.slice(0, 8), [categories]);
  const categoryProducts = useMemo(
    () => categoryFilter === 'all'
      ? availableProducts
      : availableProducts.filter(product => product.category === categoryFilter),
    [availableProducts, categoryFilter],
  );

  const inventoryById = useMemo(() => {
    const map = new Map<string, typeof inventory[number]>();
    for (const p of inventory) map.set(p.id, p);
    return map;
  }, [inventory]);

  const barcodeMap = useMemo(() => {
    const map = new Map<string, typeof inventory[number]>();

    for (const product of inventory) {
      const barcode = product.barcode?.trim();
      if (product.quantity > 0 && isProductAvailableForPOS(product) && barcode) {
        map.set(barcode, product);
      }
    }


    return map;
  }, [inventory]);



  const customerMap = useMemo(() => {
    const map = new Map<string, typeof customers[number]>();

    for (const customer of customers) {
      map.set(customer.id, customer);
    }

    return map;
  }, [customers]);

  const searchResults = useMemo(() => {
    const q = debouncedSearch.trim();

    // Barcode scans are handled separately
    if (/^\d{8,}$/.test(q)) return [];

    // Wait until user types at least 2 characters
    if (q.length < 2) return [];

    return rankSearch(availableProducts, q, 20);
  }, [availableProducts, debouncedSearch]);

  const cartLineKey = (item: Pick<CartItem, 'productId' | 'variantName'>) =>
    `${item.productId}::${item.variantName ?? ''}`;

  const addToCart = (product: typeof inventory[0]) => {
    if (product.hasVariants) {
      setVariantDrafts(cur => {
        if (cur.some(item => item.productId === product.id)) {
          return cur.map(item => item.productId === product.id ? { ...item, expanded: true } : item);
        }
        return [...cur, { productId: product.id, product, expanded: false }];
      });
      setSearchQuery('');
      closeSearch();
      return true;
    }

    const productBatches = batchesByProduct.get(product.id) ?? [];
    const sellableQuantity = productBatches.length > 0 ? getSellableBatchQuantity(productBatches) : product.quantity;
    if (sellableQuantity <= 0) {
      toast.error(`Only ${sellableQuantity} ${product.unit} in stock`);
      return false;
    }

    setCart(cur => {
      const existing = cur.find(i => cartLineKey(i) === cartLineKey({ productId: product.id }));
      if (existing) {
        if (existing.quantity >= sellableQuantity) {
          toast.error(`Only ${sellableQuantity} ${product.unit} in stock`);
          return cur;
        }
        return cur.map(i =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.sellingRate }
            : i
        );
      }

      return [...cur, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        sellingRate: product.sellingRate,
        maxQuantity: sellableQuantity,
        subtotal: product.sellingRate,
      }];
    });

    setSearchQuery('');
    closeSearch();
    toast.success(`Added ${product.name}`, { duration: 1200 });
    return true;
  };

  const setVariantQuantity = (productId: string, name: string, requestedQuantity: number) => {
    const draft = variantDrafts.find(item => item.productId === productId);
    const product = inventoryById.get(productId) ?? draft?.product;
    if (!product) return;
    const variant = product.variants?.find(item => item.name === name);
    if (!variant) return;

    const productBatches = batchesByProduct.get(product.id) ?? [];
    const sellableQuantity = productBatches.length > 0 ? getSellableBatchQuantity(productBatches) : product.quantity;
    const otherSelected = cart
      .filter(item => item.productId === product.id && item.variantName !== name)
      .reduce((sum, item) => sum + item.quantity, 0);
    const maxAllowed = Math.max(0, Math.min(variant.quantity, sellableQuantity - otherSelected));
    const quantity = Math.max(0, Math.min(maxAllowed, Math.floor(Number.isFinite(requestedQuantity) ? requestedQuantity : 0)));
    const withoutVariant = cart.filter(item => cartLineKey(item) !== cartLineKey({ productId: product.id, variantName: name }));

    if (quantity === 0) {
      setCart(withoutVariant);
      return;
    }

    const nextItem: CartItem = {
      productId: product.id,
      productName: product.name,
      variantName: name,
      quantity,
      sellingRate: product.sellingRate,
      maxQuantity: maxAllowed,
      subtotal: quantity * product.sellingRate,
    };

    setCart(prev => {
      return [...withoutVariant, nextItem];
    });
  };

  const handleBarcodeScanned = (barcode: string) => {
    const code = barcode.trim();

    const exact = barcodeMap.get(code);
    if (exact) {
      return addToCart(exact) ? 'accepted' as const : 'rejected' as const;
    }

    setSearchQuery(code);
    setSearchOpen(true);
    toast.error("Product not found");
    return 'rejected' as const;
  };

  const updateCartQuantity = (lineKey: string, delta: number) => {
    setCart(cur => cur.map(item => {
      if (cartLineKey(item) !== lineKey) return item;
      const newQ = item.quantity + delta;
      if (newQ <= 0) return item;
      if (newQ > item.maxQuantity) { toast.error(`Only ${item.maxQuantity} in stock`); return item; }
      return { ...item, quantity: newQ, subtotal: newQ * item.sellingRate };
    }));
  };

  const setCartQuantity = (lineKey: string, qty: number) => {
    if (isNaN(qty) || qty < 1) return;
    setCart(cur => cur.map(item => {
      if (cartLineKey(item) !== lineKey) return item;
      if (qty > item.maxQuantity) {
        toast.error(`Only ${item.maxQuantity} in stock`);
        return { ...item, quantity: item.maxQuantity, subtotal: item.maxQuantity * item.sellingRate };
      }
      return { ...item, quantity: qty, subtotal: qty * item.sellingRate };
    }));
  };

  const removeFromCart = (lineKey: string) => setCart(cur => cur.filter(i => cartLineKey(i) !== lineKey));

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const discount = useMemo(() => {
    if (discountType === 'percent') {
      return Math.round(subtotal * (discountValue / 100) * 100) / 100;
    }
    return discountValue;
  }, [discountType, discountValue, subtotal]);
  const taxAmount = Math.round((subtotal - discount) * (taxPercent / 100) * 100) / 100;
  const grandTotal = Math.max(0, subtotal - discount + taxAmount);
  const change = paidAmount !== '' && Number(paidAmount) > grandTotal ? Number(paidAmount) - grandTotal : 0;
  const selectedCustomer = customerId ? customerMap.get(customerId) : undefined;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartDisplayCount = cartCount + (variantDrafts.length > 0 ? variantDrafts.length : 0);

  const batchesByProduct = useMemo(() => {
    const map = new Map<string, ProductBatch[]>();
    for (const batch of batches) {
      if (batch.quantity <= 0) continue;
      const list = map.get(batch.productId);
      if (list) list.push(batch);
      else map.set(batch.productId, [batch]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      });
    }
    return map;
  }, [batches]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    const requestedByProduct = new Map<string, number>();
    const requestedByVariant = new Map<string, number>();
    for (const item of cart) {
      requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
      if (item.variantName) {
        const key = `${item.productId}::${item.variantName}`;
        requestedByVariant.set(key, (requestedByVariant.get(key) ?? 0) + item.quantity);
      }
    }

    const productAllocationsByProduct = new Map<string, BatchCostAllocation[]>();
    const batchDeductionsByProduct = new Map<string, Map<string, number>>();
    const stockErrors: string[] = [];

    for (const [productId, requestedQuantity] of requestedByProduct) {
      const p = inventoryById.get(productId);
      if (!p) {
        stockErrors.push(`${productId} no longer exists`);
        continue;
      }

      const productBatches = batchesByProduct.get(productId) ?? [];
      const sellableBatches = getSellableBatches(productBatches);
      const totalSellable = sellableBatches.reduce((sum, batch) => sum + batch.quantity, 0);

      if (productBatches.length > 0 || p.hasExpiry) {
        if (requestedQuantity > totalSellable) {
          stockErrors.push(`${p.name} (sellable stock: ${totalSellable}, needed: ${requestedQuantity})`);
          continue;
        }

        const { allocations, totalAllocated } = allocateSellableBatches(productBatches, requestedQuantity);
        if (totalAllocated < requestedQuantity) {
          stockErrors.push(`${p.name} (sellable stock: ${totalSellable}, needed: ${requestedQuantity})`);
          continue;
        }

        productAllocationsByProduct.set(productId, allocations);

        const batchDeductions = new Map<string, number>();
        for (const allocation of allocations) {
          batchDeductions.set(
            allocation.batchId,
            (batchDeductions.get(allocation.batchId) ?? 0) + allocation.quantity,
          );
        }
        batchDeductionsByProduct.set(productId, batchDeductions);
      } else {
        if (p.quantity < requestedQuantity) {
          stockErrors.push(`${p.name} (available: ${p.quantity}, needed: ${requestedQuantity})`);
        }
      }

      for (const variant of p.variants ?? []) {
        const requestedVariant = requestedByVariant.get(`${p.id}::${variant.name}`) ?? 0;
        if (requestedVariant > variant.quantity) {
          stockErrors.push(`${p.name} · ${variant.name} (available: ${variant.quantity}, needed: ${requestedVariant})`);
        }
      }
    }

    if (stockErrors.length > 0) {
      toast.error(`Insufficient stock: ${stockErrors.join('; ')}`);
      return;
    }

    const paidNow = paidAmount === '' ? (paymentMethod === 'credit' ? 0 : grandTotal) : Number(paidAmount);
    if (paidNow < 0 || paidNow > grandTotal) {
      toast.error(`Paid amount cannot be more than the total (${format(grandTotal)})`);
      return;
    }
    if (paymentMethod === 'credit' && !customerId) {
      toast.error('Select a customer before saving credit');
      setShowCustomer(true);
      return;
    }
    if (paymentMethod !== 'credit' && paidAmount !== '' && Number(paidAmount) < grandTotal) {
      toast.error(`Paid amount (${format(Number(paidAmount))}) is less than total (${format(grandTotal)})`);
      return;
    }
    const dueAmount = Math.max(0, grandTotal - paidNow);
    if (paymentMethod === 'credit' && dueAmount <= 0) {
      toast.error('Credit must have an unpaid balance');
      return;
    }

    try {
      const remainingProductAllocations = new Map<string, BatchCostAllocation[]>(
        [...productAllocationsByProduct.entries()].map(([productId, allocations]) => [productId, [...allocations]]),
      );

      const saleItems = cart.map(item => {
        const productQueue = remainingProductAllocations.get(item.productId) ?? [];
        if (productQueue.length === 0) {
          return {
            productId: item.productId,
            productName: item.productName,
            variantName: item.variantName,
            quantity: item.quantity,
            sellingRate: item.sellingRate,
            subtotal: item.subtotal,
          };
        }

        let remaining = item.quantity;
        const itemAllocations: BatchCostAllocation[] = [];
        const nextQueue: BatchCostAllocation[] = [];

        for (const allocation of productQueue) {
          if (remaining <= 0) {
            nextQueue.push(allocation);
            continue;
          }

          const take = Math.min(remaining, allocation.quantity);
          itemAllocations.push({
            batchId: allocation.batchId,
            quantity: take,
            purchaseRate: allocation.purchaseRate,
          });
          remaining -= take;

          if (allocation.quantity - take > 0) {
            nextQueue.push({
              ...allocation,
              quantity: allocation.quantity - take,
            });
          }
        }

        if (remaining > 0) {
          throw new Error(`Unable to allocate batch cost for ${item.productName}`);
        }

        remainingProductAllocations.set(item.productId, nextQueue);

        return {
          productId: item.productId,
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          sellingRate: item.sellingRate,
          subtotal: item.subtotal,
          costAllocations: itemAllocations,
        };
      });

      const saleRecord: Omit<SaleInvoice, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'> = {
        customerId: customerId || null,
        customerName: customerId
          ? (customerMap.get(customerId)?.name ?? null)
          : null,
        date: new Date().toISOString(),
        items: saleItems,
        discount, tax: taxAmount, grandTotal,
        paidAmount: paidNow,
        paymentMethod,
        bankAccountId: paymentMethod === 'bank' ? selectedBankAccountId : null,
        notes: '',
      };
      const commitSale = async () => {
        const saved = await addSale(saleRecord);
        if (paymentMethod === 'credit' && selectedCustomer) {
          await addCredit({
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
            phone: selectedCustomer.phone,
            amount: dueAmount,
            paidAmount: 0,
            description: `POS sale • ${cart.length} item${cart.length !== 1 ? 's' : ''}`,
            date: new Date().toISOString(),
            dueDate: null,
            status: 'pending',
            paidAt: null,
            notes: paidNow > 0 ? `Paid ${format(paidNow)} at checkout` : 'Full credit sale',
            sourceSaleId: saved.id,
            payments: [],
          });
        }

        for (const [productId, requestedQuantity] of requestedByProduct) {
          const p = inventoryById.get(productId);
          if (!p) continue;

          const productBatchDeductions = batchDeductionsByProduct.get(productId) ?? new Map<string, number>();

          const updatedVariants = p.variants?.map(variant => ({
            ...variant,
            quantity: Math.max(0, variant.quantity - (requestedByVariant.get(`${p.id}::${variant.name}`) ?? 0)),
          }));

          const mutations = {
            inventory: { items: inventory, update: updateInventory },
            locationStocks: { items: locationStocks, update: updateLocationStock, add: addLocationStock as any },
            batches: { items: batches, update: updateBatch },
            batchLocations: { items: batchLocations, update: updateBatchLocation, add: addBatchLocation as any },
          };

          if (productBatchDeductions.size > 0) {
            for (const [batchId, deductionQuantity] of productBatchDeductions) {
              await InventoryLedgerService.adjustStock(productId, 'loc-default', -deductionQuantity, mutations, {
                batchId,
              });
            }
          } else {
            await InventoryLedgerService.adjustStock(productId, 'loc-default', -requestedQuantity, mutations);
          }

          if (p.hasVariants && updatedVariants) {
            await updateInventory(p.id, {
              variants: updatedVariants,
            });
          }
        }

        await FinancialPostingService.postSaleInTransaction(storage, {
          id: saved.id,
          date: saved.date,
          grandTotal: saved.grandTotal,
          paidAmount: saved.paidAmount,
          paymentMethod: saved.paymentMethod,
          bankAccountId: saved.paymentMethod === 'bank' ? selectedBankAccountId : null,
          splitPayments: saved.splitPayments,
          customerId: saved.customerId,
          customerName: saved.customerName,
          locationId: 'loc-default',
        });
        return saved;
      };
      const savedSale = storage.transaction
        ? await storage.transaction([
          'sales', 'credit', 'inventory', 'inventoryLocationStocks', 'productBatches',
          'productBatchLocations', 'financialAccounts', 'financialTransactions', 'financialMovements',
          'locations', 'settings',
        ], 'rw', commitSale)
        : await commitSale();

      toast.success(paymentMethod === 'credit'
        ? `Sale saved • ${format(dueAmount)} added to credit`
        : 'Sale completed!');
      setPrintSale(savedSale);
      setCart([]); setDiscountValue(0); setDiscountType('flat'); setTaxPercent(0); setPaidAmount(''); setCustomerId('');
      setPaymentMethod('cash'); setCategoryFilter('all');
      setCartOpen(false);
    } catch (e) {
      toast.error('Checkout failed');
      console.error(e);
    }
  };

  /** Common props forwarded to CartPanel */
  const cartPanelProps = {
    cart,
    cartCount: cartDisplayCount,
    discount,
    discountType,
    discountValue,
    taxPercent,
    taxAmount,
    subtotal,
    grandTotal,
    paidAmount,
    paymentMethod,
    selectedBankAccountId,
    onSetBankAccountId: setSelectedBankAccountId,
    customerId,
    showCustomer,
    selectedCustomerName: selectedCustomer?.name,
    change,
    isDiscountsEnabled,
    symbol,
    format,
    onSetDiscountType: setDiscountType,
    onSetDiscountValue: setDiscountValue,
    onSetTaxPercent: setTaxPercent,
    onSetPaymentMethod: (method: PaymentMethod) => {
      setPaymentMethod(method);
      if (method === 'credit' && paidAmount === '') setPaidAmount('');
      if (method !== 'credit' && paidAmount === 0) setPaidAmount('');
    },
    onSetPaidAmount: setPaidAmount,
    onSetCustomerId: setCustomerId,
    onToggleCustomer: () => setShowCustomer(v => !v),
    onCloseCustomer: () => setShowCustomer(false),
    onClearCart: () => {
      setCart([]);
      setVariantDrafts([]);
    },
    onRemoveFromCart: removeFromCart,
    onUpdateCartQuantity: updateCartQuantity,
    onSetCartQuantity: setCartQuantity,
    variantDrafts,
    onToggleVariantDraft: (productId: string) => {
      setVariantDrafts(cur => cur.map(item => item.productId === productId ? { ...item, expanded: !item.expanded } : item));
    },
    onRemoveVariantDraft: (productId: string) => {
      setVariantDrafts(cur => cur.filter(item => item.productId !== productId));
    },
    onSetVariantQuantity: setVariantQuantity,
    onCheckout: handleCheckout,
  };


  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = searchQuery.trim();
    if (!code) return;
    const product = barcodeMap.get(code);
    if (product) {
      e.preventDefault();
      addToCart(product);
      // The addToCart function already clears searchQuery and closes the overlay
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] md:h-screen bg-muted/20">

      {/* ── MOBILE SEARCH OVERLAY ──────────────────────────────────────────────
           Fixed fullscreen. Input at top → keyboard opens below → results stay
           visible in the space between input and keyboard. Never covered.     */}
      {searchOpen && (
        <div className="fixed inset-0 z-9999 bg-background flex flex-col lg:hidden">
          {/* Search bar row */}
          <div className="flex items-center gap-2 px-3 py-3 border-b bg-background shrink-0">
            <button
              onClick={closeSearch}
              className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={overlaySearchRef}
                type="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                placeholder="Search product by name or barcode…"
                className="w-full h-11 pl-9 pr-9 rounded-lg border bg-muted/50 text-base outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Results — fills remaining space above keyboard */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {searchQuery.trim() === '' ? (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center text-muted-foreground">
                <Search className="h-12 w-12 mb-4 opacity-20" />

                <h3 className="text-base font-semibold text-foreground">
                  Search Products
                </h3>

                <p className="text-sm mt-2 max-w-xs">
                  Type a product name, barcode, or scan an item to begin.
                </p>
              </div>
            ) : searchQuery.trim().length < 2 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Search className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">Keep typing…</p>
                <p className="text-xs mt-1">
                  Enter at least 2 characters
                </p>
              </div>
            ) : searchResults.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground px-4 py-2 font-medium">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </p>
                {searchResults.map(product => (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b hover:bg-muted active:bg-muted/80 text-left transition-colors"
                    onClick={() => addToCart(product)}
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{product.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                        {product.barcode && <span>#{product.barcode}</span>}
                        <span className="text-green-600 font-medium">Stock: {product.quantity} {product.unit}</span>
                        {product.category && <span>• {product.category}</span>}
                      </div>
                    </div>
                    <div className="font-bold text-primary shrink-0 text-sm tabular-nums">{format(product.sellingRate)}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Search className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No products found</p>
                <p className="text-xs mt-1">"{searchQuery}"</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MOBILE CART DRAWER ─────────────────────────────────────────────────
           Bottom sheet that slides up when cart bar is tapped.               */}
      {cartOpen && (
        <div className="fixed inset-0 z-9998 lg:hidden flex flex-col justify-end">
          {/* Scrim */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
          />
          {/* Drawer panel — 85dvh max, scrollable inside */}
          <div className="relative bg-background rounded-t-2xl flex flex-col"
            style={{ maxHeight: '85dvh' }}>
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <CartPanel {...cartPanelProps} inDrawer />
          </div>
        </div>
      )}

      {/* ── MAIN LAYOUT ────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

        {/* Left — Search & Products */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Header bar (always visible) */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0">
            <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0 h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-bold hidden md:block shrink-0">Point of Sale</h1>

            {/* Search trigger button (mobile) / real search input (desktop) */}
            <button
              className="flex-1 flex items-center gap-2 h-11 px-3 rounded-lg border bg-muted/50 text-muted-foreground text-sm hover:bg-muted transition-colors lg:hidden"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span>Search products…</span>
            </button>

            {/* Desktop: real input with inline dropdown */}
            {/* Desktop: real input with inline dropdown */}
            <div className="hidden lg:flex flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus
                placeholder="Search product by name or barcode…"
                className="pl-9 h-11 text-base border-primary/20 focus-visible:ring-primary bg-background"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchQuery(searchQuery)}
              />
              {searchQuery.trim() && (
                <div className="absolute top-11.5 left-0 right-0 bg-card border rounded-xl shadow-2xl z-50 overflow-hidden max-h-80 flex flex-col">
                  {searchQuery.trim().length < 2 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground space-y-1">
                      <p className="text-sm font-medium">Keep typing…</p>
                      <p className="text-xs">Enter at least 2 characters</p>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="overflow-y-auto divide-y flex-1">
                      {searchResults.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left transition-colors active:bg-muted"
                          onClick={() => { addToCart(product); setSearchQuery(''); }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{product.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 flex gap-2">
                              {product.barcode && <span>#{product.barcode}</span>}
                              <span className="text-green-600 font-medium">Stock: {product.quantity} {product.unit}</span>
                              {product.category && <span>• {product.category}</span>}
                            </div>
                          </div>
                          <div className="font-bold text-primary shrink-0 text-sm tabular-nums">{format(product.sellingRate)}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No products found for "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>

            <BarcodeScanner onScan={handleBarcodeScanned} autoClose={false} />
          </div>

          {/* Product grid — visible on all sizes now on mobile too */}
          <div className="flex-1 overflow-y-auto p-3 pb-24">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs text-muted-foreground font-medium">
                {categoryProducts.length} product{categoryProducts.length !== 1 ? 's' : ''} in stock
              </p>
              {categories.length > 8 && (
                <select
                  value={categories.includes(categoryFilter) && !visibleCategories.includes(categoryFilter) ? categoryFilter : 'more'}
                  onChange={e => setCategoryFilter(e.target.value === 'more' ? 'all' : e.target.value)}
                  className="h-8 max-w-36 rounded-lg border bg-background px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="More product categories"
                >
                  <option value="more">More categories</option>
                  {categories.slice(8).map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${categoryFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              >
                All
              </button>
              {visibleCategories.map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${categoryFilter === category ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {categoryProducts.slice(0, 24).map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  format={format}
                  onClick={() => addToCart(product)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right — Cart (desktop sidebar) */}
        <div className="hidden lg:flex w-95 xl:w-105 bg-card border-l flex-col shadow-xl z-10">
          <ScrollArea className="flex-1">
            <CartPanel {...cartPanelProps} />
          </ScrollArea>
        </div>
      </div>

      {/* ── MOBILE BOTTOM CART BAR ─────────────────────────────────────────── */}
      <div className="fixed left-0 right-0 bottom-16 z-50 lg:hidden border-t bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <button
          className="w-full flex items-center justify-between px-4 py-3 active:bg-muted/50 transition-colors"
          onClick={() => setCartOpen(true)}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="h-6 w-6" />
              {cartDisplayCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center leading-none">
                  {cartDisplayCount > 9 ? '9+' : cartDisplayCount}
                </span>
              )}
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold">
                {cartDisplayCount === 0 ? 'Cart is empty' : `${cartDisplayCount} item${cartDisplayCount !== 1 ? 's' : ''}`}
              </div>
              {cartDisplayCount > 0 && (
                <div className="text-xs text-muted-foreground">Tap to review & checkout</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <span className="font-bold text-primary text-base tabular-nums">{format(grandTotal)}</span>
            )}
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </div>

      {printSale && (
        <Suspense fallback={null}>
          <SaleBillPrint
            sale={printSale}
            settings={settings}
            customerName={printSale.customerName ?? undefined}
            open={!!printSale}
            onClose={() => setPrintSale(null)}
          />
        </Suspense>
      )}

    </div>
  );
}
