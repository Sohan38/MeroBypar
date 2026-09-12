import { useState, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Building2,
  BookOpen,
  Receipt,
  Wallet,
  Banknote,
  ArrowUpFromLine,
  FileText,
  ShoppingCart,
  Hotel,
  UtensilsCrossed,
  Package,
  Factory,
  ArrowLeftRight,
  Truck,
  Users,
  Settings,
  Search,
  ChevronRight,
  Sparkles,
  ArrowRightLeft,
  DollarSign,
  Utensils,
  Moon,
  Sun,
  Laptop,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useFeature } from '@/hooks/useFeature';
import { useApp } from '@/contexts/AppContext';

interface HubItem {
  title: string;
  desc: string;
  href: string;
  icon: any;
  colorClass: string;
  bgClass: string;
  badge?: string;
  show?: boolean;
}

interface HubSection {
  id: string;
  title: string;
  subtitle: string;
  items: HubItem[];
}

export default function MoreHub() {
  const [, setLocation] = useLocation();
  const { settings, theme, setTheme, currentUser } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const isHotelEnabled = useFeature('hospitality', 'hotelGrid');
  const isRestaurantEnabled = useFeature('hospitality', 'restaurantBilling');
  const isConsumptionEnabled = useFeature('consumption', 'enabled');

  const sections: HubSection[] = useMemo(() => [
    {
      id: 'finance',
      title: 'Finance & Banking',
      subtitle: 'Cash management, accounts, ledgers, & udharo',
      items: [
        {
          title: 'Accounts & Banking',
          desc: 'Banks, Sahakari, cash drawers & fund transfers',
          href: '/accounts',
          icon: Building2,
          colorClass: 'text-emerald-600 dark:text-emerald-400',
          bgClass: 'bg-emerald-500/10 dark:bg-emerald-500/20',
          badge: 'Essential',
          show: true,
        },
        {
          title: 'Daybook',
          desc: 'Unified double-entry transaction timeline',
          href: '/daybook',
          icon: BookOpen,
          colorClass: 'text-blue-600 dark:text-blue-400',
          bgClass: 'bg-blue-500/10 dark:bg-blue-500/20',
          show: true,
        },
        {
          title: 'Cash Book',
          desc: 'Daily cash-in & cash-out records',
          href: '/cash-book',
          icon: Wallet,
          colorClass: 'text-teal-600 dark:text-teal-400',
          bgClass: 'bg-teal-500/10 dark:bg-teal-500/20',
          show: true,
        },
        {
          title: 'Credit (Udharo)',
          desc: 'Customer credit, aging & collections',
          href: '/credit',
          icon: Banknote,
          colorClass: 'text-amber-600 dark:text-amber-400',
          bgClass: 'bg-amber-500/10 dark:bg-amber-500/20',
          show: true,
        },
        {
          title: 'Expenses',
          desc: 'Rent, bills, staff & operational costs',
          href: '/expenses',
          icon: Receipt,
          colorClass: 'text-rose-600 dark:text-rose-400',
          bgClass: 'bg-rose-500/10 dark:bg-rose-500/20',
          show: true,
        },
        {
          title: 'Payables',
          desc: 'Supplier dues & pending purchase bills',
          href: '/payables',
          icon: ArrowUpFromLine,
          colorClass: 'text-indigo-600 dark:text-indigo-400',
          bgClass: 'bg-indigo-500/10 dark:bg-indigo-500/20',
          show: true,
        },
        {
          title: 'Financial Reports',
          desc: 'Profit & Loss, Sales, and Tax reports',
          href: '/reports',
          icon: FileText,
          colorClass: 'text-cyan-600 dark:text-cyan-400',
          bgClass: 'bg-cyan-500/10 dark:bg-cyan-500/20',
          show: true,
        },
      ],
    },
    {
      id: 'operations',
      title: 'Sales & Operations',
      subtitle: 'POS billing, hospitality & purchases',
      items: [
        {
          title: 'POS Terminal',
          desc: 'Fast barcode & touchscreen sales billing',
          href: '/sales/new',
          icon: ShoppingCart,
          colorClass: 'text-emerald-600 dark:text-emerald-400',
          bgClass: 'bg-emerald-500/10 dark:bg-emerald-500/20',
          badge: 'Quick POS',
          show: true,
        },
        {
          title: 'Sales History',
          desc: 'View all bills, invoices and returns',
          href: '/sales',
          icon: FileText,
          colorClass: 'text-blue-600 dark:text-blue-400',
          bgClass: 'bg-blue-500/10 dark:bg-blue-500/20',
          show: true,
        },
        {
          title: 'Purchases',
          desc: 'Supplier bills & stock inventory inbound',
          href: '/purchases',
          icon: Truck,
          colorClass: 'text-indigo-600 dark:text-indigo-400',
          bgClass: 'bg-indigo-500/10 dark:bg-indigo-500/20',
          show: true,
        },
        {
          title: 'Hotel & Lodging',
          desc: 'Room visual grid, check-in & stay billing',
          href: '/hotel',
          icon: Hotel,
          colorClass: 'text-violet-600 dark:text-violet-400',
          bgClass: 'bg-violet-500/10 dark:bg-violet-500/20',
          show: isHotelEnabled,
        },
        {
          title: 'Restaurant & Tables',
          desc: 'Dine-in tables, KOT & food billing',
          href: '/restaurant',
          icon: UtensilsCrossed,
          colorClass: 'text-orange-600 dark:text-orange-400',
          bgClass: 'bg-orange-500/10 dark:bg-orange-500/20',
          show: isRestaurantEnabled,
        },
        {
          title: 'Dispositions',
          desc: 'Waste, damages, samples & expired stock',
          href: '/dispositions',
          icon: FileText,
          colorClass: 'text-rose-600 dark:text-rose-400',
          bgClass: 'bg-rose-500/10 dark:bg-rose-500/20',
          show: true,
        },
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory & Stocks',
      subtitle: 'Catalog, manufacturing & multiple locations',
      items: [
        {
          title: 'Product Catalog',
          desc: 'Items, batches, pricing & barcodes',
          href: '/inventory',
          icon: Package,
          colorClass: 'text-primary dark:text-primary',
          bgClass: 'bg-primary/10 dark:bg-primary/20',
          show: true,
        },
        {
          title: 'Production & Assembly',
          desc: 'Manufacture goods from raw materials',
          href: '/inventory/production',
          icon: Factory,
          colorClass: 'text-amber-600 dark:text-amber-400',
          bgClass: 'bg-amber-500/10 dark:bg-amber-500/20',
          show: true,
        },
        {
          title: 'Kitchen Consumption',
          desc: 'Track ingredients & internal kitchen usage',
          href: '/inventory/consumption',
          icon: Utensils,
          colorClass: 'text-orange-600 dark:text-orange-400',
          bgClass: 'bg-orange-500/10 dark:bg-orange-500/20',
          show: isConsumptionEnabled,
        },
        {
          title: 'Locations & Godowns',
          desc: 'Warehouses, multiple outlets & inter-transfers',
          href: '/locations',
          icon: ArrowLeftRight,
          colorClass: 'text-teal-600 dark:text-teal-400',
          bgClass: 'bg-teal-500/10 dark:bg-teal-500/20',
          show: true,
        },
      ],
    },
    {
      id: 'management',
      title: 'Contacts & Business Settings',
      subtitle: 'Parties, staff, backups & customization',
      items: [
        {
          title: 'Customers',
          desc: 'Customer directory, contact numbers & balances',
          href: '/customers',
          icon: Users,
          colorClass: 'text-blue-600 dark:text-blue-400',
          bgClass: 'bg-blue-500/10 dark:bg-blue-500/20',
          show: true,
        },
        {
          title: 'Suppliers & Vendors',
          desc: 'Vendor catalog, PAN numbers & dues',
          href: '/suppliers',
          icon: Truck,
          colorClass: 'text-indigo-600 dark:text-indigo-400',
          bgClass: 'bg-indigo-500/10 dark:bg-indigo-500/20',
          show: true,
        },
        {
          title: 'System Settings',
          desc: 'Printers, features, tax, backup & bill layout',
          href: '/settings',
          icon: Settings,
          colorClass: 'text-slate-600 dark:text-slate-400',
          bgClass: 'bg-slate-500/10 dark:bg-slate-500/20',
          show: true,
        },
      ],
    },
  ], [isHotelEnabled, isRestaurantEnabled, isConsumptionEnabled]);

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return sections.map(sec => ({
        ...sec,
        items: sec.items.filter(item => item.show !== false),
      })).filter(sec => sec.items.length > 0);
    }

    return sections.map(sec => {
      const matchedItems = sec.items.filter(item => {
        if (item.show === false) return false;
        return (
          item.title.toLowerCase().includes(query) ||
          item.desc.toLowerCase().includes(query) ||
          sec.title.toLowerCase().includes(query)
        );
      });
      return { ...sec, items: matchedItems };
    }).filter(sec => sec.items.length > 0);
  }, [sections, searchQuery]);

  return (
    <div className="min-h-full pb-24 md:pb-12 bg-background/50">
      {/* ── Top Hero / Business Header ────────────────────── */}
      <div className="bg-gradient-to-b from-primary/10 via-primary/5 to-transparent px-4 pt-6 pb-4 border-b border-border/40">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm shadow-primary/30">
                {settings.businessName ? settings.businessName.charAt(0).toUpperCase() : 'M'}
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-foreground leading-snug">
                  {settings.businessName || 'My Business'}
                </h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {currentUser?.name || 'Admin'} · Hub Menu
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (theme === 'light') setTheme('dark');
                  else if (theme === 'dark') setTheme('system');
                  else setTheme('light');
                }}
                className="p-2.5 rounded-xl bg-card border border-border/60 text-muted-foreground hover:text-foreground shadow-xs active:scale-95 transition-all"
                title="Toggle Theme"
                aria-label="Toggle Theme"
              >
                {theme === 'light' ? <Sun className="size-4 text-amber-500" /> : theme === 'dark' ? <Moon className="size-4 text-blue-400" /> : <Laptop className="size-4" />}
              </button>
            </div>
          </div>

          {/* Search bar inside hub */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search features (e.g. Accounts, POS, Udharo, Daybook)..."
              className="pl-10 pr-4 h-11 text-sm bg-card/80 backdrop-blur-md rounded-2xl border-border/70 shadow-xs focus-visible:ring-primary"
            />
          </div>

          {/* Quick Action Badges */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setLocation('/accounts')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-500/20 shrink-0 active:scale-95 transition-transform"
            >
              <Building2 className="size-3.5" /> Accounts & Banking
            </button>
            <button
              onClick={() => setLocation('/sales/new')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20 shrink-0 active:scale-95 transition-transform"
            >
              <ShoppingCart className="size-3.5" /> Quick POS
            </button>
            <button
              onClick={() => setLocation('/daybook')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium border border-blue-500/20 shrink-0 active:scale-95 transition-transform"
            >
              <BookOpen className="size-3.5" /> Daybook
            </button>
            <button
              onClick={() => setLocation('/credit')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium border border-amber-500/20 shrink-0 active:scale-95 transition-transform"
            >
              <Banknote className="size-3.5" /> Udharo
            </button>
          </div>
        </div>
      </div>

      {/* ── Categorized Sections ─────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 pt-5 space-y-6">
        {filteredSections.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Search className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">No matching features</p>
            <p className="text-xs text-muted-foreground">Try searching for "cash", "bank", "sales", or "supplier"</p>
          </div>
        ) : (
          filteredSections.map(section => (
            <div key={section.id} className="space-y-2.5">
              <div className="flex items-baseline justify-between px-1">
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-foreground uppercase tracking-wider text-[11px] text-muted-foreground/80">
                    {section.title}
                  </h2>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    {section.subtitle}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {section.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border/60 hover:border-primary/40 hover:shadow-sm active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`p-2.5 rounded-xl shrink-0 ${item.bgClass} ${item.colorClass} group-hover:scale-105 transition-transform`}>
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {item.title}
                            </span>
                            {item.badge && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary bg-primary/5 font-semibold">
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {item.desc}
                          </p>
                        </div>
                      </div>

                      <ChevronRight className="size-4 text-muted-foreground/60 shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
