import { useMemo, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { usePurchases, useSuppliers } from '@/contexts/GlobalProviders';
import { useStorageProvider } from '../../storage/StorageContext';
import { useSmartBack } from '@/contexts/NavigationContext';
import { useCurrency } from '@/hooks/useCurrency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettlePaymentMethod } from '@/components/PaymentMethodPicker';
import { PaymentDisbursementField } from '@/components/PaymentDisbursementField';
import {
  ArrowLeft, Truck, Calendar, Banknote, CheckCircle2,
  Clock, TrendingDown, History, ChevronRight, Phone,
  FileText, AlertCircle, Package, CreditCard, Receipt
} from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CreditPayment, PaymentSplitEntry } from '@/types';
import { patchPurchase, patchPurchaseFinancial } from '@/services/purchaseService';

export default function PayableDetail() {
  const goBack = useSmartBack('/payables');
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const storage = useStorageProvider();
  const { items: purchases } = usePurchases();
  const { items: suppliers } = useSuppliers();
  const { format } = useCurrency();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string | null>(null);
  const [splitPayments, setSplitPayments] = useState<PaymentSplitEntry[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const invoice = useMemo(() => purchases.find(p => p.id === id), [purchases, id]);
  const supplier = useMemo(
    () => invoice?.supplierId ? suppliers.find(s => s.id === invoice.supplierId) : null,
    [suppliers, invoice],
  );

  if (!invoice) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Purchase invoice not found.</p>
        <Button variant="outline" className="mt-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Payables
        </Button>
      </div>
    );
  }

  // Safe defaults for older records that didn't have these fields
  const paidAmount = invoice.paidAmount ?? 0;
  const payments: CreditPayment[] = invoice.payments ?? [];
  const remainingAmount = Math.max(0, invoice.grandTotal - paidAmount);
  const progressPct = invoice.grandTotal > 0
    ? Math.min(100, (paidAmount / invoice.grandTotal) * 100) : 0;

  const ps = invoice.paymentStatus ?? (paidAmount >= invoice.grandTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid');

  const statusConfig = {
    unpaid: {
      label: 'Unpaid',
      className: 'bg-rose-500/10 text-rose-600 border-rose-200/40 dark:border-rose-500/20',
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    partial: {
      label: 'Partial Payment',
      className: 'bg-sky-500/10 text-sky-600 border-sky-200/40 dark:border-sky-500/20',
      icon: <TrendingDown className="h-3.5 w-3.5" />,
    },
    paid: {
      label: 'Fully Settled',
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-200/40 dark:border-emerald-500/20',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    },
  };
  const statusCfg = statusConfig[ps] ?? statusConfig.unpaid;

  const PAYMENT_METHOD_LABELS: Record<SettlePaymentMethod, string> = {
    cash: 'Cash',
    qr: 'QR / Mobile Pay',
    card: 'Card',
    bank: 'Bank Transfer',
    other: 'Other',
  };

  const handleRecordPayment = async () => {
    let amt = Number(paymentAmount);
    if (paymentMethod === 'split') {
      amt = splitPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    }

    if (!amt || isNaN(amt) || amt <= 0) {
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
      const isFullyPaid = newPaidAmount >= invoice.grandTotal - 0.001;
      const nextPaidAmount = isFullyPaid ? invoice.grandTotal : newPaidAmount;
      const newPayment: CreditPayment = {
        id: `${invoice.id}:payment:${Date.now()}`,
        date: new Date().toISOString(),
        amount: amt,
        note: paymentMethod === 'split' ? 'Split Payment' : (PAYMENT_METHOD_LABELS[paymentMethod as SettlePaymentMethod] || paymentMethod),
        paymentMethod: paymentMethod as any,
        financialAccountId: paymentMethod === 'bank' ? selectedBankAccountId : null,
        splitPayments: paymentMethod === 'split' ? splitPayments : undefined,
      };

      const commit = async () => {
        await patchPurchaseFinancial(storage, invoice.id, {
          paidAmount: nextPaidAmount,
          payments: [...payments, newPayment],
          paymentStatus: isFullyPaid ? 'paid' : 'partial',
          splitPayments: paymentMethod === 'split' ? splitPayments : undefined,
          bankAccountId: paymentMethod === 'bank' ? selectedBankAccountId : null,
        });
      };
      if (storage.transaction) {
        await storage.transaction(['purchases', 'expenses', 'financialAccounts', 'financialTransactions', 'financialMovements', 'settings'], 'rw', commit);
      } else {
        await commit();
      }

      toast.success(isFullyPaid ? 'Invoice fully settled!' : `${format(amt)} payment recorded`);
      setPaymentAmount('');
      setPaymentMethod('cash');
      setSplitPayments([]);
      setShowPaymentForm(false);
    } finally {
      setSaving(false);
    }
  };

  const supplierName = supplier?.name ?? invoice.supplierName ?? 'Unknown Supplier';
  const invoiceRef = invoice.invoiceNumber || `#${invoice.id.slice(-6).toUpperCase()}`;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto pb-24 md:pb-8">
      {/* Header section with back button and status */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full shrink-0 border" onClick={goBack} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold truncate leading-tight">{supplierName}</h1>
            <p className="text-sm font-mono text-muted-foreground mt-0.5">{invoiceRef}</p>
          </div>
        </div>
        <Badge variant="outline" className={cn('flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border shrink-0', statusCfg.className)}>
          {statusCfg.icon}
          {statusCfg.label}
        </Badge>
      </div>

      {/* Amount Summary and Progress */}
      <Card className="border border-border rounded-2xl shadow-sm overflow-hidden">
        <CardContent className="p-6 md:p-8 space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              {ps === 'paid' ? 'Fully Paid Amount' : 'Outstanding Balance'}
            </p>
            <p className={cn(
              'text-4xl md:text-5xl font-black tracking-tight',
              remainingAmount > 0 ? 'text-rose-600' : 'text-emerald-600',
            )}>
              {format(remainingAmount)}
            </p>
          </div>

          {/* Progress Slider */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-end text-xs">
              <span className="text-muted-foreground font-semibold">Payment Progress</span>
              <span className="font-extrabold text-foreground">{progressPct.toFixed(0)}% paid</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  progressPct >= 100 ? 'bg-emerald-500' : progressPct > 0 ? 'bg-sky-500' : 'bg-rose-500',
                )}
                style={{ width: `${Math.max(progressPct, 1.5)}%` }}
              />
            </div>
          </div>

          {/* Detailed Pill Stats */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-2xl bg-muted/40 border border-border/80 p-4 text-center">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Invoice Value</p>
              <p className="text-xl font-extrabold text-foreground">{format(invoice.grandTotal)}</p>
            </div>
            <div className="rounded-2xl bg-sky-500/3 border border-sky-500/10 p-4 text-center">
              <p className="text-[11px] font-bold text-sky-700/80 uppercase tracking-wider mb-1">Settled So Far</p>
              <p className="text-xl font-extrabold text-sky-600">{format(paidAmount)}</p>
            </div>
          </div>

          {/* Payment Form Button or Panel */}
          {ps !== 'paid' && (
            <div className="pt-2">
              {!showPaymentForm ? (
                <Button
                  className="w-full h-12 text-sm font-semibold rounded-xl gap-2 shadow-sm cursor-pointer"
                  size="lg"
                  onClick={() => {
                    setShowPaymentForm(true);
                    if (!paymentAmount) {
                      setPaymentAmount(String(remainingAmount));
                    }
                  }}
                >
                  <CreditCard className="h-4 w-4" />
                  Record Supplier Settle
                </Button>
              ) : (
                <div className="space-y-4 bg-muted/40 rounded-2xl p-5 border border-border/80">
                  <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    Record Settlement Amount
                  </h3>

                  <PaymentDisbursementField
                    amount={remainingAmount}
                    paymentStatus={paymentAmount && Number(paymentAmount) >= remainingAmount ? 'paid' : 'partial'}
                    onPaymentStatusChange={() => {}}
                    paidAmount={paymentAmount}
                    onPaidAmountChange={val => setPaymentAmount(String(val))}
                    paymentMethod={paymentMethod}
                    onPaymentMethodChange={m => setPaymentMethod(m)}
                    selectedBankAccountId={selectedBankAccountId}
                    onBankAccountIdChange={setSelectedBankAccountId}
                    splitPayments={splitPayments}
                    onSplitPaymentsChange={setSplitPayments}
                    hideStatusSelector={true}
                  />

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-11 rounded-xl font-semibold"
                      onClick={() => {
                        setShowPaymentForm(false);
                        setPaymentAmount('');
                        setSplitPayments([]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1 h-11 rounded-xl font-semibold" onClick={handleRecordPayment} disabled={saving}>
                      {saving ? 'Processing…' : 'Confirm Payment'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {ps === 'paid' && (
            <div className="flex items-center gap-2 justify-center py-2.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-emerald-600 text-sm font-semibold">
              <CheckCircle2 className="h-4.5 w-4.5" />
              Fully paid to supplier
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice items and metadata */}
      <Card className="border border-border rounded-2xl shadow-sm overflow-hidden">
        <CardHeader className="pb-3 pt-5 px-6 border-b border-border/40">
          <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailRow icon={<Truck className="h-4 w-4 text-muted-foreground" />} label="Supplier Profile" value={supplierName} />
            {supplier?.phone && (
              <DetailRow icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Contact Number" value={supplier.phone} />
            )}
            <DetailRow icon={<FileText className="h-4 w-4 text-muted-foreground" />} label="Invoice Reference" value={invoiceRef} />
            <DetailRow
              icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
              label="Purchase Date"
              value={formatDate(parseISO(invoice.date), 'MMM d, yyyy')}
            />
          </div>

          {invoice.referenceNumber && (
            <DetailRow icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />} label="Additional Ref" value={invoice.referenceNumber} />
          )}
          {invoice.notes && (
            <DetailRow icon={<FileText className="h-4 w-4 text-muted-foreground" />} label="Purchase Notes" value={invoice.notes} />
          )}

          {/* Items Summary Table */}
          {invoice.items.length > 0 && (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Package className="h-4 w-4" /> Billed Items ({invoice.items.length})
              </p>
              <div className="rounded-xl border bg-muted/20 overflow-hidden divide-y divide-border/60">
                {invoice.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 text-sm">
                    <span className="font-medium text-foreground truncate flex-1 pr-4">{item.productName}</span>
                    <span className="font-bold text-muted-foreground shrink-0 text-xs">
                      {item.quantity} × {format(item.purchaseRate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setLocation(`/purchases/${invoice.id}`)}
            className="w-full flex items-center gap-3 rounded-2xl border bg-muted/30 border-border/80 px-4 py-3.5 hover:bg-muted active:scale-[0.99] transition-all text-left mt-2"
          >
            <Receipt className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Ledger</p>
              <p className="text-sm font-medium text-foreground">View complete purchase details</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </CardContent>
      </Card>

      {/* Payment History Timeline */}
      {payments.length > 0 && (
        <Card className="border border-border rounded-2xl shadow-sm overflow-hidden">
          <CardHeader className="pb-3 pt-5 px-6 border-b border-border/40">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <History className="h-4 w-4" />
              Settle History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 divide-y divide-border/60">
            {[...payments].reverse().map((payment, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600">
                    <Banknote className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{payment.note}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(parseISO(payment.date), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-extrabold text-emerald-600 shrink-0">{format(payment.amount)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {payments.length === 0 && ps !== 'paid' && (
        <div className="text-center py-10 bg-card rounded-2xl border border-dashed flex flex-col items-center justify-center p-6 space-y-2">
          <History className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground font-semibold">No payments recorded yet</p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-foreground wrap-break-word">{value}</p>
      </div>
    </div>
  );
}
