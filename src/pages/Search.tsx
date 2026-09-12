import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  useInventory,
  useCustomers,
  useSuppliers,
  useCredit,
  useFinancialAccounts,
} from '@/contexts/GlobalProviders';
import { useCurrency } from '@/hooks/useCurrency';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search as SearchIcon,
  Package,
  Users,
  Truck,
  Banknote,
  Building2,
  ArrowRight,
  X,
  ShoppingCart,
  BookOpen,
  Receipt,
  QrCode,
  Phone,
  Barcode,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { rankSearch } from '@/utils/search/rank';

type SearchCategory = 'all' | 'products' | 'customers' | 'suppliers' | 'credit' | 'accounts';

export default function Search() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SearchCategory>('all');
  const { format } = useCurrency();

  const { items: inventory } = useInventory();
  const { items: customers } = useCustomers();
  const { items: suppliers } = useSuppliers();
  const { items: credits } = useCredit();
  const { items: accounts } = useFinancialAccounts();

  const q = query.trim();

  // Multi-entity ranked search
  const results = useMemo(() => {
    if (!q) {
      return {
        products: [],
        customers: [],
        suppliers: [],
        credits: [],
        accounts: [],
      };
    }

    return {
      products: rankSearch(inventory, q, 6),
      customers: rankSearch(customers, q, 5),
      suppliers: rankSearch(suppliers, q, 5),
      credits: rankSearch(
        credits.map(c => ({ ...c, name: c.customerName || 'Customer' })),
        q,
        5
      ),
      accounts: rankSearch(
        accounts.map(a => ({ ...a, name: `${a.name} ${a.institutionName || ''}` })),
        q,
        4
      ),
    };
  }, [q, inventory, customers, suppliers, credits, accounts]);

  const totalResults =
    results.products.length +
    results.customers.length +
    results.suppliers.length +
    results.credits.length +
    results.accounts.length;

  const hasResults = totalResults > 0;

  // Filter category counts
  const categoryCounts = useMemo(() => ({
    all: totalResults,
    products: results.products.length,
    customers: results.customers.length,
    suppliers: results.suppliers.length,
    credit: results.credits.length,
    accounts: results.accounts.length,
  }), [results, totalResults]);

  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-4 max-w-4xl mx-auto pb-28 md:pb-12 animate-in fade-in duration-150">
      {/* ── Native Search Input Bar ────────────────────────────── */}
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-xl bg-primary/10 text-primary">
          <SearchIcon className="size-4.5" />
        </div>
        <Input
          autoFocus
          placeholder="Search products, customers, vendors, credit, accounts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 pr-10 h-13 text-base sm:text-lg bg-card/90 backdrop-blur-md shadow-xs border-border/80 rounded-2xl focus-visible:ring-primary"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
            aria-label="Clear Search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* ── Category Filter Pills (When search active) ──────────── */}
      {q && hasResults && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'all', label: 'All Results', count: categoryCounts.all },
            { id: 'products', label: 'Products', count: categoryCounts.products, icon: Package },
            { id: 'customers', label: 'Customers', count: categoryCounts.customers, icon: Users },
            { id: 'suppliers', label: 'Suppliers', count: categoryCounts.suppliers, icon: Truck },
            { id: 'credit', label: 'Udharo', count: categoryCounts.credit, icon: Banknote },
            { id: 'accounts', label: 'Accounts', count: categoryCounts.accounts, icon: Building2 },
          ].map((tab) => {
            if (tab.id !== 'all' && tab.count === 0) return null;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id as SearchCategory)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all active:scale-95 ${
                  selectedCategory === tab.id
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {Icon && <Icon className="size-3.5" />}
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    selectedCategory === tab.id
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Zero-State: Quick Jumps & Shortcuts ────────────────── */}
      {!q && (
        <div className="space-y-6 pt-2">
          {/* Quick Action Spotlight Cards */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
              Quick Shortcuts
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => setLocation('/sales/new')}
                className="flex flex-col items-start p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 text-left active:scale-95 transition-all"
              >
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 mb-2">
                  <ShoppingCart className="size-5" />
                </div>
                <span className="font-bold text-sm text-emerald-800 dark:text-emerald-200">New POS Bill</span>
                <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">Fast checkout</span>
              </button>

              <button
                onClick={() => setLocation('/inventory/new')}
                className="flex flex-col items-start p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 text-left active:scale-95 transition-all"
              >
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-700 dark:text-blue-300 mb-2">
                  <Package className="size-5" />
                </div>
                <span className="font-bold text-sm text-blue-800 dark:text-blue-200">Add Product</span>
                <span className="text-[11px] text-blue-700/80 dark:text-blue-300/80">Stock item</span>
              </button>

              <button
                onClick={() => setLocation('/credit')}
                className="flex flex-col items-start p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 text-left active:scale-95 transition-all"
              >
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 mb-2">
                  <Banknote className="size-5" />
                </div>
                <span className="font-bold text-sm text-amber-800 dark:text-amber-200">Udharo / Credit</span>
                <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80">Track debt</span>
              </button>

              <button
                onClick={() => setLocation('/accounts')}
                className="flex flex-col items-start p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 hover:border-teal-500/40 text-left active:scale-95 transition-all"
              >
                <div className="p-2 rounded-xl bg-teal-500/20 text-teal-700 dark:text-teal-300 mb-2">
                  <Building2 className="size-5" />
                </div>
                <span className="font-bold text-sm text-teal-800 dark:text-teal-200">Accounts</span>
                <span className="text-[11px] text-teal-700/80 dark:text-teal-300/80">Banks & Cash</span>
              </button>
            </div>
          </div>

          {/* Quick Browse Categories */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 px-1">
              Browse Catalogs
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setLocation('/inventory')}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/70 hover:border-primary/40 text-left active:scale-98 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Package className="size-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-foreground">Inventory Items</span>
                    <p className="text-xs text-muted-foreground">{inventory.length} products listed</p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground/60" />
              </button>

              <button
                onClick={() => setLocation('/customers')}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/70 hover:border-primary/40 text-left active:scale-98 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600">
                    <Users className="size-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-foreground">Customers Directory</span>
                    <p className="text-xs text-muted-foreground">{customers.length} registered parties</p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground/60" />
              </button>

              <button
                onClick={() => setLocation('/suppliers')}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/70 hover:border-primary/40 text-left active:scale-98 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600">
                    <Truck className="size-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-foreground">Suppliers & Vendors</span>
                    <p className="text-xs text-muted-foreground">{suppliers.length} vendors listed</p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground/60" />
              </button>

              <button
                onClick={() => setLocation('/daybook')}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/70 hover:border-primary/40 text-left active:scale-98 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600">
                    <BookOpen className="size-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-foreground">Unified Daybook</span>
                    <p className="text-xs text-muted-foreground">Double-entry audit logs</p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground/60" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── No Results Found ─────────────────────────────────── */}
      {q && !hasResults && (
        <div className="py-20 text-center space-y-2">
          <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
            <SearchIcon className="size-6 opacity-40" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No matches found for "{query}"</h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Check the spelling or try searching for a brand name, mobile number, or item code.
          </p>
        </div>
      )}

      {/* ── Differentiated Multi-Entity Search Results ──────── */}
      {q && hasResults && (
        <div className="space-y-6 pt-1">
          {/* 1. Products Section (Emerald Themed) */}
          {(selectedCategory === 'all' || selectedCategory === 'products') && results.products.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Package className="size-3.5" />
                  Products ({results.products.length})
                </h3>
              </div>
              <div className="space-y-2">
                {results.products.map((item) => {
                  const isLowStock = item.quantity <= (item.minimumStock ?? 5) && item.quantity > 0;
                  const isOutOfStock = item.quantity <= 0;

                  return (
                    <Card
                      key={item.id}
                      onClick={() => setLocation(`/inventory/${item.id}`)}
                      className="cursor-pointer bg-card border-border/70 hover:border-emerald-500/40 hover:shadow-sm active:scale-[0.98] transition-all rounded-2xl"
                    >
                      <CardContent className="p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <Package className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-foreground truncate">{item.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {item.barcode && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md">
                                  <Barcode className="size-3" /> {item.barcode}
                                </span>
                              )}
                              <span
                                className={`text-[11px] font-medium px-2 py-0.2 rounded-full ${
                                  isOutOfStock
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                    : isLowStock
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {isOutOfStock ? 'Out of stock' : `${item.quantity} in stock`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-extrabold text-base text-foreground">
                            {format(item.sellingRate)}
                          </div>
                          <span className="text-[10px] text-muted-foreground">Price</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Customers Section (Blue Themed) */}
          {(selectedCategory === 'all' || selectedCategory === 'customers') && results.customers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  Customers ({results.customers.length})
                </h3>
              </div>
              <div className="space-y-2">
                {results.customers.map((item) => (
                  <Card
                    key={item.id}
                    onClick={() => setLocation(`/customers/${item.id}`)}
                    className="cursor-pointer bg-card border-border/70 hover:border-blue-500/40 hover:shadow-sm active:scale-[0.98] transition-all rounded-2xl"
                  >
                    <CardContent className="p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
                          {item.name ? item.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-foreground truncate">{item.name}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.phone ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="size-3" /> {item.phone}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">No phone recorded</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                          Customer
                        </Badge>
                        <ArrowRight className="size-4 text-muted-foreground/60" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* 3. Udharo / Credit Records (Amber Themed) */}
          {(selectedCategory === 'all' || selectedCategory === 'credit') && results.credits.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <Banknote className="size-3.5" />
                  Udharo / Credit ({results.credits.length})
                </h3>
              </div>
              <div className="space-y-2">
                {results.credits.map((item) => {
                  const remaining = Math.max(0, item.amount - (item.paidAmount ?? 0));
                  const isSettled = item.status === 'paid' || remaining <= 0;

                  return (
                    <Card
                      key={item.id}
                      onClick={() => setLocation(`/credit/${item.id}`)}
                      className="cursor-pointer bg-card border-border/70 hover:border-amber-500/40 hover:shadow-sm active:scale-[0.98] transition-all rounded-2xl"
                    >
                      <CardContent className="p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <Banknote className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-foreground truncate">{item.customerName || 'Customer'}</h4>
                            <span className="text-[11px] text-muted-foreground">
                              Total Due: {format(item.amount)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className={`font-extrabold text-base ${isSettled ? 'text-emerald-600' : 'text-amber-600 dark:text-amber-400'}`}>
                            {isSettled ? 'Settled' : format(remaining)}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {isSettled ? 'Fully paid' : 'Remaining balance'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Suppliers Section (Indigo Themed) */}
          {(selectedCategory === 'all' || selectedCategory === 'suppliers') && results.suppliers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                  <Truck className="size-3.5" />
                  Suppliers & Vendors ({results.suppliers.length})
                </h3>
              </div>
              <div className="space-y-2">
                {results.suppliers.map((item) => (
                  <Card
                    key={item.id}
                    onClick={() => setLocation(`/suppliers/${item.id}`)}
                    className="cursor-pointer bg-card border-border/70 hover:border-indigo-500/40 hover:shadow-sm active:scale-[0.98] transition-all rounded-2xl"
                  >
                    <CardContent className="p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <Truck className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-foreground truncate">{item.name}</h4>
                          <span className="text-xs text-muted-foreground">
                            {item.phone || item.contactPerson || 'Vendor'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20">
                          Supplier
                        </Badge>
                        <ArrowRight className="size-4 text-muted-foreground/60" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* 5. Accounts & Banking Section (Teal Themed) */}
          {(selectedCategory === 'all' || selectedCategory === 'accounts') && results.accounts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  Accounts & Banking ({results.accounts.length})
                </h3>
              </div>
              <div className="space-y-2">
                {results.accounts.map((item) => (
                  <Card
                    key={item.id}
                    onClick={() => setLocation('/accounts')}
                    className="cursor-pointer bg-card border-border/70 hover:border-teal-500/40 hover:shadow-sm active:scale-[0.98] transition-all rounded-2xl"
                  >
                    <CardContent className="p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                          <Building2 className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-foreground truncate">{item.name}</h4>
                          <span className="text-xs text-muted-foreground capitalize">
                            {item.institutionName ? `${item.institutionName} · ` : ''}
                            {item.type}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20">
                          Account
                        </Badge>
                        <ArrowRight className="size-4 text-muted-foreground/60" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
