import { useMemo, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useInventory, useSuppliers, useProductBatches, useLocations, useInventoryLocationStocks, useProductBatchLocations } from '@/contexts/GlobalProviders';
import { getLocationStockForProduct, getTotalStockAcrossLocations } from '@/lib/locationStock';
import { useSort } from '@/hooks/useSort';
import { useCurrency } from '@/hooks/useCurrency';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Search,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Package,
  ShoppingCart,
  SlidersHorizontal,
  AlertTriangle,
  ArrowUpDown,
  X,
  ChevronDown,
  ImageOff,
} from 'lucide-react';
import { StockAdjustDialog } from '@/components/StockAdjustDialog';
import { ExpiryBadge, getBatchStatus } from '@/components/BatchFormDialog';
import { Product } from '@/types';
import { toast } from 'sonner';
import { rankSearch } from '@/utils/search/rank';
import { useFeature } from '@/hooks/useFeature';

const PAGE_SIZE = 12;

export default function InventoryList() {
  const isBatchesEnabled = useFeature('inventory', 'batches');
  const isExpiryEnabled = useFeature('inventory', 'expiry');
  const [pathname, setLocation] = useLocation();
  const { items, remove, undoRemove, hardRemove, update } = useInventory();
  const { items: suppliers } = useSuppliers();
  const { items: batches } = useProductBatches();
  const { items: locations } = useLocations();
  const { items: locationStocks } = useInventoryLocationStocks();
  const { items: batchLocations } = useProductBatchLocations();
  const { format } = useCurrency();
  const showUndoToast = useUndoDelete(undoRemove);

  // Extract location filter from query params
  const locationFilterFromUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('location') ?? 'all';
    }
    return 'all';
  }, [pathname]);

  // Filter state
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'expiring' | 'expired'>('all');
  const [locationFilter, setLocationFilter] = useState<string>(locationFilterFromUrl);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(inputValue), 200);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [debouncedQuery, categoryFilter, stockFilter, locationFilter]);

  const categories = useMemo(
    () => Array.from(new Set(items.map(i => i.category))).filter(Boolean).sort(),
    [items]
  );

  // Location-scoped quantity helper: returns quantity at a specific location or global total
  const getDisplayQuantity = useCallback((product: Product): number => {
    if (locationFilter === 'all') {
      return getTotalStockAcrossLocations(product, locationStocks);
    }
    return getLocationStockForProduct(product, locationFilter, locationStocks);
  }, [locationFilter, locationStocks]);

  // Map productId → worst expiry status across its ACTIVE (quantity > 0) batches
  const expiryStatusMap = useMemo(() => {
    const map: Record<string, 'expired' | 'expiring' | 'ok' | 'none'> = {};
    for (const b of batches) {
      // Depleted batches must never trigger expiry alerts
      if (b.quantity <= 0) continue;
      const s = getBatchStatus(b.expiryDate);
      const prev = map[b.productId];
      if (!prev || s === 'expired' || (s === 'expiring' && prev !== 'expired')) {
        map[b.productId] = s;
      }
    }
    return map;
  }, [batches]);

  // Precompute batches by product
  const batchesByProduct = useMemo(() => {
    const map: Record<string, typeof batches> = {};
    batches.forEach(batch => {
      if (!map[batch.productId]) map[batch.productId] = [];
      map[batch.productId].push(batch);
    });
    return map;
  }, [batches]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let filtered = items;

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }

    if (locationFilter !== 'all') {
      // Filter to products with stock at this location (includes legacy supplierStocks via getLocationStockForProduct)
      filtered = filtered.filter(item => {
        const qty = getLocationStockForProduct(item, locationFilter, locationStocks);
        return qty > 0;
      });
    }

    if (stockFilter === 'low') {
      filtered = filtered.filter(i => {
        const displayQty = getDisplayQuantity(i);
        return displayQty <= i.minimumStock && displayQty > 0;
      });
    } else if (stockFilter === 'out') {
      filtered = filtered.filter(i => {
        const displayQty = getDisplayQuantity(i);
        return displayQty === 0;
      });
    } else if (stockFilter === 'expiring') {
      filtered = filtered.filter(i => expiryStatusMap[i.id] === 'expiring');
    } else if (stockFilter === 'expired') {
      filtered = filtered.filter(i => expiryStatusMap[i.id] === 'expired');
    }

    if (debouncedQuery.trim()) {
      filtered = rankSearch(filtered, debouncedQuery, filtered.length);
    }

    return filtered;
  }, [items, categoryFilter, stockFilter, debouncedQuery, expiryStatusMap, locationFilter, locationStocks, getDisplayQuantity]);

  const { sortedItems: baseSortedItems, requestSort, sortConfig } = useSort(filteredItems, { key: 'name', direction: 'asc' });

  const sortedItems = useMemo(() => {
    if (debouncedQuery.trim() && sortConfig?.key === 'name') {
      return filteredItems;
    }
    return baseSortedItems;
  }, [debouncedQuery, sortConfig, filteredItems, baseSortedItems]);

  // Pagination
  const visibleItems = useMemo(() => sortedItems.slice(0, displayCount), [sortedItems, displayCount]);
  const hasMore = displayCount < sortedItems.length;
  const remaining = sortedItems.length - displayCount;

  const lowStockCount = useMemo(() => {
    return items.filter(i => {
      const displayQty = getDisplayQuantity(i);
      return displayQty <= i.minimumStock && displayQty > 0;
    }).length;
  }, [items, locationFilter, locationStocks, getDisplayQuantity]);

  const outOfStockCount = useMemo(() => {
    return items.filter(i => {
      const displayQty = getDisplayQuantity(i);
      return displayQty === 0;
    }).length;
  }, [items, locationFilter, locationStocks, getDisplayQuantity]);
  const expiredCount = Object.values(expiryStatusMap).filter(s => s === 'expired').length;
  const expiringCount = Object.values(expiryStatusMap).filter(s => s === 'expiring').length;

  const getSupplierName = useCallback((product: Product) => {
    let ids = product.supplierIds?.length ? product.supplierIds : product.supplierId ? [product.supplierId] : [];

    // Filter suppliers by selected location stock if a location is selected
    if (locationFilter !== 'all') {
      const productBatches = batchesByProduct[product.id] ?? [];
      const activeBatchesAtLocation = productBatches.filter(batch => {
        const allocationAtLocation = batchLocations.find(
          bl => bl.batchId === batch.id && bl.locationId === locationFilter
        );
        return allocationAtLocation && Number(allocationAtLocation.quantity ?? 0) > 0;
      });
      const activeSupplierIds = new Set(activeBatchesAtLocation.map(b => b.supplierId));
      ids = ids.filter(id => activeSupplierIds.has(id));
    }

    const names = ids.map(id => suppliers.find(s => s.id === id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  }, [locationFilter, suppliers, batchesByProduct, batchLocations]);

  const handleDelete = useCallback((id: string, name: string) => {
    if (confirm(`Delete "${name}"? This can be undone.`)) {
      remove(id);
      showUndoToast(`Product "${name}"`, id);
    }
  }, [remove, showUndoToast]);

  const handleStockAdjust = useCallback((productId: string, newQuantity: number, reason: string) => {
    const product = items.find(p => p.id === productId);
    if (!product) return;
    const diff = newQuantity - product.quantity;
    update(productId, { quantity: newQuantity });
    toast.success(`Stock ${diff > 0 ? `+${diff}` : diff} → ${newQuantity} ${product.unit}. ${reason}`);
  }, [items, update]);

  const loadMore = useCallback(() => setDisplayCount(c => c + PAGE_SIZE), []);

  const activeFilterCount = [debouncedQuery !== '', categoryFilter !== 'all', stockFilter !== 'all', locationFilter !== 'all'].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setInputValue('');
    setCategoryFilter('all');
    setStockFilter('all');
    setLocationFilter('all');
    window.history.replaceState({}, '', '/inventory');
  }, []);

  const renderBatchChips = (productId: string) => {
    const productBatches = batchesByProduct[productId] ?? [];

    // Always exclude fully depleted batches first
    const activeBatches = productBatches.filter(batch => batch.quantity > 0);

    // Filter batches by location if a location is selected
    let batchesToShow = activeBatches;
    if (locationFilter !== 'all') {
      batchesToShow = activeBatches.filter(batch => {
        const allocationAtLocation = batchLocations.find(
          bl => bl.batchId === batch.id && bl.locationId === locationFilter
        );
        return allocationAtLocation && Number(allocationAtLocation.quantity ?? 0) > 0;
      });
    }

    // Sort by expiry date (with expiryDate first, then no expiry)
    const sortedBatches = batchesToShow.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return (a.expiryDate ?? '').localeCompare(b.expiryDate ?? '');
    });

    if (sortedBatches.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {sortedBatches.slice(0, 2).map(b => {
          const qtyAtLocation = locationFilter !== 'all'
            ? batchLocations.find(bl => bl.batchId === b.id && bl.locationId === locationFilter)?.quantity ?? 0
            : undefined;

          return (
            <span key={b.id} className="text-[10px] border rounded px-1.5 py-0.5 text-muted-foreground flex items-center gap-1">
              {b.batchNumber}
              {locationFilter !== 'all' && qtyAtLocation !== undefined && (
                <span className="text-muted-foreground">({qtyAtLocation})</span>
              )}
              {b.expiryDate && <ExpiryBadge expiryDate={b.expiryDate} />}
            </span>
          );
        })}
        {sortedBatches.length > 2 && (
          <span className="text-[10px] text-muted-foreground py-0.5">+{sortedBatches.length - 2} more</span>
        )}
      </div>
    );
  };

  const SortBtn = ({ field, label }: { field: keyof Product; label: string }) => (
    <button
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => requestSort(field)}
    >
      {label}
      {sortConfig?.key === field && <ArrowUpDown className="h-3 w-3" />}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 pb-28 md:pb-8 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
            <span>{items.length} products</span>
            {lowStockCount > 0 && <span className="text-orange-500 font-medium">• {lowStockCount} low</span>}
            {outOfStockCount > 0 && <span className="text-destructive font-medium">• {outOfStockCount} out</span>}
            {expiredCount > 0 && isExpiryEnabled && <span className="text-destructive font-medium">• {expiredCount} expired</span>}
            {expiringCount > 0 && isExpiryEnabled && <span className="text-orange-500 font-medium">• {expiringCount} expiring</span>}
          </p>
        </div>
        <Button onClick={() => setLocation('/inventory/new')} className="w-full sm:w-auto shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by product name..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            className="pl-9 pr-9"
          />
          {inputValue && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setInputValue('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
              {isExpiryEnabled && <SelectItem value="expiring">Expiring Soon</SelectItem>}
              {isExpiryEnabled && <SelectItem value="expired">Expired</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <X className="h-4 w-4" />
            Clear filters
            <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
              {activeFilterCount}
            </Badge>
          </Button>
        </div>
      )}

      {/* Sort bar (desktop) */}
      {sortedItems.length > 0 && (
        <div className="hidden md:flex items-center gap-4 px-1">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Sort:</span>
          <SortBtn field="name" label="Name" />
          <SortBtn field="quantity" label="Quantity" />
          <SortBtn field="sellingRate" label="Sell Rate" />
          <SortBtn field="purchaseRate" label="Buy Rate" />
          <SortBtn field="category" label="Category" />
        </div>
      )}

      {/* Results */}
      {sortedItems.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold">
              {debouncedQuery ? `No results for "${debouncedQuery}"` : 'No products found'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {debouncedQuery ? 'Try a different search term.' : 'Add your first product to get started.'}
            </p>
            <Button onClick={() => setLocation('/inventory/new')} variant="outline" className="mt-2">
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleItems.map((item, index) => {
              const displayQuantity = getDisplayQuantity(item);
              const isLowStock = displayQuantity <= item.minimumStock && displayQuantity > 0;
              const isOutOfStock = displayQuantity === 0;
              const expiryStatus = expiryStatusMap[item.id] ?? 'none';
              const productBatches = batchesByProduct[item.id] ?? [];
              // Only consider batches that still have remaining stock
              const nearestExpiry = productBatches
                .filter(b => b.expiryDate && b.quantity > 0)
                .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))[0];

              return (
                <Card
                  key={item.id}
                  className={`rounded-2xl border bg-card shadow-xs hover:shadow-md transition-all overflow-hidden ${isOutOfStock || expiryStatus === 'expired'
                    ? 'border-destructive/40'
                    : isLowStock || expiryStatus === 'expiring'
                      ? 'border-amber-400/60'
                      : 'border-border/70 hover:border-primary/40'
                    }`}
                >
                  <CardContent className="p-0">
                    <div
                      className="p-3.5 sm:p-4 flex gap-3 cursor-pointer hover:bg-muted/30 active:scale-[0.99] transition-all"
                      onClick={() => setLocation(`/inventory/${item.id}${locationFilter !== 'all' ? `?location=${locationFilter}` : ''}`)}
                    >
                      {item.imageBase64 ? (
                        <div
                          className="h-14 w-14 rounded-md bg-muted shrink-0"
                          style={{ backgroundImage: `url(${item.imageBase64})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-lg">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm leading-tight truncate flex items-center gap-1">
                            {item.name}
                            <span className="text-[10px] text-muted-foreground">View</span>
                          </div>
                          {locationFilter === 'all' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setAdjustProduct(item)}>
                                  <SlidersHorizontal className="h-4 w-4 mr-2" /> Adjust Stock
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setLocation('/sales/new')}>
                                  <ShoppingCart className="h-4 w-4 mr-2" /> Sell
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setLocation(`/inventory/${item.id}/edit`)}>
                                  <Edit className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDelete(item.id, item.name)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{item.brand || item.category}</div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-sm font-bold ${isOutOfStock ? 'text-destructive' : isLowStock ? 'text-orange-500' : 'text-foreground'
                            }`}>
                            {displayQuantity} {item.unit}
                          </span>
                          {isOutOfStock && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Out of Stock</Badge>}
                          {isLowStock && !isOutOfStock && (
                            <Badge className="text-[10px] py-0 px-1.5 bg-orange-500/10 text-orange-600 border-orange-300">
                              <AlertTriangle className="h-2.5 w-2.5 mr-1" />Low
                            </Badge>
                          )}
                          {nearestExpiry && isExpiryEnabled && <ExpiryBadge expiryDate={nearestExpiry.expiryDate} />}
                        </div>
                      </div>
                    </div>

                    {isBatchesEnabled && renderBatchChips(item.id)}

                    <div className="px-4 pb-3 grid grid-cols-3 gap-2 text-center border-t bg-muted/20 pt-2">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Buy</div>
                        <div className="text-sm font-semibold">{format(item.purchaseRate)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Sell</div>
                        <div className="text-sm font-semibold text-primary">{format(item.sellingRate)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase">Profit</div>
                        <div className={`text-sm font-semibold ${item.sellingRate - item.purchaseRate >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {format(item.sellingRate - item.purchaseRate)}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 pb-3 flex justify-between items-center text-xs text-muted-foreground border-t pt-2">
                      <span className="truncate mr-2" title={getSupplierName(item)}>{getSupplierName(item)}</span>
                      <span className="font-medium shrink-0">Val: {format(item.purchaseRate * displayQuantity)}</span>
                    </div>

                    {locationFilter === 'all' && (
                      <div className="px-4 pb-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdjustProduct(item);
                          }}
                        >
                          <SlidersHorizontal className="h-3 w-3 mr-1" /> Adjust Stock
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/inventory/${item.id}/edit`);
                          }}
                        >
                          <Edit className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="outline" className="w-full sm:w-auto gap-2" onClick={loadMore}>
                <ChevronDown className="h-4 w-4" />
                Load {Math.min(PAGE_SIZE, remaining)} more
                <span className="text-muted-foreground text-xs">({remaining} remaining)</span>
              </Button>
            </div>
          )}

          {/* End of list */}
          {!hasMore && sortedItems.length > PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground py-2">
              All {sortedItems.length} products shown
            </p>
          )}
        </div>
      )}

      <StockAdjustDialog
        product={adjustProduct}
        open={!!adjustProduct}
        onClose={() => setAdjustProduct(null)}
        onAdjust={handleStockAdjust}
      />
    </div>
  );
}