import { useMemo, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useCredit, useCustomers, useSales } from '@/contexts/GlobalProviders';
import { useSmartBack } from '@/contexts/NavigationContext';
import { useCurrency } from '@/hooks/useCurrency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PaymentMethodPicker, SettlePaymentMethod } from '@/components/PaymentMethodPicker';
import { BankSelector } from '@/components/pos/BankSelector';
import {
  ArrowLeft, User, Calendar, Banknote, CheckCircle2,
  Clock, TrendingDown, History, ChevronRight, Phone,
  FileText, AlertCircle, ShoppingBag, CreditCard, Pencil
} from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useStorageProvider } from '@/storage/StorageContext';
import { FinancialPostingService } from '@/services/financialPostingService';

export default function CreditDetail() {
  const goBack = useSmartBack('/credit');
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { items: credits, update } = useCredit();
  const storage = useStorageProvider();
  const { items: customers } = useCustomers();
  const { items: sales } = useSales();
  const { format } = useCurrency();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SettlePaymentMethod>('cash');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const credit = useMemo(() => credits.find(c => c.id === id), [credits, id]);
  const customer = useMemo(
    () => credit?.customerId ? customers.find(c => c.id === credit.customerId) : null,
    [customers, credit],
  );
  const sourceSale = useMemo(
    () => credit?.sourceSaleId ? sales.find(s => s.id === credit.sourceSaleId) : null,
    [sales, credit],
  );

  if (!credit) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Credit record not found.</p>
        <Button variant="outline" className="mt-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Credit
        </Button>
      </div>
    );
  }

  // Safe access with defaults for records created before partial-payment feature
  const paidAmount = credit.paidAmount ?? 0;
  const payments = credit.payments ?? [];
  const remainingAmount = Math.max(0, credit.amount - paidAmount);
  const progressPct = credit.amount > 0 ? Math.min(100, (paidAmount / credit.amount) * 100) : 0;

  const statusConfig = {
    pending: {
      label: 'Pending',
      className: 'bg-orange-500/10 text-orange-600 border-orange-200',
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    partial: {
      label: 'Partial',
      className: 'bg-blue-500/10 text-blue-600 border-blue-200',
      icon: <TrendingDown className="h-3.5 w-3.5" />,
    },
    paid: {
      label: 'Settled',
      className: 'bg-green-500/10 text-green-600 border-green-200',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    },
  };
  const status = statusConfig[credit.status] ?? statusConfig.pending;

  const PAYMENT_METHOD_LABELS: Record<SettlePaymentMethod, string> = {
    cash: 'Cash',
    qr: 'QR / Mobile Pay',
    card: 'Card',
    bank: 'Bank Transfer',
    other: 'Other',
  };

  const handleRecordPayment = async () => {
    const amt = Number(paymentAmount);
    if (!paymentAmount || isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (amt > remainingAmount + 0.001) {
      toast.error(`Amount exceeds remaining balance of ${format(remainingAmount)}`);
      return;
    }

    setSaving(true);
    try {
      const newPaidAmount = paidAmount + amt;
      const isFullyPaid = newPaidAmount >= credit.amount - 0.001;
      const newPayment = {
        id: `${credit.id}:payment:${Date.now()}`,
        date: new Date().toISOString(),
        amount: amt,
        note: PAYMENT_METHOD_LABELS[paymentMethod],
        paymentMethod,
      };

      const commit = async () => {
        await update(credit.id, {
          paidAmount: newPaidAmount,
          payments: [...payments, newPayment],
          status: isFullyPaid ? 'paid' : 'partial',
          paidAt: isFullyPaid ? new Date().toISOString() : credit.paidAt,
        });
        await FinancialPostingService.postCustomerPayment(storage, {
          id: newPayment.id,
          creditId: credit.id,
          date: newPayment.date,
          amount: amt,
          paymentMethod,
          customerName: credit.customerName,
          bankAccountId: paymentMethod === 'bank' ? selectedBankAccountId : null,
        });
      };
      if (storage.transaction) {
        await storage.transaction(['credit', 'financialAccounts', 'financialTransactions', 'financialMovements', 'settings'], 'rw', commit);
      } else {
        await commit();
      }

      toast.success(isFullyPaid ? 'Credit fully settled!' : `${format(amt)} payment recorded`);
      setPaymentAmount('');
      setPaymentMethod('cash');
      setShowPaymentForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto pb-24 md:pb-8">
      {/* ── Header ── */}
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back" className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <h1
            className="text-lg md:text-xl font-bold truncate leading-tight"
            title={credit.customerName}
          >
            {credit.customerName}
          </h1>
          <p className="text-sm text-muted-foreground truncate mt-0.5" title={credit.description}>
            {credit.description}
          </p>
        </div>

        {/* Credit Type badge */}
        {credit.creditType === 'loan' ? (
          <Badge variant="outline" className="px-2 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/40 shrink-0">
            Money Loan / सापटी
          </Badge>
        ) : credit.sourceSaleId ? (
          <Badge variant="outline" className="px-2 py-0.5 text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/40 shrink-0">
            POS Sale
          </Badge>
        ) : (
          <Badge variant="outline" className="px-2 py-0.5 text-xs font-semibold bg-muted text-muted-foreground border-border shrink-0">
            Udharo
          </Badge>
        )}

        {/* Status badge */}
        <Badge variant="outline" className={cn('flex items-center gap-1.5 shrink-0', status.className)}>
          {status.icon}
          {status.label}
        </Badge>

        {/* Edit button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(`/credit/${credit.id}/edit`)}
          aria-label="Edit credit"
          className="shrink-0"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Amount summary ── */}
      <Card>
        <CardContent className="p-5 space-y-4">
          {/* Primary: remaining balance featured prominently */}
          <div className="text-center space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {credit.status === 'paid' ? 'Fully Settled' : 'Remaining Balance'}
            </p>
            <p className={cn(
              'text-4xl font-extrabold tracking-tight',
              remainingAmount > 0 ? 'text-orange-600' : 'text-green-600',
            )}>
              {format(remainingAmount)}
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  progressPct >= 100 ? 'bg-green-500' : progressPct > 0 ? 'bg-blue-500' : 'bg-orange-400',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>0%</span>
              <span className="font-semibold text-foreground">{progressPct.toFixed(0)}% settled</span>
              <span>100%</span>
            </div>
          </div>

          {/* Secondary: total & paid as two stat chips */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-center">
              <p className="text-[11px] text-muted-foreground font-medium mb-1">Total Credit</p>
              <p className="text-lg font-bold">{format(credit.amount)}</p>
            </div>
            <div className="rounded-xl bg-green-500/8 border border-green-200/60 px-4 py-3 text-center">
              <p className="text-[11px] text-green-700/80 font-medium mb-1">Paid So Far</p>
              <p className="text-lg font-bold text-green-600">{format(paidAmount)}</p>
            </div>
          </div>

          {/* Record payment button */}
          {credit.status !== 'paid' && (
            <div className="pt-1">
              {!showPaymentForm ? (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setShowPaymentForm(true)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              ) : (
                <div className="space-y-3 bg-muted/40 rounded-xl p-4 border border-border">
                  <p className="text-sm font-semibold">Record a payment</p>
                  <div className="space-y-4">
                    <PaymentMethodPicker
                      selectedMethod={paymentMethod}
                      onSelect={setPaymentMethod}
                    />
                    {paymentMethod === 'bank' && (
                      <BankSelector
                        selectedAccountId={selectedBankAccountId}
                        onSelectAccountId={setSelectedBankAccountId}
                        label="Receive in Bank Account"
                      />
                    )}
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground font-medium">
                        Amount <span className="text-foreground">(max {format(remainingAmount)})</span>
                      </label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        placeholder="0"
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        min="0.01"
                        max={remainingAmount}
                        className="h-12 text-base"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[25, 50, 75, 100].map(pct => {
                      const val = Math.round(remainingAmount * pct) / 100;
                      if (val <= 0) return null;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setPaymentAmount(String(val))}
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                            paymentAmount === String(val)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:border-primary/50 hover:bg-primary/5',
                          )}
                        >
                          {pct === 100 ? 'Full' : `${pct}%`} &middot; {format(val)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setShowPaymentForm(false); setPaymentAmount(''); }}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1" onClick={handleRecordPayment} disabled={saving}>
                      {saving ? 'Saving…' : 'Confirm Payment'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {credit.status === 'paid' && (
            <div className="flex items-center gap-2 justify-center py-1 text-green-600 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Fully settled{credit.paidAt && ` on ${formatDate(parseISO(credit.paidAt), 'MMM d, yyyy')}`}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Details card ── */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Details</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <DetailRow icon={<User className="h-4 w-4" />} label="Customer" value={credit.customerName} />
          {credit.phone && (
            <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone" value={credit.phone} />
          )}
          <DetailRow
            icon={<Calendar className="h-4 w-4" />}
            label="Created"
            value={formatDate(parseISO(credit.date), 'MMM d, yyyy')}
          />
          {credit.dueDate && (
            <DetailRow
              icon={<AlertCircle className="h-4 w-4" />}
              label="Due Date"
              value={formatDate(parseISO(credit.dueDate), 'MMM d, yyyy')}
            />
          )}
          {credit.notes && (
            <DetailRow icon={<FileText className="h-4 w-4" />} label="Notes" value={credit.notes} />
          )}
          {credit.creditType === 'loan' && credit.disbursementMethod && (
            <DetailRow
              icon={<Banknote className="h-4 w-4 text-primary" />}
              label="Disbursed From"
              value={
                credit.disbursementMethod === 'split'
                  ? 'Split Payment (Multi-Source)'
                  : credit.disbursementMethod.toUpperCase()
              }
            />
          )}
          {credit.referenceNumber && (
            <DetailRow icon={<FileText className="h-4 w-4" />} label="Reference #" value={credit.referenceNumber} />
          )}
          {sourceSale && (
            <button
              onClick={() => setLocation(`/sales/${sourceSale.id}`)}
              className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
            >
              <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">From POS Sale</p>
                <p className="text-sm font-medium truncate">View sale #{sourceSale.id.slice(-6)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          )}
          {customer && (
            <button
              onClick={() => setLocation(`/customers/${customer.id}`)}
              className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
            >
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Customer Profile</p>
                <p className="text-sm font-medium truncate">{customer.name}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          )}
        </CardContent>
      </Card>

      {/* ── Payment history ── */}
      {payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <History className="h-4 w-4" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-2">
            {[...payments].reverse().map((payment, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 py-2.5 border-b last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                    <Banknote className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{payment.note}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(parseISO(payment.date), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-bold text-green-600 shrink-0">{format(payment.amount)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {payments.length === 0 && credit.status === 'pending' && (
        <div className="text-center py-8 bg-card rounded-xl border border-dashed space-y-2">
          <History className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No payments recorded yet</p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium wrap-break-word">{value}</p>
      </div>
    </div>
  );
}
