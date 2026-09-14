import { useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { useExpenses } from '@/contexts/GlobalProviders';
import { useSmartBack } from '@/contexts/NavigationContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    Calendar,
    CreditCard,
    FileText,
    Hash,
    Link2,
    Pencil,
    Tag,
    Trash2,
    Zap,
    Droplets,
    Wifi,
    Utensils,
    Fuel,
    Wrench,
    Landmark,
    ShoppingCart,
    Package,
    Banknote,
    Split,
    Layers,
    Info,
} from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';
import { useCurrency } from '@/hooks/useCurrency';
import { usePaymentFunds } from '@/hooks/usePaymentFunds';
import { useStorageProvider } from '@/storage/StorageContext';
import { FinancialPostingService } from '@/services/financialPostingService';
import { toast } from 'sonner';

// Category icon mapping
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    salary: Banknote,
    electricity: Zap,
    water: Droplets,
    internet: Wifi,
    food: Utensils,
    fuel: Fuel,
    maintenance: Wrench,
    tax: Landmark,
    purchase: ShoppingCart,
    miscellaneous: Package,
};

function getCategoryIcon(category: string) {
    return CATEGORY_ICONS[category] ?? Package;
}

export default function ExpenseDetail() {
    const storage = useStorageProvider();
    const goBack = useSmartBack('/expenses');
    const [, setLocation] = useLocation();
    const { id } = useParams<{ id: string }>();
    const { items, remove } = useExpenses();
    const { format } = useCurrency();
    const { bankAccounts } = usePaymentFunds();

    const expense = useMemo(() => items.find(e => e.id === id) ?? null, [items, id]);

    if (!expense) {
        return (
            <div className="p-4 md:p-6 max-w-2xl mx-auto pb-24 md:pb-6">
                <div className="flex items-center gap-3 mb-6">
                    <Button variant="ghost" size="icon" onClick={goBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-2xl font-bold">Expense not found</h1>
                </div>
                <Button variant="outline" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
                </Button>
            </div>
        );
    }

    const isAuto = Boolean(expense.sourcePurchaseId);
    const CategoryIcon = getCategoryIcon(expense.category);

    const bankAccount = useMemo(() => {
        if (!expense.bankAccountId) return null;
        return bankAccounts.find(b => b.id === expense.bankAccountId) ?? null;
    }, [expense.bankAccountId, bankAccounts]);

    const handleEdit = () => setLocation(`/expenses/${expense.id}/edit`);

    const handleDelete = async () => {
        if (!confirm('Delete this expense? This will also reverse the corresponding ledger entry.')) return;
        try {
            const commit = async () => {
                if (!expense.sourcePurchaseId) {
                    const allTransactions = await storage.get<any>('financialTransactions');
                    const priorPostings = allTransactions.filter(
                        (tx: any) => tx.sourceType === 'expense' && tx.sourceId === expense.id && tx.status === 'posted'
                    );
                    for (const posting of priorPostings) {
                        await FinancialPostingService.reverse(
                            storage,
                            posting.id,
                            expense.id,
                            `expense:${expense.id}:reversal:${Date.now()}`
                        );
                    }
                }
                await remove(expense.id);
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
        }
    };

    return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto pb-24 md:pb-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-xl md:text-2xl font-bold truncate">Expense details</h1>
                        <p className="text-sm text-muted-foreground truncate">
                            {expense.description || expense.category}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    {!isAuto && (
                        <Button variant="outline" size="sm" onClick={handleEdit}>
                            <Pencil className="h-4 w-4 mr-1.5" /> Edit
                        </Button>
                    )}
                    {!isAuto && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                        </Button>
                    )}
                </div>
            </div>

            {/* Auto Expense Banner */}
            {isAuto && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
                    <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                        <p className="font-semibold">Auto-Generated Purchase Expense</p>
                        <p className="opacity-90 mt-0.5">
                            This expense was automatically posted from Purchase payment #{expense.sourcePurchaseId}. To edit or remove, please update the linked purchase.
                        </p>
                    </div>
                </div>
            )}

            {/* Hero card with amount */}
            <Card className="overflow-hidden border-2 shadow-sm rounded-2xl">
                <CardContent className="p-6 sm:p-8">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                            <CategoryIcon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                                {expense.category}
                            </p>
                            <p className="text-sm font-semibold truncate">
                                {expense.description || 'No description'}
                            </p>
                        </div>
                    </div>
                    <div className="mt-6 text-center">
                        <p className="text-4xl sm:text-5xl font-black text-red-600 dark:text-red-400 tabular-nums tracking-tight">
                            {format(expense.amount)}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Details card */}
            <Card className="rounded-2xl border shadow-xs">
                <CardContent className="p-4 sm:p-6">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                        Particulars
                    </h2>
                    <dl className="space-y-3.5">
                        {/* Date */}
                        <div className="flex items-center gap-3">
                            <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground w-36 shrink-0">
                                <Calendar className="h-4 w-4" /> Date
                            </dt>
                            <dd className="text-xs font-bold text-foreground">
                                {formatDate(parseISO(expense.date), 'dd MMM yyyy')}
                            </dd>
                        </div>

                        {/* Reference / Voucher # */}
                        {expense.referenceNumber && (
                            <div className="flex items-center gap-3">
                                <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground w-36 shrink-0">
                                    <Hash className="h-4 w-4" /> Bill / Voucher #
                                </dt>
                                <dd className="text-xs font-bold font-mono text-foreground">
                                    {expense.referenceNumber}
                                </dd>
                            </div>
                        )}

                        {/* Payment method */}
                        <div className="flex items-start gap-3">
                            <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground w-36 shrink-0 mt-0.5">
                                <CreditCard className="h-4 w-4" /> Disbursement
                            </dt>
                            <dd className="text-xs font-bold capitalize flex-1">
                                {expense.paymentMethod === 'bank' && bankAccount ? (
                                    <span>
                                        Bank ({bankAccount.name})
                                    </span>
                                ) : expense.paymentMethod === 'split' ? (
                                    <span className="text-primary flex items-center gap-1">
                                        <Split className="h-3.5 w-3.5" /> Multi-Source Split
                                    </span>
                                ) : (
                                    <span>{expense.paymentMethod}</span>
                                )}
                            </dd>
                        </div>

                        {/* Split Breakdown (if split) */}
                        {expense.paymentMethod === 'split' && expense.splitPayments && expense.splitPayments.length > 0 && (
                            <div className="p-3 rounded-xl bg-muted/40 border border-border/70 space-y-2 mt-2">
                                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5 text-primary" />
                                    Split Allocation Breakdown
                                </p>
                                <div className="space-y-1.5">
                                    {expense.splitPayments.map(split => {
                                        const bAccount = split.bankAccountId ? bankAccounts.find(b => b.id === split.bankAccountId) : null;
                                        return (
                                            <div key={split.id} className="flex items-center justify-between text-xs font-semibold">
                                                <span className="capitalize text-muted-foreground">
                                                    {split.method} {bAccount ? `(${bAccount.name})` : ''}
                                                </span>
                                                <span className="font-bold tabular-nums">
                                                    {format(split.amount)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Type */}
                        <div className="flex items-center gap-3">
                            <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground w-36 shrink-0">
                                <Tag className="h-4 w-4" /> Source Type
                            </dt>
                            <dd className="text-xs">
                                <Badge
                                    variant={isAuto ? 'secondary' : 'outline'}
                                    className="capitalize font-semibold text-[11px]"
                                >
                                    {isAuto ? 'Auto (Purchase)' : 'Manual Expense'}
                                </Badge>
                            </dd>
                        </div>

                        {/* Source purchase link (if auto) */}
                        {isAuto && (
                            <div className="flex items-center gap-3 pt-1">
                                <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground w-36 shrink-0">
                                    <Link2 className="h-4 w-4" /> Linked Purchase
                                </dt>
                                <dd className="text-xs">
                                    <Button
                                        variant="link"
                                        className="p-0 h-auto text-xs font-bold text-primary"
                                        onClick={() => setLocation(`/purchases/${expense.sourcePurchaseId}`)}
                                    >
                                        View Purchase Invoice →
                                    </Button>
                                </dd>
                            </div>
                        )}
                    </dl>
                </CardContent>
            </Card>

            {/* Notes (only if present) */}
            {expense.notes && (
                <Card className="rounded-2xl border shadow-xs">
                    <CardContent className="p-4 sm:p-6">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Remarks & Notes
                        </h2>
                        <p className="text-xs font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                            {expense.notes}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}