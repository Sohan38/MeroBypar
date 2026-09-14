import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Form } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Package2 } from 'lucide-react';
import { useSmartBack } from '@/contexts/NavigationContext';
import { StepFormContainer } from '@/components/ui/StepFormContainer';
import { BatchFormDialog } from '@/components/BatchFormDialog';
import { SupplierFormDialog } from '@/components/SupplierFormDialog';
import { useInventoryForm } from './Form/hooks/useInventoryForm';
import { useInventoryFormSteps } from './Form/hooks/useInventoryFormSteps';
import { useInventoryFooter } from './Form/hooks/useInventoryFooter';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useConfirm } from '@/contexts/ConfirmContext';
import { InventoryConfirmDialog } from './Form/InventoryConfirmDialog';

export default function InventoryForm() {
  const goBack = useSmartBack('/inventory');
  const [location] = useLocation();

  // Extract query params
  const query = typeof window !== 'undefined' && window.location.search
    ? window.location.search.slice(1)
    : (location.includes('?') ? location.split('?')[1] : '');
  const queryParams = new URLSearchParams(query);
  const supplierIdFromQuery = queryParams.get('supplierId');
  const returnTo = queryParams.get('returnTo');

  // All business logic lives inside the hook
  const {
    form,
    isNew,
    existingProduct,
    hasExpiry,
    hasVariants,
    isMultiSupplier,
    showPurchaseCreationSection,
    suppliers,
    purchases,
    watchedSupplierIds,
    existingCategories,
    existingBrands,
    existingProductNameLookup,
    existingBarcodes,
    averagePurchaseRate,
    totalBatchQuantity,
    totalVariantQuantity,
    totalSupplierStockQuantity,
    warnings,
    localBatches,
    batchDialogOpen,
    editingBatch,
    nextBatchNumber,
    handleToggleExpiry,
    handleToggleVariants,
    handleAddBatch,
    handleEditBatch,
    handleDeleteBatch,
    handleSaveBatch,
    setBatchDialogOpen,
    supplierPresetName,
    setSupplierPresetName,
    supplierDialogOpen,
    setSupplierDialogOpen,
    supplierPurchaseDrafts,
    updatePurchaseDraft,
    purchaseSupplierIds,
    isBatchesEnabled,
    isExpiryEnabled,
    isVariantsEnabled,
    draftBatchDefaults,
    onSubmit,
  } = useInventoryForm(supplierIdFromQuery, returnTo);

  const [activeStep, setActiveStep] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Step generation & error derivation
  const { stepsWithReview, stepErrorsWithUI } = useInventoryFormSteps(
    form,
    {
      isNew,
      existingProduct,
      existingCategories,
      existingBrands,
      existingProductNameLookup,
      existingBarcodes,
      isExpiryEnabled,
      isBatchesEnabled,
      hasExpiry,
      handleToggleExpiry,
      localBatches,
      handleAddBatch,
      handleEditBatch,
      handleDeleteBatch,
      isVariantsEnabled,
      hasVariants,
      handleToggleVariants,
      suppliers,
      purchases,
      watchedSupplierIds,
      averagePurchaseRate,
      isMultiSupplier,
      totalBatchQuantity,
      totalVariantQuantity,
      totalSupplierStockQuantity,
      showPurchaseCreationSection,
      purchaseSupplierIds,
      supplierPurchaseDrafts,
      updatePurchaseDraft,
      setSupplierPresetName,
      setSupplierDialogOpen,
    },
    setActiveStep
  );

  const totalSteps = stepsWithReview.length;

  const handleStepChange = useCallback(async (stepIdx: number) => {
    const currentStep = stepsWithReview[activeStep];
    if (currentStep?.fields && currentStep.fields.length > 0) {
      await form.trigger(currentStep.fields as any);
    }
    setActiveStep(stepIdx);
  }, [activeStep, stepsWithReview, form]);

  const handleNext = useCallback(async () => {
    const currentStep = stepsWithReview[activeStep];
    if (currentStep?.fields && currentStep.fields.length > 0) {
      await form.trigger(currentStep.fields as any);
    }
    setActiveStep(prev => prev + 1);
  }, [activeStep, stepsWithReview, form]);

  // Intercept save: validate last step then open confirm dialog
  const handleSave = useCallback(async () => {
    const lastStep = stepsWithReview[stepsWithReview.length - 1];
    if (lastStep?.fields && lastStep.fields.length > 0) {
      await form.trigger(lastStep.fields as any);
    }
    const isValid = await form.trigger();
    if (!isValid) return;
    setConfirmOpen(true);
  }, [form, stepsWithReview]);

  // Called when user confirms in the dialog — triggers native form submit
  const handleConfirmSave = useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);

  // Footer (desktop/mobile aware)
  const footer = useInventoryFooter(
    activeStep,
    totalSteps,
    goBack,
    setActiveStep,
    stepErrorsWithUI,
    form,
    isMobile,
    handleNext,
    handleSave
  );
  const confirm = useConfirm();

  const customConfirm = useCallback(() => {
    return confirm({
      title: 'Unsaved Changes',
      description: 'You have unsaved changes. Are you sure you want to leave?',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      variant: 'destructive',
    });
  }, [confirm]);

  const { isDirty } = form.formState;

  useUnsavedChanges({
    isDirty,
    customConfirm,
    onLeave: goBack,
  });


  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-card p-4 md:p-5 shadow-sm">
        {/* Subtle accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary/60 to-primary/20" />

        <div className="flex items-start gap-3">
          {/* Compact icon (hidden on small screens) */}
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
            <Package2 className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                {isNew ? 'Add Product' : 'Edit Product'}
              </h1>
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${isNew
                  ? 'bg-primary/10 text-primary'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}
              >
                {isNew ? 'New' : 'Edit'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-lg">
              {isNew
                ? 'Create a new item in your inventory catalog'
                : 'Modify existing product specifications'}
            </p>
          </div>
        </div>
      </div>

      {/* Warning banners */}
      {warnings.length > 0 && (
        <Alert variant="default" className="border-orange-200 bg-orange-50/50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-950 font-medium">
            <ul className="list-disc pl-4 space-y-1 text-xs">
              {warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form ref={formRef} onSubmit={form.handleSubmit(onSubmit)}>
          <StepFormContainer
            steps={stepsWithReview}
            activeStep={activeStep}
            onStepChange={handleStepChange}
            footer={footer}
            stepErrors={stepErrorsWithUI}
            isMobile={isMobile}
          />
        </form>
      </Form>

      {/* Confirm-before-save dialog */}
      <InventoryConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSave}
        form={form}
        suppliers={suppliers}
        localBatches={localBatches}
        hasExpiry={hasExpiry}
        hasVariants={hasVariants}
        averagePurchaseRate={averagePurchaseRate}
        isSaving={form.formState.isSubmitting}
      />

      {/* Batch dialog */}
      <BatchFormDialog
        open={batchDialogOpen}
        onClose={() => setBatchDialogOpen(false)}
        onSave={handleSaveBatch}
        editBatch={editingBatch}
        isNew={isNew}
        nextBatchNumber={nextBatchNumber}
        suppliers={suppliers}
        productId={existingProduct?.id || ''}
        productName={form.getValues('name') || ''}
        existingBatches={localBatches}
        existingPurchases={purchases}
        packSize={form.watch('packSize')}
        packUnit={form.watch('packUnit')}
        baseUnit={form.watch('unit')}
        defaultQuantity={draftBatchDefaults?.defaultQuantity}
        defaultPurchaseRate={draftBatchDefaults?.defaultPurchaseRate}
        defaultPackQuantity={draftBatchDefaults?.defaultPackQuantity}
        defaultPackPurchaseCost={draftBatchDefaults?.defaultPackPurchaseCost}
        defaultSupplierId={draftBatchDefaults?.defaultSupplierId}
        onUpdatePack={(size, unit) => {
          form.setValue('isPackPricingEnabled', true, { shouldDirty: true });
          form.setValue('packSize', size, { shouldDirty: true });
          form.setValue('packUnit', unit, { shouldDirty: true });
        }}
      />

      {/* Supplier dialog */}
      <SupplierFormDialog
        open={supplierDialogOpen}
        onClose={() => {
          setSupplierDialogOpen(false);
          setSupplierPresetName('');
        }}
        defaultName={supplierPresetName}
        onSuccess={(newSupplierId) => {
          const currentIds = form.getValues('supplierIds') ?? [];
          if (!currentIds.includes(newSupplierId)) {
            const currentStocks = form.getValues('supplierStocks') ?? [];
            const newStocks = [
              ...currentStocks,
              {
                supplierId: newSupplierId,
                locationId: 'loc-default',
                cost: 0,
                stock: 0,
                supplierSku: '',
                reorderLevel: undefined,
                notes: '',
              },
            ];
            form.setValue('supplierIds', [...currentIds, newSupplierId], {
              shouldDirty: true,
            });
            form.setValue('supplierStocks', newStocks, { shouldDirty: true });
          }
          setSupplierDialogOpen(false);
        }}
      />
    </div>
  );
}