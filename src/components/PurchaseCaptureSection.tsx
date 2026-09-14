import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { BankSelector } from '@/components/pos/BankSelector';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';
import {
    safeCurrency,
    safeMul,
    formatQtyDisplay,
} from '@/utils/unitUtils';
import {
    Receipt,
    Tag,
    Percent,
    Truck,
    Calendar,
    FileText,
    Hash,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Clock,
    AlertCircle,
} from 'lucide-react';
import { SupplierPurchaseDraft } from '@/pages/inventory/Form/hooks/useInventoryForm';

interface PurchaseCaptureSectionProps {
    purchaseSupplierIds: string[];
    supplierPurchaseDrafts: Record<string, SupplierPurchaseDraft>;
    suppliers: any[];
    updatePurchaseDraft: (supplierId: string, field: keyof SupplierPurchaseDraft, value: any) => void;
    localBatches?: any[];
    hasExpiry?: boolean;
    isMultiSupplier?: boolean;
    watchedSupplierStocks?: any[];
    productName?: string;
    purchaseRate?: number;
    quantity?: number;
    unit?: string;
    packSize?: number;
    packUnit?: string | null;
}

export const PurchaseCaptureSection = React.memo(({
    purchaseSupplierIds,
    supplierPurchaseDrafts,
    suppliers,
    updatePurchaseDraft,
    localBatches = [],
    hasExpiry = false,
    isMultiSupplier = false,
    watchedSupplierStocks = [],
    purchaseRate = 0,
    quantity = 0,
    unit = 'unit',
}: PurchaseCaptureSectionProps) => {
    const { format } = useCurrency();
    const [selectedTabSupplierId, setSelectedTabSupplierId] = useState<string>(purchaseSupplierIds[0] ?? '');
    const [showAdjustments, setShowAdjustments] = useState(false);
    const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

    // Active supplier ID
    const activeSupplierId = purchaseSupplierIds.includes(selectedTabSupplierId)
        ? selectedTabSupplierId
        : (purchaseSupplierIds[0] ?? '');

    // Function to calculate subtotal and items summary for a specific supplier
    const getSupplierDetails = (supplierId: string) => {
        if (hasExpiry && localBatches.length > 0) {
            const batches = localBatches.filter(b => b.supplierId === supplierId);
            const subtotal = safeCurrency(
                batches.reduce((sum, b) => sum + safeMul(Number(b.quantity || 0), Number(b.purchaseRate || 0), 6), 0)
            );
            const totalUnits = batches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
            return {
                subtotal,
                totalUnits,
                batchCount: batches.length,
            };
        }

        if (isMultiSupplier && watchedSupplierStocks.length > 0) {
            const entry = watchedSupplierStocks.find(s => s.supplierId === supplierId);
            const stock = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
            const cost = Number(entry?.cost || purchaseRate || 0);
            const subtotal = Number(entry?.totalPurchaseCost ?? safeCurrency(safeMul(stock, cost)));
            return {
                subtotal,
                totalUnits: stock,
                batchCount: 0,
            };
        }

        const stock = Number(quantity || 0);
        const rate = Number(purchaseRate || 0);
        const subtotal = safeCurrency(safeMul(stock, rate));
        return {
            subtotal,
            totalUnits: stock,
            batchCount: 0,
        };
    };

    const activeSupplier = suppliers.find(s => s.id === activeSupplierId);
    const activeSupplierName = activeSupplier?.name || 'Selected Supplier';

    const draft = supplierPurchaseDrafts[activeSupplierId] || {
        invoiceNumber: '',
        purchaseDate: new Date().toLocaleDateString('en-CA'),
        referenceNumber: '',
        discountMode: 'amount',
        discountAmount: '0',
        discountPercent: '0',
        taxMode: 'amount',
        taxAmount: '0',
        taxPercent: '0',
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        paidAmount: '0',
        notes: '',
    };

    const { subtotal, totalUnits } = getSupplierDetails(activeSupplierId);

    // Live calculation for discount & tax
    const discountNum = draft.discountMode === 'percent'
        ? safeCurrency(safeMul(subtotal, (Number(draft.discountPercent) || 0) / 100))
        : safeCurrency(Number(draft.discountAmount) || 0);

    const taxableBase = Math.max(0, subtotal - discountNum);

    const taxNum = draft.taxMode === 'percent'
        ? safeCurrency(safeMul(taxableBase, (Number(draft.taxPercent) || 0) / 100))
        : safeCurrency(Number(draft.taxAmount) || 0);

    const grandTotal = safeCurrency(Math.max(0, subtotal - discountNum + taxNum));

    // Live paid / due
    const currentPaid = draft.paymentStatus === 'paid'
        ? grandTotal
        : draft.paymentStatus === 'partial'
            ? Math.min(grandTotal, Math.max(0, Number(draft.paidAmount) || 0))
            : 0;

    const remainingDue = safeCurrency(Math.max(0, grandTotal - currentPaid));

    return (
        <div className="space-y-4 max-w-xl mx-auto">
            {/* Multi-Supplier Switcher Tabs */}
            {purchaseSupplierIds.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b">
                    {purchaseSupplierIds.map((supId) => {
                        const sup = suppliers.find(s => s.id === supId);
                        const supName = sup?.name || 'Supplier';
                        const supInfo = getSupplierDetails(supId);
                        const supDraft = supplierPurchaseDrafts[supId];
                        const status = supDraft?.paymentStatus || 'unpaid';
                        const isSelected = supId === activeSupplierId;

                        return (
                            <button
                                key={supId}
                                type="button"
                                onClick={() => setSelectedTabSupplierId(supId)}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border shrink-0',
                                    isSelected
                                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                                        : 'bg-card text-muted-foreground hover:bg-accent border-border/60'
                                )}
                            >
                                <Truck className="h-3 w-3" />
                                <span>{supName}</span>
                                <span className={cn(
                                    'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                                    isSelected
                                        ? 'bg-primary-foreground/20 text-primary-foreground'
                                        : 'bg-muted text-foreground'
                                )}>
                                    {format(supInfo.subtotal)}
                                </span>
                                <span className={cn(
                                    'text-[9px] uppercase font-bold tracking-wider px-1 rounded',
                                    status === 'paid' && 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
                                    status === 'partial' && 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
                                    status === 'unpaid' && 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                )}>
                                    {status}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Main Compact Card */}
            <Card className="border-border/80 shadow-xs">
                <CardContent className="p-4 sm:p-5 space-y-4">
                    {/* Header Summary Row */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                Supplier Purchase
                            </span>
                            <h4 className="text-base font-bold text-foreground truncate">
                                {activeSupplierName}
                            </h4>
                        </div>
                        <div className="text-right shrink-0">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                Stock In
                            </span>
                            <span className="text-sm font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                                {formatQtyDisplay(totalUnits)} {unit}
                            </span>
                        </div>
                    </div>

                    {/* Total & Quick Adjustments Banner */}
                    <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Total Amount
                            </span>
                            <div className="text-right">
                                <span className="text-2xl font-black tracking-tight text-foreground">
                                    {format(grandTotal)}
                                </span>
                                {(discountNum > 0 || taxNum > 0) && (
                                    <div className="text-[11px] text-muted-foreground space-x-1.5">
                                        <span>Base: {format(subtotal)}</span>
                                        {discountNum > 0 && <span className="text-emerald-600 dark:text-emerald-400">-{format(discountNum)}</span>}
                                        {taxNum > 0 && <span className="text-primary">+{format(taxNum)}</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Optional Discount/Tax inline toggle */}
                        <div className="pt-1 border-t border-border/40 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setShowAdjustments(prev => !prev)}
                                className="text-xs text-primary font-medium flex items-center gap-1 hover:underline cursor-pointer"
                            >
                                <Tag className="h-3 w-3" />
                                {discountNum > 0 || taxNum > 0 ? (
                                    <span>Discount & Tax applied ({format(discountNum)} / {format(taxNum)})</span>
                                ) : (
                                    <span>+ Add Discount or Tax</span>
                                )}
                                {showAdjustments ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {(discountNum > 0 || taxNum > 0) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        updatePurchaseDraft(activeSupplierId, 'discountAmount', '0');
                                        updatePurchaseDraft(activeSupplierId, 'discountPercent', '0');
                                        updatePurchaseDraft(activeSupplierId, 'taxAmount', '0');
                                        updatePurchaseDraft(activeSupplierId, 'taxPercent', '0');
                                    }}
                                    className="text-[11px] text-muted-foreground hover:text-destructive cursor-pointer"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {/* Expandable Minimal Discount & Tax Inputs */}
                        {showAdjustments && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-border/50">
                                {/* Discount */}
                                <div className="space-y-1 bg-background/60 p-2.5 rounded-lg border">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-muted-foreground">Discount</span>
                                        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                                            <button
                                                type="button"
                                                onClick={() => updatePurchaseDraft(activeSupplierId, 'discountMode', 'amount')}
                                                className={cn(
                                                    'px-1.5 py-0.5 text-[10px] font-semibold rounded',
                                                    draft.discountMode === 'amount' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
                                                )}
                                            >
                                                Rs.
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updatePurchaseDraft(activeSupplierId, 'discountMode', 'percent')}
                                                className={cn(
                                                    'px-1.5 py-0.5 text-[10px] font-semibold rounded',
                                                    draft.discountMode === 'percent' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
                                                )}
                                            >
                                                %
                                            </button>
                                        </div>
                                    </div>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={draft.discountMode === 'percent' ? draft.discountPercent : draft.discountAmount}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (draft.discountMode === 'percent') {
                                                updatePurchaseDraft(activeSupplierId, 'discountPercent', val);
                                            } else {
                                                updatePurchaseDraft(activeSupplierId, 'discountAmount', val);
                                            }
                                        }}
                                        placeholder="0"
                                        className="h-8 text-sm"
                                    />
                                </div>

                                {/* Tax */}
                                <div className="space-y-1 bg-background/60 p-2.5 rounded-lg border">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-muted-foreground">Tax</span>
                                        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                                            <button
                                                type="button"
                                                onClick={() => updatePurchaseDraft(activeSupplierId, 'taxMode', 'percent')}
                                                className={cn(
                                                    'px-1.5 py-0.5 text-[10px] font-semibold rounded',
                                                    draft.taxMode === 'percent' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
                                                )}
                                            >
                                                %
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updatePurchaseDraft(activeSupplierId, 'taxMode', 'amount')}
                                                className={cn(
                                                    'px-1.5 py-0.5 text-[10px] font-semibold rounded',
                                                    draft.taxMode === 'amount' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'
                                                )}
                                            >
                                                Rs.
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Input
                                            type="number"
                                            min="0"
                                            value={draft.taxMode === 'percent' ? draft.taxPercent : draft.taxAmount}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (draft.taxMode === 'percent') {
                                                    updatePurchaseDraft(activeSupplierId, 'taxPercent', val);
                                                } else {
                                                    updatePurchaseDraft(activeSupplierId, 'taxAmount', val);
                                                }
                                            }}
                                            placeholder="0"
                                            className="h-8 text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                updatePurchaseDraft(activeSupplierId, 'taxMode', 'percent');
                                                updatePurchaseDraft(activeSupplierId, 'taxPercent', '13');
                                            }}
                                            className={cn(
                                                'px-2 py-1 rounded text-[10px] font-bold border shrink-0',
                                                draft.taxMode === 'percent' && Number(draft.taxPercent) === 13
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                                            )}
                                        >
                                            13% VAT
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Payment Status Segmented Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
                            Payment Status
                        </label>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/50">
                            <button
                                type="button"
                                onClick={() => {
                                    updatePurchaseDraft(activeSupplierId, 'paymentStatus', 'unpaid');
                                    updatePurchaseDraft(activeSupplierId, 'paidAmount', '0');
                                }}
                                className={cn(
                                    'py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                                    draft.paymentStatus === 'unpaid'
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
                                    updatePurchaseDraft(activeSupplierId, 'paymentStatus', 'partial');
                                    if (!draft.paidAmount || draft.paidAmount === '0') {
                                        updatePurchaseDraft(activeSupplierId, 'paidAmount', String(safeCurrency(grandTotal * 0.5)));
                                    }
                                }}
                                className={cn(
                                    'py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                                    draft.paymentStatus === 'partial'
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
                                    updatePurchaseDraft(activeSupplierId, 'paymentStatus', 'paid');
                                    updatePurchaseDraft(activeSupplierId, 'paidAmount', String(grandTotal));
                                }}
                                className={cn(
                                    'py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5',
                                    draft.paymentStatus === 'paid'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Paid</span>
                            </button>
                        </div>
                    </div>

                    {/* Unpaid Info Note */}
                    {draft.paymentStatus === 'unpaid' && (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                            <span>
                                Recorded as unpaid credit. <strong>{format(grandTotal)}</strong> will be added to <strong>{activeSupplierName}</strong>'s balance.
                            </span>
                        </div>
                    )}

                    {/* Partial Amount Input & Due Calculation */}
                    {draft.paymentStatus === 'partial' && (
                        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">Amount Paid Now</span>
                                <span className="text-xs font-semibold text-muted-foreground">
                                    Remaining Due: <strong className="text-amber-600 dark:text-amber-400">{format(remainingDue)}</strong>
                                </span>
                            </div>
                            <Input
                                type="number"
                                min="0"
                                max={grandTotal}
                                value={draft.paidAmount}
                                onChange={e => updatePurchaseDraft(activeSupplierId, 'paidAmount', e.target.value)}
                                placeholder="0"
                                className="h-9 text-base font-bold bg-background"
                            />
                            <div className="flex items-center gap-1.5 pt-1">
                                {[0.25, 0.5, 0.75].map(ratio => {
                                    const presetVal = safeCurrency(grandTotal * ratio);
                                    return (
                                        <button
                                            key={ratio}
                                            type="button"
                                            onClick={() => updatePurchaseDraft(activeSupplierId, 'paidAmount', String(presetVal))}
                                            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-background border hover:bg-muted text-muted-foreground"
                                        >
                                            {ratio * 100}% ({format(presetVal)})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Payment Method Selector (Shown for Paid and Partial) */}
                    {(draft.paymentStatus === 'paid' || draft.paymentStatus === 'partial') && (
                        <div className="space-y-2.5 pt-1">
                            <PaymentMethodPicker
                                label="Payment Method"
                                selectedMethod={draft.paymentMethod || 'cash'}
                                onSelect={(method: string) => updatePurchaseDraft(activeSupplierId, 'paymentMethod', method)}
                            />
                            {draft.paymentMethod === 'bank' && (
                                <BankSelector
                                    selectedAccountId={draft.bankAccountId}
                                    onSelectAccountId={(id: string) => updatePurchaseDraft(activeSupplierId, 'bankAccountId', id)}
                                    label="Pay from Bank Account"
                                />
                            )}
                        </div>
                    )}

                    {/* Optional Collapsed Advanced Options (Invoice #, Date, Notes) */}
                    <div className="pt-2 border-t border-border/40">
                        <button
                            type="button"
                            onClick={() => setShowAdvancedDetails(prev => !prev)}
                            className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 cursor-pointer transition-colors"
                        >
                            {showAdvancedDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            <span>Invoice Number & Details (Optional)</span>
                        </button>

                        {showAdvancedDetails && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                                <label className="space-y-1 text-xs font-medium text-muted-foreground block">
                                    Invoice #
                                    <Input
                                        value={draft.invoiceNumber}
                                        onChange={e => updatePurchaseDraft(activeSupplierId, 'invoiceNumber', e.target.value)}
                                        placeholder="Auto-generated if blank"
                                        className="h-8 text-xs mt-1 bg-background"
                                    />
                                </label>
                                <label className="space-y-1 text-xs font-medium text-muted-foreground block">
                                    Purchase Date
                                    <Input
                                        type="date"
                                        value={draft.purchaseDate}
                                        onChange={e => updatePurchaseDraft(activeSupplierId, 'purchaseDate', e.target.value)}
                                        className="h-8 text-xs mt-1 bg-background"
                                    />
                                </label>
                                <label className="space-y-1 text-xs font-medium text-muted-foreground block sm:col-span-2">
                                    Notes
                                    <Input
                                        value={draft.notes}
                                        onChange={e => updatePurchaseDraft(activeSupplierId, 'notes', e.target.value)}
                                        placeholder="Delivery or bill notes"
                                        className="h-8 text-xs mt-1 bg-background"
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
});