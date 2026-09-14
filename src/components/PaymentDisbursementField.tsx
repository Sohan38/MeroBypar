import React, { useEffect, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Coins,
  CreditCard,
  QrCode,
  Landmark,
  Wallet,
  Split,
  Clock,
  Tag,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BankSelector } from '@/components/pos/BankSelector';
import { useCurrency } from '@/hooks/useCurrency';
import { usePaymentFunds } from '@/hooks/usePaymentFunds';
import { PaymentMethod, PaymentSplitEntry, PurchasePaymentStatus } from '@/types';
import { safeCurrency } from '@/utils/unitUtils';

export interface PaymentDisbursementFieldProps {
  paymentStatus?: PurchasePaymentStatus;
  onPaymentStatusChange?: (status: PurchasePaymentStatus) => void;
  paymentMethod: PaymentMethod | string;
  onPaymentMethodChange: (method: any) => void;
  bankAccountId?: string | null;
  selectedBankAccountId?: string | null;
  onBankAccountIdChange?: (id: string | null) => void;
  grandTotal?: number;
  amount?: number;
  paidAmount: number | string;
  onPaidAmountChange: (amount: any) => void;
  splitPayments?: PaymentSplitEntry[];
  onSplitPaymentsChange?: (splits: PaymentSplitEntry[]) => void;
  supplierName?: string;
  className?: string;
  hideStatusSelector?: boolean;
}

export const PaymentDisbursementField: React.FC<PaymentDisbursementFieldProps> = ({
  paymentStatus = 'unpaid',
  onPaymentStatusChange,
  paymentMethod,
  onPaymentMethodChange,
  bankAccountId: bankAccountIdProp,
  selectedBankAccountId,
  onBankAccountIdChange,
  grandTotal: grandTotalProp,
  amount: amountProp,
  paidAmount: paidAmountProp,
  onPaidAmountChange,
  splitPayments = [],
  onSplitPaymentsChange,
  supplierName = 'Supplier',
  className,
  hideStatusSelector = false,
}) => {
  const { format } = useCurrency();
  const {
    bankAccounts,
    checkFundAvailability,
    getMethodBalance,
    resolveAccountForMethod,
  } = usePaymentFunds();

  const grandTotal = grandTotalProp !== undefined ? grandTotalProp : (amountProp ?? 0);
  const paidAmount = Number(paidAmountProp) || 0;
  const bankAccountId = selectedBankAccountId !== undefined ? selectedBankAccountId : bankAccountIdProp;

  const handlePaidAmountChange = (val: number | string) => {
    if (typeof paidAmountProp === 'string') {
      onPaidAmountChange(String(val));
    } else {
      onPaidAmountChange(Number(val) || 0);
    }
  };

  const isUnpaid = paymentStatus === 'unpaid';
  const isPartial = paymentStatus === 'partial';
  const isPaid = paymentStatus === 'paid';
  const isSplit = paymentMethod === 'split';

  // Target amount to disburse based on status
  const targetDisbursement = hideStatusSelector
    ? (paidAmount > 0 ? paidAmount : grandTotal)
    : isPaid
      ? grandTotal
      : isPartial
        ? Math.min(grandTotal, Math.max(0, paidAmount))
        : 0;

  // Check fund availability for current single method
  const fundInfo = useMemo(() => {
    if (isUnpaid || isSplit) return null;
    return checkFundAvailability(paymentMethod, targetDisbursement, bankAccountId);
  }, [isUnpaid, isSplit, checkFundAvailability, paymentMethod, targetDisbursement, bankAccountId]);

  // Current method balance
  const activeMethodBalance = useMemo(() => {
    if (isUnpaid || isSplit) return 0;
    return getMethodBalance(paymentMethod, bankAccountId);
  }, [isUnpaid, isSplit, getMethodBalance, paymentMethod, bankAccountId]);

  // Total allocated across split lines
  const totalSplitAllocated = useMemo(() => {
    return safeCurrency(splitPayments.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
  }, [splitPayments]);

  // Initialize split lines if switching to split
  useEffect(() => {
    if (isSplit && (!splitPayments || splitPayments.length === 0)) {
      const primaryBankId = bankAccounts[0]?.id || null;
      const initialSplits: PaymentSplitEntry[] = [
        {
          id: uuidv4(),
          method: 'cash',
          amount: safeCurrency(targetDisbursement > 0 ? targetDisbursement * 0.5 : grandTotal * 0.5),
        },
        {
          id: uuidv4(),
          method: 'bank',
          amount: safeCurrency(targetDisbursement > 0 ? targetDisbursement * 0.5 : grandTotal * 0.5),
          bankAccountId: primaryBankId,
        },
      ];
      onSplitPaymentsChange?.(initialSplits);
    }
  }, [isSplit, splitPayments, onSplitPaymentsChange, targetDisbursement, grandTotal, bankAccounts]);

  // Handle single method change
  const handleMethodSelect = (method: PaymentMethod) => {
    onPaymentMethodChange(method);
    if (method === 'bank' && !bankAccountId && bankAccounts.length > 0) {
      onBankAccountIdChange?.(bankAccounts[0].id);
    }
  };

  // Convert deficit to partial pay with available balance
  const handlePayAvailableAsPartial = () => {
    if (!fundInfo) return;
    const availableSafe = safeCurrency(Math.max(0, fundInfo.available));
    onPaymentStatusChange?.('partial');
    handlePaidAmountChange(availableSafe);
  };

  // Convert deficit into split payment covering available + deficit
  const handleSplitDeficit = () => {
    if (!fundInfo) return;
    const availableSafe = safeCurrency(Math.max(0, fundInfo.available));
    const deficitSafe = safeCurrency(Math.max(0, targetDisbursement - availableSafe));
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

    onPaymentMethodChange('split');
    onSplitPaymentsChange?.(newSplits);
  };

  // Split lines operations
  const updateSplitLine = (id: string, updates: Partial<PaymentSplitEntry>) => {
    if (!onSplitPaymentsChange) return;
    const next = splitPayments.map(line => {
      if (line.id !== id) return line;
      const updated = { ...line, ...updates };
      if (updated.method === 'bank' && !updated.bankAccountId && bankAccounts.length > 0) {
        updated.bankAccountId = bankAccounts[0].id;
      }
      return updated;
    });
    onSplitPaymentsChange(next);

    // Sync total paidAmount
    const newTotal = safeCurrency(next.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
    handlePaidAmountChange(newTotal);
    if (isPartial && newTotal >= grandTotal) {
      onPaymentStatusChange?.('paid');
    }
  };

  const addSplitLine = () => {
    if (!onSplitPaymentsChange) return;
    const remaining = Math.max(0, targetDisbursement - totalSplitAllocated);
    const existingMethods = new Set(splitPayments.map(s => s.method));
    const candidateMethod: Exclude<PaymentMethod, 'split' | 'credit'> =
      !existingMethods.has('bank') ? 'bank' : !existingMethods.has('cash') ? 'cash' : 'qr';

    const newLine: PaymentSplitEntry = {
      id: uuidv4(),
      method: candidateMethod,
      amount: remaining > 0 ? remaining : 0,
      bankAccountId: candidateMethod === 'bank' ? (bankAccounts[0]?.id || null) : null,
    };
    const next = [...splitPayments, newLine];
    onSplitPaymentsChange(next);
  };

  const removeSplitLine = (id: string) => {
    if (!onSplitPaymentsChange || splitPayments.length <= 1) return;
    const next = splitPayments.filter(line => line.id !== id);
    onSplitPaymentsChange(next);
    const newTotal = safeCurrency(next.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));
    handlePaidAmountChange(newTotal);
  };

  const fillRemainingOnSplitLine = (id: string) => {
    const currentLine = splitPayments.find(s => s.id === id);
    if (!currentLine) return;
    const currentAmt = Number(currentLine.amount) || 0;
    const remaining = safeCurrency(targetDisbursement - totalSplitAllocated);
    const updatedAmt = safeCurrency(Math.max(0, currentAmt + remaining));
    updateSplitLine(id, { amount: updatedAmt });
  };

  const primaryPaymentMethods: Array<{
    id: PaymentMethod;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'cash', label: 'Cash', icon: Coins },
    { id: 'bank', label: 'Bank', icon: Landmark },
    { id: 'qr', label: 'QR', icon: QrCode },
    { id: 'other', label: 'Wallet', icon: Wallet },
    { id: 'card', label: 'Card', icon: CreditCard },
    { id: 'split', label: 'Split', icon: Split },
  ];

  return (
    <div className={cn('space-y-3.5', className)}>
      {/* 1. Payment Status Segmented Control (Optional) */}
      {!hideStatusSelector && onPaymentStatusChange && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Payment Status
          </label>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/50">
            <button
              type="button"
              onClick={() => {
                onPaymentStatusChange('unpaid');
                handlePaidAmountChange(0);
              }}
              className={cn(
                'py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                isUnpaid
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Unpaid</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onPaymentStatusChange('partial');
                if (!paidAmount || paidAmount === 0) {
                  handlePaidAmountChange(safeCurrency(grandTotal * 0.5));
                }
              }}
              className={cn(
                'py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                isPartial
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Partial</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onPaymentStatusChange('paid');
                handlePaidAmountChange(grandTotal);
              }}
              className={cn(
                'py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer',
                isPaid
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Paid</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Unpaid Information Banner */}
      {isUnpaid ? (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Recorded as unpaid credit. <strong>{format(grandTotal)}</strong> will be added to <strong>{supplierName}</strong>'s balance.
          </span>
        </div>
      ) : (
        /* 3. Paid or Partial Payment Controls */
        <div className="space-y-3.5 pt-1">
          {/* Method Selection Chips */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Disbursement Method
              </label>
              {!isSplit && (
                <span className="text-[11px] font-medium text-muted-foreground">
                  Available in {fundInfo?.accountName || 'Account'}:{' '}
                  <strong className={cn(activeMethodBalance < targetDisbursement ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                    {format(activeMethodBalance)}
                  </strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {primaryPaymentMethods.map(m => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleMethodSelect(m.id)}
                    className={cn(
                      'py-2 px-1 rounded-xl text-xs font-semibold border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-background hover:bg-muted/60 text-muted-foreground border-border/80'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] truncate max-w-full">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bank Account Selector (If method is bank and NOT split) */}
          {paymentMethod === 'bank' && (
            <div className="pt-1">
              <BankSelector
                selectedAccountId={bankAccountId}
                onSelectAccountId={(id: string) => onBankAccountIdChange?.(id)}
                label="Pay From Bank Account"
              />
            </div>
          )}

          {/* Insufficient Balance Deficit Alert & Smart Action Banner (Single Method Mode) */}
          {!isSplit && fundInfo && !fundInfo.isSufficient && targetDisbursement > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">
                    Insufficient Balance in {fundInfo.accountName}
                  </p>
                  <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 mt-0.5">
                    Available: <strong>{format(fundInfo.available)}</strong> · Short by{' '}
                    <strong className="text-destructive font-bold">{format(fundInfo.deficit)}</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
                {fundInfo.available > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handlePayAvailableAsPartial}
                    className="h-7 text-xs bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-900 dark:text-amber-100 font-semibold gap-1"
                  >
                    Pay Available ({format(fundInfo.available)}) as Partial
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSplitDeficit}
                  className="h-7 text-xs bg-background/80 hover:bg-background border-border text-foreground font-semibold gap-1"
                >
                  <Split className="h-3 w-3" />
                  Split with Another Method
                </Button>
              </div>
            </div>
          )}

          {/* Partial Amount Input & Live Due Calculator */}
          {(isPartial || hideStatusSelector) && !isSplit && (
            <div className="space-y-2 p-3 rounded-xl bg-muted/40 border border-border/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Amount Paying Now
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePaidAmountChange(safeCurrency(grandTotal * 0.25))}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-background border hover:bg-muted"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaidAmountChange(safeCurrency(grandTotal * 0.5))}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-background border hover:bg-muted"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaidAmountChange(safeCurrency(grandTotal * 0.75))}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-background border hover:bg-muted"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePaidAmountChange(grandTotal);
                      if (!hideStatusSelector) {
                        onPaymentStatusChange?.('paid');
                      }
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-background border hover:bg-muted"
                  >
                    Full
                  </button>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                  Rs.
                </span>
                <Input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="0.01"
                  value={paidAmountProp === 0 || paidAmountProp === '0' ? '' : paidAmountProp}
                  onChange={e => {
                    const val = e.target.value;
                    handlePaidAmountChange(val);
                    if ((Number(val) || 0) >= grandTotal && !hideStatusSelector) {
                      onPaymentStatusChange?.('paid');
                    }
                  }}
                  placeholder="0"
                  className="pl-9 text-base font-semibold h-10"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground">Remaining Due Later:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {format(Math.max(0, grandTotal - paidAmount))}
                </span>
              </div>
            </div>
          )}

          {/* 4. Multi-Method Split Payment Line Editor */}
          {isSplit && (
            <div className="space-y-3 p-3.5 rounded-xl bg-card border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Split className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-foreground">Split Payment Lines</span>
                </div>
                <Badge
                  variant={totalSplitAllocated === targetDisbursement ? 'default' : 'outline'}
                  className={cn(
                    'text-[10px] font-bold px-2 py-0.5',
                    totalSplitAllocated === targetDisbursement
                      ? 'bg-emerald-600 text-white'
                      : totalSplitAllocated > targetDisbursement
                        ? 'border-destructive text-destructive'
                        : 'border-amber-500 text-amber-600 dark:text-amber-400'
                  )}
                >
                  {totalSplitAllocated === targetDisbursement ? (
                    <span className="flex items-center gap-1">
                      <Check className="h-3 w-3" /> Fully Allocated ({format(totalSplitAllocated)})
                    </span>
                  ) : totalSplitAllocated > targetDisbursement ? (
                    `Over-allocated by ${format(totalSplitAllocated - targetDisbursement)}`
                  ) : (
                    `Remaining: ${format(targetDisbursement - totalSplitAllocated)}`
                  )}
                </Badge>
              </div>

              {/* Split Lines */}
              <div className="space-y-2.5">
                {splitPayments.map((line, idx) => {
                  const lineBalance = getMethodBalance(line.method, line.bankAccountId);
                  const isLineSufficient = lineBalance >= (Number(line.amount) || 0);

                  return (
                    <div
                      key={line.id}
                      className="p-2.5 rounded-lg bg-background border border-border/80 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-muted-foreground w-4 text-center shrink-0">
                          #{idx + 1}
                        </span>

                        {/* Method Selector */}
                        <div className="w-28 shrink-0">
                          <select
                            value={line.method}
                            onChange={e =>
                              updateSplitLine(line.id, {
                                method: e.target.value as Exclude<PaymentMethod, 'split' | 'credit'>,
                              })
                            }
                            className="w-full h-8 px-2 text-xs font-medium rounded-md border bg-background border-border"
                          >
                            <option value="cash">Cash</option>
                            <option value="bank">Bank</option>
                            <option value="qr">QR</option>
                            <option value="other">Wallet</option>
                            <option value="card">Card</option>
                          </select>
                        </div>

                        {/* Amount Input */}
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground">
                            Rs.
                          </span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.amount === 0 ? '' : line.amount}
                            onChange={e =>
                              updateSplitLine(line.id, {
                                amount: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                            className="h-8 pl-8 text-xs font-semibold"
                          />
                        </div>

                        {/* Fill Remaining button on line */}
                        {totalSplitAllocated < targetDisbursement && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => fillRemainingOnSplitLine(line.id)}
                            className="h-8 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 shrink-0"
                            title="Fill remaining balance into this line"
                          >
                            + Fill
                          </Button>
                        )}

                        {/* Delete line */}
                        {splitPayments.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSplitLine(line.id)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      {/* Bank Selector if line is Bank */}
                      {line.method === 'bank' && (
                        <div className="pl-6 pt-1">
                          <BankSelector
                            selectedAccountId={line.bankAccountId}
                            onSelectAccountId={(id: string) => updateSplitLine(line.id, { bankAccountId: id })}
                            label="Bank Account"
                          />
                        </div>
                      )}

                      {/* Live balance badge for this line */}
                      <div className="flex items-center justify-between text-[10px] pl-6 text-muted-foreground">
                        <span>
                          Available:{' '}
                          <strong className={cn(!isLineSufficient && 'text-amber-600 dark:text-amber-400 font-bold')}>
                            {format(lineBalance)}
                          </strong>
                        </span>
                        {!isLineSufficient && Number(line.amount) > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> Short by {format(Number(line.amount) - lineBalance)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Split Line & Summary Footer */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSplitLine}
                  className="h-7 text-xs gap-1 border-dashed font-semibold"
                >
                  <Plus className="h-3 w-3" /> Add Another Method / Bank
                </Button>

                <div className="text-right text-xs">
                  <span className="text-muted-foreground">Total: </span>
                  <strong className="text-foreground">{format(totalSplitAllocated)}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
