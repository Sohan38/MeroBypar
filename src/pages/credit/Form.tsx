import { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useCredit, useCustomers } from '@/contexts/GlobalProviders';
import { useSmartBack } from '@/contexts/NavigationContext';
import { useStorageProvider } from '@/storage/StorageContext';
import { useCurrency } from '@/hooks/useCurrency';
import { usePaymentFunds } from '@/hooks/usePaymentFunds';
import { useAllCustomerStats } from '@/hooks/useCustomerStats';
import { FinancialPostingService } from '@/services/financialPostingService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BankSelector } from '@/components/pos/BankSelector';
import {
  ArrowLeft,
  Check,
  Search,
  Save,
  UserRound,
  X,
  Calendar,
  Clock,
  Trash2,
  Banknote,
  Landmark,
  Coins,
  QrCode,
  Split,
  AlertCircle,
  Plus,
  Phone,
  ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';
import { rankSearch } from '@/utils/search/rank';
import { normalizeDecimalInput, parseDecimal } from '@/utils/numberUtils';
import { safeCurrency } from '@/utils/unitUtils';
import { cn } from '@/lib/utils';
import type { Customer, CreditType, PaymentMethod, PaymentSplitEntry } from '@/types';
import { format as formatDate, addDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

// Quick due date presets (relative to today)
const DUE_DATE_PRESETS = [
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '15 days', days: 15 },
  { label: '30 days', days: 30 },
];

// Quick loan amount increment chips
const QUICK_AMOUNT_INCREMENTS = [500, 1000, 2000, 5000, 10000];

// Quick purpose presets
const PURPOSE_PRESETS = [
  'Cash Sapaati (सापटी)',
  'Personal Help',
  'Business Advance',
  'Emergency',
  'Salary Advance',
  'Goods / Service Udharo',
];

export default function CreditForm() {
  const goBack = useSmartBack('/credit');
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const storage = useStorageProvider();
  const { add, update, items, remove } = useCredit();
  const { items: customers } = useCustomers();
  const { format } = useCurrency();
  const customerStatsMap = useAllCustomerStats();

  const {
    bankAccounts,
    getMethodBalance,
    checkFundAvailability,
  } = usePaymentFunds();

  const isNew = !id || id === 'new';
  const existing = useMemo(
    () => (isNew ? null : items.find(c => c.id === id) ?? null),
    [isNew, items, id],
  );

  // Form State
  const [creditType, setCreditType] = useState<CreditType>(existing?.creditType ?? 'loan');
  const [customerId, setCustomerId] = useState(existing?.customerId ?? '');
  const [amount, setAmount] = useState(String(existing?.amount ?? ''));
  const [disbursementMethod, setDisbursementMethod] = useState<PaymentMethod | string>(existing?.disbursementMethod ?? 'cash');
  const [disbursementAccountId, setDisbursementAccountId] = useState<string | null>(existing?.disbursementAccountId ?? null);
  const [splitDisbursements, setSplitDisbursements] = useState<PaymentSplitEntry[]>(existing?.splitDisbursements ?? []);
  const [purpose, setPurpose] = useState(existing?.purpose ?? 'Cash Sapaati (सापटी)');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [referenceNumber, setReferenceNumber] = useState(existing?.referenceNumber ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ? existing.dueDate.slice(0, 10) : '');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load existing data when editing
  useEffect(() => {
    if (existing) {
      setCreditType(existing.creditType ?? 'loan');
      setCustomerId(existing.customerId ?? '');
      setAmount(String(existing.amount ?? ''));
      setDisbursementMethod(existing.disbursementMethod ?? 'cash');
      setDisbursementAccountId(existing.disbursementAccountId ?? null);
      setSplitDisbursements(existing.splitDisbursements ?? []);
      setPurpose(existing.purpose ?? existing.description ?? 'Cash Sapaati (सापटी)');
      setDescription(existing.description ?? '');
      setReferenceNumber(existing.referenceNumber ?? '');
      setDueDate(existing.dueDate ? existing.dueDate.slice(0, 10) : '');
    }
  }, [existing]);

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === customerId),
    [customers, customerId],
  );

  const selectedCustomerStats = useMemo(() => {
    if (!selectedCustomer) return null;
    return customerStatsMap.get(selectedCustomer.id);
  }, [selectedCustomer, customerStatsMap]);

  const customerResults = useMemo(() => {
    if (!customerQuery.trim()) return customers.slice(0, 8);
    return rankSearch(customers, customerQuery, 8);
  }, [customers, customerQuery]);

  const selectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerQuery('');
    setCustomerError('');
  };

  const parsedAmount = Math.max(0, parseDecimal(amount) || 0);

  // Handle Quick Amount Chips
  const handleQuickAddAmount = (addVal: number) => {
    const current = parseDecimal(amount) || 0;
    setAmount(String(current + addVal));
  };

  // Funds verification for single method
  const isLoan = creditType === 'loan';
  const isSplit = disbursementMethod === 'split';

  const fundInfo = useMemo(() => {
    if (!isLoan || isSplit || parsedAmount <= 0) return null;
    return checkFundAvailability(disbursementMethod as PaymentMethod, parsedAmount, disbursementAccountId);
  }, [isLoan, isSplit, parsedAmount, checkFundAvailability, disbursementMethod, disbursementAccountId]);

  const activeMethodBalance = useMemo(() => {
    if (!isLoan || isSplit) return 0;
    return getMethodBalance(disbursementMethod as PaymentMethod, disbursementAccountId);
  }, [isLoan, isSplit, getMethodBalance, disbursementMethod, disbursementAccountId]);

  // Total allocated across split lines
  const totalSplitAllocated = useMemo(() => {
    return safeCurrency(splitDisbursements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
  }, [splitDisbursements]);

  // Initialize split lines if switching to split
  useEffect(() => {
    if (isSplit && (!splitDisbursements || splitDisbursements.length === 0)) {
      const primaryBankId = bankAccounts[0]?.id || null;
      const initialSplits: PaymentSplitEntry[] = [
        {
          id: uuidv4(),
          method: 'cash',
          amount: safeCurrency(parsedAmount * 0.5),
        },
        {
          id: uuidv4(),
          method: 'bank',
          amount: safeCurrency(parsedAmount * 0.5),
          bankAccountId: primaryBankId,
        },
      ];
      setSplitDisbursements(initialSplits);
    }
  }, [isSplit, splitDisbursements, parsedAmount, bankAccounts]);

  const updateSplitLine = (id: string, updates: Partial<PaymentSplitEntry>) => {
    const next = splitDisbursements.map(line => {
      if (line.id !== id) return line;
      const updated = { ...line, ...updates };
      if (updated.method === 'bank' && !updated.bankAccountId && bankAccounts.length > 0) {
        updated.bankAccountId = bankAccounts[0].id;
      }
      return updated;
    });
    setSplitDisbursements(next);
    const newTotal = safeCurrency(next.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
    setAmount(String(newTotal));
  };

  const addSplitLine = () => {
    const remaining = Math.max(0, parsedAmount - totalSplitAllocated);
    const existingMethods = new Set(splitDisbursements.map(s => s.method));
    const candidateMethod: Exclude<PaymentMethod, 'split' | 'credit'> =
      !existingMethods.has('bank') ? 'bank' : !existingMethods.has('cash') ? 'cash' : 'qr';

    const newLine: PaymentSplitEntry = {
      id: uuidv4(),
      method: candidateMethod,
      amount: remaining > 0 ? remaining : 0,
      bankAccountId: candidateMethod === 'bank' ? (bankAccounts[0]?.id || null) : null,
    };
    setSplitDisbursements([...splitDisbursements, newLine]);
  };

  const removeSplitLine = (id: string) => {
    if (splitDisbursements.length <= 1) return;
    const next = splitDisbursements.filter(line => line.id !== id);
    setSplitDisbursements(next);
    const newTotal = safeCurrency(next.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
    setAmount(String(newTotal));
  };

  const handleQuickDueDate = (days: number) => {
    const due = addDays(new Date(), days);
    setDueDate(formatDate(due, 'yyyy-MM-dd'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setCustomerError('Select a customer before saving.');
      toast.error('A customer is required');
      return;
    }

    if (parsedAmount <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }

    if (isLoan && isSplit) {
      if (splitDisbursements.length === 0) {
        toast.error('Add at least one split disbursement line');
        return;
      }
      if (totalSplitAllocated <= 0) {
        toast.error('Enter valid amounts for split disbursements');
        return;
      }
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const creditId = existing ? existing.id : uuidv4();
      const finalDescription = purpose ? `${purpose}${description ? ` · ${description}` : ''}` : (description || 'Credit record');

      const creditPayload = {
        id: creditId,
        customerId,
        customerName: selectedCustomer!.name,
        phone: selectedCustomer!.phone,
        creditType,
        amount: parsedAmount,
        paidAmount: existing ? existing.paidAmount ?? 0 : 0,
        date: existing ? existing.date : now,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        status: existing ? existing.status : 'pending',
        paidAt: existing ? existing.paidAt : null,
        description: finalDescription,
        purpose,
        referenceNumber: referenceNumber.trim() || undefined,
        disbursementMethod: isLoan ? disbursementMethod : undefined,
        disbursementAccountId: isLoan && disbursementMethod === 'bank' ? disbursementAccountId : null,
        splitDisbursements: isLoan && isSplit ? splitDisbursements : undefined,
        notes: description.trim(),
        payments: existing ? existing.payments ?? [] : [],
      };

      const commit = async () => {
        // 1. Save or Update Credit Record
        if (isNew) {
          await add(creditPayload as any);
        } else if (existing) {
          await update(existing.id, creditPayload as any);
        }

        // 2. Financial Ledger Synchronization for Money Loans
        const allTransactions = await storage.get<any>('financialTransactions');
        const priorPostings = allTransactions.filter(
          (tx: any) => tx.sourceType === 'customer_lending' && tx.sourceId === creditId && tx.status === 'posted'
        );

        for (const posting of priorPostings) {
          await FinancialPostingService.reverse(storage, posting.id, creditId, `credit-lending:${creditId}:reversal:${Date.now()}`);
        }

        if (isLoan) {
          await FinancialPostingService.postCreditLending(storage, {
            id: creditId,
            date: creditPayload.date,
            amount: parsedAmount,
            paymentMethod: disbursementMethod,
            bankAccountId: disbursementAccountId,
            splitDisbursements: isSplit ? splitDisbursements : undefined,
            customerName: selectedCustomer!.name,
            description: finalDescription,
          });
        }
      };

      if (storage.transaction) {
        await storage.transaction(
          ['credit', 'financialAccounts', 'financialTransactions', 'financialMovements', 'settings'],
          'rw',
          commit,
        );
      } else {
        await commit();
      }

      toast.success(isNew ? (isLoan ? 'Loan disbursement recorded!' : 'Udharo credit recorded!') : 'Record updated successfully!');
      setLocation('/credit');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to save credit record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (!confirm('Delete this credit record? Any linked cash/bank disbursement will be reversed.')) return;

    setSaving(true);
    try {
      const commit = async () => {
        const allTransactions = await storage.get<any>('financialTransactions');
        const priorPostings = allTransactions.filter(
          (tx: any) => tx.sourceType === 'customer_lending' && tx.sourceId === existing.id && tx.status === 'posted'
        );
        for (const posting of priorPostings) {
          await FinancialPostingService.reverse(storage, posting.id, existing.id, `credit-lending:${existing.id}:reversal:${Date.now()}`);
        }
        await remove(existing.id);
      };

      if (storage.transaction) {
        await storage.transaction(
          ['credit', 'financialAccounts', 'financialTransactions', 'financialMovements', 'settings'],
          'rw',
          commit,
        );
      } else {
        await commit();
      }

      toast.success('Credit record deleted');
      setLocation('/credit');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete credit record');
    } finally {
      setSaving(false);
    }
  };

  const disbursementOptions: Array<{
    id: PaymentMethod;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'cash', label: 'Cash Drawer', icon: Coins },
    { id: 'bank', label: 'Bank Account', icon: Landmark },
    { id: 'qr', label: 'QR / Wallet', icon: QrCode },
    { id: 'split', label: 'Split (Multi)', icon: Split },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto pb-28 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back" className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">
            {isNew ? (isLoan ? 'Lend Money (सापटी)' : 'Add Udharo Credit') : 'Edit Credit Record'}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            {isNew
              ? isLoan
                ? 'Disburse cash or bank funds as an informal loan to a customer'
                : 'Record manual credit for goods or services outside POS'
              : 'Update lending and credit details'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Credit Type Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-muted/70 border border-border/80 shadow-2xs">
          <button
            type="button"
            onClick={() => {
              setCreditType('loan');
              if (!purpose || purpose === 'Goods / Service Udharo') setPurpose('Cash Sapaati (सापटी)');
            }}
            className={cn(
              'py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition-all flex flex-col items-center justify-center gap-1 cursor-pointer',
              creditType === 'loan'
                ? 'bg-background text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-1.5">
              <Banknote className="h-4 w-4 text-primary" />
              <span>Money Loan (सापटी)</span>
            </div>
            <span className="text-[10px] font-normal opacity-80">Disbursed from Cash/Bank</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreditType('sale');
              if (purpose === 'Cash Sapaati (सापटी)') setPurpose('Goods / Service Udharo');
            }}
            className={cn(
              'py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition-all flex flex-col items-center justify-center gap-1 cursor-pointer',
              creditType === 'sale'
                ? 'bg-background text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <div className="flex items-center gap-1.5">
              <ShoppingBag className="h-4 w-4 text-blue-600" />
              <span>Goods / Service Udharo</span>
            </div>
            <span className="text-[10px] font-normal opacity-80">Manual non-cash credit</span>
          </button>
        </div>

        {/* 2. Customer Card with Credit Intelligence */}
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Customer Recipient *
              </label>
              {selectedCustomer && (
                <span className="text-[11px] text-muted-foreground">
                  {selectedCustomerStats?.visitCount || 0} lifetime transactions
                </span>
              )}
            </div>

            {selectedCustomer ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-base shrink-0">
                      {selectedCustomer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate leading-tight">{selectedCustomer.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />
                        {selectedCustomer.phone || 'No phone number'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCustomerId('')}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Change customer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Customer Credit Intelligence Stats */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-primary/15 text-xs">
                  <span className="text-muted-foreground font-medium">Existing Outstanding:</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-md',
                      (selectedCustomerStats?.outstandingCredit ?? 0) > 0
                        ? 'bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-900/50'
                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-900/50'
                    )}
                  >
                    {(selectedCustomerStats?.outstandingCredit ?? 0) > 0
                      ? `${format(selectedCustomerStats?.outstandingCredit ?? 0)} due`
                      : 'Clear balance (Rs. 0)'}
                  </Badge>

                  {(selectedCustomerStats?.outstandingCredit ?? 0) > 0 && (
                    <span className="text-[11px] text-muted-foreground italic">
                      + This new {isLoan ? 'loan' : 'credit'} will add {format(parsedAmount)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={customerQuery}
                    onChange={e => { setCustomerQuery(e.target.value); setCustomerError(''); }}
                    placeholder="Search customer by name or phone..."
                    className="h-11 pl-9 pr-9 text-sm rounded-xl bg-background"
                    autoComplete="off"
                  />
                  {customerQuery && (
                    <button
                      type="button"
                      onClick={() => setCustomerQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {customerResults.length > 0 ? (
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {customerResults.map(customer => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-1.5 text-left shrink-0 hover:border-primary/50 hover:bg-primary/5 active:scale-[.98] transition-all cursor-pointer"
                      >
                        <span className="h-5 w-5 rounded-full bg-background flex items-center justify-center text-[10px] font-bold text-primary border">
                          {customer.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="max-w-28 truncate text-xs font-semibold">{customer.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed py-4 text-center text-xs text-muted-foreground">
                    <UserRound className="h-5 w-5 mx-auto mb-1 text-muted-foreground/50" />
                    No matching customer found
                  </div>
                )}
                {customerError && <p className="text-xs text-destructive font-medium">{customerError}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Amount & Quick Add Chips */}
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {isLoan ? 'Loan Amount to Lend *' : 'Credit Amount *'}
              </label>
              <span className="text-xs font-extrabold text-foreground tabular-nums">
                {format(parsedAmount)}
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground select-none pointer-events-none">
                Rs.
              </span>
              <Input
                type="text"
                value={amount}
                onChange={e => setAmount(normalizeDecimalInput(e.target.value))}
                onFocus={e => e.target.select()}
                inputMode="decimal"
                placeholder="0.00"
                required
                className="text-xl md:text-2xl font-black h-13 pl-10 rounded-xl bg-background tabular-nums"
              />
            </div>

            {/* Quick Add Amount Increments */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              <span className="text-[11px] font-semibold text-muted-foreground mr-1 shrink-0">Quick Add:</span>
              {QUICK_AMOUNT_INCREMENTS.map(inc => (
                <button
                  key={inc}
                  type="button"
                  onClick={() => handleQuickAddAmount(inc)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-background hover:bg-muted text-foreground/80 hover:text-foreground shrink-0 transition-colors cursor-pointer"
                >
                  +{inc >= 1000 ? `${inc / 1000}k` : inc}
                </button>
              ))}
              {parsedAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount('')}
                  className="px-2 py-1 text-xs font-medium rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 4. Disbursement Source & Live Funds Verification (Only for Money Loan) */}
        {isLoan && (
          <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden">
            <CardContent className="p-4 md:p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-primary" />
                  Disbursed From / रकम दिएको स्रोत *
                </label>
                {!isSplit && (
                  <span className="text-xs font-medium text-muted-foreground">
                    Available: <strong className={cn(activeMethodBalance < parsedAmount ? 'text-rose-600' : 'text-emerald-600')}>{format(activeMethodBalance)}</strong>
                  </span>
                )}
              </div>

              {/* Source Method Selection Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {disbursementOptions.map(opt => {
                  const Icon = opt.icon;
                  const isSelected = disbursementMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDisbursementMethod(opt.id)}
                      className={cn(
                        'p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer text-center',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold'
                          : 'bg-background hover:bg-muted/60 text-muted-foreground border-border/80 font-medium'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Bank Account Selector */}
              {disbursementMethod === 'bank' && (
                <div className="pt-1">
                  <BankSelector
                    selectedAccountId={disbursementAccountId}
                    onSelectAccountId={id => setDisbursementAccountId(id)}
                    label="Select Bank Account to Disburse From"
                  />
                </div>
              )}

              {/* Insufficient Funds Warning Banner */}
              {!isSplit && fundInfo && !fundInfo.isSufficient && parsedAmount > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                  <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <p className="font-bold">Insufficient funds in {fundInfo.accountName}</p>
                      <p className="text-[11px] opacity-90 mt-0.5">
                        Available: <strong>{format(fundInfo.available)}</strong>. Short by{' '}
                        <strong className="text-destructive font-black">{format(fundInfo.deficit)}</strong>.
                      </p>
                    </div>
                  </div>

                  {/* 1-Click Solutions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {fundInfo.available > 0 && (
                      <button
                        type="button"
                        onClick={() => setAmount(String(safeCurrency(fundInfo.available)))}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition-colors cursor-pointer"
                      >
                        Lend Available {format(fundInfo.available)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDisbursementMethod('split')}
                      className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
                    >
                      Split with Another Source
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Source Split Allocation */}
              {isSplit && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>Split Allocation Breakdown</span>
                    <span className={cn('tabular-nums', totalSplitAllocated === parsedAmount ? 'text-emerald-600' : 'text-amber-600')}>
                      Allocated: {format(totalSplitAllocated)} / {format(parsedAmount)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {splitDisbursements.map((split) => {
                      const splitMethodBalance = getMethodBalance(split.method, split.bankAccountId);
                      const isShort = Number(split.amount) > splitMethodBalance;
                      return (
                        <div key={split.id} className="p-3 rounded-xl border bg-muted/30 space-y-2">
                          <div className="flex items-center gap-2">
                            <select
                              value={split.method}
                              onChange={e => updateSplitLine(split.id, { method: e.target.value as any })}
                              className="h-9 px-2.5 text-xs font-semibold rounded-lg border bg-background"
                            >
                              <option value="cash">Cash</option>
                              <option value="bank">Bank</option>
                              <option value="qr">QR / Mobile</option>
                              <option value="other">Wallet</option>
                            </select>

                            <div className="relative flex-1">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">Rs.</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={split.amount === 0 ? '' : split.amount}
                                onChange={e => updateSplitLine(split.id, { amount: Number(e.target.value) || 0 })}
                                placeholder="0"
                                className="h-9 pl-8 text-xs font-bold bg-background tabular-nums"
                              />
                            </div>

                            {splitDisbursements.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSplitLine(split.id)}
                                className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          {split.method === 'bank' && (
                            <div className="pt-0.5">
                              <BankSelector
                                selectedAccountId={split.bankAccountId}
                                onSelectAccountId={bId => updateSplitLine(split.id, { bankAccountId: bId })}
                                label="Bank for this split"
                              />
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                            <span>Available: {format(splitMethodBalance)}</span>
                            {isShort && <span className="text-destructive font-semibold">Insufficient balance</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSplitLine}
                    className="w-full text-xs font-semibold rounded-xl"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Another Source
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 5. Purpose, Reference & Notes */}
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4 md:p-5 space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                Purpose / Reason
              </label>
              {/* Purpose Chips */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {PURPOSE_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPurpose(preset)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
                      purpose === preset
                        ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                        : 'bg-background hover:bg-muted text-muted-foreground border-border/80'
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Reference / Cheque #</label>
                <Input
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  placeholder="Optional ref or voucher no."
                  className="h-10 text-xs rounded-xl bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Additional Notes</label>
                <Input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Promised return by Friday"
                  className="h-10 text-xs rounded-xl bg-background"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 6. Repayment Due Date */}
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Repayment Due Date (Optional)
              </label>
              {dueDate && (
                <span className="text-xs font-bold text-primary">
                  {formatDate(new Date(dueDate), 'MMM d, yyyy')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="h-10 text-xs rounded-xl bg-background flex-1"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  className="px-2.5 h-10 text-xs rounded-xl border border-dashed text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {DUE_DATE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleQuickDueDate(preset.days)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border bg-background hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 7. Action Bar (Sticky on mobile for ease of use) */}
        <div className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur-md p-4 border-t shadow-lg md:relative md:p-0 md:bg-transparent md:border-0 md:shadow-none">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            {!isNew && existing && (
              <Button
                variant="destructive"
                size="lg"
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="rounded-xl h-12 px-4 shrink-0"
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Delete
              </Button>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-sm font-bold rounded-xl shadow-md cursor-pointer ml-auto"
              disabled={saving || (!selectedCustomer && customers.length > 0)}
            >
              <Save className="mr-2 h-5 w-5" />
              {saving
                ? 'Processing…'
                : isNew
                  ? isLoan
                    ? `Lend ${format(parsedAmount)} Now`
                    : `Record ${format(parsedAmount)} Udharo`
                  : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}