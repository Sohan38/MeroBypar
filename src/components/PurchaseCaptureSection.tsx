import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PaymentMethodPicker } from '@/components/PaymentMethodPicker';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';
import {
    safeCurrency,
    safeMul,
    formatMoney,
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
    AlertCircle,
    CheckCircle2,
    Boxes,
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
    packUnit = 'pack',
}: PurchaseCaptureSectionProps) => {
    const { format } = useCurrency();
    const [selectedTabSupplierId, setSelectedTabSupplierId] = useState<string>(purchaseSupplierIds[0] ?? '');

    // Active supplier ID (fall back to first if current tab was removed)
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
                batches,
                subtotal,
                totalUnits,
                mode: 'batch' as const,
            };
        }

        if (isMultiSupplier && watchedSupplierStocks.length > 0) {
            const entry = watchedSupplierStocks.find(s => s.supplierId === supplierId);
            const stock = Number(entry?.baseQuantity ?? entry?.stock ?? 0);
            const cost = Number(entry?.cost || purchaseRate || 0);
            const subtotal = Number(entry?.totalPurchaseCost ?? safeCurrency(safeMul(stock, cost)));
            return {
                entry,
                subtotal,
                totalUnits: stock,
                mode: 'multi' as const,
            };
        }

        const stock = Number(quantity || 0);
        const rate = Number(purchaseRate || 0);
        const subtotal = safeCurrency(safeMul(stock, rate));
        return {
            subtotal,
            totalUnits: stock,
            mode: 'single' as const,
        };
    };

    if (purchaseSupplierIds.length === 0) {
        return (
            <div className="p-6 md:p-8 text-center text-sm text-muted-foreground">
                <p>No supplier selected. Please select a supplier or add a batch first.</p>
            </div>
        );
    }

    const currentSupplier = suppliers.find(s => s.id === activeSupplierId);
    const draft = supplierPurchaseDrafts[activeSupplierId] ?? {
        invoiceNumber: '',
        purchaseDate: new Date().toLocaleDateString('en-CA'),
        referenceNumber: '',
        discountMode: 'amount',
        discountAmount: '0',
        discountPercent: '0',
        taxMode: 'amount',
        taxAmount: '0',
        taxPercent: '13',
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        paidAmount: '0',
        notes: '',
    };

    const { batches, subtotal, totalUnits, mode } = getSupplierDetails(activeSupplierId);

    // Live Discount & Tax calculations
    const discountValue = draft.discountMode === 'percent'
        ? safeCurrency(safeMul(subtotal, (Math.max(0, Number(draft.discountPercent) || 0) / 100)))
        : Math.max(0, Number(draft.discountAmount) || 0);

    const taxableAmount = Math.max(0, subtotal - discountValue);

    const taxValue = draft.taxMode === 'percent'
        ? safeCurrency(safeMul(taxableAmount, (Math.max(0, Number(draft.taxPercent) || 0) / 100)))
        : Math.max(0, Number(draft.taxAmount) || 0);

    const grandTotal = safeCurrency(Math.max(0, subtotal - discountValue + taxValue));

    return (
        <div className="p-4 md:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
                        <Receipt className="h-5 w-5 text-primary" /> Purchase Configuration
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Configure payment status, taxes, discounts, and invoice details for this incoming stock.
                    </p>
                </div>
                {purchaseSupplierIds.length > 1 && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary self-start sm:self-auto">
                        {purchaseSupplierIds.length} Suppliers Active
                    </span>
                )}
            </div>

            {/* Multi-Supplier Navigation Tabs */}
            {purchaseSupplierIds.length > 1 && (
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                        Select Supplier to Configure:
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {purchaseSupplierIds.map(supId => {
                            const sup = suppliers.find(s => s.id === supId);
                            const supDraft = supplierPurchaseDrafts[supId];
                            const { subtotal: supSubtotal } = getSupplierDetails(supId);
                            const isActive = supId === activeSupplierId;
                            const statusColor = supDraft?.paymentStatus === 'paid'
                                ? 'text-green-600 dark:text-green-400'
                                : supDraft?.paymentStatus === 'partial'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-amber-600 dark:text-amber-400';

                            return (
                                <button
                                    key={supId}
                                    type="button"
                                    onClick={() => setSelectedTabSupplierId(supId)}
                                    className={cn(
                                        'flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all shrink-0',
                                        isActive
                                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                            : 'bg-background hover:bg-muted/60 text-foreground border-border'
                                    )}
                                >
                                    <Truck className={cn('h-3.5 w-3.5', isActive ? 'text-primary-foreground' : 'text-primary')} />
                                    <span className="font-semibold">{sup?.name || 'Supplier'}</span>
                                    <span className={cn('text-[11px] font-bold tabular-nums', isActive ? 'text-primary-foreground/90' : statusColor)}>
                                        {format(supSubtotal)}
                                    </span>
                                    {supDraft?.paymentStatus && (
                                        <span className={cn(
                                            'text-[9px] uppercase px-1.5 py-0.5 rounded font-bold',
                                            isActive
                                                ? 'bg-black/20 text-white'
                                                : 'bg-muted text-muted-foreground'
                                        )}>
                                            {supDraft.paymentStatus}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Main Purchase Card for Active Supplier */}
            <Card className="rounded-2xl border-border/80 shadow-xs overflow-hidden">
                <CardContent className="p-4 md:p-6 space-y-6">
                    {/* Supplier & Items Header Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-muted/40 border">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <Truck className="h-4.5 w-4.5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm leading-tight text-foreground">
                                    {currentSupplier?.name || 'Selected Supplier'}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {currentSupplier?.phone || currentSupplier?.email || 'Supplier document'}
                                </p>
                            </div>
                        </div>

                        {/* Stock breakdown pill */}
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <span className="text-xs text-muted-foreground font-medium">Stock from supplier:</span>
                            <span className="font-bold text-xs bg-background px-2.5 py-1 rounded-lg border text-foreground tabular-nums">
                                {formatQtyDisplay(totalUnits)} {unit}
                            </span>
                        </div>
                    </div>

                    {/* Stock / Batches provenance breakdown */}
                    {mode === 'batch' && batches && batches.length > 0 && (
                        <div className="space-y-2 rounded-xl bg-muted/20 border p-3 text-xs">
                            <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider block">
                                Batches Sourced From This Supplier:
                            </span>
                            <div className="space-y-1.5">
                                {batches.map((b, idx) => (
                                    <div key={b.id || idx} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                                        <div className="flex items-center gap-1.5">
                                            <Boxes className="h-3.5 w-3.5 text-primary" />
                                            <span className="font-medium text-foreground">
                                                {b.batchNumber ? `Batch #${b.batchNumber}` : `Batch ${idx + 1}`}
                                            </span>
                                            {b.packQuantity && b.packQuantity > 0 && (
                                                <span className="text-muted-foreground text-[11px]">
                                                    ({b.packQuantity} {packUnit}s)
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-right">
                                            <span className="text-muted-foreground">
                                                {b.quantity} {unit} @ Rs. {formatMoney(b.purchaseRate)}
                                            </span>
                                            <span className="font-bold text-foreground tabular-nums">
                                                {format(safeCurrency(safeMul(Number(b.quantity || 0), Number(b.purchaseRate || 0))))}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Section 1: Invoice Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <span className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-primary" /> Supplier Invoice #
                            </span>
                            <Input
                                value={draft.invoiceNumber}
                                onChange={e => updatePurchaseDraft(activeSupplierId, 'invoiceNumber', e.target.value)}
                                placeholder="e.g. SUP-2026-001"
                                className="h-10 text-sm font-medium bg-background"
                            />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <span className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-primary" /> Purchase Date
                            </span>
                            <Input
                                type="date"
                                value={draft.purchaseDate}
                                onChange={e => updatePurchaseDraft(activeSupplierId, 'purchaseDate', e.target.value)}
                                className="h-10 text-sm font-medium bg-background"
                            />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <span className="flex items-center gap-1.5">
                                <Hash className="h-3.5 w-3.5 text-primary" /> Reference Number
                            </span>
                            <Input
                                value={draft.referenceNumber}
                                onChange={e => updatePurchaseDraft(activeSupplierId, 'referenceNumber', e.target.value)}
                                placeholder="Optional PO or delivery ref"
                                className="h-10 text-sm font-medium bg-background"
                            />
                        </label>
                    </div>

                    {/* Section 2: Financial Breakdown (Subtotal, Discount, Tax, Grand Total) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                        {/* Left Column: Subtotal, Discount & Tax Controls */}
                        <div className="space-y-4">
                            {/* Subtotal Row */}
                            <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border text-sm">
                                <span className="text-muted-foreground font-semibold">Subtotal</span>
                                <span className="font-bold text-foreground tabular-nums text-base">{format(subtotal)}</span>
                            </div>

                            {/* Discount Section */}
                            <div className="space-y-2 rounded-xl bg-muted/40 p-3.5 border border-border/60">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                        <Tag className="h-3.5 w-3.5 text-primary" /> Discount
                                    </span>
                                    {/* Mode Toggle: Rs. vs % */}
                                    <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs font-medium shadow-2xs">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (draft.discountMode !== 'amount') {
                                                    updatePurchaseDraft(activeSupplierId, 'discountMode', 'amount');
                                                    updatePurchaseDraft(activeSupplierId, 'discountAmount', String(discountValue));
                                                }
                                            }}
                                            className={cn(
                                                'px-2 py-0.5 rounded-md transition-all text-[11px]',
                                                draft.discountMode === 'amount'
                                                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            Rs.
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (draft.discountMode !== 'percent') {
                                                    updatePurchaseDraft(activeSupplierId, 'discountMode', 'percent');
                                                    const pct = subtotal > 0 ? ((discountValue / subtotal) * 100).toFixed(1) : '0';
                                                    updatePurchaseDraft(activeSupplierId, 'discountPercent', pct);
                                                }
                                            }}
                                            className={cn(
                                                'px-2 py-0.5 rounded-md transition-all text-[11px]',
                                                draft.discountMode === 'percent'
                                                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            %
                                        </button>
                                    </div>
                                </div>

                                {/* Input with inline preview */}
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none pointer-events-none">
                                            {draft.discountMode === 'amount' ? 'Rs.' : '%'}
                                        </span>
                                        <Input
                                            type="number"
                                            min="0"
                                            step={draft.discountMode === 'amount' ? '0.01' : '0.1'}
                                            value={draft.discountMode === 'amount' ? draft.discountAmount : draft.discountPercent}
                                            onFocus={e => e.target.select()}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (draft.discountMode === 'amount') {
                                                    updatePurchaseDraft(activeSupplierId, 'discountAmount', val);
                                                } else {
                                                    updatePurchaseDraft(activeSupplierId, 'discountPercent', val);
                                                }
                                            }}
                                            placeholder="0"
                                            className="pl-8 h-9 text-xs font-medium text-right pr-2.5 bg-background"
                                        />
                                    </div>
                                    <div className="text-right min-w-[75px]">
                                        <span className={cn('text-xs font-bold tabular-nums', discountValue > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                                            -{format(discountValue)}
                                        </span>
                                        {draft.discountMode === 'amount' && subtotal > 0 && discountValue > 0 && (
                                            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                                                ({((discountValue / subtotal) * 100).toFixed(1)}%)
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Quick presets */}
                                {draft.discountMode === 'percent' ? (
                                    <div className="flex items-center gap-1 pt-0.5">
                                        <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Quick:</span>
                                        {[0, 5, 10, 15, 20].map(pct => (
                                            <button
                                                key={pct}
                                                type="button"
                                                onClick={() => updatePurchaseDraft(activeSupplierId, 'discountPercent', String(pct))}
                                                className={cn(
                                                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                                                    Number(draft.discountPercent) === pct
                                                        ? 'bg-primary text-primary-foreground font-semibold border-primary'
                                                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                                                )}
                                            >
                                                {pct}%
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 pt-0.5">
                                        <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Quick:</span>
                                        {[0, 100, 250, 500, 1000].map(amt => (
                                            <button
                                                key={amt}
                                                type="button"
                                                onClick={() => updatePurchaseDraft(activeSupplierId, 'discountAmount', String(amt))}
                                                className={cn(
                                                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                                                    Number(draft.discountAmount) === amt
                                                        ? 'bg-primary text-primary-foreground font-semibold border-primary'
                                                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                                                )}
                                            >
                                                {amt === 0 ? 'Clear' : `Rs.${amt}`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Tax Section */}
                            <div className="space-y-2 rounded-xl bg-muted/40 p-3.5 border border-border/60">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                        <Percent className="h-3.5 w-3.5 text-primary" /> Tax / VAT
                                    </span>
                                    {/* Mode Toggle: Rs. vs % */}
                                    <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs font-medium shadow-2xs">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (draft.taxMode !== 'amount') {
                                                    updatePurchaseDraft(activeSupplierId, 'taxMode', 'amount');
                                                    updatePurchaseDraft(activeSupplierId, 'taxAmount', String(taxValue));
                                                }
                                            }}
                                            className={cn(
                                                'px-2 py-0.5 rounded-md transition-all text-[11px]',
                                                draft.taxMode === 'amount'
                                                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            Rs.
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (draft.taxMode !== 'percent') {
                                                    updatePurchaseDraft(activeSupplierId, 'taxMode', 'percent');
                                                    const base = Math.max(0, subtotal - discountValue);
                                                    const pct = base > 0 ? ((taxValue / base) * 100).toFixed(1) : '13';
                                                    updatePurchaseDraft(activeSupplierId, 'taxPercent', pct);
                                                }
                                            }}
                                            className={cn(
                                                'px-2 py-0.5 rounded-md transition-all text-[11px]',
                                                draft.taxMode === 'percent'
                                                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                                    : 'text-muted-foreground hover:text-foreground'
                                            )}
                                        >
                                            %
                                        </button>
                                    </div>
                                </div>

                                {/* Input with inline preview */}
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none pointer-events-none">
                                            {draft.taxMode === 'amount' ? 'Rs.' : '%'}
                                        </span>
                                        <Input
                                            type="number"
                                            min="0"
                                            step={draft.taxMode === 'amount' ? '0.01' : '0.1'}
                                            value={draft.taxMode === 'amount' ? draft.taxAmount : draft.taxPercent}
                                            onFocus={e => e.target.select()}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (draft.taxMode === 'amount') {
                                                    updatePurchaseDraft(activeSupplierId, 'taxAmount', val);
                                                } else {
                                                    updatePurchaseDraft(activeSupplierId, 'taxPercent', val);
                                                }
                                            }}
                                            placeholder="0"
                                            className="pl-8 h-9 text-xs font-medium text-right pr-2.5 bg-background"
                                        />
                                    </div>
                                    <div className="text-right min-w-[75px]">
                                        <span className="text-xs font-bold tabular-nums text-foreground">
                                            +{format(taxValue)}
                                        </span>
                                        {draft.taxMode === 'amount' && taxableAmount > 0 && taxValue > 0 && (
                                            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                                                ({((taxValue / taxableAmount) * 100).toFixed(1)}%)
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Quick presets for tax */}
                                {draft.taxMode === 'percent' && (
                                    <div className="flex items-center gap-1 pt-0.5">
                                        <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Quick:</span>
                                        {[
                                            { label: '0%', val: 0 },
                                            { label: '5%', val: 5 },
                                            { label: '13% VAT', val: 13 },
                                        ].map(preset => (
                                            <button
                                                key={preset.val}
                                                type="button"
                                                onClick={() => updatePurchaseDraft(activeSupplierId, 'taxPercent', String(preset.val))}
                                                className={cn(
                                                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                                                    Number(draft.taxPercent) === preset.val
                                                        ? 'bg-primary text-primary-foreground font-semibold border-primary'
                                                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                                                )}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column: Grand Total & Payment Method & Status */}
                        <div className="space-y-4">
                            {/* Grand Total Highlight Box */}
                            <div className="rounded-2xl bg-primary/[0.06] dark:bg-primary/[0.12] border border-primary/25 p-4 space-y-1">
                                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                                    <span>Grand Total for {currentSupplier?.name || 'Supplier'}</span>
                                    <span className="text-[10px] font-normal text-primary">
                                        {totalUnits} units total
                                    </span>
                                </div>
                                <div className="text-2xl font-black text-primary tracking-tight tabular-nums">
                                    {format(grandTotal)}
                                </div>
                            </div>

                            {/* Payment Method - using PaymentMethodPicker */}
                            <div className="space-y-3">
                                <PaymentMethodPicker
                                    label="Payment Method"
                                    selectedMethod={draft.paymentMethod}
                                    onSelect={method => updatePurchaseDraft(activeSupplierId, 'paymentMethod', method)}
                                    methods={['cash', 'qr', 'card', 'bank', 'split', 'other']}
                                />

                                {/* Payment Status Segmented Picker */}
                                <div className="space-y-2 pt-1">
                                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">
                                        Payment Status
                                    </label>
                                    <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-muted/60 border">
                                        <button
                                            type="button"
                                            onClick={() => updatePurchaseDraft(activeSupplierId, 'paymentStatus', 'unpaid')}
                                            className={cn(
                                                'py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center justify-center gap-0.5',
                                                draft.paymentStatus === 'unpaid'
                                                    ? 'bg-amber-600 text-white shadow-xs'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                            )}
                                        >
                                            <span>Unpaid</span>
                                            <span className="text-[9px] opacity-85 font-normal">On Credit</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                updatePurchaseDraft(activeSupplierId, 'paymentStatus', 'partial');
                                                if (!draft.paidAmount || Number(draft.paidAmount) === 0) {
                                                    updatePurchaseDraft(activeSupplierId, 'paidAmount', String(safeCurrency(grandTotal / 2)));
                                                }
                                            }}
                                            className={cn(
                                                'py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center justify-center gap-0.5',
                                                draft.paymentStatus === 'partial'
                                                    ? 'bg-blue-600 text-white shadow-xs'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                            )}
                                        >
                                            <span>Partial</span>
                                            <span className="text-[9px] opacity-85 font-normal">Split / Due</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updatePurchaseDraft(activeSupplierId, 'paymentStatus', 'paid')}
                                            className={cn(
                                                'py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center justify-center gap-0.5',
                                                draft.paymentStatus === 'paid'
                                                    ? 'bg-green-600 text-white shadow-xs'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                            )}
                                        >
                                            <span>Paid</span>
                                            <span className="text-[9px] opacity-85 font-normal">In Full</span>
                                        </button>
                                    </div>

                                    {/* Status-specific breakdown & Partial input */}
                                    {draft.paymentStatus === 'partial' ? (
                                        <div className="space-y-2 rounded-xl border p-3 bg-muted/30">
                                            <div className="flex items-center justify-between text-xs font-medium">
                                                <span className="text-muted-foreground">Amount Paid</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                                                    Due: {format(Math.max(0, grandTotal - (Number(draft.paidAmount) || 0)))}
                                                </span>
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none select-none">
                                                    Rs.
                                                </span>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max={grandTotal}
                                                    step="0.01"
                                                    value={draft.paidAmount}
                                                    onFocus={e => e.target.select()}
                                                    onChange={e => updatePurchaseDraft(activeSupplierId, 'paidAmount', e.target.value)}
                                                    className="pl-9 h-9 text-xs font-semibold bg-background"
                                                />
                                            </div>
                                            {/* Quick partial chips */}
                                            <div className="flex items-center gap-1 pt-0.5">
                                                <span className="text-[10px] text-muted-foreground mr-0.5 font-medium">Preset:</span>
                                                {[
                                                    { label: '25%', factor: 0.25 },
                                                    { label: '50%', factor: 0.5 },
                                                    { label: '75%', factor: 0.75 },
                                                ].map(preset => (
                                                    <button
                                                        key={preset.label}
                                                        type="button"
                                                        onClick={() => updatePurchaseDraft(activeSupplierId, 'paidAmount', String(safeCurrency(grandTotal * preset.factor)))}
                                                        className="text-[10px] px-2 py-0.5 rounded border bg-background hover:bg-muted text-muted-foreground"
                                                    >
                                                        {preset.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : draft.paymentStatus === 'unpaid' ? (
                                        <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                            <div>
                                                <p className="font-semibold leading-tight">Supplier Payable</p>
                                                <p className="text-[11px] opacity-90 mt-0.5">
                                                    Full {format(grandTotal)} will be added to {currentSupplier?.name ? `${currentSupplier.name}'s` : "supplier's"} credit balance.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-green-200/60 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900/50 p-2.5 text-xs text-green-800 dark:text-green-300 flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                                            <span className="font-medium text-[11px]">Paid in full via {draft.paymentMethod.toUpperCase()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Notes */}
                    <div className="pt-2 border-t">
                        <label className="space-y-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
                            Purchase Document Notes
                            <Textarea
                                value={draft.notes}
                                onChange={e => updatePurchaseDraft(activeSupplierId, 'notes', e.target.value)}
                                placeholder="Delivery notes, terms, or condition from supplier"
                                rows={2}
                                className="mt-1 text-sm bg-background"
                            />
                        </label>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
});