import { UseFormReturn } from 'react-hook-form';
import * as z from 'zod';
import { ProductBatch, Supplier } from '@/types';

export const productSchema = z.object({
  name: z
    .string()
    .min(1, 'Product name is required')
    .min(2, 'Name needs at least 2 characters')
    .max(100, 'Keep the name under 100 characters'),

  barcode: z
    .string()
    .max(50, 'Barcode seems too long — max 50 characters')
    .optional(),

  category: z
    .string()
    .min(1, 'Pick or type a category — helps organise your inventory')
    .max(50, 'Category name is too long'),

  brand: z
    .string()
    .max(50, 'Brand name is too long')
    .optional(),

  supplierIds: z.array(z.string()).optional(),

  supplierStocks: z.array(z.object({
    supplierId: z.string(),
    locationId: z.string().default('loc-default'),
    supplierSku: z.string().optional(),
    cost: z.coerce.number().min(0).default(0),
    stock: z.coerce.number().min(0).default(0),
    reorderLevel: z.coerce.number().min(0).optional(),
    lastPurchaseDate: z.string().optional(),
    notes: z.string().optional(),
    isPrimary: z.boolean().optional(),
    baseQuantity: z.coerce.number().min(0).optional(),
    totalPurchaseCost: z.coerce.number().min(0).optional(),
    packQuantity: z.coerce.number().min(0).optional().nullable(),
    packCost: z.coerce.number().min(0).optional().nullable(),
    appliedPackSize: z.coerce.number().min(1).optional().nullable(),
  })).optional(),

  unit: z.string().min(1, 'Please select a unit'),

  quantity: z.coerce
    .number({ invalid_type_error: 'Enter a valid number' })
    .min(0, 'Stock cannot be negative')
    .max(999999, 'That quantity seems too large'),

  minimumStock: z.coerce
    .number({ invalid_type_error: 'Enter a valid number' })
    .min(0, 'Cannot be negative')
    .max(999999, 'That value seems too large'),

  purchaseRate: z.coerce
    .number({ invalid_type_error: 'Enter a valid number' })
    .min(0, 'Cannot be negative'),

  sellingRate: z.coerce
    .number({ invalid_type_error: 'Enter a valid number' })
    .min(0.01, 'Selling price must be greater than zero'),

  // Pack / Bulk pricing (optional)
  packSize: z.coerce.number().min(1, 'Pack size must be at least 1').optional().nullable(),
  packUnit: z.string().max(50).optional().nullable(),
  packPurchaseCost: z.coerce.number().min(0, 'Pack cost cannot be negative').optional().nullable(),
  packQuantity: z.coerce.number().min(0, 'Pack quantity cannot be negative').optional().nullable(),

  hasExpiry: z.boolean().optional(),
  hasVariants: z.boolean().optional(),

  variants: z
    .array(
      z.object({
        name: z.string().min(1, 'Give this variant a name (e.g. Red, XL)'),
        quantity: z.coerce.number().min(0, 'Cannot be negative'),
      })
    )
    .optional(),

  notes: z
    .string()
    .max(500, 'Notes are too long — keep it under 500 characters')
    .optional(),

  imageBase64: z.string().optional(),

  // Product capabilities — what can this product be used for?
  purchasable: z.boolean().optional(),
  availableForPOS: z.boolean().optional(),
  consumable: z.boolean().optional(),
  productionOutput: z.boolean().optional(),
  availableInMenu: z.boolean().optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export interface SectionProps {
  form: UseFormReturn<ProductFormValues>;
}
