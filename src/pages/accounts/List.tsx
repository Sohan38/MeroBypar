import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { v4 as uuidv4 } from 'uuid';
import {
  Building2,
  Landmark,
  Wallet,
  QrCode,
  CreditCard,
  UserCheck,
  Plus,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  X,
  MoreVertical,
  Edit2,
  SlidersHorizontal,
  FileText,
  DollarSign,
  Layers,
  History,
  CheckCircle2,
  AlertCircle,
  PiggyBank,
} from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';
import { useStorageProvider } from '@/storage/StorageContext';
import { useFinancialAccounts, useSales } from '@/contexts/GlobalProviders';
import {
  FinancialPostingService,
  type FinancialDaybookRow,
} from '@/services/financialPostingService';
import { useCurrency } from '@/hooks/useCurrency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { FinancialAccount, FinancialAccountType, FinancialAccountStatus } from '@/types';

type TabFilter = 'all' | 'cash' | 'bank' | 'cooperative' | 'digital' | 'other';

export default function AccountsList() {
  const [, setLocation] = useLocation();
  const storage = useStorageProvider();
  const { items: accounts, refresh: refreshAccounts } = useFinancialAccounts();
  const { items: sales } = useSales();
  const { format } = useCurrency();

  const [ledgerRows, setLedgerRows] = useState<FinancialDaybookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  // Dialog States
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [openingBalanceDialogOpen, setOpeningBalanceDialogOpen] = useState(false);
  const [selectedAccountForAction, setSelectedAccountForAction] = useState<FinancialAccount | null>(null);

  // Form States - Account
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<FinancialAccountType>('bank');
  const [institutionName, setInstitutionName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountNotes, setAccountNotes] = useState('');
  const [initialBalance, setInitialBalance] = useState('0');
  const [linkQrToBank, setLinkQrToBank] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);

  // Form States - Transfer
  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferRef, setTransferRef] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [savingTransfer, setSavingTransfer] = useState(false);

  // Form States - Opening Balance
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceDate, setBalanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [balanceNotes, setBalanceNotes] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);

  // Load ledger entries to calculate balances
  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      await FinancialPostingService.ensureDefaultAccounts(storage);
      const rows = await FinancialPostingService.getDaybook(storage);
      setLedgerRows(rows);
      refreshAccounts();
    } catch (error) {
      console.error('[Accounts] Failed to load data:', error);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, [storage, refreshAccounts]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Listen to external storage updates so POS sales, Credit settlements, Payables, etc. instantly reflect
  useEffect(() => {
    const handleStorageChange = (e: any) => {
      const key = e.detail?.key;
      if (
        !key ||
        key === 'financialTransactions' ||
        key === 'financialMovements' ||
        key === 'financialAccounts' ||
        key === 'sales' ||
        key === 'purchases' ||
        key === 'credit' ||
        key === 'expenses'
      ) {
        void loadData();
      }
    };
    window.addEventListener('sohan-storage-changed', handleStorageChange);
    return () => window.removeEventListener('sohan-storage-changed', handleStorageChange);
  }, [loadData]);

  // Compute live balances per account
  const accountBalancesMap = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach(acc => map.set(acc.id, 0));
    ledgerRows.forEach(row => {
      const accId = row.movement.accountId;
      const current = map.get(accId) ?? 0;
      map.set(accId, current + Number(row.movement.amount || 0));
    });
    return map;
  }, [accounts, ledgerRows]);

  // Summary Totals
  const summaryTotals = useMemo(() => {
    let totalCash = 0;
    let totalBank = 0;
    let totalCooperative = 0;
    let totalDigital = 0;
    let totalReceivables = 0;
    let totalPayables = 0;

    accounts.forEach(acc => {
      const balance = accountBalancesMap.get(acc.id) ?? 0;
      if (acc.type === 'cash') totalCash += balance;
      else if (acc.type === 'bank') totalBank += balance;
      else if (acc.type === 'cooperative') totalCooperative += balance;
      else if (acc.type === 'digital' || acc.type === 'card') totalDigital += balance;
      else if (acc.type === 'receivable') totalReceivables += balance;
      else if (acc.type === 'payable') totalPayables += balance;
    });

    const totalLiquid = totalCash + totalBank + totalCooperative + totalDigital;

    return {
      totalCash,
      totalBank,
      totalCooperative,
      totalDigital,
      totalLiquid,
      totalReceivables,
      totalPayables,
    };
  }, [accounts, accountBalancesMap]);

  // Channel metrics: QR Collections
  const qrStats = useMemo(() => {
    const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
    let totalQr = 0;
    let todayQr = 0;
    const perAccount = new Map<string, number>();

    const targetBank = accounts.find(a => a.type === 'bank' && a.paymentMethods?.includes('qr')) ||
                       accounts.find(a => a.id === 'financial-account-bank') ||
                       accounts.find(a => a.type === 'bank');

    sales.forEach(sale => {
      if (sale.deletedAt) return;
      let saleQrAmount = 0;
      if (sale.paymentMethod === 'qr') {
        saleQrAmount = Number(sale.grandTotal || 0);
      } else if (sale.splitPayments && sale.splitPayments.length > 0) {
        const qrSplit = sale.splitPayments.find(sp => sp.method === 'qr');
        if (qrSplit) saleQrAmount = Number(qrSplit.amount || 0);
      }

      if (saleQrAmount > 0) {
        totalQr += saleQrAmount;
        let saleDateStr = (sale.date || '').slice(0, 10);
        try {
          const parsed = parseISO(sale.date);
          if (!isNaN(parsed.getTime())) saleDateStr = formatDate(parsed, 'yyyy-MM-dd');
        } catch {}
        if (saleDateStr === todayStr) {
          todayQr += saleQrAmount;
        }
        if (targetBank) {
          perAccount.set(targetBank.id, (perAccount.get(targetBank.id) ?? 0) + saleQrAmount);
        }
      }
    });

    return { totalQr, todayQr, perAccount };
  }, [sales, accounts]);

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (acc.status === 'inactive') return false;

      // Tab filter
      if (activeTab === 'cash' && acc.type !== 'cash') return false;
      if (activeTab === 'bank' && acc.type !== 'bank') return false;
      if (activeTab === 'cooperative' && acc.type !== 'cooperative') return false;
      if (activeTab === 'digital' && acc.type !== 'digital' && acc.type !== 'card') return false;
      if (activeTab === 'other' && (acc.type === 'cash' || acc.type === 'bank' || acc.type === 'cooperative' || acc.type === 'digital' || acc.type === 'card')) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          acc.name.toLowerCase().includes(q) ||
          (acc.institutionName || '').toLowerCase().includes(q) ||
          (acc.accountNumber || '').toLowerCase().includes(q) ||
          acc.type.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [accounts, activeTab, searchTerm]);

  // Open Create Account Modal
  const handleOpenCreateAccount = () => {
    setEditingAccount(null);
    setAccountName('');
    setAccountType('bank');
    setInstitutionName('');
    setAccountNumber('');
    setAccountNotes('');
    setInitialBalance('0');
    setLinkQrToBank(true);
    setAccountDialogOpen(true);
  };

  // Open Edit Account Modal
  const handleOpenEditAccount = (acc: FinancialAccount) => {
    setEditingAccount(acc);
    setAccountName(acc.name);
    setAccountType(acc.type);
    setInstitutionName(acc.institutionName || '');
    setAccountNumber(acc.accountNumber || '');
    setAccountNotes(acc.notes || '');
    setInitialBalance('0');
    setLinkQrToBank(acc.paymentMethods?.includes('qr') ?? true);
    setAccountDialogOpen(true);
  };

  // Save Account
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) {
      toast.error('Please provide an account name.');
      return;
    }

    setSavingAccount(true);
    try {
      const now = new Date().toISOString();
      const accountId = editingAccount ? editingAccount.id : `acc-${uuidv4().slice(0, 8)}`;

      let paymentMethods: any[] = [];
      if (accountType === 'cash') {
        paymentMethods = ['cash'];
      } else if (accountType === 'bank') {
        paymentMethods = linkQrToBank ? ['bank', 'qr'] : ['bank'];
      } else if (accountType === 'digital') {
        paymentMethods = ['other'];
      } else if (accountType === 'card') {
        paymentMethods = ['card'];
      }

      const payload: FinancialAccount = {
        id: accountId,
        name: accountName.trim(),
        type: accountType,
        status: editingAccount ? editingAccount.status : 'active',
        institutionName: institutionName.trim() || null,
        accountNumber: accountNumber.trim() || null,
        notes: accountNotes.trim() || null,
        paymentMethods,
        isSystem: editingAccount?.isSystem ?? false,
        createdAt: editingAccount?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        version: (editingAccount?.version ?? 0) + 1,
      };

      await storage.save('financialAccounts', payload);

      // If initial opening balance entered for a brand new account, post it to ledger!
      const initBal = Number(initialBalance) || 0;
      if (!editingAccount && initBal > 0) {
        await FinancialPostingService.postOpeningBalance(storage, {
          id: uuidv4(),
          date: now,
          accountId: payload.id,
          amount: initBal,
          description: `Initial opening balance for ${payload.name}`,
        });
      }

      toast.success(editingAccount ? 'Account updated' : 'Account created successfully');
      setAccountDialogOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setSavingAccount(false);
    }
  };

  // Open Transfer Modal
  const handleOpenTransfer = (fromAcc?: FinancialAccount) => {
    const validAccounts = accounts.filter(a => a.status === 'active' && a.type !== 'receivable' && a.type !== 'payable');
    setTransferFromId(fromAcc ? fromAcc.id : validAccounts[0]?.id || '');
    setTransferToId(validAccounts.find(a => a.id !== (fromAcc ? fromAcc.id : validAccounts[0]?.id))?.id || '');
    setTransferAmount('');
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransferRef('');
    setTransferNotes('');
    setTransferDialogOpen(true);
  };

  // Execute Transfer
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(transferAmount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid transfer amount.');
      return;
    }
    if (!transferFromId || !transferToId) {
      toast.error('Please select both source and destination accounts.');
      return;
    }
    if (transferFromId === transferToId) {
      toast.error('Source and destination accounts must be different.');
      return;
    }

    setSavingTransfer(true);
    try {
      const fromAccount = accounts.find(a => a.id === transferFromId);
      const toAccount = accounts.find(a => a.id === transferToId);

      await FinancialPostingService.postTransfer(storage, {
        id: uuidv4(),
        date: new Date(`${transferDate}T${new Date().toLocaleTimeString('en-GB')}`).toISOString(),
        amount,
        fromAccountId: transferFromId,
        toAccountId: transferToId,
        description: `Transfer: ${fromAccount?.name ?? 'Account'} ➔ ${toAccount?.name ?? 'Account'}${transferNotes ? ` · ${transferNotes}` : ''}`,
      });

      toast.success(`Transferred ${format(amount)} from ${fromAccount?.name} to ${toAccount?.name}`);
      setTransferDialogOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete transfer');
    } finally {
      setSavingTransfer(false);
    }
  };

  // Open Opening Balance Modal
  const handleOpenOpeningBalance = (acc: FinancialAccount) => {
    setSelectedAccountForAction(acc);
    setBalanceAmount(String(accountBalancesMap.get(acc.id) ?? 0));
    setBalanceDate(new Date().toISOString().split('T')[0]);
    setBalanceNotes('');
    setOpeningBalanceDialogOpen(true);
  };

  // Save Opening Balance / Target Balance Posting
  const handleSaveOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountForAction) return;

    const targetAmount = Number(balanceAmount);
    if (isNaN(targetAmount)) {
      toast.error('Please enter a valid target balance.');
      return;
    }

    const currentBalance = accountBalancesMap.get(selectedAccountForAction.id) ?? 0;
    const delta = Number((targetAmount - currentBalance).toFixed(2));

    if (Math.abs(delta) < 0.0001) {
      toast.info(`Balance for ${selectedAccountForAction.name} is already ${format(targetAmount)}`);
      setOpeningBalanceDialogOpen(false);
      return;
    }

    setSavingBalance(true);
    try {
      await FinancialPostingService.postOpeningBalance(storage, {
        id: uuidv4(),
        date: new Date(`${balanceDate}T${new Date().toLocaleTimeString('en-GB')}`).toISOString(),
        accountId: selectedAccountForAction.id,
        amount: delta,
        description: `Balance adjustment for ${selectedAccountForAction.name} (${format(currentBalance)} ➔ ${format(targetAmount)})${balanceNotes ? ` · ${balanceNotes}` : ''}`,
      });

      toast.success(`Balance updated to ${format(targetAmount)} for ${selectedAccountForAction.name}`);
      setOpeningBalanceDialogOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to adjust balance');
    } finally {
      setSavingBalance(false);
    }
  };

  const getAccountIcon = (type: FinancialAccountType) => {
    switch (type) {
      case 'cash': return Wallet;
      case 'bank': return Landmark;
      case 'cooperative': return PiggyBank;
      case 'digital': return QrCode;
      case 'card': return CreditCard;
      case 'receivable': return UserCheck;
      case 'payable': return Building2;
      default: return DollarSign;
    }
  };

  const accountCounts = useMemo(() => {
    const counts = { all: accounts.length, cash: 0, bank: 0, cooperative: 0, digital: 0, other: 0 };
    accounts.forEach(a => {
      if (a.status === 'inactive') return;
      if (a.type === 'cash') counts.cash++;
      else if (a.type === 'bank') counts.bank++;
      else if (a.type === 'cooperative') counts.cooperative++;
      else if (a.type === 'digital' || a.type === 'card') counts.digital++;
      else counts.other++;
    });
    return counts;
  }, [accounts]);

  return (
    <div className="p-3.5 sm:p-5 md:p-6 space-y-5 max-w-6xl mx-auto pb-28 md:pb-12 animate-in fade-in duration-200">
      {/* ── 1. Page Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 bg-card/60 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-border/70 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <Building2 className="size-6 sm:size-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Accounts & Banking
              </h1>
              <Badge variant="outline" className="hidden sm:inline-flex text-[10px] bg-primary/5 text-primary border-primary/20">
                Finance Hub
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              Cash drawers, commercial banks, Sahakari & instant transfers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenTransfer()}
            className="flex-1 sm:flex-none h-10 gap-1.5 text-xs rounded-xl font-semibold border-primary/30 hover:bg-primary/5 active:scale-95 transition-all"
          >
            <ArrowRightLeft className="size-4 text-primary" />
            Transfer Funds
          </Button>

          <Button
            size="sm"
            onClick={handleOpenCreateAccount}
            className="flex-1 sm:flex-none h-10 gap-1.5 text-xs rounded-xl font-semibold shadow-sm active:scale-95 transition-all"
          >
            <Plus className="size-4" />
            Add Account
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="h-10 w-10 rounded-xl shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-primary' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ── 2. Liquid Assets Summary Metrics (High-End Card Grid) ─ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* Total Liquid Funds - Hero Card */}
        <Card className="col-span-2 sm:col-span-2 lg:col-span-1 relative overflow-hidden bg-gradient-to-br from-emerald-600/15 via-emerald-500/5 to-card border-emerald-500/30 shadow-xs">
          <div className="absolute -right-3 -top-3 w-20 h-20 rounded-full bg-emerald-500/10 blur-xl pointer-events-none" />
          <CardContent className="p-4 sm:p-4.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                Total Liquid Funds
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <DollarSign className="size-4" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-300 pt-0.5">
              {format(summaryTotals.totalLiquid)}
            </p>
            <p className="text-[11px] text-muted-foreground pt-0.5">
              Ready cash + active bank deposits
            </p>
          </CardContent>
        </Card>

        {/* Cash in Hand */}
        <Card className="bg-card border-border/70 shadow-xs hover:border-primary/40 transition-colors">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Cash in Hand</span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Wallet className="size-3.5" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground">
              {format(summaryTotals.totalCash)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Counter drawer & petty cash
            </p>
          </CardContent>
        </Card>

        {/* Bank Accounts */}
        <Card className="bg-card border-border/70 shadow-xs hover:border-blue-500/40 transition-colors">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Bank Accounts</span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Landmark className="size-3.5" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground">
              {format(summaryTotals.totalBank)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Commercial bank balances
            </p>
          </CardContent>
        </Card>

        {/* Sahakari / Cooperatives */}
        <Card className="bg-card border-border/70 shadow-xs hover:border-amber-500/40 transition-colors col-span-2 sm:col-span-1">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sahakari</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <PiggyBank className="size-3.5" />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-foreground">
              {format(summaryTotals.totalCooperative)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Savings & cooperative shares
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Filter Tabs & Search Bar ──────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        {/* Modern Tab Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'all', label: 'All', count: accountCounts.all },
            { id: 'cash', label: 'Cash', count: accountCounts.cash },
            { id: 'bank', label: 'Banks', count: accountCounts.bank },
            { id: 'cooperative', label: 'Sahakari', count: accountCounts.cooperative },
            { id: 'digital', label: 'Wallets', count: accountCounts.digital },
            { id: 'other', label: 'Ledgers', count: accountCounts.other },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabFilter)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all active:scale-95 ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === tab.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search account name, number..."
            className="pl-9 pr-8 h-10 text-xs rounded-xl bg-card border-border/70"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── 4. Accounts Grid ─────────────────────────────────── */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <RefreshCw className="size-8 mx-auto animate-spin text-primary opacity-60" />
          <p className="text-sm text-muted-foreground font-medium">Updating account balances...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <Card className="border-dashed bg-card/50">
          <CardContent className="py-16 text-center space-y-3">
            <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
              <Building2 className="size-7" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">No accounts found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {searchTerm ? 'No accounts match your search query.' : 'Add your bank accounts, cooperative deposits, or cash counters.'}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleOpenCreateAccount}
              className="text-xs rounded-xl gap-1.5 h-9 font-medium"
            >
              <Plus className="size-4" /> Add Account Now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredAccounts.map(acc => {
            const balance = accountBalancesMap.get(acc.id) ?? 0;
            const Icon = getAccountIcon(acc.type);
            const isLiquid = acc.type === 'cash' || acc.type === 'bank' || acc.type === 'cooperative' || acc.type === 'digital';
            const qrInflow = acc.type === 'bank' ? (qrStats.perAccount.get(acc.id) ?? 0) : 0;

            return (
              <Card
                key={acc.id}
                className="group relative overflow-hidden bg-card border-border/70 hover:border-primary/50 hover:shadow-md transition-all duration-200 rounded-2xl flex flex-col justify-between"
              >
                <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    {/* Header Row: Icon + Name + Actions Dropdown */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 group-hover:scale-105 transition-transform">
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-sm leading-tight text-foreground truncate max-w-[180px]">
                              {acc.name}
                            </h3>
                            {acc.type === 'bank' && acc.paymentMethods?.includes('qr') && (
                              <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 px-1.5 py-0 h-4 font-semibold">
                                <QrCode className="size-2.5 mr-1" /> QR Linked
                              </Badge>
                            )}
                            {acc.type === 'digital' && (
                              <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 px-1.5 py-0 h-4 font-semibold">
                                Wallet
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground capitalize mt-0.5 truncate">
                            {acc.institutionName ? `${acc.institutionName} · ` : ''}
                            {acc.type === 'cooperative' ? 'Sahakari' : acc.type === 'digital' ? 'Digital Wallet' : acc.type}
                          </p>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground shrink-0">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 text-xs rounded-xl shadow-lg">
                          {isLiquid && (
                            <DropdownMenuItem onClick={() => handleOpenTransfer(acc)} className="cursor-pointer">
                              <ArrowRightLeft className="size-3.5 mr-2 text-primary" />
                              Transfer Funds
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleOpenOpeningBalance(acc)} className="cursor-pointer">
                            <SlidersHorizontal className="size-3.5 mr-2" />
                            Adjust / Set Balance
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenEditAccount(acc)} className="cursor-pointer">
                            <Edit2 className="size-3.5 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation('/daybook')} className="cursor-pointer">
                            <History className="size-3.5 mr-2" />
                            View in Daybook
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Account Number Pill */}
                    {acc.accountNumber && (
                      <div className="flex items-center justify-between text-xs bg-muted/40 px-3 py-1.5 rounded-xl font-mono text-muted-foreground border border-border/40">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70">A/C:</span>
                        <span className="font-semibold text-foreground tracking-wide select-all">{acc.accountNumber}</span>
                      </div>
                    )}

                    {/* QR Inflow Channel Breakdown */}
                    {qrInflow > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-[11px] flex justify-between items-center text-emerald-700 dark:text-emerald-300">
                        <span className="flex items-center gap-1 font-medium">
                          <QrCode className="size-3" /> Fonepay QR Inflow:
                        </span>
                        <span className="font-bold">+{format(qrInflow)}</span>
                      </div>
                    )}
                  </div>

                  {/* Balance Display & Bottom Actions */}
                  <div className="pt-3 border-t border-border/60 space-y-2.5 mt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Available Balance</span>
                      <span
                        className={`text-lg sm:text-xl font-extrabold tracking-tight ${
                          balance > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : balance < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-foreground'
                        }`}
                      >
                        {format(balance)}
                      </span>
                    </div>

                    {/* Quick Touch Action Buttons */}
                    {isLiquid && (
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenTransfer(acc)}
                          className="h-8 text-xs rounded-xl font-medium border-border/80 hover:bg-primary/5 hover:border-primary/40 active:scale-95 transition-all"
                        >
                          <ArrowRightLeft className="size-3.5 mr-1 text-primary" /> Transfer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenOpeningBalance(acc)}
                          className="h-8 text-xs rounded-xl font-medium text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
                        >
                          Adjust Bal
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 5. Add / Edit Account Modal ──────────────────────── */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? 'Edit Account' : 'Add New Account / Bank / Sahakari'}
            </DialogTitle>
            <DialogDescription>
              Set up your bank accounts, cooperative deposits, or cash drawers.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAccount} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-medium">Account Name *</label>
              <Input
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                placeholder="e.g. Nabil Bank Current, Sahakari Savings, Locker Cash"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium">Account Type *</label>
                <Select
                  value={accountType}
                  onValueChange={val => setAccountType(val as FinancialAccountType)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Account</SelectItem>
                    <SelectItem value="cooperative">Sahakari (Cooperative)</SelectItem>
                    <SelectItem value="cash">Cash Drawer / Locker</SelectItem>
                    <SelectItem value="digital">Digital Wallet (eSewa / Khalti)</SelectItem>
                    <SelectItem value="card">Card POS Machine</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium">Institution Name</label>
                <Input
                  value={institutionName}
                  onChange={e => setInstitutionName(e.target.value)}
                  placeholder="e.g. Nabil Bank, Shree Sahakari"
                />
              </div>
            </div>

            {accountType === 'bank' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkQrToBank}
                    onChange={e => setLinkQrToBank(e.target.checked)}
                    className="rounded text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="text-xs font-semibold text-foreground">
                    Link Counter Fonepay / Merchant QR to this Bank
                  </span>
                </label>
                <p className="text-[11px] text-muted-foreground pl-6">
                  When customers scan the QR at checkout, money will land directly in this bank account.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium">
                {accountType === 'digital' ? 'Wallet ID / Mobile Number' : 'Account Number (Optional)'}
              </label>
              <Input
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                placeholder={accountType === 'digital' ? 'e.g. 9801234567' : 'e.g. 01201017500124'}
              />
            </div>

            {!editingAccount && (
              <div className="space-y-2 p-3 bg-muted/40 rounded-xl border">
                <label className="text-xs font-semibold text-foreground block">
                  Initial Starting Balance (Opening Balance)
                </label>
                <p className="text-[11px] text-muted-foreground">
                  How much money is currently in this account right now?
                </p>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={initialBalance}
                  onChange={e => setInitialBalance(e.target.value)}
                  placeholder="0.00"
                  className="font-bold text-base"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium">Notes (Optional)</label>
              <Textarea
                value={accountNotes}
                onChange={e => setAccountNotes(e.target.value)}
                placeholder="Branch location, contact person, or remarks"
                rows={2}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAccountDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingAccount}>
                {savingAccount ? 'Saving...' : editingAccount ? 'Save Changes' : 'Create Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── 6. Transfer Money Modal ──────────────────────────── */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-5 text-primary" />
              Transfer Funds Between Accounts
            </DialogTitle>
            <DialogDescription>
              Move money between your cash drawers, bank accounts, or Sahakari.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleExecuteTransfer} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium">From Account *</label>
                <Select value={transferFromId} onValueChange={setTransferFromId}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter(a => a.status === 'active' && a.type !== 'receivable' && a.type !== 'payable')
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({format(accountBalancesMap.get(a.id) ?? 0)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium">To Account *</label>
                <Select value={transferToId} onValueChange={setTransferToId}>
                  <SelectTrigger><SelectValue placeholder="Select target" /></SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter(a => a.status === 'active' && a.id !== transferFromId && a.type !== 'receivable' && a.type !== 'payable')
                      .map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({format(accountBalancesMap.get(a.id) ?? 0)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Transfer Amount *</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                placeholder="0.00"
                required
                className="text-lg font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium">Date *</label>
                <Input
                  type="date"
                  value={transferDate}
                  onChange={e => setTransferDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Reference (Optional)</label>
                <Input
                  value={transferRef}
                  onChange={e => setTransferRef(e.target.value)}
                  placeholder="e.g. Cheque #, Voucher #"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Remarks (Optional)</label>
              <Input
                value={transferNotes}
                onChange={e => setTransferNotes(e.target.value)}
                placeholder="e.g. Daily cash deposit, Sahakari installment"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTransferDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingTransfer}>
                {savingTransfer ? 'Processing...' : 'Complete Transfer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── 7. Set / Adjust Opening Balance Modal ────────────── */}
      <Dialog open={openingBalanceDialogOpen} onOpenChange={setOpeningBalanceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="size-5 text-primary" />
              Set Opening Balance / Baseline
            </DialogTitle>
            <DialogDescription>
              Record the baseline opening balance for{' '}
              <span className="font-semibold text-foreground">
                {selectedAccountForAction?.name}
              </span>
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveOpeningBalance} className="space-y-4 pt-2">
            {selectedAccountForAction && (
              <div className="p-3 bg-muted/40 rounded-xl border space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Balance:</span>
                  <span className="font-bold text-foreground">
                    {format(accountBalancesMap.get(selectedAccountForAction.id) ?? 0)}
                  </span>
                </div>
                {!isNaN(Number(balanceAmount)) && (
                  <div className="flex justify-between border-t pt-1.5 font-medium">
                    <span className="text-muted-foreground">Adjustment Delta:</span>
                    <span
                      className={
                        (Number(balanceAmount) - (accountBalancesMap.get(selectedAccountForAction.id) ?? 0)) >= 0
                          ? 'text-emerald-600 font-bold'
                          : 'text-rose-600 font-bold'
                      }
                    >
                      {(Number(balanceAmount) - (accountBalancesMap.get(selectedAccountForAction.id) ?? 0)) >= 0 ? '+' : ''}
                      {format(Number(balanceAmount) - (accountBalancesMap.get(selectedAccountForAction.id) ?? 0))}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium">New Target Balance *</label>
              <Input
                type="number"
                step="0.01"
                value={balanceAmount}
                onChange={e => setBalanceAmount(e.target.value)}
                placeholder="0.00"
                required
                className="text-lg font-bold"
              />
              <p className="text-[11px] text-muted-foreground">
                Enter the exact amount this account should have right now.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Effective Date *</label>
              <Input
                type="date"
                value={balanceDate}
                onChange={e => setBalanceDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Remarks (Optional)</label>
              <Input
                value={balanceNotes}
                onChange={e => setBalanceNotes(e.target.value)}
                placeholder="e.g. Verified bank statement balance"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpeningBalanceDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingBalance}>
                {savingBalance ? 'Saving...' : 'Post Opening Balance'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
