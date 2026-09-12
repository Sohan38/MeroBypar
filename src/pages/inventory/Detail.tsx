import { useParams, useLocation } from 'wouter';
import { useSmartBack } from '@/contexts/NavigationContext';
import {
  useInventory, useProductBatches, useSuppliers, useLocations, useInventoryLocationStocks, useProductBatchLocations,
} from '@/contexts/GlobalProviders';
import { useCurrency } from '@/hooks/useCurrency';
import { format as formatDate, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, Edit, Package, Tag, Barcode, Factory,
  Layers, TrendingUp, AlertTriangle, CalendarDays, Truck,
  FileText, ShoppingCart, MoreHorizontal, MapPin, X
} from 'lucide-react';
import { ExpiryBadge, getBatchStatus } from '@/components/BatchFormDialog';
import { InventoryDispositionDialog } from '@/components/InventoryDispositionDialog';
import { useMemo, useState, useEffect } from 'react';
import { getLocationStockForProduct, getTotalStockAcrossLocations } from '@/lib/locationStock';

import { useFeature } from '@/hooks/useFeature';

export default function InventoryDetail() {
  const isBatchesEnabled = useFeature('inventory', 'batches');
  const isExpiryEnabled = useFeature('inventory', 'expiry');
  const isVariantsEnabled = useFeature('inventory', 'variants');

  const goBack = useSmartBack('/inventory');
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { items: inventory } = useInventory();
  const { items: allBatches } = useProductBatches();
  const { items: suppliers } = useSuppliers();
  const { items: locations } = useLocations();
  const { items: locationStocks } = useInventoryLocationStocks();
  const { items: batchLocations } = useProductBatchLocations();
  const { format } = useCurrency();
  const [dispositionDialogOpen, setDispositionDialogOpen] = useState(false);

  const [locationFilter, setLocationFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('location') || 'all';
  });

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setLocationFilter(params.get('location') || 'all');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleShowAll = () => {
    window.history.pushState({}, '', `/inventory/${id}`);
    setLocationFilter('all');
  };

  const product = inventory.find(p => p.id === id);

  if (!product) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Product not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation('/inventory')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Inventory
        </Button>
      </div>
    );
  }

  // Location-scoped stock quantity
  const displayQuantity = useMemo(() => {
    if (locationFilter === 'all') {
      return getTotalStockAcrossLocations(product, locationStocks);
    }
    return getLocationStockForProduct(product, locationFilter, locationStocks);
  }, [product, locationFilter, locationStocks]);

  // Filter batches by location if locationFilter is set
  const batches = useMemo(() => {
    let list = allBatches.filter(b => b.productId === id);
    if (locationFilter !== 'all') {
      list = list.filter(batch => {
        const allocation = batchLocations.find(
          bl => bl.batchId === batch.id && bl.locationId === locationFilter
        );
        return allocation && Number(allocation.quantity ?? 0) > 0;
      });
    }
    return list.sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''));
  }, [id, allBatches, locationFilter, batchLocations]);

  const suppliersById = useMemo(() => {
    const map = new Map<string, (typeof suppliers)[number]>();
    for (const supplier of suppliers) {
      map.set(supplier.id, supplier);
    }
    return map;
  }, [suppliers]);

  // Filter product supplier names based on location stock
  const supplierNames = useMemo(() => {
    let ids = product.supplierIds?.length
      ? product.supplierIds
      : product.supplierId
        ? [product.supplierId]
        : [];

    if (locationFilter !== 'all') {
      const activeSupplierIds = new Set(batches.map(b => b.supplierId));
      ids = ids.filter(id => activeSupplierIds.has(id));
    }

    return ids
      .map(id => suppliersById.get(id)?.name)
      .filter(Boolean) as string[];
  }, [product, suppliersById, locationFilter, batches]);

  const isOutOfStock = displayQuantity === 0;
  const isLowStock = displayQuantity > 0 && displayQuantity <= product.minimumStock;
  const margin = product.purchaseRate > 0
    ? ((product.sellingRate - product.purchaseRate) / product.purchaseRate * 100).toFixed(1)
    : '—';
  const profit = product.sellingRate - product.purchaseRate;

  const stockValue = product.purchaseRate * displayQuantity;
  const retailValue = product.sellingRate * displayQuantity;

  const expiredCount = batches.filter(
    b => b.quantity > 0 && getBatchStatus(b.expiryDate) === 'expired'
  ).length;

  const expiringSoonCount = batches.filter(
    b => b.quantity > 0 && getBatchStatus(b.expiryDate) === 'expiring'
  ).length;

  const healthyCount = batches.filter(
    b => b.quantity > 0 && getBatchStatus(b.expiryDate) === 'ok'
  ).length;

  const totalBatchStock = useMemo(() => {
    return batches.reduce((sum, batch) => {
      const qty = locationFilter !== 'all'
        ? batchLocations.find(bl => bl.batchId === batch.id && bl.locationId === locationFilter)?.quantity ?? 0
        : batch.quantity;
      return sum + qty;
    }, 0);
  }, [batches, locationFilter, batchLocations]);

  // Calculate stock breakdown by location
  const locationStockBreakdown = useMemo(() => {
    const breakdown: Array<{ location: typeof locations[0]; quantity: number; value: number }> = [];

    const activeLocations = locationFilter === 'all'
      ? locations.filter(l => (l.status ?? 'active') !== 'inactive')
      : locations.filter(l => l.id === locationFilter);

    for (const loc of activeLocations) {
      const qty = locationStocks
        .filter(s => s.productId === product.id && s.locationId === loc.id)
        .reduce((sum, s) => sum + (s.quantity ?? 0), 0);

      if (qty > 0 || locationFilter !== 'all') {
        breakdown.push({
          location: loc,
          quantity: qty,
          value: qty * (product.purchaseRate ?? 0),
        });
      }
    }

    return breakdown;
  }, [product, locations, locationStocks, locationFilter]);

  // Nearest non-expired batch that still has remaining stock (FEFO-aware)
  const nextExpiryBatch = batches.find(
    b => b.quantity > 0 && getBatchStatus(b.expiryDate) !== 'expired'
  );

  // Latest expiry batch (furthest out) with remaining stock
  const latestExpiryBatch =
    batches.length > 0
      ? [...batches].filter(b => b.quantity > 0).reverse().find(b => b.expiryDate)
      : undefined;

  const activeLocation = useMemo(() => {
    return locations.find(l => l.id === locationFilter);
  }, [locations, locationFilter]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto pb-24 md:pb-8">

      {/* Location Filter Alert Banner */}
      {locationFilter !== 'all' && activeLocation && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <p className="text-muted-foreground text-xs sm:text-sm">
              Showing stock for <span className="font-semibold text-foreground">{activeLocation.name}</span> only.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 hover:bg-primary/20"
            onClick={handleShowAll}
          >
            <X className="h-3 w-3" /> Show All
          </Button>
        </div>
      )}

      {/* Header – mobile responsive */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: back + product info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{product.name}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {product.category}{product.brand ? ` · ${product.brand}` : ''}
            </p>
          </div>
        </div>

        {/* Right: action buttons */}
        {locationFilter === 'all' && (
          <div className="flex gap-2 shrink-0 items-center">
            {/* Primary actions: always visible */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setLocation(
                  `/purchases/new?productId=${id}&supplierId=${encodeURIComponent(product.supplierId || '')}`
                )
              }
            >
              <Truck className="h-4 w-4" />
              <span className="hidden sm:inline">Restock</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLocation('/sales/new')}
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Sell</span>
            </Button>

            {/* Secondary actions: full labels on md+, hidden otherwise */}
            <div className="hidden md:flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setDispositionDialogOpen(true)}
              >
                <AlertTriangle className="h-4 w-4" /> Disposition
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setLocation(`/inventory/${id}/edit`)}
              >
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </div>

            {/* Mobile dropdown for secondary actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setDispositionDialogOpen(true)}>
                  <AlertTriangle className="mr-2 h-4 w-4" /> Disposition
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation(`/inventory/${id}/edit`)}>
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Product image + stock status row */}
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-20 h-20 rounded-xl border bg-muted flex items-center justify-center overflow-hidden">
          {product.imageBase64
            ? <img src={product.imageBase64} alt={product.name} className="w-full h-full object-cover" />
            : <span className="text-3xl font-bold text-muted-foreground">{product.name.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-2xl font-bold ${isOutOfStock ? 'text-destructive' : isLowStock ? 'text-orange-500' : 'text-foreground'}`}>
              {displayQuantity} <span className="text-sm font-normal text-muted-foreground">{product.unit}</span>
            </span>
            {isOutOfStock && <Badge variant="destructive">Out of Stock</Badge>}
            {isLowStock && !isOutOfStock && (
              <Badge className="bg-orange-100 text-orange-700 border-orange-300">
                <AlertTriangle className="h-3 w-3 mr-1" /> Low Stock
              </Badge>
            )}
            {!isOutOfStock && !isLowStock && <Badge className="bg-green-100 text-green-700 border-green-300">In Stock</Badge>}
          </div>
          {product.minimumStock > 0 && (
            <p className="text-xs text-muted-foreground">Min. stock: {product.minimumStock} {product.unit}</p>
          )}
          {expiredCount > 0 && (
            <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">
              ⚠ {expiredCount} expired batch{expiredCount > 1 ? 'es' : ''}
            </Badge>
          )}
          {expiringSoonCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
              ⏱ {expiringSoonCount} expiring soon
            </Badge>
          )}
        </div>
      </div>

      {/* Pricing */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" /> Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-3 gap-4 text-center mb-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Buy Rate</p>
              <p className="font-bold text-sm">{format(product.purchaseRate)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Sell Rate</p>
              <p className="font-bold text-sm text-primary">{format(product.sellingRate)}</p>
            </div>
            <div className={`rounded-lg p-3 ${profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Profit</p>
              <p className={`font-bold text-sm ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {format(profit)}
              </p>
            </div>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground border-t pt-3 flex-wrap gap-2">
            <span>Margin: <span className="font-medium text-foreground">{margin}%</span></span>
            <span>Stock Value (cost): <span className="font-medium text-foreground">{format(stockValue)}</span></span>
            <span>Stock Value (retail): <span className="font-medium text-foreground">{format(retailValue)}</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Location breakdown */}
      {locationStockBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" /> Stock by Location
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="divide-y border rounded-lg overflow-hidden bg-card">
              {locationStockBreakdown.map(({ location, quantity, value }) => (
                <div key={location.id} className="flex items-center justify-between px-3 py-3 hover:bg-muted/10 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{location.name}</p>
                    <p className="text-xs text-muted-foreground">{quantity} {product.unit}</p>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-sm font-semibold text-foreground">{format(value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product details */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" /> Product Details
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-0.5 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Category
            </p>
            <p className="font-medium">{product.category || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-0.5 flex items-center gap-1">
              <Factory className="h-3 w-3" /> Brand
            </p>
            <p className="font-medium">{product.brand || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-0.5 flex items-center gap-1">
              <Barcode className="h-3 w-3" /> Barcode
            </p>
            <p className="font-medium font-mono text-xs">{product.barcode || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase mb-0.5 flex items-center gap-1">
              <Layers className="h-3 w-3" /> Unit
            </p>
            <p className="font-medium">{product.unit}</p>
          </div>
          {supplierNames.length > 0 && (
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <Truck className="h-3 w-3" /> Suppliers
              </p>
              <div className="flex flex-wrap gap-1.5">
                {supplierNames.map(name => (
                  <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                ))}
              </div>
            </div>
          )}
          {product.notes && (
            <div className="col-span-2">
              <p className="text-[10px] text-muted-foreground uppercase mb-0.5 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Notes
              </p>
              <p className="text-sm text-muted-foreground">{product.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batches */}
      {isBatchesEnabled && product.hasExpiry && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Batches
              <Badge variant="outline" className="text-xs ml-auto">{batches.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {batches.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No batches recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {batches.map(b => {
                  const sup = suppliersById.get(b.supplierId);
                  const status = getBatchStatus(b.expiryDate);
                  const qtyAtLocation = locationFilter !== 'all'
                    ? batchLocations.find(bl => bl.batchId === b.id && bl.locationId === locationFilter)?.quantity ?? 0
                    : b.quantity;

                  return (
                    <div
                      key={b.id}
                      className={`rounded-lg border p-3 text-sm space-y-2 ${status === 'expired' ? 'border-red-200 bg-red-50/50' :
                        status === 'expiring' ? 'border-yellow-200 bg-yellow-50/50' :
                          'bg-muted/30'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-xs">{b.batchNumber}</span>
                        {b.expiryDate && <ExpiryBadge expiryDate={b.expiryDate} />}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {sup && (
                          <div><span className="font-medium text-foreground">Supplier:</span> {sup.name}</div>
                        )}
                        <div>
                          <span className="font-medium text-foreground">Qty:</span>{' '}
                          {qtyAtLocation}
                          {locationFilter === 'all' && b.quantity !== b.initialQuantity && (
                            <span className="text-muted-foreground"> / {b.initialQuantity} initial</span>
                          )}
                        </div>
                        {b.manufacturingDate && (
                          <div>
                            <span className="font-medium text-foreground">Mfg:</span>{' '}
                            {(() => { try { return formatDate(parseISO(b.manufacturingDate!), 'dd MMM yyyy'); } catch { return b.manufacturingDate; } })()}
                          </div>
                        )}
                        {b.expiryDate && (
                          <div>
                            <span className="font-medium text-foreground">Expiry:</span>{' '}
                            {(() => { try { return formatDate(parseISO(b.expiryDate), 'dd MMM yyyy'); } catch { return b.expiryDate; } })()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-foreground">Rate:</span> {format(b.purchaseRate)}
                        </div>
                        {b.notes && (
                          <div className="col-span-2">
                            <span className="font-medium text-foreground">Notes:</span> {b.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Expiry Summary */}
            <Card className="mt-3">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  Expiry Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {!product.hasExpiry ? (
                  <p className="text-sm text-muted-foreground">
                    Expiry tracking is disabled for this product.
                  </p>
                ) : batches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Expiry tracking is enabled, but no batches have been added yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Total Batches</p>
                      <p className="font-semibold">{batches.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Batch Stock</p>
                      <p className="font-semibold">{totalBatchStock} {product.unit}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Product Stock</p>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{displayQuantity} {product.unit}</span>
                        {displayQuantity === totalBatchStock ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300">Match</Badge>
                        ) : (
                          <Badge variant="destructive">Mismatch</Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Healthy</p>
                      <p className="font-semibold">{healthyCount} batch{healthyCount !== 1 && 'es'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Expiring Soon</p>
                      <p className="font-semibold text-yellow-700">{expiringSoonCount} batch{expiringSoonCount !== 1 && 'es'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Expired</p>
                      <p className="font-semibold text-red-600">{expiredCount} batch{expiredCount !== 1 && 'es'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Next Expiry</p>
                      <p className="font-semibold">
                        {nextExpiryBatch?.expiryDate
                          ? formatDate(parseISO(nextExpiryBatch.expiryDate), 'dd MMM yyyy')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Latest Expiry</p>
                      <p className="font-semibold">
                        {latestExpiryBatch?.expiryDate
                          ? formatDate(parseISO(latestExpiryBatch.expiryDate), 'dd MMM yyyy')
                          : '—'}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3 text-xs"
              onClick={() => setLocation(`/inventory/${id}/edit`)}
            >
              <Edit className="h-3.5 w-3.5 mr-1" /> Manage Batches
            </Button>
          </CardContent>
        </Card>
      )}

      {isVariantsEnabled && product.hasVariants && product.variants && product.variants.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Variant Stocks
              <Badge variant="outline" className="text-xs ml-auto">{product.variants.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="divide-y border rounded-lg overflow-hidden bg-card">
              {product.variants.map((v, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/10 transition-colors">
                  <span className="font-medium text-foreground">{v.name}</span>
                  <span className={`font-semibold ${v.quantity === 0 ? 'text-destructive' : v.quantity <= product.minimumStock ? 'text-amber-600' : 'text-green-600'}`}>
                    {v.quantity} <span className="text-xs font-normal text-muted-foreground">{product.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <InventoryDispositionDialog
        product={product}
        open={dispositionDialogOpen}
        onOpenChange={setDispositionDialogOpen}
      />
    </div>
  );
}