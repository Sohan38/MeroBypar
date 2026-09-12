/**
 * Sales History — refactored
 *
 * Performance strategy
 * ────────────────────
 * 1. Items are sorted once (by ISO date string — lexicographic, no parse needed).
 * 2. Three successive useMemo filters (date preset → payment method → search)
 *    each short-circuit immediately when their filter is inactive.
 * 3. Date comparison uses ISO prefix strings ("2024-07-25") so parseISO is
 *    called ONLY when formatting labels — never inside filter loops.
 * 4. Only `displayCount` rows are rendered at a time; a "Load More" button
 *    appends 30 more without unmounting existing rows.
 * 5. Grouping and serial-number assignment happen on the already-sliced visible
 *    list — O(visible) not O(total).
 * 6. Search is debounced 200 ms and displayCount resets on any filter change.
 *
 * UX
 * ──
 * • Date preset chips: Today · Yesterday · This Week · This Month · All Time
 * • Payment chips:     All · Cash · QR · Card · Bank
 * • Debounced search across invoice ID, customer name, product names
 * • Date-grouped rows with sticky group headers
 * • Serial number badge (#1, #2 …) shown when list > 1 entry
 * • Inline receipt preview / print without navigating away
 * • Reactive summary card (count + revenue for current view)
 */

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  lazy,
  Suspense,
} from 'react';
import { isActiveSale } from '@/lib/saleUtils';
import { useLocation } from 'wouter';
import { format as formatDate, parseISO, subDays, startOfWeek, startOfMonth } from 'date-fns';
import {
  Search, Plus, Receipt, Calendar, Printer, X,
  ChevronDown, Banknote, CreditCard, QrCode,
  SplitSquareHorizontal, TrendingUp, BookOpen,
} from 'lucide-react';

import { useSales } from '@/contexts/GlobalProviders';
import { useCurrency } from '@/hooks/useCurrency';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { SaleInvoice, PaymentMethod } from '@/types';

const SaleBillPrint = lazy(() =>
  import('@/components/SaleBillPrint').then(m => ({ default: m.SaleBillPrint }))
);

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

interface DatePresetOption {
  id: DatePreset;
  label: string;
}

const DATE_PRESETS: DatePresetOption[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
  { id: 'all', label: 'All Time' },
];

interface PaymentOption {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { id: 'all', label: 'All', icon: null },
  { id: 'cash', label: 'Cash', icon: <Banknote className="h-3 w-3" /> },
  { id: 'qr', label: 'QR', icon: <QrCode className="h-3 w-3" /> },
  { id: 'card', label: 'Card', icon: <CreditCard className="h-3 w-3" /> },
  { id: 'bank', label: 'Bank', icon: <SplitSquareHorizontal className="h-3 w-3" /> },
  { id: 'credit', label: 'Credit', icon: <BookOpen className="h-3 w-3" /> },
];

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  qr: 'QR',
  card: 'Card',
  bank: 'Bank',
  split: 'Split',
  credit: 'Credit',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns "yyyy-MM-dd" prefix for today, yesterday, week-start, month-start */
function getDateBoundaries() {
  const now = new Date();
  const fmt = (d: Date) => formatDate(d, 'yyyy-MM-dd');
  return {
    today: fmt(now),
    yesterday: fmt(subDays(now, 1)),
    weekStart: fmt(startOfWeek(now, { weekStartsOn: 0 })),
    monthStart: fmt(startOfMonth(now)),
  };
}

/** Human-readable group label from a "yyyy-MM-dd" string */
function dayLabel(dayStr: string, today: string, yesterday: string): string {
  if (dayStr === today) return 'Today';
  if (dayStr === yesterday) return 'Yesterday';
  try {
    return formatDate(parseISO(dayStr), 'EEE, MMM d, yyyy');
  } catch {
    return dayStr;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

function Chip({ active, onClick, children, className = '' }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors shrink-0',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted text-muted-foreground hover:bg-muted/80',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalesList() {
  const [, setLocation] = useLocation();
  const { items } = useSales();
  const { format } = useCurrency();
  const { settings } = useApp();

  // ── Filter state ───────────────────────────────────────────────────────────
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Print dialog state
  const [printSale, setPrintSale] = useState<SaleInvoice | null>(null);

  // ── Debounce search query ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Reset displayCount on any filter change so we start fresh each time
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [datePreset, paymentFilter, debouncedQuery]);

  // ── 1. Sort once by ISO date desc (no parseISO — string compare is valid) ──
  const sortedSales = useMemo(
    () => [...items].sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0)),
    [items],
  );

  // ── 2. Date preset filter ──────────────────────────────────────────────────
  const dateFilteredSales = useMemo(() => {
    if (datePreset === 'all') return sortedSales;

    if (datePreset === 'custom') {
      return sortedSales.filter(sale => {
        const day = sale.date.slice(0, 10);
        if (customDateFrom && day < customDateFrom) return false;
        if (customDateTo && day > customDateTo) return false;
        return true;
      });
    }

    const { today, yesterday, weekStart, monthStart } = getDateBoundaries();

    return sortedSales.filter(sale => {
      // Use first 10 chars of ISO string ("yyyy-MM-dd") — avoids parseISO
      const day = sale.date.slice(0, 10);
      switch (datePreset) {
        case 'today': return day === today;
        case 'yesterday': return day === yesterday;
        case 'week': return day >= weekStart;
        case 'month': return day >= monthStart;
        default: return true;
      }
    });
  }, [sortedSales, datePreset, customDateFrom, customDateTo]);

  // ── 3. Payment method filter ───────────────────────────────────────────────
  const paymentFilteredSales = useMemo(() => {
    if (paymentFilter === 'all') return dateFilteredSales;
    return dateFilteredSales.filter(s => s.paymentMethod === paymentFilter);
  }, [dateFilteredSales, paymentFilter]);

  // ── 4. Search filter ───────────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return paymentFilteredSales;

    return paymentFilteredSales.filter(sale => {
      // Short-circuit cheap checks first
      if (sale.id.slice(-8).toLowerCase().includes(q)) return true;
      if (sale.id.slice(-6).toLowerCase().includes(q)) return true;
      if (sale.customerName?.toLowerCase().includes(q)) return true;
      if (sale.paymentMethod.includes(q)) return true;
      if (sale.notes?.toLowerCase().includes(q)) return true;
      // More expensive: scan item names
      return sale.items.some(i => i.productName.toLowerCase().includes(q));
    });
  }, [paymentFilteredSales, debouncedQuery]);

  // ── 5. Summary stats for the current filtered view ────────────────────────
  // Exclude voided sales from revenue/count stats so numbers are accurate
  const stats = useMemo(() => {
    const active = filteredSales.filter(isActiveSale);
    return {
      count: active.length,
      revenue: active.reduce((s, sale) => s + sale.grandTotal, 0),
      totalWithVoided: filteredSales.length,
    };
  }, [filteredSales]);

  // ── 6. Visible slice + grouping ───────────────────────────────────────────
  const visibleSales = useMemo(
    () => filteredSales.slice(0, displayCount),
    [filteredSales, displayCount],
  );

  const { today, yesterday } = useMemo(getDateBoundaries, []);

  /**
   * Grouped structure for rendering.
   * Each group carries its label and the sales within it,
   * each annotated with its 1-based serial number in the *filtered* list.
   */
  const groupedVisible = useMemo(() => {
    const groups: Array<{
      label: string;
      entries: Array<{ sale: SaleInvoice; serialNo: number }>;
    }> = [];

    let currentLabel = '';
    let serialOffset = 0; // serial numbers are global across groups

    for (let i = 0; i < visibleSales.length; i++) {
      const sale = visibleSales[i];
      const label = dayLabel(sale.date.slice(0, 10), today, yesterday);

      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, entries: [] });
      }

      groups[groups.length - 1].entries.push({ sale, serialNo: i + 1 });
    }

    return groups;
  }, [visibleSales, today, yesterday]);

  const hasMore = displayCount < filteredSales.length;
  const remaining = filteredSales.length - displayCount;
  const showSerials = filteredSales.length > 1;
  const hasActiveFilter = datePreset !== 'all' || paymentFilter !== 'all' || debouncedQuery !== '';

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const loadMore = useCallback(
    () => setDisplayCount(c => c + PAGE_SIZE),
    [],
  );
  const clearFilters = useCallback(() => {
    setDatePreset('all');
    setPaymentFilter('all');
    setQuery('');
    setCustomDateFrom('');
    setCustomDateTo('');
    setCustomOpen(false);
  }, []);

  const handleDatePreset = useCallback((p: DatePreset) => {
    if (p === 'custom') {
      setDatePreset('custom');
      setCustomOpen(true);
      return;
    }

    setDatePreset(p);
  }, []);

  const applyCustomDates = useCallback(() => {
    setDatePreset('custom');
    setCustomOpen(false);
  }, []);

  const handlePaymentFilter = useCallback((p: string) => {
    setPaymentFilter(p);
  }, []);

  const handlePrint = useCallback(
    (e: React.MouseEvent, sale: SaleInvoice) => {
      e.stopPropagation(); // don't navigate to detail
      setPrintSale(sale);
    },
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 pb-28 md:pb-8 space-y-4">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} total record{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setLocation('/sales/new')} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          New Sale
        </Button>
      </div>

      {/* ── Date preset chips ────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {DATE_PRESETS.map(p => (
          <Chip
            key={p.id}
            active={datePreset === p.id}
            onClick={() => handleDatePreset(p.id)}
          >
            {p.id === 'today' || p.id === 'yesterday'
              ? <Calendar className="h-3 w-3" />
              : null}
            {p.label}
          </Chip>
        ))}
      </div>

      {/* ── Payment filter chips ─────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {PAYMENT_OPTIONS.map(p => (
          <Chip
            key={p.id}
            active={paymentFilter === p.id}
            onClick={() => handlePaymentFilter(p.id)}
          >
            {p.icon}
            {p.label}
          </Chip>
        ))}
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by invoice #, customer, product…"
          className="pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setQuery('')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom date range</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="text-sm font-medium text-muted-foreground space-y-2 block">
              <span>From date</span>
              <Input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-muted-foreground space-y-2 block">
              <span>To date</span>
              <Input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setCustomDateFrom(''); setCustomDateTo(''); setDatePreset('all'); setCustomOpen(false); }}>
              Clear
            </Button>
            <Button onClick={applyCustomDates}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {hasActiveFilter ? 'Matching sales' : 'Total sales'}
              </p>
              <p className="font-bold text-lg leading-tight">{stats.count}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-right">
            <div>
              <p className="text-xs text-muted-foreground">
                {hasActiveFilter ? 'Filtered revenue' : 'Total revenue'}
              </p>
              <p className="font-bold text-lg leading-tight text-primary tabular-nums">
                {format(stats.revenue)}
              </p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {filteredSales.length === 0 ? (
        <EmptyState
          hasItems={items.length > 0}
          hasFilter={hasActiveFilter}
          onClear={clearFilters}
          onNew={() => setLocation('/sales/new')}
        />
      ) : (
        <div className="space-y-5">

          {groupedVisible.map(group => (
            <section key={group.label}>
              {/* Date group header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({group.entries.length})
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Sale rows */}
              <div className="space-y-2">
                {group.entries.map(({ sale, serialNo }) => (
                  <SaleRow
                    key={sale.id}
                    sale={sale}
                    serialNo={serialNo}
                    showSerial={showSerials}
                    format={format}
                    onClick={() => setLocation(`/sales/${sale.id}`)}
                    onPrint={handlePrint}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto gap-2"
                onClick={loadMore}
              >
                <ChevronDown className="h-4 w-4" />
                Load {Math.min(PAGE_SIZE, remaining)} more
                <span className="text-muted-foreground text-xs">
                  ({remaining} remaining)
                </span>
              </Button>
            </div>
          )}

          {/* End of list indicator */}
          {!hasMore && filteredSales.length > PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground py-2">
              All {filteredSales.length} sales shown
            </p>
          )}
        </div>
      )}

      {/* ── Inline print dialog ───────────────────────────────────────────── */}
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

// ─── SaleRow ──────────────────────────────────────────────────────────────────

interface SaleRowProps {
  sale: SaleInvoice;
  serialNo: number;
  showSerial: boolean;
  format: (n: number) => string;
  onClick: () => void;
  onPrint: (e: React.MouseEvent, sale: SaleInvoice) => void;
}

function SaleRow({ sale, serialNo, showSerial, format, onClick, onPrint }: SaleRowProps) {
  const totalQty = useMemo(
    () => sale.items.reduce((s, i) => s + i.quantity, 0),
    [sale.items],
  );

  const timeLabel = useMemo(() => {
    try {
      return formatDate(parseISO(sale.date), 'h:mm a');
    } catch {
      return '';
    }
  }, [sale.date]);

  // Preview: first 2 product names
  const itemPreview = useMemo(() => {
    const names = sale.items.slice(0, 2).map(i => i.productName).join(', ');
    return sale.items.length > 2 ? `${names} +${sale.items.length - 2}` : names;
  }, [sale.items]);

  const pmtLabel = PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod;

  const invoiceId = `INV-${sale.id.slice(-6).toUpperCase()}`;

  const isVoided = sale.status === 'voided';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`
        group flex items-center gap-3 rounded-2xl border border-border/70 bg-card
        p-3.5 sm:p-4 cursor-pointer shadow-xs
        hover:border-primary/40 hover:bg-muted/30 active:scale-[0.98]
        transition-all duration-150 select-none
        ${isVoided ? 'opacity-50' : ''}
      `}
    >
      {/* Serial number */}
      {showSerial && (
        <div className="text-[11px] text-muted-foreground/80 tabular-nums w-5 text-center shrink-0 font-bold">
          {serialNo}
        </div>
      )}

      {/* Receipt icon */}
      <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <Receipt className="size-5" />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-foreground tracking-tight">{invoiceId}</span>
          {isVoided && (
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 uppercase font-bold tracking-wider">
              Voided
            </Badge>
          )}
          {sale.customerName ? (
            <span className="text-xs text-muted-foreground truncate max-w-[140px] font-medium">
              · {sale.customerName}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/80">· Counter Sale</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {itemPreview || 'No items'}
        </p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{timeLabel}</span>
          <span className="text-muted-foreground/40 text-[10px]">·</span>
          <span className="text-[11px] text-muted-foreground">{totalQty} item{totalQty !== 1 ? 's' : ''}</span>
          <Badge
            variant="outline"
            className="text-[10px] px-2 py-0 h-4.5 capitalize font-semibold border-primary/20 bg-primary/5 text-primary"
          >
            {pmtLabel}
          </Badge>
        </div>
      </div>

      {/* Amount + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className="font-extrabold tabular-nums text-sm sm:text-base text-foreground">{format(sale.grandTotal)}</p>
          {sale.discount > 0 && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
              -{format(sale.discount)}
            </p>
          )}
        </div>

        {/* Print button — hidden for voided sales */}
        {!isVoided && (
          <button
            type="button"
            aria-label="Print receipt"
            onClick={e => onPrint(e, sale)}
            className="
              size-8.5 rounded-xl flex items-center justify-center
              text-muted-foreground hover:text-foreground hover:bg-muted/70
              border border-border/60 active:scale-90 transition-all shrink-0
            "
          >
            <Printer className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  hasItems: boolean;
  hasFilter: boolean;
  onClear: () => void;
  onNew: () => void;
}

function EmptyState({ hasItems, hasFilter, onClear, onNew }: EmptyStateProps) {
  if (!hasItems) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-3">
          <Receipt className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold">No sales yet</h3>
          <p className="text-muted-foreground text-sm">Start recording sales to see them here.</p>
          <Button onClick={onNew} className="mt-2">
            <Plus className="h-4 w-4 mr-2" />
            New Sale
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-12 text-center space-y-3">
        <Search className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <h3 className="text-base font-semibold">No matching sales</h3>
        <p className="text-muted-foreground text-sm">
          {hasFilter
            ? 'Try a different date range, payment method, or search term.'
            : 'No sales found for your search.'}
        </p>
        {hasFilter && (
          <Button variant="outline" size="sm" onClick={onClear} className="mt-1">
            <X className="h-3.5 w-3.5 mr-1.5" />
            Clear filters
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
