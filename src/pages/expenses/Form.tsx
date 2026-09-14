import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { v4 as uuidv4 } from 'uuid';
import { useExpenses } from '@/contexts/GlobalProviders';
import { useSmartBack } from '@/contexts/NavigationContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Banknote,
  Droplets,
  FileText,
  Fuel,
  Landmark,
  Package,
  Plus,
  Save,
  ShoppingCart,
  Tag,
  Trash2,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  CreditCard,
  QrCode,
  Split,
  Wallet,
  Coins,
  AlertCircle,
  Calendar,
  Hash,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStorageProvider } from '@/storage/StorageContext';
import { FinancialPostingService } from '@/services/financialPostingService';
import { useCurrency } from '@/hooks/useCurrency';
import { usePaymentFunds } from '@/hooks/usePaymentFunds';
import { BankSelector } from '@/components/pos/BankSelector';
import { safeCurrency } from '@/utils/unitUtils';
import { cn } from '@/lib/utils';
import type { Expense, PaymentMethod, PaymentSplitEntry } from '@/types';

function parseDecimal(val: string | number): number {
  if (typeof val === 'number') return val;
  const num = parseFloat(String(val || '').replace(/[^0-9.-]+/g, ''));
  return isNaN(num) ? 0 : num;
}

// Predefined categories with icons and color accents
const CATEGORY_OPTIONS = [
  { value: 'salary', label: 'Salary', icon: Banknote, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' },
  { value: 'electricity', label: 'Electricity', icon: Zap, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' },
  { value: 'water', label: 'Water', icon: Droplets, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' },
  { value: 'internet', label: 'Internet', icon: Wifi, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800' },
  { value: 'food', label: 'Food / Tea', icon: Utensils, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800' },
  { value: 'fuel', label: 'Fuel / Travel', icon: Fuel, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800' },
  { value: 'maintenance', label: 'Maintenance', icon: Wrench, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800' },
  { value: 'tax', label: 'Tax & Govt', icon: Landmark, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800' },
  { value: 'purchase', label: 'Supplies', icon: ShoppingCart, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800' },
  { value: 'miscellaneous', label: 'Misc', icon: Package, color: 'text-slate-600 bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800' },
];

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

export default function ExpenseForm() {
  const storage = useStorageProvider();
  const goBack = useSmartBack('/expenses');
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { add, update, items, remove } = useExpenses();
  const { format } = useCurrency();

  const {
    bankAccounts,
    checkFundAvailability,
    getMethodBalance,
  } = usePaymentFunds();

  const isNew = !id || id === 'new';
  const existing = useMemo(
    () => (isNew ? null : items.find(e => e.id === id) ?? null),
    [isNew, items, id]
  );

  // Is this an auto-generated purchase expense?
  const isAutoExpense = Boolean(existing?.sourcePurchaseId);

  // Form State
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('miscellaneous');
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | string>('cash');
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [splitPayments, setSplitPayments] = useState<PaymentSplitEntry[]>([]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Load existing expense data for editing
  useEffect(() => {
    if (existing) {
      const isPredefined = CATEGORY_OPTIONS.some(c => c.value === existing.category);
      setAmount(String(existing.amount ?? ''));
      setCategory(isPredefined ? existing.category : 'other');
      if (!isPredefined) {
        setCustomCategory(existing.category);
        setShowCustomCategory(true);
      } else {
        setCustomCategory('');
        setShowCustomCategory(false);
      }
      setDescription(existing.description ?? '');
      setDate(existing.date ? existing.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setPaymentMethod(existing.paymentMethod ?? 'cash');
      setBankAccountId(existing.bankAccountId ?? null);
      setSplitPayments(existing.splitPayments ?? []);
      setReferenceNumber(existing.referenceNumber ?? '');
      setNotes(existing.notes ?? '');
    }
  }, [existing]);

  const parsedAmount = Math.max(0, parseDecimal(amount) || 0);

  // Quick Amount Handlers
  const handleQuickAdd = (val: number) => {
    const current = parseDecimal(amount) || 0;
    setAmount(String(current + val));
  };

  const handleClearAmount = () => {
    setAmount('');
  };

  // Funds availability for single-source payments
  const isSplit = paymentMethod === 'split';

  const fundInfo = useMemo(() => {
    if (isSplit || parsedAmount <= 0) return null;
    return checkFundAvailability(paymentMethod as PaymentMethod, parsedAmount, bankAccountId);
  }, [isSplit, parsedAmount, checkFundAvailability, paymentMethod, bankAccountId]);

  const activeMethodBalance = useMemo(() => {
    if (isSplit) return 0;
    return getMethodBalance(paymentMethod as PaymentMethod, bankAccountId);
  }, [isSplit, getMethodBalance, paymentMethod, bankAccountId]);

  // Total allocated across split lines
  const totalSplitAllocated = useMemo(() => {
    return safeCurrency(splitPayments.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
  }, [splitPayments]);

  // Initialize split lines if switching to split
  useEffect(() => {
    if (isSplit && (!splitPayments || splitPayments.length === 0)) {
      const primaryBankId = bankAccounts[0]?.id || null;
      const half = safeCurrency(parsedAmount * 0.5);
      const initialSplits: PaymentSplitEntry[] = [
        {
          id: uuidv4(),
          method: 'cash',
          amount: half,
        },
        {
          id: uuidv4(),
          method: 'bank',
          amount: safeCurrency(Math.max(0, parsedAmount - half)),
          bankAccountId: primaryBankId,
        },
      ];
      setSplitPayments(initialSplits);
    }
  }, [isSplit, splitPayments, parsedAmount, bankAccounts]);

  const handleMethodSelect = (method: PaymentMethod | string) => {
    setPaymentMethod(method);
    if (method === 'bank' && !bankAccountId && bankAccounts.length > 0) {
      setBankAccountId(bankAccounts[0].id);
    }
  };

  // Split lines operations
  const updateSplitLine = (lineId: string, updates: Partial<PaymentSplitEntry>) => {
    setSplitPayments(prev =>
      prev.map(line => {
        if (line.id !== lineId) return line;
        const updated = { ...line, ...updates };
        if (updated.method === 'bank' && !updated.bankAccountId && bankAccounts.length > 0) {
          updated.bankAccountId = bankAccounts[0].id;
        }
        return updated;
      })
    );
  };

  const addSplitLine = () => {
    const remaining = Math.max(0, safeCurrency(parsedAmount - totalSplitAllocated));
    const existingMethods = new Set(splitPayments.map(s => s.method));
    const candidateMethod: Exclude<PaymentMethod, 'split' | 'credit'> =
      !existingMethods.has('bank') ? 'bank' : !existingMethods.has('cash') ? 'cash' : 'qr';

    const newLine: PaymentSplitEntry = {
      id: uuidv4(),
      method: candidateMethod,
      amount: remaining > 0 ? remaining : 0,
      bankAccountId: candidateMethod === 'bank' ? (bankAccounts[0]?.id || null) : null,
    };
    setSplitPayments(prev => [...prev, newLine]);
  };

  const removeSplitLine = (lineId: string) => {
    if (splitPayments.length <= 1) return;
    setSplitPayments(prev => prev.filter(line => line.id !== lineId));
  };

  const fillRemainingOnSplitLine = (lineId: string) => {
    const currentLine = splitPayments.find(s => s.id === lineId);
    if (!currentLine) return;
    const currentAmt = Number(currentLine.amount) || 0;
    const remaining = safeCurrency(parsedAmount - totalSplitAllocated);
    const updatedAmt = safeCurrency(Math.max(0, currentAmt + remaining));
    updateSplitLine(lineId, { amount: updatedAmt });
  };

  // Convert deficit into split payment covering available + deficit
  const handleSplitDeficit = () => {
    if (!fundInfo) return;
    const availableSafe = safeCurrency(Math.max(0, fundInfo.available));
    const deficitSafe = safeCurrency(Math.max(0, parsedAmount - availableSafe));
    const nextMethod: Exclude<PaymentMethod, 'split' | 'credit'> = paymentMethod === 'cash' ? 'bank' : 'cash';
    const primaryBankId = bankAccounts[0]?.id || null;

    const newSplits: PaymentSplitEntry[] = [
      {
        id: uuidv4(),
        method: paymentMethod as Exclude<PaymentMethod, 'split' | 'credit'>,
        amount: availableSafe,
        bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
      },
      {
        id: uuidv4(),
        method: nextMethod,
        amount: deficitSafe,
        bankAccountId: nextMethod === 'bank' ? primaryBankId : null,
      },
    ];

    setPaymentMethod('split');
    setSplitPayments(newSplits);
  };

  const handleCategorySelect = (categoryValue: string) => {
    setCategory(categoryValue);
    setShowCustomCategory(categoryValue === 'other');
  };

  // Primary payment methods configuration
  const primaryMethods: Array<{
    id: PaymentMethod | string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'cash', label: 'Cash Drawer', icon: Coins },
    { id: 'bank', label: 'Bank Account', icon: Landmark },
    { id: 'qr', label: 'QR / Digital', icon: QrCode },
    { id: 'card', label: 'Debit Card', icon: CreditCard },
    { id: 'split', label: 'Split Source', icon: Split },
  ];

  // Submission handler with Ledger & Accounts integration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isAutoExpense) {
      toast.error('Auto-generated purchase expenses cannot be edited manually. Please modify the purchase directly.');
      return;
    }

    if (parsedAmount <= 0) {
      toast.error('Please enter an amount greater than zero');
      return;
    }

    // Determine final category
    let finalCategory = category;
    if (category === 'other') {
      finalCategory = customCategory.trim();
      if (!finalCategory) {
        toast.error('Please enter a custom category name');
        return;
      }
    }

    // Validate Split breakdown if split is chosen
    if (isSplit) {
      if (splitPayments.length === 0) {
        toast.error('Please add at least one split disbursement line');
        return;
      }
      if (Math.abs(totalSplitAllocated - parsedAmount) > 0.05) {
        toast.error(`Split allocation (${format(totalSplitAllocated)}) must match total expense (${format(parsedAmount)})`);
        return;
      }
    }

    setSaving(true);
    try {
      const expenseId = existing ? existing.id : uuidv4();
      const finalDescription = description.trim() || finalCategory;

      const payload: Expense = {
        id: expenseId,
        date: new Date(date).toISOString(),
        category: finalCategory,
        description: finalDescription,
        amount: parsedAmount,
        paymentMethod: paymentMethod as PaymentMethod,
        bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
        splitPayments: isSplit ? splitPayments : undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim(),
        version: existing ? (existing.version ?? 1) + 1 : 1,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const commit = async () => {
        // 1. Save or Update the Expense Record
        if (isNew) {
          await add(payload as any);
        } else if (existing) {
          await update(existing.id, payload as any);
        }

        // 2. Financial Ledger Synchronization (Updates Daybook, Banking, and Financial Accounts)
        const allTransactions = await storage.get<any>('financialTransactions');
        const priorPostings = allTransactions.filter(
          (tx: any) => tx.sourceType === 'expense' && tx.sourceId === expenseId && tx.status === 'posted'
        );

        for (const posting of priorPostings) {
          await FinancialPostingService.reverse(
            storage,
            posting.id,
            expenseId,
            `expense:${expenseId}:reversal:${Date.now()}`
          );
        }

        await FinancialPostingService.postExpense(storage, {
          id: expenseId,
          date: payload.date,
          amount: parsedAmount,
          paymentMethod,
          bankAccountId: paymentMethod === 'bank' ? bankAccountId : null,
          splitPayments: isSplit ? splitPayments : undefined,
          description: payload.description,
          eventKey: `expense:${expenseId}:version:${payload.version}`,
        });
      };

      if (storage.transaction) {
        await storage.transaction(
          ['expenses', 'financialAccounts', 'financialTransactions', 'financialMovements', 'settings'],
          'rw',
          commit
        );
      } else {
        await commit();
      }

      toast.success(isNew ? 'Expense recorded successfully!' : 'Expense updated successfully!');
      setLocation('/expenses');
    } catch (error) {
      console.error('Failed to save expense:', error);
      toast.error('Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    if (isAutoExpense) {
      toast.error('Auto-generated expenses cannot be deleted here. Delete or edit the linked purchase.');
      return;
    }
    if (!confirm('Are you sure you want to delete this expense? This will also reverse the financial ledger movement.')) {
      return;
    }

    setSaving(true);
    try {
      const commit = async () => {
        const allTransactions = await storage.get<any>('financialTransactions');
        const priorPostings = allTransactions.filter(
          (tx: any) => tx.sourceType === 'expense' && tx.sourceId === existing.id && tx.status === 'posted'
        );

        for (const posting of priorPostings) {
          await FinancialPostingService.reverse(
            storage,
            posting.id,
            existing.id,
            `expense:${existing.id}:reversal:${Date.now()}`
          );
        }

        await remove(existing.id);
      };

      if (storage.transaction) {
        await storage.transaction(
          ['expenses', 'financialAccounts', 'financialTransactions', 'financialMovements', 'settings'],
          'rw',
          commit
        );
      } else {
        await commit();
      }

      toast.success('Expense deleted and ledger reversed');
      setLocation('/expenses');
    } catch (err) {
      console.error('Failed to delete expense:', err);
      toast.error('Failed to delete expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-2xl mx-auto pb-28 md:pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" onClick={goBack} className="h-9 w-9 rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight">
              {isNew ? 'Record Expense' : 'Edit Expense'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isNew ? 'Disburse funds for operational business expenses' : 'Update recorded expenditure & ledger movements'}
            </p>
          </div>
        </div>

        {!isNew && !isAutoExpense && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="text-destructive hover:bg-destructive/10 text-xs font-semibold h-8"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        )}
      </div>

      {/* Auto-Expense Protection Banner */}
      {isAutoExpense && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <Info className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Auto-Generated Purchase Expense</p>
            <p className="opacity-90">
              This expense was automatically recorded from Purchase payment #{existing?.sourcePurchaseId}. To adjust amounts or payment methods, please open and update the corresponding purchase invoice.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Amount Hero Card */}
        <Card className="overflow-hidden border-2 shadow-sm rounded-2xl">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-primary" />
                Expense Amount *
              </label>
              {parsedAmount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAmount}
                  disabled={isAutoExpense}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                रू
              </span>
              <Input
                type="number"
                disabled={isAutoExpense}
                className="text-2xl sm:text-3xl h-14 sm:h-16 pl-11 font-black tracking-tight rounded-xl bg-background"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                autoFocus={isNew}
                min="0"
                step="0.01"
              />
            </div>

            {/* Quick Increment Chips */}
            {!isAutoExpense && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" /> Quick Add:
                </span>
                {QUICK_AMOUNTS.map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickAdd(val)}
                    className="h-7 px-2.5 rounded-lg text-xs font-bold border border-border/80 bg-muted/40 hover:bg-primary/10 hover:border-primary/50 text-foreground transition-colors cursor-pointer"
                  >
                    +{val >= 1000 ? `${val / 1000}k` : val}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Category Selection Grid */}
        <Card className="rounded-2xl border shadow-xs">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-4 w-4 text-primary" />
                Category *
              </label>
              <span className="text-[11px] font-medium text-muted-foreground">
                Select or create custom
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {CATEGORY_OPTIONS.map(({ value, label, icon: Icon, color }) => {
                const isSelected = category === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={isAutoExpense}
                    onClick={() => handleCategorySelect(value)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs font-bold transition-all cursor-pointer',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-background hover:bg-muted/60 text-foreground border-border/80'
                    )}
                  >
                    <div
                      className={cn(
                        'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border',
                        isSelected ? 'bg-primary-foreground/20 border-transparent text-primary-foreground' : color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}

              {/* Custom Category Button */}
              <button
                type="button"
                disabled={isAutoExpense}
                onClick={() => handleCategorySelect('other')}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs font-bold transition-all cursor-pointer',
                  category === 'other'
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-background hover:bg-muted/60 text-foreground border-border/80'
                )}
              >
                <div
                  className={cn(
                    'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border',
                    category === 'other'
                      ? 'bg-primary-foreground/20 border-transparent text-primary-foreground'
                      : 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800'
                  )}
                >
                  <Plus className="h-4 w-4" />
                </div>
                <span className="truncate">Other / Custom</span>
              </button>
            </div>

            {/* Custom Category Name Input */}
            {showCustomCategory && (
              <div className="pt-2">
                <Input
                  disabled={isAutoExpense}
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  placeholder="Enter custom category name (e.g. Office Rent, Legal, Audit)"
                  className="h-10 text-xs font-semibold rounded-xl bg-background"
                  autoFocus
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Source of Funds & Live Verification */}
        <Card className="rounded-2xl border shadow-xs">
          <CardContent className="p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-primary" />
                Source of Funds / Payment Method *
              </label>
              {!isSplit && (
                <span className="text-[11px] font-medium text-muted-foreground">
                  Available in {fundInfo?.accountName || 'Account'}:{' '}
                  <strong className={cn(activeMethodBalance < parsedAmount ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                    {format(activeMethodBalance)}
                  </strong>
                </span>
              )}
            </div>

            {/* Method Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {primaryMethods.map(m => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                const balance = m.id !== 'split' ? getMethodBalance(m.id as any, m.id === 'bank' ? bankAccountId : null) : null;

                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isAutoExpense}
                    onClick={() => handleMethodSelect(m.id)}
                    className={cn(
                      'p-2.5 rounded-xl text-left border flex flex-col justify-between gap-1.5 transition-all cursor-pointer min-h-[64px]',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-background hover:bg-muted/60 text-muted-foreground border-border/80'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-xs font-bold truncate">{m.label}</span>
                    </div>
                    {balance !== null && (
                      <span className={cn(
                        'text-[10px] font-semibold tabular-nums truncate',
                        isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'
                      )}>
                        Bal: {format(balance)}
                      </span>
                    )}
                    {m.id === 'split' && (
                      <span className={cn(
                        'text-[10px] font-semibold truncate',
                        isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'
                      )}>
                        Multi-Account
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bank Account Dropdown (If single Bank selected) */}
            {paymentMethod === 'bank' && !isSplit && (
              <div className="pt-1">
                <BankSelector
                  selectedAccountId={bankAccountId}
                  onSelectAccountId={id => setBankAccountId(id)}
                  label="Disburse from Bank Account"
                />
              </div>
            )}

            {/* Insufficient Funds Deficit Warning Alert */}
            {!isSplit && fundInfo && !fundInfo.isSufficient && parsedAmount > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">Insufficient funds in {fundInfo.accountName}</p>
                    <p className="text-[11px] opacity-90">
                      Available: <strong>{format(fundInfo.available)}</strong> · Short by{' '}
                      <strong className="text-destructive font-black">{format(fundInfo.deficit)}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleSplitDeficit}
                    className="h-7 text-xs bg-background/80 hover:bg-background border-border text-foreground font-bold gap-1"
                  >
                    <Split className="h-3 w-3" />
                    Split with Another Source
                  </Button>
                </div>
              </div>
            )}

            {/* Multi-Source Split Allocation Section */}
            {isSplit && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    Split Allocation Breakdown
                  </span>
                  <span
                    className={cn(
                      'tabular-nums font-bold',
                      Math.abs(totalSplitAllocated - parsedAmount) <= 0.05
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    )}
                  >
                    Allocated: {format(totalSplitAllocated)} / {format(parsedAmount)}
                  </span>
                </div>

                <div className="space-y-2">
                  {splitPayments.map(split => {
                    const splitBalance = getMethodBalance(split.method, split.bankAccountId);
                    const isShort = Number(split.amount) > splitBalance;

                    return (
                      <div key={split.id} className="p-3 rounded-xl border bg-muted/30 space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={split.method}
                            disabled={isAutoExpense}
                            onChange={e => updateSplitLine(split.id, { method: e.target.value as any })}
                            className="h-9 px-2.5 text-xs font-bold rounded-lg border bg-background text-foreground"
                          >
                            <option value="cash">Cash Drawer</option>
                            <option value="bank">Bank Account</option>
                            <option value="qr">QR / Digital</option>
                            <option value="card">Debit Card</option>
                          </select>

                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                              रू
                            </span>
                            <Input
                              type="number"
                              disabled={isAutoExpense}
                              min="0"
                              step="0.01"
                              value={split.amount === 0 ? '' : split.amount}
                              onChange={e => updateSplitLine(split.id, { amount: Number(e.target.value) || 0 })}
                              placeholder="0.00"
                              className="h-9 pl-7 text-xs font-bold bg-background tabular-nums"
                            />
                          </div>

                          {splitPayments.length > 1 && !isAutoExpense && (
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
                              label="Bank Account for this split"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                          <span>Available: {format(splitBalance)}</span>
                          <div className="flex items-center gap-2">
                            {isShort && (
                              <span className="text-destructive font-bold">Short by {format(Number(split.amount) - splitBalance)}</span>
                            )}
                            {totalSplitAllocated < parsedAmount && !isAutoExpense && (
                              <button
                                type="button"
                                onClick={() => fillRemainingOnSplitLine(split.id)}
                                className="text-[10px] font-bold text-primary hover:underline"
                              >
                                + Fill Remaining ({format(parsedAmount - totalSplitAllocated)})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isAutoExpense && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSplitLine}
                    className="w-full text-xs font-bold rounded-xl h-8"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Another Source
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. Details (Date, Reference, Description, Notes) */}
        <Card className="rounded-2xl border shadow-xs">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              Expense Particulars
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Date *
                </label>
                <Input
                  type="date"
                  disabled={isAutoExpense}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="h-10 text-xs font-semibold rounded-xl bg-background"
                  required
                />
              </div>

              {/* Reference / Voucher # */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  Bill / Voucher # (Optional)
                </label>
                <Input
                  disabled={isAutoExpense}
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  placeholder="e.g. VCH-0042, Receipt #12"
                  className="h-10 text-xs font-semibold rounded-xl bg-background"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Description / Purpose
              </label>
              <Input
                disabled={isAutoExpense}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Monthly high-speed fiber internet recharge"
                className="h-10 text-xs font-semibold rounded-xl bg-background"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Additional Notes
              </label>
              <Textarea
                disabled={isAutoExpense}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional details, vendor contact, remarks…"
                rows={2}
                className="text-xs rounded-xl bg-background resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Sticky Mobile Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/95 backdrop-blur-md border-t border-border z-30 md:static md:p-0 md:bg-transparent md:border-0">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Total Expense
              </span>
              <span className="text-lg sm:text-xl font-black text-foreground tabular-nums truncate block">
                {format(parsedAmount)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="h-11 px-4 text-xs font-bold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || isAutoExpense || parsedAmount <= 0}
                className="h-11 px-6 text-xs sm:text-sm font-bold rounded-xl shadow-sm gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Recording…' : isNew ? 'Record Expense' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}