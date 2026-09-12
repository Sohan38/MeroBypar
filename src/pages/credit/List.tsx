import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useCredit } from '@/contexts/GlobalProviders';
import { useCurrency } from '@/hooks/useCurrency';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Banknote, Plus, Calendar, User, ChevronRight, ChevronDown,
  Clock, TrendingDown, CheckCircle2, Search, Phone, X,
} from 'lucide-react';
import { format as formatDate, parseISO, subDays, startOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatDateTime, sortByLatestFirst } from '@/lib/date';
import { rankSearch } from '@/utils/search/rank';

type FilterStatus = 'all' | 'pending' | 'partial' | 'paid';
type DatePreset = 'all' | 'today' | 'yesterday' | '7days' | 'month' | 'custom';

const PAGE_SIZE = 25;
const CREDIT_PAGE_SIZE = 5; // initial credits per expanded customer

const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
  { id: 'all', label: 'All Time' },
];

const STATUS_FILTERS: Array<{ id: FilterStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'partial', label: 'Partial' },
  { id: 'paid', label: 'Settled' },
];

// Chip component (shared pattern)
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

export default function CreditList() {
  const [, setLocation] = useLocation();
  const { items } = useCredit();
  const { format } = useCurrency();

  // Filter state
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [creditPageMap, setCreditPageMap] = useState<Record<string, number>>({});

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(inputValue), 200);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Reset display count and credit pagination on filter changes
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
    setCreditPageMap({});
  }, [debouncedQuery, statusFilter, datePreset, customDateFrom, customDateTo]);

  // Derived date range from preset (ISO prefix strings)
  const dateRange = useMemo(() => {
    const now = new Date();
    const fmt = (d: Date) => formatDate(d, 'yyyy-MM-dd');

    switch (datePreset) {
      case 'today':
        return { from: fmt(now), to: fmt(now) };
      case 'yesterday': {
        const y = subDays(now, 1);
        return { from: fmt(y), to: fmt(y) };
      }
      case '7days':
        return { from: fmt(subDays(now, 6)), to: fmt(now) };
      case 'month':
        return { from: fmt(startOfMonth(now)), to: fmt(now) };
      case 'custom':
        return { from: customDateFrom, to: customDateTo };
      default:
        return { from: '', to: '' };
    }
  }, [datePreset, customDateFrom, customDateTo]);

  // Filter and enrich individual credit records
  const filteredCredits = useMemo(() => {
    // 1. Enrich with searchable fields
    const enriched = items.map(credit => ({
      ...credit,
      name: credit.customerName,
      phone: credit.phone,
      category: credit.description,
      searchText: [
        credit.customerName,
        credit.phone,
        credit.description,
        credit.notes,
      ].join(' '),
    }));

    let filtered = enriched;

    // 2. Date filter
    const { from, to } = dateRange;
    if (from || to) {
      filtered = filtered.filter(credit => {
        const day = credit.date.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      });
    }

    // 3. Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    // 4. Search
    if (debouncedQuery.trim()) {
      filtered = rankSearch(filtered, debouncedQuery, filtered.length);
    }

    // 5. Sort for internal use (grouping will reorder)
    return sortByLatestFirst(filtered, item => item.date, item => item.createdAt);
  }, [items, debouncedQuery, statusFilter, dateRange]);

  // Aggregate credits by customer (composite key: name + phone)
  const customerSummaries = useMemo(() => {
    const map = new Map<string, {
      key: string;
      customerName: string;
      phone: string;
      credits: typeof filteredCredits;
      totalOutstanding: number;
      totalReceived: number;
      totalAmount: number;
      oldestDate: string;
      creditCount: number;
    }>();

    filteredCredits.forEach(credit => {
      const key = `${credit.customerName}-${credit.phone || 'no-phone'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          customerName: credit.customerName,
          phone: credit.phone,
          credits: [],
          totalOutstanding: 0,
          totalReceived: 0,
          totalAmount: 0,
          oldestDate: credit.date,
          creditCount: 0,
        });
      }
      const summary = map.get(key)!;
      const paid = Number(credit.paidAmount ?? 0);
      const outstanding = Math.max(0, Number(credit.amount ?? 0) - paid);
      summary.credits.push(credit);
      summary.totalOutstanding += outstanding;
      summary.totalReceived += paid;
      summary.totalAmount += Number(credit.amount ?? 0);
      summary.creditCount++;
      if (credit.date < summary.oldestDate) summary.oldestDate = credit.date;
    });

    // Sort by totalOutstanding descending
    return Array.from(map.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [filteredCredits]);

  // Summary metrics (based on all items, consistent with original)
  const totalPending = useMemo(
    () =>
      items
        .filter(i => i.status !== 'paid')
        .reduce((s, i) => s + Math.max(0, i.amount - (i.paidAmount ?? 0)), 0),
    [items]
  );
  const totalReceived = useMemo(
    () =>
      items.reduce(
        (s, i) => s + (i.paidAmount ?? 0) + (i.status === 'paid' && !i.paidAmount ? i.amount : 0),
        0
      ),
    [items]
  );

  // Pagination on customer groups
  const visibleCustomers = useMemo(
    () => customerSummaries.slice(0, displayCount),
    [customerSummaries, displayCount]
  );
  const hasMore = displayCount < customerSummaries.length;
  const remaining = customerSummaries.length - displayCount;

  const activeFilterCount = [
    debouncedQuery !== '',
    statusFilter !== 'all',
    datePreset !== 'all',
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setInputValue('');
    setStatusFilter('all');
    setDatePreset('all');
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
    setCustomOpen(false);
  }, []);

  const applyCustomDates = useCallback(() => {
    setDatePreset('custom');
    setCustomOpen(false);
  }, []);

  const loadMore = useCallback(() => {
    setDisplayCount(c => c + PAGE_SIZE);
  }, []);

  const toggleCustomer = useCallback((key: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const loadMoreCredits = useCallback((customerKey: string) => {
    setCreditPageMap(prev => ({
      ...prev,
      [customerKey]: (prev[customerKey] ?? CREDIT_PAGE_SIZE) + CREDIT_PAGE_SIZE,
    }));
  }, []);

  const statusConfig = {
    pending: {
      label: 'Pending',
      className: 'bg-orange-500/10 text-orange-600 border-orange-200/40 dark:border-orange-500/20',
      icon: <Clock className="h-3 w-3" />,
    },
    partial: {
      label: 'Partial',
      className: 'bg-blue-500/10 text-blue-600 border-blue-200/40 dark:border-blue-500/20',
      icon: <TrendingDown className="h-3 w-3" />,
    },
    paid: {
      label: 'Settled',
      className: 'bg-green-500/10 text-green-600 border-green-200/40 dark:border-green-500/20',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-28 md:pb-8 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Credit (Udharo)</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customer debts grouped by person
          </p>
        </div>
        <Button onClick={() => setLocation('/credit/new')} className="w-full sm:w-auto shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Credit
        </Button>
      </div>

      {/* Date chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {DATE_PRESETS.map(p => (
          <Chip key={p.id} active={datePreset === p.id} onClick={() => handleDatePreset(p.id)}>
            {(p.id === 'today' || p.id === 'yesterday') && <Calendar className="h-3 w-3" />}
            {p.label}
          </Chip>
        ))}
      </div>

      {/* Status chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {STATUS_FILTERS.map(s => (
          <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
            {s.label}
          </Chip>
        ))}
      </div>

      {/* Search + clear filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Search by customer name or phone…"
            className="pl-9 pr-9"
            aria-label="Search credit records"
          />
          {inputValue && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setInputValue('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <X className="h-4 w-4" />
            Clear
            <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
              {activeFilterCount}
            </Badge>
          </Button>
        )}
      </div>

      {/* Custom date dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom date range</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="text-sm font-medium text-muted-foreground space-y-2 block">
              <span>From date</span>
              <Input
                type="date"
                value={customDateFrom}
                onChange={e => setCustomDateFrom(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-muted-foreground space-y-2 block">
              <span>To date</span>
              <Input
                type="date"
                value={customDateTo}
                onChange={e => setCustomDateTo(e.target.value)}
              />
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCustomDateFrom('');
                setCustomDateTo('');
                setDatePreset('all');
                setCustomOpen(false);
              }}
            >
              Clear
            </Button>
            <Button onClick={applyCustomDates}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Summary cards */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl px-4 py-3">
            <div className="h-9 w-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Pending</p>
              <p className="font-bold text-lg leading-tight text-orange-600 tabular-nums wrap-break-word">
                {format(totalPending)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl px-4 py-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Received</p>
              <p className="font-bold text-lg leading-tight text-emerald-600 tabular-nums wrap-break-word">
                {format(totalReceived)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer list / empty states */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Banknote className="mx-auto h-12 w-12 text-orange-500/70" />
            <h3 className="text-lg font-semibold">No Credit Records</h3>
            <p className="text-muted-foreground text-sm">
              Use the "Add Credit" action or checkout a customer on POS credit.
            </p>
          </CardContent>
        </Card>
      ) : customerSummaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <h3 className="text-base font-semibold">No matching customers</h3>
            <p className="text-muted-foreground text-sm">
              {activeFilterCount > 0
                ? 'Try a different date, status, or search term.'
                : 'No credits found for your search.'}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-1">
                <X className="h-3.5 w-3.5 mr-1.5" />
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            {visibleCustomers.map(summary => {
              const isExpanded = expandedCustomers.has(summary.key);
              const progressPct = summary.totalAmount > 0
                ? Math.min(100, (summary.totalReceived / summary.totalAmount) * 100)
                : 0;
              const creditLimit = creditPageMap[summary.key] ?? CREDIT_PAGE_SIZE;
              const visibleCredits = summary.credits.slice(0, creditLimit);
              const remainingCredits = summary.credits.length - creditLimit;

              return (
                <Card key={summary.key} className="rounded-2xl border border-border/70 bg-card shadow-xs hover:shadow-md hover:border-amber-500/40 transition-all overflow-hidden">
                  {/* Customer summary row */}
                  <div
                    className="p-4 sm:p-5 cursor-pointer flex items-start justify-between gap-3 active:scale-[0.99] transition-transform"
                    onClick={() => toggleCustomer(summary.key)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm truncate">
                          {summary.customerName}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-1">
                          {summary.phone && (
                            <>
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {summary.phone}
                              </span>
                              <span>•</span>
                            </>
                          )}
                          <span>{summary.creditCount} credit{summary.creditCount !== 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(parseISO(summary.oldestDate), 'dd MMM yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-orange-600 text-base sm:text-lg tabular-nums">
                          {format(summary.totalOutstanding)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          of {format(summary.totalAmount)}
                        </p>
                      </div>
                      <ChevronDown className={cn(
                        'h-5 w-5 text-muted-foreground transition-transform',
                        isExpanded && 'rotate-180'
                      )} />
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                    <div className="flex justify-between items-end text-xs mb-1">
                      <span className="text-muted-foreground">Settle Progress</span>
                      <span className="font-bold">{progressPct.toFixed(0)}% paid</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          progressPct >= 100 ? 'bg-emerald-500' : progressPct > 0 ? 'bg-blue-500' : 'bg-orange-500',
                        )}
                        style={{ width: `${Math.max(progressPct, 1.5)}%` }}
                      />
                    </div>
                  </div>

                  {/* Expanded individual credits with pagination */}
                  {isExpanded && (
                    <div className="border-t border-border/60 divide-y">
                      {visibleCredits.map(credit => {
                        const paid = Number(credit.paidAmount ?? 0);
                        const remaining = Math.max(0, Number(credit.amount ?? 0) - paid);
                        const statusCfg = statusConfig[credit.status] ?? statusConfig.pending;

                        return (
                          <div
                            key={credit.id}
                            className="p-4 sm:px-5 hover:bg-muted/40 cursor-pointer transition-colors"
                            onClick={() => setLocation(`/credit/${credit.id}`)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                    {credit.id.slice(0, 8).toUpperCase()}
                                  </span>
                                  <Badge variant="outline" className={cn('flex items-center gap-1 px-2 py-0 text-[10px] font-semibold rounded-full border', statusCfg.className)}>
                                    {statusCfg.icon}
                                    {statusCfg.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatDateTime(credit.date)}
                                  {credit.dueDate && (
                                    <> &middot; Due {formatDate(parseISO(credit.dueDate), 'MMM d')}</>
                                  )}
                                </p>
                                {credit.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1 italic mt-0.5">
                                    {credit.description}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-semibold text-sm text-orange-600">{format(remaining)}</p>
                                <p className="text-xs text-muted-foreground">of {format(credit.amount)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {remainingCredits > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadMoreCredits(summary.key);
                          }}
                        >
                          Load {Math.min(CREDIT_PAGE_SIZE, remainingCredits)} more credit{remainingCredits !== 1 ? 's' : ''}
                          <span className="text-muted-foreground text-xs ml-1">
                            ({remainingCredits} remaining)
                          </span>
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Load more customers */}
          {hasMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <Button variant="outline" className="w-full sm:w-auto gap-2" onClick={loadMore}>
                <ChevronDown className="h-4 w-4" />
                Load {Math.min(PAGE_SIZE, remaining)} more
                <span className="text-muted-foreground text-xs">({remaining} remaining)</span>
              </Button>
            </div>
          )}

          {/* End of customers */}
          {!hasMore && customerSummaries.length > PAGE_SIZE && (
            <p className="text-center text-xs text-muted-foreground py-2">
              All {customerSummaries.length} customers shown
            </p>
          )}
        </div>
      )}
    </div>
  );
}