import { useMemo } from 'react';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { ProductFormValues } from '../types';
import { ProductIdentitySection } from '../ProductIdentitySection';
import { BatchSection } from '../BatchSection';
import { VariantSection } from '../VariantSection';
import { SupplierSection } from '../SupplierSection';
import { PricingSection } from '../PricingSection';
import { StockSection } from '../StockSection';
import { NotesSection } from '../NotesSection';
import { ProductCapabilitiesSection } from '../ProductCapabilitiesSection';
import { PurchaseCaptureSection } from '@/components/PurchaseCaptureSection';


export interface StepDefinition {
    id: string;
    label: string;
    content: React.ReactNode;
    fields?: string[];
}

interface InventoryFormStepsInput {
    isNew: boolean;
    existingProduct: any;
    existingCategories: string[];
    existingBrands: string[];
    existingProductNameLookup: Set<string>;
    existingBarcodes: string[];
    isExpiryEnabled: boolean;
    isBatchesEnabled: boolean;
    hasExpiry: boolean;
    handleToggleExpiry: (checked: boolean) => void;
    localBatches: any[];
    handleAddBatch: () => void;
    handleEditBatch: (batch: any) => void;
    handleDeleteBatch: (bid: string) => void;
    isVariantsEnabled: boolean;
    hasVariants: boolean;
    handleToggleVariants: (checked: boolean) => void;
    suppliers: any[];
    purchases: any[];
    watchedSupplierIds: string[];
    averagePurchaseRate: number;
    isMultiSupplier: boolean;
    totalBatchQuantity: number;
    totalVariantQuantity: number;
    totalSupplierStockQuantity: number;
    showPurchaseCreationSection: boolean;
    purchaseSupplierIds: string[];
    supplierPurchaseDrafts: Record<string, any>;
    updatePurchaseDraft: (supplierId: string, field: string, value: string) => void;
    setSupplierPresetName: (name: string) => void;
    setSupplierDialogOpen: (open: boolean) => void;
}

export function useInventoryFormSteps(
    form: UseFormReturn<ProductFormValues>,
    input: InventoryFormStepsInput,
    setActiveStep: (step: number) => void
) {
    const {
        isNew, existingProduct, existingCategories, existingBrands, existingProductNameLookup, existingBarcodes,
        isExpiryEnabled, isBatchesEnabled, hasExpiry, handleToggleExpiry,
        localBatches, handleAddBatch, handleEditBatch, handleDeleteBatch,
        isVariantsEnabled, hasVariants, handleToggleVariants,
        suppliers, purchases, watchedSupplierIds,
        averagePurchaseRate, isMultiSupplier,
        totalBatchQuantity, totalVariantQuantity, totalSupplierStockQuantity,
        showPurchaseCreationSection, purchaseSupplierIds,
        supplierPurchaseDrafts, updatePurchaseDraft,
        setSupplierPresetName, setSupplierDialogOpen,
    } = input;

    const watchedVariants = form.watch('variants') || [];
    const quantity = form.watch('quantity') ?? 0;

    const steps = useMemo(() => {
        const result: StepDefinition[] = [];

        result.push({
            id: 'identity',
            label: 'Product',
            content: (
                <ProductIdentitySection
                    form={form}
                    isNew={isNew}
                    existingCategories={existingCategories}
                    existingBrands={existingBrands}
                    existingNameLookup={existingProductNameLookup}
                    existingBarcodes={existingBarcodes}
                />
            ),
            fields: ['name', 'category', 'barcode', 'brand', 'imageBase64'],
        });

        result.push({
            id: 'inventory',
            label: 'Inventory',
            content: (
                <>
                    <BatchSection
                        form={form}
                        isExpiryEnabled={isExpiryEnabled}
                        isBatchesEnabled={isBatchesEnabled}
                        hasExpiry={hasExpiry}
                        onToggleExpiry={handleToggleExpiry}
                        localBatches={localBatches}
                        onAddBatch={handleAddBatch}
                        onEditBatch={handleEditBatch}
                        onDeleteBatch={handleDeleteBatch}
                        isNew={isNew}
                    />
                    <Separator className="my-0" />
                    <VariantSection
                        form={form}
                        isVariantsEnabled={isVariantsEnabled}
                        hasVariants={hasVariants}
                        onToggleVariants={handleToggleVariants}
                    />
                </>
            ),
            fields: ['hasExpiry', 'hasVariants', 'variants'],
        });

        result.push({
            id: 'pricing-stock',
            label: 'Pricing & Stock',
            content: (
                <>
                    <PricingSection
                        form={form}
                        hasExpiry={hasExpiry}
                        averagePurchaseRate={averagePurchaseRate}
                        hasSupplier={!hasExpiry && watchedSupplierIds.length > 0}
                        isMultiSupplier={isMultiSupplier}
                        isNew={isNew}
                    />
                    <Separator className="my-0" />
                    <StockSection
                        form={form}
                        isNew={isNew}
                        totalBatchQuantity={totalBatchQuantity}
                        totalVariantQuantity={totalVariantQuantity}
                        isMultiSupplier={isMultiSupplier}
                        totalSupplierStockQuantity={totalSupplierStockQuantity}
                        hasExpiry={hasExpiry}
                        hasVariants={hasVariants}
                    />
                </>
            ),
            fields: ['purchaseRate', 'sellingRate', 'packSize', 'packUnit', 'packPurchaseCost', 'quantity', 'minimumStock'],
        });

        if (!hasExpiry) {
            result.push({
                id: 'suppliers',
                label: 'Suppliers',
                content: (
                    <SupplierSection
                        form={form}
                        isNew={isNew}
                        suppliers={suppliers}
                        existingPurchases={purchases}
                        onSupplierNew={(nameValue: string) => {
                            setSupplierPresetName(nameValue ?? '');
                            setSupplierDialogOpen(true);
                        }}
                    />
                ),
                fields: ['supplierIds', 'supplierStocks'],
            });
        }

        if (showPurchaseCreationSection) {
            result.push({
                id: 'purchase',
                label: 'Purchase',
                content: (
                    <PurchaseCaptureSection
                        purchaseSupplierIds={purchaseSupplierIds}
                        supplierPurchaseDrafts={supplierPurchaseDrafts}
                        suppliers={suppliers}
                        updatePurchaseDraft={updatePurchaseDraft}
                    />
                ),
            });
        }

        result.push({
            id: 'capabilities',
            label: 'Capabilities',
            content: (
                <ProductCapabilitiesSection form={form} />
            ),
            fields: ['purchasable', 'availableForPOS', 'consumable', 'productionOutput', 'availableInMenu'],
        });

        result.push({
            id: 'review',
            label: 'Review & Save',
            content: (
                <div className="p-6 md:p-8 space-y-6">
                    <NotesSection form={form} />
                    <Separator className="my-0" />
                    <div>
                        <h3 className="font-semibold mb-2">Review and save product</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            All information has been captured. Click the button below to finalise.
                        </p>
                    </div>
                </div>
            ),
            fields: ['notes'],
        });

        return result;
    }, [
        form, isNew, existingProduct, existingCategories, existingBrands, existingProductNameLookup, existingBarcodes,
        isExpiryEnabled, isBatchesEnabled, hasExpiry, handleToggleExpiry,
        localBatches, handleAddBatch, handleEditBatch, handleDeleteBatch,
        isVariantsEnabled, hasVariants, handleToggleVariants,
        suppliers, purchases, watchedSupplierIds,
        averagePurchaseRate, isMultiSupplier,
        totalBatchQuantity, totalVariantQuantity, totalSupplierStockQuantity,
        showPurchaseCreationSection, purchaseSupplierIds,
        supplierPurchaseDrafts, updatePurchaseDraft,
        setSupplierPresetName, setSupplierDialogOpen,
    ]);

    const stepErrors = useMemo(() => {
        const errorFields = Object.keys(form.formState.errors);
        return steps.map(step =>
            step.fields ? step.fields.some(f => errorFields.includes(f)) : false
        );
    }, [steps, form.formState.errors]);

    const stepErrorsWithUI = useMemo(() => {
        return stepErrors.map((err, idx) => {
            const stepId = steps[idx]?.id;
            if (stepId === 'suppliers' && !hasExpiry && watchedSupplierIds.length === 0) {
                return true;
            }
            if (stepId === 'inventory') {
                if (hasExpiry && localBatches.length === 0) {
                    return true;
                }
                if (hasVariants && watchedVariants.length === 0) {
                    return true;
                }
            }
            return err;
        });
    }, [stepErrors, steps, hasExpiry, watchedSupplierIds, hasVariants, localBatches, watchedVariants]);

    const stepsWithReview = useMemo(() => {
        return steps.map((step, idx) => {
            if (step.id !== 'review') return step;
            const anyErrors = stepErrorsWithUI.some(Boolean);
            return {
                ...step,
                content: (
                    <div className="p-6 md:p-8 space-y-6">
                        <NotesSection form={form} />
                        {quantity === 0 && (
                            <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs">
                                <span className="text-sm shrink-0">ℹ️</span>
                                <div>
                                    <span className="font-semibold">No opening stock set</span> — the stock count for this product is currently 0. You can record purchases later.
                                </div>
                            </div>
                        )}
                        <Separator className="my-0" />
                        {anyErrors ? (
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 p-4 rounded-2xl border border-destructive/30 bg-destructive/5">
                                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-destructive">Review incomplete</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Some steps still require attention before you can save this product.
                                        </p>
                                    </div>
                                </div>
                                <ul className="space-y-2">
                                    {steps.map((s, i) => {
                                        if (!stepErrorsWithUI[i]) return null;
                                        return (
                                            <li key={s.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveStep(i)}
                                                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-muted-foreground/20 bg-card hover:bg-muted/30 transition-colors text-left"
                                                >
                                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                                                        {i + 1}
                                                    </span>
                                                    <span className="text-sm font-medium">{s.label}</span>
                                                    <span className="ml-auto text-xs text-destructive underline underline-offset-2">
                                                        Fix
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center gap-3 p-4 rounded-2xl border border-green-200 bg-green-50/50 dark:bg-green-950/20">
                                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-green-800 dark:text-green-300">Ready to save</h3>
                                        <p className="text-sm text-muted-foreground">
                                            All steps are complete and valid. Use the button below to finalise.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ),
            };
        });
    }, [steps, stepErrorsWithUI, form, setActiveStep]);

    return { steps, stepErrors, stepErrorsWithUI, stepsWithReview };
}