import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useSales, useExpenses, usePurchases, useInventory, useCredit, useCustomers } from '@/contexts/GlobalProviders';
import { useCurrency } from '@/hooks/useCurrency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  format as formatDate, subDays, startOfWeek, startOfMonth, startOfYear,
  startOfDay, isAfter, isBefore, endOfDay,
} from 'date-fns';
import { TrendingUp, TrendingDown, Package, Users, CalendarRange, Receipt, CreditCard, Coins, ShoppingCart, Truck, Wallet, PiggyBank } from 'lucide-react';
import { buildFinancialMetrics } from '@/lib/financialMetrics';
import { isActiveSale } from '@/lib/saleUtils';

const COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
  '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#3b82f6',
];

export default function Reports() {
  const [, setLocation] = useLocation();
  const { items: sales } = useSales();
  const { items: expenses } = useExpenses();
  const { items: purchases } = usePurchases();
  const { items: inventory } = useInventory();
  const { items: credits } = useCredit();
  const { items: customers } = useCustomers();
  const { format } = useCurrency();

  const [timeframe, setTimeframe] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getDateRange = () => {
    const today = new Date();
    switch (timeframe) {
      case 'today': return { start: startOfDay(today), end: endOfDay(today) };
      case 'yesterday': {
        const y = subDays(today, 1);
        return { start: startOfDay(y), end: endOfDay(y) };
      }
      case 'week': return { start: startOfWeek(today, { weekStartsOn: 0 }), end: endOfDay(today) };
      case 'month': return { start: startOfMonth(today), end: endOfDay(today) };
      case 'year': return { start: startOfYear(today), end: endOfDay(today) };
      case 'custom': {
        const s = customStart ? startOfDay(new Date(customStart)) : new Date(0);
        const e = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(today);
        return { start: s, end: e };
      }
      default: return { start: new Date(0), end: endOfDay(today) };
    }
  };

  const { start, end } = getDateRange();

  const inRange = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return !isBefore(d, start) && !isAfter(d, end);
    } catch { return false; }
  };

  const filteredSales = useMemo(() => sales.filter(s => isActiveSale(s) && inRange(s.date)), [sales, start, end]);
  const filteredExpenses = useMemo(() => expenses.filter(e => inRange(e.date)), [expenses, start, end]);
  const filteredPurchases = useMemo(() => purchases.filter(p => inRange(p.date)), [purchases, start, end]);
  const filteredCredits = useMemo(() => credits.filter(c => inRange(c.date)), [credits, start, end]);

  const stats = useMemo(() => {
    const metrics = buildFinancialMetrics({
      sales,
      expenses,
      purchases,
      credits,
      inventory,
      start,
      end,
    });

    const totalDiscount = filteredSales.reduce((sum, sale) => sum + sale.discount, 0);
    const totalTax = filteredSales.reduce((sum, sale) => sum + sale.tax, 0);

    const customerSalesMap: Record<string, { name: string; revenue: number; visits: number; avgOrder: number }> = {};
    for (const sale of filteredSales) {
      if (!sale.customerId) continue;
      const existing = customerSalesMap[sale.customerId];
      if (existing) {
        existing.revenue += sale.grandTotal;
        existing.visits += 1;
      } else {
        customerSalesMap[sale.customerId] = {
          name: sale.customerName || customers.find(c => c.id === sale.customerId)?.name || 'Unknown',
          revenue: sale.grandTotal,
          visits: 1,
          avgOrder: 0,
        };
      }
    }
    const topCustomers = Object.values(customerSalesMap)
      .map(customer => ({ ...customer, avgOrder: customer.visits > 0 ? customer.revenue / customer.visits : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    const customerSalesCount = Object.keys(customerSalesMap).length;
    const walkinSales = filteredSales.filter(s => !s.customerId);
    const walkinRevenue = walkinSales.reduce((sum, sale) => sum + sale.grandTotal, 0);

    return {
      salesRevenue: metrics.salesRevenue,
      totalExpenses: metrics.expensesTotal,
      totalPurchases: metrics.purchasesTotal,
      totalDiscount,
      totalTax,
      cogs: metrics.cogs,
      grossProfit: metrics.grossProfit,
      netProfit: metrics.netProfit,
      grossMargin: metrics.grossMargin,
      expensePieData: metrics.expensePieData,
      paymentPieData: metrics.paymentPieData,
      topProducts: metrics.topProducts,
      collected: metrics.collected,
      creditCreated: metrics.creditCreated,
      collectedCredit: metrics.collectedCredit,
      customerReceivables: metrics.customerReceivables,
      supplierPayables: metrics.supplierPayables,
      supplierPayments: metrics.supplierPayments,
      salesCount: filteredSales.length,
      topCustomers,
      customerSalesCount,
      walkinRevenue,
    };
  }, [filteredSales, filteredExpenses, filteredPurchases, filteredCredits, sales, expenses, purchases, credits, inventory, start, end, customers]);

  // Daily chart (last 30 days or filtered range)
  const dailyChart = useMemo(() => {
    const days = Math.min(30, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = formatDate(startOfDay(date), 'yyyy-MM-dd');
      const dayRevenue = filteredSales
        .filter(s => s.date.startsWith(dateStr))
        .reduce((s, x) => s + Math.max(0, x.grandTotal - x.tax), 0);
      const dayExpenses = filteredExpenses
        .filter(e => !e.sourcePurchaseId && e.date.startsWith(dateStr))
        .reduce((s, e) => s + e.amount, 0);
      data.push({ date: formatDate(date, 'd MMM'), Revenue: dayRevenue, Expenses: dayExpenses });
    }
    return data;
  }, [filteredSales, filteredExpenses, start, end]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {stats.salesCount} sales in selected period
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-full sm:w-40 bg-card shadow-sm">
              <CalendarRange className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {timeframe === 'custom' && (
            <div className="flex gap-2">
              <Input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="w-full sm:w-36 bg-card text-sm"
              />
              <Input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="w-full sm:w-36 bg-card text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Primary summary cards */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sales Revenue</p>
              <p className="text-xl font-bold mt-0.5 truncate">{format(stats.salesRevenue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collected</p>
              <p className="text-xl font-bold mt-0.5 truncate">{format(stats.collected)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`shadow-sm hover:shadow-md transition-shadow ${stats.grossProfit >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${stats.grossProfit >= 0 ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
              {stats.grossProfit >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Profit</p>
              <p className={`text-xl font-bold mt-0.5 truncate ${stats.grossProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {format(stats.grossProfit)}
              </p>
              <p className="text-xs text-muted-foreground">{stats.grossMargin.toFixed(1)}% margin</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`shadow-sm hover:shadow-md transition-shadow ${stats.netProfit >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${stats.netProfit >= 0 ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
              {stats.netProfit >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Profit</p>
              <p className={`text-xl font-bold mt-0.5 truncate ${stats.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {format(Math.abs(stats.netProfit))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard
          icon={<Receipt className="h-5 w-5 text-red-500" />}
          label="Total Expenses"
          value={format(stats.totalExpenses)}
          onClick={() => setLocation('/expenses')}
          accentColor="red"
        />
        <MetricCard
          icon={<Truck className="h-5 w-5 text-blue-500" />}
          label="Purchases"
          value={format(stats.totalPurchases)}
          onClick={() => setLocation('/purchases')}
          accentColor="blue"
        />
        <MetricCard
          icon={<CreditCard className="h-5 w-5 text-orange-500" />}
          label="Credit Created"
          value={format(stats.creditCreated)}
          onClick={() => setLocation('/credit')}
          accentColor="orange"
        />
        <MetricCard
          icon={<Wallet className="h-5 w-5 text-purple-500" />}
          label="Supplier Payables"
          value={format(stats.supplierPayables)}
          onClick={() => setLocation('/payables')}
          accentColor="purple"
        />
        <MetricCard
          icon={<PiggyBank className="h-5 w-5 text-green-500" />}
          label="Credit Collected"
          value={format(stats.collectedCredit)}
          onClick={() => setLocation('/credit')}
          accentColor="green"
        />
        <MetricCard
          icon={<Coins className="h-5 w-5 text-emerald-500" />}
          label="Supplier Payments"
          value={format(stats.supplierPayments)}
          onClick={() => setLocation('/payables')}
          accentColor="emerald"
        />
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Sales vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-70 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <Tooltip formatter={(v: number, name) => [format(v), name]} />
                  <Legend />
                  <Bar dataKey="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense breakdown */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.expensePieData.length === 0 ? (
              <div className="h-70 sm:h-80 flex items-center justify-center text-muted-foreground text-sm">
                No expense data
              </div>
            ) : (
              <div className="h-70 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.expensePieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {stats.expensePieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => format(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment method breakdown */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Payments by Method</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.paymentPieData.length === 0 ? (
              <div className="h-70 sm:h-80 flex items-center justify-center text-muted-foreground text-sm">
                No sales data
              </div>
            ) : (
              <div className="h-70 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.paymentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {stats.paymentPieData.map((entry, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => format(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales by customer */}
      {stats.topCustomers.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Sales by Customer
              </CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{stats.customerSalesCount} {stats.customerSalesCount === 1 ? 'customer' : 'customers'}</span>
                {stats.walkinRevenue > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    Walk-in: {format(stats.walkinRevenue)}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              <div className="hidden md:grid grid-cols-12 px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase bg-muted/30">
                <span className="col-span-1">#</span>
                <span className="col-span-5">Customer</span>
                <span className="col-span-2 text-right">Visits</span>
                <span className="col-span-2 text-right">Avg Order</span>
                <span className="col-span-2 text-right">Revenue</span>
              </div>
              {stats.topCustomers.map((c, i) => (
                <div key={i} className="flex flex-col md:grid md:grid-cols-12 px-6 py-3 gap-1 md:gap-0 text-sm hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 md:col-span-6 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-medium truncate">{c.name}</span>
                  </div>
                  <div className="flex justify-between items-center md:contents text-xs md:text-sm text-muted-foreground">
                    <span className="md:col-span-2 md:text-right">
                      <span className="md:hidden">Visits: </span>{c.visits}
                    </span>
                    <span className="md:col-span-2 md:text-right">
                      <span className="md:hidden">Avg: </span>{format(c.avgOrder)}
                    </span>
                    <span className="md:col-span-2 md:text-right font-semibold text-primary">
                      {format(c.revenue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top selling products */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" /> Top Selling Products
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stats.topProducts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No sales data</div>
          ) : (
            <div className="divide-y">
              <div className="hidden md:grid grid-cols-12 px-6 py-2.5 text-xs font-semibold text-muted-foreground uppercase bg-muted/30">
                <span className="col-span-1">#</span>
                <span className="col-span-5">Product</span>
                <span className="col-span-2 text-right">Qty</span>
                <span className="col-span-2 text-right">Revenue</span>
                <span className="col-span-2 text-right">Profit</span>
              </div>
              {stats.topProducts.map((p, i) => (
                <div key={i} className="flex flex-col md:grid md:grid-cols-12 px-6 py-3 gap-2 md:gap-0 text-sm hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 md:col-span-6 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-medium truncate">{p.name}</span>
                  </div>
                  <div className="flex justify-between items-center md:contents text-xs md:text-sm text-muted-foreground">
                    <span className="md:col-span-2 md:text-right">
                      <span className="md:hidden">Qty: </span>{p.qty}
                    </span>
                    <span className="md:col-span-2 md:text-right font-semibold text-foreground">
                      <span className="md:hidden">Revenue: </span>{format(p.revenue)}
                    </span>
                    <span className={`md:col-span-2 md:text-right font-semibold ${p.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      <span className="md:hidden">Profit: </span>{format(p.profit)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Reusable metric card component
function MetricCard({
  icon,
  label,
  value,
  onClick,
  accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
  accentColor?: string;
}) {
  return (
    <Card
      className={`shadow-sm hover:shadow-md transition-shadow cursor-pointer ${onClick ? 'hover:bg-muted/40' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${accentColor ? `bg-${accentColor}-100 text-${accentColor}-600` : 'bg-muted'}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}