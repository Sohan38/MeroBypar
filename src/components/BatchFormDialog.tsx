// BatchFormDialog.tsx
// Merged version: preserves supplier invoice on edit & auto‑generates on add.

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  FlaskConical,
  Save,
  Wand2,
  X,
  Boxes,
} from 'lucide-react';
import { ProductBatch, Supplier, BatchFormData } from '@/types';
import { cn } from '@/lib/utils';
import {
  addMonths,
  format as fmtDate,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from 'date-fns';
import { useBackModal } from '@/contexts/NavigationContext';
import { rankSearch } from '@/utils/search/rank';
import {
  generateBatchNumber,
  generateSupplierInvoiceNumber,
} from '@/utils/numbering';
import {
  safeCurrency,
  safeQty,
  safeMul,
  safeDiv,
  formatMoney,
  formatQtyDisplay,
} from '@/utils/unitUtils';

const batchSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  batchNumber: z.string().min(1, 'Batch number is required'),
  manufacturingDate: z.string().min(1, 'Manufacturing date is required'),
  expiryMode: z.enum(['months', 'manual']),
  expiryMonths: z.coerce.number().min(1, 'Must be at least 1 month').optional(),
  expiryDate: z.string().optional(),
  initialQuantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  purchaseRate: z.coerce.number().min(0, 'Purchase rate cannot be negative'),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  const today = startOfDay(new Date());
  const mfgDate = parseISO(data.manufacturingDate);

  if (isAfter(mfgDate, today)) {
    ctx.addIssue({
      code: 'custom',
      path: ['manufacturingDate'],
      message: 'Manufacturing date cannot be in the future',
    });
  }

  if (data.expiryMode === 'months') {
    if (!data.expiryMonths || data.expiryMonths < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiryMonths'],
        message: 'Enter a valid shelf life in months',
      });
    }
  }

  if (data.expiryMode === 'manual') {
    if (!data.expiryDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['expiryDate'],
        message: 'Expiry date is required',
      });
    } else {
      const expDate = parseISO(data.expiryDate);

      if (!isAfter(expDate, mfgDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['expiryDate'],
          message: 'Expiry date must be after manufacturing date',
        });
      }
    }
  }
});

type BatchFormValues = z.infer<typeof batchSchema>;

export function computeExpiryDate(mfgDate: string, months: number): string {
  return addMonths(parseISO(mfgDate), months).toISOString().split('T')[0];
}

export function getBatchStatus(
  expiryDate: string | null,
): 'expired' | 'expiring' | 'ok' | 'none' {
  if (!expiryDate) return 'none';

  const today = startOfDay(new Date());
  const exp = startOfDay(parseISO(expiryDate));

  if (isBefore(exp, today)) return 'expired';

  const warn = addMonths(today, 1);
  if (isBefore(exp, warn)) return 'expiring';

  return 'ok';
}

export function ExpiryBadge({
  expiryDate,
}: {
  expiryDate: string | null;
}) {
  const status = getBatchStatus(expiryDate);

  if (status === 'none') return null;

  if (status === 'expired') {
    return (
      <Badge
        variant="destructive"
        className="text-[10px] py-0 px-1.5"
      >
        Expired
      </Badge>
    );
  }

  if (status === 'expiring') {
    return (
      <Badge className="text-[10px] py-0 px-1.5 bg-orange-500/10 text-orange-600 border-orange-300">
        Expiring Soon
      </Badge>
    );
  }

  return (
    <Badge className="text-[10px] py-0 px-1.5 bg-green-500/10 text-green-700 border-green-300">
      Good
    </Badge>
  );
}

interface BatchFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (batch: BatchFormData) => void;
  suppliers: Supplier[];
  productId: string;
  editBatch?: ProductBatch | null;
  isNew: boolean;
  nextBatchNumber: string;
  productName?: string;
  existingBatches?: ProductBatch[];
  existingPurchases?: Array<{
    id: string | undefined;
    invoiceNumber?: string | null;
    date?: string | null;
  }>;
  packSize?: number | null;
  packUnit?: string | null;
  baseUnit?: string | null;
  onUpdatePack?: (size: number, unit: string) => void;
}

export function BatchFormDialog({
  open,
  onClose,
  onSave,
  suppliers,
  productId,
  editBatch,
  isNew,
  nextBatchNumber,
  productName,
  existingBatches = [],
  existingPurchases = [],
  packSize,
  packUnit,
  baseUnit,
  onUpdatePack,
}: BatchFormDialogProps) {
  const hasPack = Boolean(packSize && Number(packSize) > 0);
  const safePackSize = hasPack ? Number(packSize) : 1;
  const pUnit = packUnit || 'pack';
  const bUnit = baseUnit || 'pcs';

  const [batchUnitMode, setBatchUnitMode] = useState<'pack' | 'base'>('pack');
  const [packQtyInput, setPackQtyInput] = useState<string>('1');
  const [packRateInput, setPackRateInput] = useState<string>('');
  const [showInlinePackSetup, setShowInlinePackSetup] = useState(false);
  const [inlinePackSize, setInlinePackSize] = useState<string>('30');
  const [previewExpiry, setPreviewExpiry] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');

  // Resolve the invoice number for the batch being edited.
  // Fall back to purchaseInvoiceId if the actual invoice number hasn't loaded yet.
  const editBatchInvoiceNumber = useMemo(() => {
    if (!editBatch?.purchaseInvoiceId) return '';

    const purchase = existingPurchases.find(
      (item) => item.id === editBatch.purchaseInvoiceId,
    );

    return purchase?.invoiceNumber ?? editBatch.purchaseInvoiceId;
  }, [editBatch?.purchaseInvoiceId, existingPurchases]);

  const selectableSuppliers = useMemo(() => {
    const query = filterQuery.trim();

    if (!query) {
      return suppliers.slice(0, 5);
    }

    return rankSearch(suppliers, query, 10);
  }, [suppliers, filterQuery]);

  useBackModal(open, onClose, 'batch-form-dialog');

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      supplierId: editBatch?.supplierId ?? '',
      batchNumber: editBatch?.batchNumber ?? nextBatchNumber,
      manufacturingDate:
        editBatch?.manufacturingDate?.split('T')[0] ?? '',
      expiryMode: editBatch?.expiryMonths ? 'months' : 'manual',
      expiryMonths: editBatch?.expiryMonths ?? undefined,
      expiryDate: editBatch?.expiryDate?.split('T')[0] ?? '',
      initialQuantity: editBatch?.initialQuantity ?? (hasPack ? safePackSize : 1),
      purchaseRate: editBatch?.purchaseRate ?? 0,
      notes: editBatch?.notes ?? '',
    },
  });

  const expiryMode = form.watch('expiryMode');
  const mfgDate = form.watch('manufacturingDate');
  const expiryMonths = form.watch('expiryMonths');
  const selectedSupplierId = form.watch('supplierId');

  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === selectedSupplierId,
  );

  // Expiry preview
  useEffect(() => {
    if (
      expiryMode === 'months' &&
      mfgDate &&
      expiryMonths &&
      expiryMonths > 0
    ) {
      try {
        setPreviewExpiry(
          computeExpiryDate(mfgDate, Number(expiryMonths)),
        );
      } catch {
        setPreviewExpiry(null);
      }
    } else {
      setPreviewExpiry(null);
    }
  }, [expiryMode, mfgDate, expiryMonths]);

  // Reset form when dialog opens / edit batch changes
  useEffect(() => {
    if (!open) return;

    const initialQty = editBatch?.initialQuantity ?? (hasPack ? safePackSize : 1);
    const initialRate = editBatch?.purchaseRate ?? 0;

    form.reset({
      supplierId: editBatch?.supplierId ?? '',
      batchNumber: editBatch?.batchNumber ?? nextBatchNumber,
      manufacturingDate:
        editBatch?.manufacturingDate?.split('T')[0] ?? '',
      expiryMode: editBatch?.expiryMonths ? 'months' : 'manual',
      expiryMonths: editBatch?.expiryMonths ?? undefined,
      expiryDate: editBatch?.expiryDate?.split('T')[0] ?? '',
      initialQuantity: initialQty,
      purchaseRate: initialRate,
      notes: editBatch?.notes ?? '',
    });

    if (hasPack) {
      setBatchUnitMode('pack');
      const pQty = safePackSize > 0 ? safeDiv(initialQty, safePackSize, 3) : 1;
      setPackQtyInput(formatQtyDisplay(pQty));
      const pRate = safePackSize > 0 && initialRate > 0 ? safeMul(initialRate, safePackSize) : 0;
      setPackRateInput(pRate > 0 ? formatQtyDisplay(pRate, 2) : '');
    } else {
      setBatchUnitMode('base');
      setPackQtyInput('1');
      setPackRateInput('');
    }

    setShowInlinePackSetup(false);

    // For edit mode, restore the supplier invoice.
    // For add mode, clear it until a supplier is picked.
    if (editBatch) {
      setSupplierInvoiceNumber(editBatchInvoiceNumber);
    } else {
      setSupplierInvoiceNumber('');
    }

    setFilterQuery('');
  }, [
    open,
    editBatch,
    editBatchInvoiceNumber,
    nextBatchNumber,
    form,
    hasPack,
    safePackSize,
  ]);

  // When adding, auto‑generate batch number & invoice on supplier selection
  useEffect(() => {
    if (!open) return;

    // Editing an existing batch → never regenerate identifiers
    if (editBatch) return;

    // No supplier selected → clear the generated values
    if (!selectedSupplierId) {
      form.setValue('batchNumber', '', {
        shouldDirty: true,
        shouldValidate: false,
      });
      setSupplierInvoiceNumber('');
      return;
    }

    // Generate new identifiers
    const generatedBatchNumber = generateBatchNumber(existingBatches, {
      productName,
      supplierName: selectedSupplier?.name ?? '',
      date: new Date(),
    });

    const generatedInvoiceNumber = generateSupplierInvoiceNumber(
      existingPurchases,
      selectedSupplier?.name ?? '',
      new Date(),
    );

    form.setValue('batchNumber', generatedBatchNumber, {
      shouldDirty: true,
      shouldValidate: false,
    });

    setSupplierInvoiceNumber(generatedInvoiceNumber);
  }, [
    open,
    editBatch,
    existingBatches,
    existingPurchases,
    form,
    productName,
    selectedSupplier,
    selectedSupplierId,
  ]);

  const onSubmit = (data: BatchFormValues) => {
    let finalExpiryDate: string | null = null;
    let finalExpiryMonths: number | null = null;

    if (
      data.expiryMode === 'months' &&
      data.expiryMonths &&
      mfgDate
    ) {
      finalExpiryMonths = data.expiryMonths;
      finalExpiryDate = computeExpiryDate(
        mfgDate,
        data.expiryMonths,
      );
    } else if (
      data.expiryMode === 'manual' &&
      data.expiryDate
    ) {
      finalExpiryDate = data.expiryDate;
      finalExpiryMonths = null;
    }

    onSave({
      productId,
      supplierId: data.supplierId,
      batchNumber: data.batchNumber,
      manufacturingDate: data.manufacturingDate,
      expiryMonths: finalExpiryMonths,
      expiryDate: finalExpiryDate,
      initialQuantity: data.initialQuantity,
      quantity: editBatch
        ? Math.max(
          0,
          editBatch.quantity +
          (data.initialQuantity - editBatch.initialQuantity),
        )
        : data.initialQuantity,
      purchaseRate: data.purchaseRate,
      notes: data.notes ?? '',
    });

    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            {editBatch ? 'Edit Batch' : 'Add New Batch'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => {
                const fieldSupplier = suppliers.find(
                  (supplier) => supplier.id === field.value,
                );

                return (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Supplier *
                    </FormLabel>

                    <FormControl>
                      {fieldSupplier ? (
                        <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-2.5 border-border">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                              {fieldSupplier.name
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <span className="text-sm font-medium">
                              {fieldSupplier.name}
                            </span>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full hover:bg-destructive/15 hover:text-destructive text-muted-foreground"
                            onClick={() => field.onChange('')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="relative">
                            <Input
                              placeholder="Type to search suppliers..."
                              value={filterQuery}
                              onChange={(event) =>
                                setFilterQuery(event.target.value)
                              }
                              className="h-9 text-sm rounded-xl"
                            />

                            {filterQuery && (
                              <button
                                type="button"
                                onClick={() => setFilterQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto py-1">
                            {selectableSuppliers.map((supplier) => (
                              <button
                                key={supplier.id}
                                type="button"
                                onClick={() => {
                                  field.onChange(supplier.id);
                                  setFilterQuery('');
                                }}
                                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border bg-muted/50 border-border text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all select-none"
                              >
                                {supplier.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </FormControl>

                    <FormMessage className="text-xs" />
                  </FormItem>
                );
              }}
            />

            <div className="grid grid-cols-1 gap-3">
              <label className="space-y-1 text-sm font-medium">
                Supplier invoice / SKU
                <Input
                  value={supplierInvoiceNumber}
                  readOnly
                  placeholder="Auto-generated after supplier selection"
                  className="h-9 bg-muted/40"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="batchNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Batch No. *
                    </FormLabel>

                    <FormControl>
                      <Input
                        placeholder="B-2024-001"
                        {...field}
                        className="h-9"
                      />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="manufacturingDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Mfg. Date *
                    </FormLabel>

                    <FormControl>
                      <Input
                        type="date"
                        max={new Date().toISOString().split('T')[0]}
                        {...field}
                        className="h-9"
                      />
                    </FormControl>

                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Expiry Date Mode
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    form.setValue('expiryMode', 'months')
                  }
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${expiryMode === 'months'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                    }`}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto (months)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    form.setValue('expiryMode', 'manual')
                  }
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${expiryMode === 'manual'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                    }`}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Manual date
                </button>
              </div>
            </div>

            {expiryMode === 'months' ? (
              <FormField
                control={form.control}
                name="expiryMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Shelf Life (months after manufacturing) *
                    </FormLabel>

                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        placeholder="e.g. 12"
                        {...field}
                      />
                    </FormControl>

                    {previewExpiry && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        Expiry:
                        <span className="font-semibold text-foreground ml-1">
                          {fmtDate(
                            parseISO(previewExpiry),
                            'dd MMM yyyy',
                          )}
                        </span>
                        <ExpiryBadge expiryDate={previewExpiry} />
                      </p>
                    )}

                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="expiryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date *</FormLabel>

                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                      />
                    </FormControl>

                    {field.value && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <ExpiryBadge expiryDate={field.value} />
                      </p>
                    )}

                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Inline carton setup prompt if not yet enabled */}
            {!hasPack && isNew && onUpdatePack && (
              <div className="p-2.5 rounded-xl bg-muted/40 border text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Boxes className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium text-foreground">Receiving in Cartons / Bulk?</span>
                  </div>
                  {!showInlinePackSetup ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setShowInlinePackSetup(true)}
                    >
                      Enable Cartons
                    </Button>
                  ) : null}
                </div>
                {showInlinePackSetup && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    <span className="text-[11px] text-muted-foreground shrink-0">1 carton =</span>
                    <Input
                      type="number"
                      min={2}
                      placeholder="e.g. 30"
                      value={inlinePackSize}
                      onChange={(e) => setInlinePackSize(e.target.value)}
                      className="h-7 text-xs w-24 bg-background"
                      autoFocus
                    />
                    <span className="text-[11px] text-muted-foreground shrink-0">{bUnit}</span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs px-2.5 ml-auto"
                      onClick={() => {
                        const sz = Number(inlinePackSize);
                        if (sz > 1) {
                          onUpdatePack(sz, 'carton');
                        }
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Pack Mode Switcher / Conversion Header */}
            {hasPack && (
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/40 border text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Boxes className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-semibold text-foreground truncate">
                    1 {pUnit} = {safePackSize} {bUnit}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-background p-0.5 rounded-lg border shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchUnitMode('pack');
                      const curQty = Number(form.getValues('initialQuantity')) || 0;
                      const pQ = safePackSize > 0 ? safeDiv(curQty, safePackSize, 3) : 1;
                      setPackQtyInput(formatQtyDisplay(pQ));
                      const curRate = Number(form.getValues('purchaseRate')) || 0;
                      const pR = safePackSize > 0 && curRate > 0 ? safeMul(curRate, safePackSize) : 0;
                      setPackRateInput(pR > 0 ? formatQtyDisplay(pR, 2) : '');
                    }}
                    className={cn(
                      "px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all",
                      batchUnitMode === 'pack'
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    By {pUnit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchUnitMode('base')}
                    className={cn(
                      "px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all",
                      batchUnitMode === 'base'
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    By {bUnit}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="initialQuantity"
                render={({ field }) => {
                  const currentQtyVal = Number(field.value) || 0;

                  return (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                        <span>{hasPack && batchUnitMode === 'pack' ? `${pUnit}s *` : 'Quantity *'}</span>
                        {hasPack && batchUnitMode === 'pack' && currentQtyVal > 0 && (
                          <span className="text-[10px] font-normal lowercase tracking-normal tabular-nums">
                            = {currentQtyVal} {bUnit}
                          </span>
                        )}
                      </FormLabel>

                      <FormControl>
                        {hasPack && batchUnitMode === 'pack' ? (
                          <Input
                            type="number"
                            min="0.01"
                            step="any"
                            placeholder="1"
                            value={packQtyInput}
                            onChange={(event) => {
                              const text = event.target.value;
                              setPackQtyInput(text);
                              const num = text === '' ? 0 : Number(text);
                              const basePcs = safeQty(safeMul(num, safePackSize));
                              field.onChange(basePcs);
                            }}
                            className="h-9"
                            readOnly={!isNew}
                            disabled={!isNew}
                          />
                        ) : (
                          <Input
                            type="number"
                            min="1"
                            step="any"
                            placeholder="0"
                            value={field.value === 0 ? '' : field.value}
                            onChange={(event) => {
                              const rawVal = event.target.value === '' ? 0 : Number(event.target.value);
                              field.onChange(rawVal);
                              if (safePackSize > 0) {
                                const pQ = safeDiv(rawVal, safePackSize, 3);
                                setPackQtyInput(formatQtyDisplay(pQ));
                              }
                            }}
                            className="h-9"
                            readOnly={!isNew}
                            disabled={!isNew}
                          />
                        )}
                      </FormControl>

                      {!isNew && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Stock adjustments are managed separately for existing products.
                        </p>
                      )}

                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="purchaseRate"
                render={({ field }) => {
                  const currentRateVal = Number(field.value) || 0;

                  return (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                        <span>{hasPack && batchUnitMode === 'pack' ? `Cost / ${pUnit}` : 'Purchase Rate'}</span>
                        {hasPack && batchUnitMode === 'pack' && currentRateVal > 0 && (
                          <span className="text-[10px] font-normal lowercase tracking-normal tabular-nums">
                            Rs. {formatMoney(currentRateVal)}/{bUnit}
                          </span>
                        )}
                      </FormLabel>

                      <FormControl>
                        {hasPack && batchUnitMode === 'pack' ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={packRateInput}
                            onChange={(event) => {
                              const text = event.target.value;
                              setPackRateInput(text);
                              const num = text === '' ? 0 : Number(text);
                              const baseCost = safePackSize > 0 ? safeDiv(num, safePackSize, 6) : 0;
                              field.onChange(safeCurrency(baseCost));
                            }}
                            className="h-9"
                            readOnly={!isNew}
                            disabled={!isNew}
                          />
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            value={field.value === 0 ? '' : field.value}
                            onChange={(event) => {
                              const rawVal = event.target.value === '' ? 0 : Number(event.target.value);
                              field.onChange(rawVal);
                              if (safePackSize > 0 && rawVal > 0) {
                                const pR = safeMul(rawVal, safePackSize);
                                setPackRateInput(formatQtyDisplay(pR, 2));
                              }
                            }}
                            className="h-9"
                            readOnly={!isNew}
                            disabled={!isNew}
                          />
                        )}
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            {(() => {
              const initQty = Number(form.watch('initialQuantity') || 0);
              const pRate = Number(form.watch('purchaseRate') || 0);
              const isPackMode = hasPack && batchUnitMode === 'pack' && Number(packQtyInput) > 0 && Number(packRateInput) > 0;
              const totalCost = isPackMode
                ? safeCurrency(safeMul(Number(packQtyInput), Number(packRateInput)))
                : safeCurrency(safeMul(initQty, pRate));

              if ((initQty <= 0 && (!isPackMode || Number(packQtyInput) <= 0)) || (totalCost <= 0 && pRate <= 0)) {
                return null;
              }

              return (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/30 border text-xs">
                  <span className="text-muted-foreground">Batch Total Cost:</span>
                  <span className="font-bold text-foreground tabular-nums">
                    Rs. {formatMoney(totalCost)}
                    {hasPack && batchUnitMode === 'pack' && Number(packQtyInput) > 0 && (
                      <span className="text-[10px] font-normal text-muted-foreground ml-1.5">
                        ({formatQtyDisplay(packQtyInput)} {pUnit}{Number(packQtyInput) === 1 ? '' : 's'} × Rs. {formatMoney(packRateInput || 0)})
                      </span>
                    )}
                  </span>
                </div>
              );
            })()}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>

                  <FormControl>
                    <Textarea
                      placeholder="Any notes about this batch..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                Cancel
              </Button>

              <Button type="submit">
                <Save className="h-4 w-4 mr-1" />
                Save Batch
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}