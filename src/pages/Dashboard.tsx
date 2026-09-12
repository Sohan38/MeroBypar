import { useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useInventory, useSales, useExpenses, useCredit, usePurchases, useProductBatches, useCustomers } from '@/contexts/GlobalProviders';
import { useAllCustomerStats } from '@/hooks/useCustomerStats';
import { useCurrency } from '@/hooks/useCurrency';
import { format, isToday, parseISO, subDays, startOfDay, endOfDay } from 'date-fns';
import { getBatchStatus } from '@/components/BatchFormDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart, Truck, UtensilsCrossed, Hotel, Receipt, Banknote,
  TrendingUp, TrendingDown, Package, AlertTriangle, Wallet,
  BarChart3, ArrowUpRight, Users, ArrowUpFromLine
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useApp } from '@/contexts/AppContext';
import { useFeature } from '@/hooks/useFeature';
import { buildFinancialMetrics, getSaleItemCOGS } from '@/lib/financialMetrics';
import { isActiveSale } from '@/lib/saleUtils';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { items: inventory } = useInventory();
  const { items: sales } = useSales();
  const { items: expenses } = useExpenses();
  const { items: credits } = useCredit();
  const { items: purchases } = usePurchases();
  const { items: batches } = useProductBatches();
  const { items: customers } = useCustomers();
  const allCustomerStats = useAllCustomerStats();
  const { format: formatCurrency } = useCurrency();
  const { settings } = useApp();

  const inventoryMap = useMemo(
    () => new Map(inventory.map(product => [product.id, product])),
    [inventory]
  );

  const todayRange = useMemo(() => {
    const today = new Date();
    return { start: startOfDay(today), end: endOfDay(today) };
  }, []);

  const todaySales = useMemo(() => sales.filter(s => {
    if (!isActiveSale(s)) return false;
    try { return isToday(parseISO(s.date)); } catch { return isToday(new Date(s.date)); }
  }), [sales]);

  const todayPurchases = useMemo(() => purchases.filter(p => {
    try { return isToday(parseISO(p.date)); } catch { return isToday(new Date(p.date)); }
  }), [purchases]);

  const metrics = useMemo(() => {
    const todayMetrics = buildFinancialMetrics({
      sales,
      expenses,
      purchases,
      credits,
      inventory,
      start: todayRange.start,
      end: todayRange.end,
    });

    const todayRevenue = todayMetrics.salesRevenue;
    const todayExpensesTotal = todayMetrics.expensesTotal;
    const todayGrossProfit = todayMetrics.grossProfit;
    const todayNetProfit = todayMetrics.netProfit;
    const collectedToday = todayMetrics.collected;
    const creditCreatedToday = todayMetrics.creditCreated;
    const qrSalesToday = todaySales.filter(s => s.paymentMethod === 'qr').reduce((sum, sale) => sum + sale.grandTotal, 0);
    const todayPurchaseTotal = todayPurchases.reduce((sum, purchase) => sum + purchase.grandTotal, 0);

    const lowStockItems = inventory.filter(i => i.quantity <= i.minimumStock && i.quantity > 0);
    const outOfStockItems = inventory.filter(i => i.quantity === 0);

    type ExpiryAlert = { batchId: string; productId: string; productName: string; batchNo: string; expiryDate: string; qty: number };
    const expiredBatches: ExpiryAlert[] = [];
    const expiringSoonBatches: ExpiryAlert[] = [];
    for (const batch of batches) {
      if (!batch.expiryDate || batch.quantity <= 0) continue;
      const status = getBatchStatus(batch.expiryDate);
      const product = inventoryMap.get(batch.productId);
      const productName = product?.name ?? 'Unknown Product';
      const entry: ExpiryAlert = {
        batchId: batch.id,
        productId: batch.productId,
        productName,
        batchNo: batch.batchNumber,
        expiryDate: batch.expiryDate,
        qty: batch.quantity,
      };
      if (status === 'expired') expiredBatches.push(entry);
      else if (status === 'expiring') expiringSoonBatches.push(entry);
    }
    expiredBatches.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    expiringSoonBatches.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    const inventoryPurchaseValue = inventory.reduce((sum, item) => sum + item.purchaseRate * item.quantity, 0);
    const inventorySellingValue = inventory.reduce((sum, item) => sum + item.sellingRate * item.quantity, 0);
    const estimatedInventoryProfit = inventorySellingValue - inventoryPurchaseValue;

    const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const sale of sales) {
      if (!isActiveSale(sale)) continue;
      const saleSubtotal = sale.items.reduce((sum, item) => sum + item.subtotal, 0);
      const discountedSaleSubtotal = saleSubtotal > 0 ? Math.max(0, saleSubtotal - sale.discount) : saleSubtotal;

      for (const item of sale.items) {
        if (!productSales[item.productId]) {
          productSales[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
        }
        productSales[item.productId].qty += item.quantity;

        if (saleSubtotal <= 0 || sale.discount <= 0) {
          productSales[item.productId].revenue += item.subtotal;
        } else {
          const itemShare = saleSubtotal > 0 ? item.subtotal / saleSubtotal : 0;
          productSales[item.productId].revenue += item.subtotal - (itemShare * sale.discount);
        }
      }
    }
    const bestSellers = Object.values(productSales)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      todaySales: todayRevenue,
      todayExpensesTotal,
      todayGrossProfit,
      todayNetProfit,
      collectedToday,
      creditCreatedToday,
      qrSalesToday,
      todayPurchaseTotal,
      customerReceivables: todayMetrics.customerReceivables,
      supplierPayables: todayMetrics.supplierPayables,
      lowStockItems,
      outOfStockItems,
      expiredBatches,
      expiringSoonBatches,
      inventoryPurchaseValue,
      inventorySellingValue,
      estimatedInventoryProfit,
      inventoryCount: inventory.length,
      bestSellers,
    };
  }, [sales, expenses, credits, purchases, inventory, batches, inventoryMap, todayRange, todaySales, todayPurchases]);

  // 7-day chart data
  const chartData = useMemo(() => {
    const purchaseHistoryByProduct = new Map<string, Array<{ date: string; purchaseRate: number }>>();
    for (const purchase of purchases) {
      for (const item of purchase.items) {
        const history = purchaseHistoryByProduct.get(item.productId) ?? [];
        history.push({ date: purchase.date, purchaseRate: item.purchaseRate });
        purchaseHistoryByProduct.set(item.productId, history);
      }
    }

    const salesByDate = new Map<string, { revenue: number; cogs: number }>();
    const expensesByDate = new Map<string, number>();

    for (const sale of sales) {
      if (!isActiveSale(sale)) continue;
      const dateKey = (sale.date ?? '').split('T')[0] ?? (sale.date ?? '').slice(0, 10);
      if (!dateKey) continue;

      const existing = salesByDate.get(dateKey) ?? { revenue: 0, cogs: 0 };
      existing.revenue += sale.grandTotal;
      for (const item of sale.items) {
        const product = inventoryMap.get(item.productId);
        const history = purchaseHistoryByProduct.get(item.productId) ?? [];
        existing.cogs += getSaleItemCOGS(item, sale.date, product, history);
      }
      salesByDate.set(dateKey, existing);
    }

    for (const expense of expenses) {
      if (expense.sourcePurchaseId) continue;
      const dateKey = (expense.date ?? '').split('T')[0] ?? (expense.date ?? '').slice(0, 10);
      if (!dateKey) continue;
      expensesByDate.set(dateKey, (expensesByDate.get(dateKey) ?? 0) + expense.amount);
    }

    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = format(startOfDay(date), 'yyyy-MM-dd');
      const daySales = salesByDate.get(dateStr) ?? { revenue: 0, cogs: 0 };
      const dayExpenses = expensesByDate.get(dateStr) ?? 0;

      data.push({
        name: format(date, 'EEE'),
        Revenue: daySales.revenue,
        COGS: daySales.cogs,
        Expenses: dayExpenses,
        Profit: daySales.revenue - daySales.cogs - dayExpenses,
      });
    }
    return data;
  }, [sales, expenses, purchases, inventoryMap]);

  const recentSales = useMemo(
    () =>
      [...sales]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5),
    [sales]
  );

  const recentPurchases = useMemo(
    () =>
      [...purchases]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3),
    [purchases]
  );

  const recentExpenses = useMemo(
    () =>
      [...expenses]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3),
    [expenses]
  );

  // Top customers by lifetime spending
  const topCustomers = useMemo(() => {
    return customers
      .map(c => ({ ...c, stats: allCustomerStats.get(c.id) }))
      .filter(c => c.stats && c.stats.visitCount > 0)
      .sort((a, b) => (b.stats?.totalSpent ?? 0) - (a.stats?.totalSpent ?? 0))
      .slice(0, 5);
  }, [customers, allCustomerStats]);

  // Customers who bought today (timezone-safe)
  const todayStr = useMemo(() => format(startOfDay(new Date()), 'yyyy-MM-dd'), []);
  const customersToday = useMemo(() => {
    const ids = new Set(
      sales.filter(s => s.customerId && s.date.startsWith(todayStr)).map(s => s.customerId!)
    );
    return ids.size;
  }, [sales, todayStr]);

  const isHotelEnabled = useFeature('hospitality', 'hotelGrid');
  const isRestaurantEnabled = useFeature('hospitality', 'restaurantBilling');

  const quickActions = useMemo(() => {
    const actions = [
      { label: 'New Sale', icon: ShoppingCart, href: '/sales/new', color: 'bg-blue-500/10 text-blue-600', show: true },
      { label: 'Purchase', icon: Truck, href: '/purchases/new', color: 'bg-green-500/10 text-green-600', show: true },
      { label: 'Hotel Bill', icon: Hotel, href: '/hotel/billing/new', color: 'bg-purple-500/10 text-purple-600', show: isHotelEnabled },
      { label: 'Restaurant', icon: UtensilsCrossed, href: '/restaurant/new', color: 'bg-orange-500/10 text-orange-600', show: isRestaurantEnabled },
      { label: 'Expense', icon: Receipt, href: '/expenses/new', color: 'bg-red-500/10 text-red-600', show: true },
      { label: 'Credit', icon: Banknote, href: '/credit/new', color: 'bg-yellow-500/10 text-yellow-600', show: true },
    ];
    return actions.filter(action => action.show);
  }, [isHotelEnabled, isRestaurantEnabled]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{settings.businessName}</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation('/reports')}>
          <BarChart3 className="h-4 w-4 mr-2" /> Reports
        </Button>
      </div>

      {/* Primary Key Metrics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border border-primary/10 bg-primary/5 rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-primary/80 uppercase tracking-wider">Today's Sales</p>
              <h2 className="text-2xl font-black text-primary tracking-tight">{formatCurrency(metrics.todaySales)}</h2>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-rose-500/10 bg-rose-500/5 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer" onClick={() => setLocation('/expenses')}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-rose-700/80 uppercase tracking-wider">Today's Expenses</p>
              <h2 className="text-2xl font-black text-rose-600 tracking-tight">{formatCurrency(metrics.todayExpensesTotal)}</h2>
            </div>
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600">
              <Receipt className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "border rounded-xl shadow-sm hover:shadow-md transition-all duration-300",
          metrics.todayGrossProfit >= 0
            ? "border-emerald-500/10 bg-emerald-500/5"
            : "border-rose-500/10 bg-rose-500/5"
        )}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Gross Profit</p>
              <div className="flex items-center gap-1.5">
                <h2 className={cn(
                  "text-2xl font-black tracking-tight",
                  metrics.todayGrossProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {formatCurrency(Math.abs(metrics.todayGrossProfit))}
                </h2>
              </div>
            </div>
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center",
              metrics.todayGrossProfit >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
            )}>
              {metrics.todayGrossProfit >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-emerald-500/10 bg-emerald-500/5 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:bg-emerald-500/10" onClick={() => setLocation('/sales')}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-emerald-700/80 uppercase tracking-wider">Collected Today</p>
              <h2 className="text-2xl font-black text-emerald-600 tracking-tight">{formatCurrency(metrics.collectedToday)}</h2>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-orange-500/10 bg-orange-500/5 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:bg-orange-500/10" onClick={() => setLocation('/credit')}>
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-orange-700/80 uppercase tracking-wider">Credit Created Today</p>
              <h2 className="text-2xl font-black text-orange-600 tracking-tight">{formatCurrency(metrics.creditCreatedToday)}</h2>
            </div>
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600">
              <Banknote className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center text-foreground shrink-0">
              <Wallet className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">QR Payments Today</p>
              <p className="font-extrabold text-base tracking-tight text-foreground">{formatCurrency(metrics.qrSalesToday)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:bg-muted/40" onClick={() => setLocation('/purchases')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center text-foreground shrink-0">
              <Truck className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Purchases Today</p>
              <p className="font-extrabold text-base tracking-tight text-foreground">{formatCurrency(metrics.todayPurchaseTotal)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:bg-muted/40" onClick={() => setLocation('/credit')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600 shrink-0">
              <Banknote className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer Receivables</p>
              <p className="font-extrabold text-base tracking-tight text-orange-600">{formatCurrency(metrics.customerReceivables)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer hover:bg-muted/40" onClick={() => setLocation('/payables')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-600 shrink-0">
              <ArrowUpFromLine className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Supplier Payables</p>
              <p className="font-extrabold text-base tracking-tight text-rose-600">{formatCurrency(metrics.supplierPayables)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
              metrics.todayNetProfit >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
            )}>
              {metrics.todayNetProfit >= 0 ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />}
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Net Profit Today</p>
              <p className={cn(
                "font-extrabold text-base tracking-tight",
                metrics.todayNetProfit >= 0 ? "text-emerald-600" : "text-rose-600"
              )}>{formatCurrency(Math.abs(metrics.todayNetProfit))}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:bg-muted/40 transition-colors rounded-xl shadow-sm" onClick={() => setLocation('/inventory')}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Products</p>
            <p className="font-bold text-lg mt-1">{metrics.inventoryCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inventory (Cost)</p>
            <p className="font-bold text-lg mt-1">{formatCurrency(metrics.inventoryPurchaseValue)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Inventory (Retail)</p>
            <p className="font-bold text-lg mt-1">{formatCurrency(metrics.inventorySellingValue)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Est. Inv. Profit</p>
            <p className="font-bold text-lg mt-1 text-green-600">{formatCurrency(metrics.estimatedInventoryProfit)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock + Expiry alerts */}
      {(
        metrics.lowStockItems.length > 0 ||
        metrics.outOfStockItems.length > 0 ||
        metrics.expiredBatches.length > 0 ||
        metrics.expiringSoonBatches.length > 0
      ) && (
          <Card className="border-orange-300/50 rounded-xl shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                Stock Alerts ({
                  metrics.lowStockItems.length +
                  metrics.outOfStockItems.length +
                  metrics.expiredBatches.length +
                  metrics.expiringSoonBatches.length
                })
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {/* Out of stock */}
              {metrics.outOfStockItems.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500 mb-1.5">Out of Stock</p>
                  <div className="flex flex-wrap gap-2">
                    {metrics.outOfStockItems.slice(0, 5).map(item => (
                      <Badge key={item.id} variant="destructive" className="text-xs cursor-pointer" onClick={() => setLocation(`/inventory/${item.id}`)}>
                        {item.name} — OUT
                      </Badge>
                    ))}
                    {metrics.outOfStockItems.length > 5 && (
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setLocation('/inventory')}>
                        +{metrics.outOfStockItems.length - 5} more
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Low stock */}
              {metrics.lowStockItems.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-1.5">Low Stock</p>
                  <div className="flex flex-wrap gap-2">
                    {metrics.lowStockItems.slice(0, 5).map(item => (
                      <Badge key={item.id} className="text-xs bg-orange-100 text-orange-700 border-orange-300 cursor-pointer" onClick={() => setLocation(`/inventory/${item.id}`)}>
                        {item.name} — {item.quantity} left
                      </Badge>
                    ))}
                    {metrics.lowStockItems.length > 5 && (
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setLocation('/inventory')}>
                        +{metrics.lowStockItems.length - 5} more
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Expired batches */}
              {metrics.expiredBatches.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-1.5">Expired Batches</p>
                  <div className="flex flex-wrap gap-2">
                    {metrics.expiredBatches.slice(0, 5).map(b => (
                      <Badge key={b.batchId} className="text-xs bg-red-100 text-red-700 border-red-300 cursor-pointer" onClick={() => setLocation(`/inventory/${b.productId}`)}>
                        {b.productName} · {b.batchNo} — {b.qty} units
                      </Badge>
                    ))}
                    {metrics.expiredBatches.length > 5 && (
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setLocation('/inventory')}>
                        +{metrics.expiredBatches.length - 5} more
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Expiring soon batches */}
              {metrics.expiringSoonBatches.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-600 mb-1.5">Expiring Soon</p>
                  <div className="flex flex-wrap gap-2">
                    {metrics.expiringSoonBatches.slice(0, 5).map(b => (
                      <Badge key={b.batchId} className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300 cursor-pointer" onClick={() => setLocation(`/inventory/${b.productId}`)}>
                        {b.productName} · {b.batchNo} — exp {format(parseISO(b.expiryDate), 'dd MMM')}
                      </Badge>
                    ))}
                    {metrics.expiringSoonBatches.length > 5 && (
                      <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setLocation('/inventory')}>
                        +{metrics.expiringSoonBatches.length - 5} more
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* Quick Actions */}
      <div>
        <h3 className="text-base font-semibold mb-3">Quick Actions</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={() => setLocation(action.href)}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border bg-card hover:bg-muted/50 active:scale-95 transition-all shadow-sm"
              data-testid={`button-quick-${action.label.toLowerCase().replace(' ', '-')}`}
            >
              <div className={`p-2.5 rounded-full ${action.color}`}>
                <action.icon className="h-5 w-5" />
              </div>
              <span className="text-[11px] md:text-xs font-medium text-center leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-day revenue chart */}
        <Card className="lg:col-span-2 rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue vs Expenses — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <Tooltip formatter={(v: number, name) => [formatCurrency(v), name]} />
                  <Legend />
                  <Area type="monotone" dataKey="Revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Expenses" stroke="hsl(var(--destructive))" fill="url(#expGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Best Sellers */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Best Sellers</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.bestSellers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No sales yet</div>
            ) : (
              <div className="space-y-3">
                {metrics.bestSellers.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center
                      ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-muted text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.qty} units sold</div>
                    </div>
                    <div className="text-sm font-semibold text-primary shrink-0">{formatCurrency(item.revenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Customer analytics ─────────────────────────────────────────────── */}
      {customers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> Customers
            </h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLocation('/customers')}>
              View All <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="grid grid-cols-2 gap-3 lg:col-span-1">
              <Card className="rounded-xl shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Customers</p>
                  <p className="text-xl font-bold mt-1">{customers.length}</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Customers Today</p>
                  <p className="text-xl font-bold mt-1 text-primary">{customersToday}</p>
                </CardContent>
              </Card>
            </div>
            <Card className="lg:col-span-2 rounded-xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Customers</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {topCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 px-4">
                    No customer purchase history yet
                  </p>
                ) : (
                  <div className="divide-y">
                    {topCustomers.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => setLocation(`/customers/${c.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 active:bg-muted text-left transition-colors"
                      >
                        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0
                          ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-muted text-muted-foreground'}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.stats!.visitCount} {c.stats!.visitCount === 1 ? 'visit' : 'visits'}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-primary shrink-0">
                          {formatCurrency(c.stats!.totalSpent)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Recent Sales
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLocation('/sales')}>
                View All <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No sales yet</p>
            ) : recentSales.map(sale => (
              <div
                key={sale.id}
                className="flex justify-between items-start py-2 border-b last:border-0 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded transition-colors"
                onClick={() => setLocation(`/sales/${sale.id}`)}
              >
                <div>
                  <div className="text-xs font-medium">{sale.items.slice(0, 2).map(i => i.productName).join(', ')}{sale.items.length > 2 ? '…' : ''}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {(() => { try { return format(parseISO(sale.date), 'MMM d, h:mm a'); } catch { return format(new Date(sale.date), 'MMM d, h:mm a'); } })()}
                  </div>
                </div>
                <span className="text-xs font-bold text-primary shrink-0 ml-2">{formatCurrency(sale.grandTotal)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Recent Purchases
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLocation('/purchases')}>
                View All <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentPurchases.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No purchases yet</p>
            ) : recentPurchases.map(p => (
              <div key={p.id} className="flex justify-between items-start py-2 border-b last:border-0">
                <div>
                  <div className="text-xs font-medium">{p.invoiceNumber || `#${p.id.slice(-6)}`}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.items.length} items</div>
                </div>
                <span className="text-xs font-bold text-green-600 shrink-0 ml-2">{formatCurrency(p.grandTotal)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Recent Expenses
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLocation('/expenses')}>
                View All <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No expenses yet</p>
            ) : recentExpenses.map(e => (
              <div key={e.id} className="flex justify-between items-start py-2 border-b last:border-0">
                <div>
                  <div className="text-xs font-medium capitalize">{e.description || e.category}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{e.category}</div>
                </div>
                <span className="text-xs font-bold text-destructive shrink-0 ml-2">{formatCurrency(e.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}