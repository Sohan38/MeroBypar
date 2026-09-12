export interface StorageRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  syncStatus?: 'synced' | 'pending_insert' | 'pending_update' | 'pending_delete';
  lastSyncedAt?: string | null;
  deviceId?: string;
}

export interface Location extends StorageRecord {
  name: string;
  code?: string;
  isDefault?: boolean;
  status?: 'active' | 'inactive';
  notes?: string;
}

export type ProductUnit = 'pcs' | 'packet' | 'box' | 'bottle' | 'kg' | 'gram' | 'litre' | 'ml' | 'plate' | 'cup' | 'glass' | 'meter' | 'roll' | 'dozen' | 'custom';

export interface Product extends StorageRecord {
  barcode: string;
  name: string;
  category: string;
  brand: string;
  supplierId: string;
  supplierIds?: string[]; // multiple suppliers support
  unit: ProductUnit;
  quantity: number;
  minimumStock: number;
  purchaseRate: number;
  sellingRate: number;
  profitPerUnit: number;
  hasExpiry?: boolean;    // does this product have expiry dates?
  hasVariants?: boolean;  // does this product have variants (size, color, etc)?
  variants?: Array<{ name: string; quantity: number }>;
  supplierStocks?: SupplierProductRecord[]; // per-supplier stock (drives total when multiple suppliers)
  notes: string;
  imageBase64?: string;
  // Product capabilities — what can this product be used for?
  purchasable?: boolean;     // can be received via purchase invoices (default true for backward compat)
  availableForPOS?: boolean; // can be sold in point-of-sale (default true for backward compat)
  consumable?: boolean;      // can be consumed internally without creating output (default false)
  productionOutput?: boolean; // can be created as output of production (default false)
  availableInMenu?: boolean; // can appear as customer-facing menu item (default false)
}

/** A single received batch of a product — tracks supplier, dates, and remaining qty */
export interface ProductBatch extends StorageRecord {
  productId: string;
  supplierId: string;            // which supplier this batch came from
  purchaseInvoiceId?: string;    // optional link to purchase invoice
  batchNumber: string;           // e.g. "B-2024-001"
  manufacturingDate: string | null;
  /** If set, expiryDate is auto-calculated as mfgDate + expiryMonths months */
  expiryMonths: number | null;
  expiryDate: string | null;     // final expiry (auto or manual)
  initialQuantity: number;       // how many entered stock in this batch
  quantity: number;              // remaining stock in this batch
  purchaseRate: number;
  notes: string;

}

export interface ProductBatchLocation extends StorageRecord {
  batchId: string;
  locationId: string;
  quantity: number;
  dateReceived?: string | null;
}

export interface InventoryLocationStock extends StorageRecord {
  productId: string;
  locationId: string;
  quantity: number;
  reservedQuantity?: number;
  lastMovementAt?: string | null;
  notes?: string;
}

export interface InventoryMovement extends StorageRecord {
  productId: string;
  productName: string;
  movementType: 'transfer' | 'adjustment' | 'sale' | 'purchase' | 'disposition' | 'consumption';
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  quantity: number;
  batchId?: string | null;
  supplierId?: string | null;
  referenceId?: string | null;
  notes?: string;
  status?: 'pending' | 'completed' | 'cancelled';
}

/** A single consumed product item within a consumption transaction */
export interface ConsumptionItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: ProductUnit;
  batchId?: string | null;
  batchNumber?: string | null;
  unitCost: number;  // cost per unit at time of consumption
  totalCost: number; // quantity * unitCost
}

/** Transaction representing internal consumption without creating sales or production output */
export interface ConsumptionTransaction extends StorageRecord {
  referenceNumber: string;     // e.g., CONS-2024-001
  date: string;                 // ISO 8601 date
  locationId: string;           // where the consumption occurred
  items: ConsumptionItem[];     // products consumed
  totalCost: number;            // sum of all item costs
  reason?: string;              // e.g., "Staff meal", "Testing", "Waste"
  notes?: string;               // additional notes
  status?: 'completed' | 'reversed';
  reversalOfId?: string | null; // if this is a reversal, links to original transaction
  reversedById?: string | null; // if reversed, links to reversal transaction
}

/** A single raw material input item within a production transaction */
export interface ProductionInputItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: ProductUnit;
  locationId: string;           // where the input is consumed from
  supplierId: string;           // which supplier provided this stock (for batch-tracked: from batch; for non-batched: if determinable)
  batchId?: string | null;      // which batch is consumed (null for non-batched)
  batchNumber?: string | null;  // batch identifier for audit
  unitCost: number;             // cost per unit at time of production (historical)
  totalCost: number;            // quantity * unitCost
}

/** A single finished-goods output item within a production transaction */
export interface ProductionOutputItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: ProductUnit;
  locationId: string;           // where the output is stored
  batchId?: string | null;      // optional: created batch for this output
  batchNumber?: string | null;  // optional: batch identifier if batch-tracked
  unitCost: number;             // output unit cost = totalInputCost / totalOutputQuantity
  totalCost: number;            // quantity * unitCost
}

/** Transaction representing production/transformation: raw materials → finished goods */
export interface ProductionTransaction extends StorageRecord {
  referenceNumber: string;      // e.g., PROD-2024-001
  date: string;                 // ISO 8601 date
  locationId: string;           // primary location for production
  recipeId?: string | null;     // which recipe was used to calculate requirements
  recipeName?: string | null;   // recipe name at time of production (for historical reference)
  inputItems: ProductionInputItem[];   // raw materials consumed
  outputItems: ProductionOutputItem[]; // finished goods created
  totalInputCost: number;       // sum of all input costs
  totalOutputCost: number;      // sum of all output costs
  notes?: string;               // additional production notes
  status: 'completed' | 'reversed'; // production status
  reversalOfId?: string | null; // if this is a reversal, links to original transaction
  reversedById?: string | null; // if reversed, links to reversal transaction
}

/** Production recipe/bill of materials: defines what raw materials are needed per output unit */
export interface ProductionRecipe extends StorageRecord {
  outputProductId: string;      // which finished product this recipe creates
  name: string;                 // human-readable recipe name (e.g., "Standard Cotton Shirt")
  status: 'active' | 'inactive'; // only one active recipe per finished product
  // createdAt, updatedAt, deletedAt, id, version inherited from StorageRecord
}

/** A single ingredient line in a production recipe */
export interface ProductionRecipeItem extends StorageRecord {
  recipeId: string;             // which recipe this ingredient belongs to
  inputProductId: string;       // raw material product
  quantityPerOutputUnit: number; // e.g., 1.5 = "1.5 kg per 1 unit of output"
  unit: ProductUnit;            // e.g., 'kg', 'pcs', etc.
  // createdAt, updatedAt, deletedAt, id, version inherited from StorageRecord
}

export type BatchFormData = Omit<
  ProductBatch,
  "id" | "createdAt" | "updatedAt" | "deletedAt" | "version"
>;

/** Per-supplier stock and cost data for a product */
export interface SupplierProductRecord {
  supplierId: string;
  locationId: string;       // effective identity for supplier stock in a product record
  supplierSku?: string;     // supplier's own SKU for this product
  cost: number;             // supplier-specific purchase cost
  stock: number;            // stock from this supplier at this location
  reorderLevel?: number;    // trigger a restock alert at this level
  lastPurchaseDate?: string;
  notes?: string;
}

export interface Supplier extends StorageRecord {
  name: string;
  contactPerson?: string;
  phone: string;
  email: string;
  address: string;
  vatPan: string;
  notes: string;
  status?: 'active' | 'inactive';
}

export interface Customer extends StorageRecord {
  name: string;
  phone: string;
  address: string;
  email: string;
  notes: string;
}

export type PaymentMethod = 'cash' | 'qr' | 'card' | 'bank' | 'other' | 'split' | 'credit';

export type FinancialAccountType = 'cash' | 'bank' | 'cooperative' | 'digital' | 'card' | 'receivable' | 'payable' | 'clearing';
export type FinancialAccountStatus = 'active' | 'inactive';
export type FinancialTransactionType =
  | 'sale_payment'
  | 'customer_credit'
  | 'customer_payment'
  | 'supplier_payment'
  | 'purchase_receipt'
  | 'expense'
  | 'refund'
  | 'transfer'
  | 'opening_balance'
  | 'adjustment';

export interface FinancialAccount extends StorageRecord {
  name: string;
  type: FinancialAccountType;
  status: FinancialAccountStatus;
  accountNumber?: string | null;
  institutionName?: string | null;
  notes?: string | null;
  locationId?: string | null;
  paymentMethods?: PaymentMethod[];
  isSystem?: boolean;
}

export interface FinancialTransaction extends StorageRecord {
  date: string;
  type: FinancialTransactionType;
  description: string;
  sourceType: string;
  sourceId: string;
  reference?: string | null;
  status: 'posted' | 'reversed';
  reversalOfId?: string | null;
  reversedById?: string | null;
  idempotencyKey: string;
  userId?: string | null;
  locationId?: string | null;
}

export interface FinancialMovement extends StorageRecord {
  transactionId: string;
  accountId: string;
  amount: number;
  date: string;
  description: string;
  sourceType: string;
  sourceId: string;
  reference?: string | null;
  locationId?: string | null;
}

export type DispositionReason = 'expired' | 'damaged' | 'defective' | 'supplier_recall' | 'wrong_item_supplied' | 'other';
export type DispositionResolution = 'return_to_supplier' | 'supplier_replacement' | 'supplier_credit' | 'supplier_refund' | 'write_off' | 'reversal';
export type DispositionStatus = 'completed' | 'reversed';
export type DispositionSettlementType = 'none' | 'credit' | 'refund' | 'replacement';
export type DispositionSettlementStatus = 'pending' | 'completed' | 'cancelled';

export interface InventoryDisposition extends StorageRecord {
  referenceNumber: string;
  date: string;
  performedById: string | null;
  performedByName: string | null;
  reason: DispositionReason;
  resolution: DispositionResolution;
  status: DispositionStatus;
  productId: string;
  productName: string;
  batchId: string | null;
  batchNumber: string | null;
  purchaseInvoiceId: string | null;
  purchaseInvoiceNumber: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  unitCost: number;
  totalValue: number;
  settlementAmount: number;
  settlementMethod: PaymentMethod | null;
  settlementType: DispositionSettlementType;
  settlementStatus?: DispositionSettlementStatus | null;
  settlementReference?: string | null;
  settlementDate?: string | null;
  notes: string | null;
  reversalOfId: string | null;
  reversedById: string | null;
  replacementPurchaseInvoiceId: string | null;
  idempotencyKey: string | null;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  purchaseRate: number;
  subtotal: number;
  /** Optional variant selection for products that use variants. */
  variantName?: string;
  /** Optional receiving information used when the product tracks batches. */
  batchId?: string;
  batchNumber?: string;
  manufacturingDate?: string | null;
  expiryMonths?: number | null;
  expiryDate?: string | null;
  notes?: string;
}

export type PurchaseStatus = 'draft' | 'received' | 'cancelled';
export type PurchasePaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface PurchaseInvoice extends StorageRecord {
  invoiceNumber: string;
  supplierId: string;
  supplierName?: string | null;
  date: string;
  items: PurchaseItem[];
  discount: number;
  tax: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  notes: string;
  referenceNumber?: string;
  status?: PurchaseStatus;
  paymentStatus?: PurchasePaymentStatus;
  paidAmount?: number;
  payments?: CreditPayment[];
  locationId?: string; // which location this purchase is for
}

export interface SaleCostAllocation {
  batchId: string;
  quantity: number;
  purchaseRate: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  sellingRate: number;
  subtotal: number;
  /** Optional variant selected at the POS (for example, Red or XL). */
  variantName?: string;
  /** Actual batch cost allocation used for this sale line when batched inventory is involved. */
  costAllocations?: SaleCostAllocation[];
}

export interface SaleInvoice extends StorageRecord {
  customerId: string | null;
  customerName?: string | null;
  date: string;
  items: SaleItem[];
  discount: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  splitPayments?: { method: PaymentMethod; amount: number }[];
  notes: string;
  status?: 'completed' | 'voided';    // defaults to 'completed' for backward compat
  voidedAt?: string | null;            // ISO timestamp when voided
  voidedReason?: string | null;        // required reason for audit trail
}

export interface HotelRoom extends StorageRecord {
  roomNumber: string;
  roomType: string;
  floor: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance';
  currentGuestName: string | null;
  currentCheckIn: string | null;
  currentCheckOut: string | null;
  ratePerNight: number;
  notes: string;
  imageBase64?: string;
}

export interface HotelBillItem {
  description: string;
  category: 'food' | 'laundry' | 'drinks' | 'other';
  amount: number;
}

export interface HotelBill extends StorageRecord {
  invoiceNumber: string;
  guestName: string;
  phone: string;
  address: string;
  roomId: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  numberOfNights: number;
  roomCharge: number;
  additionalItems: HotelBillItem[];
  discount: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: PaymentMethod;
  notes: string;
}

export interface RestaurantItem {
  name: string;
  quantity: number;
  rate: number;
  total: number;
}

export interface RestaurantBill extends StorageRecord {
  billNumber: string;
  tableNumber: string;
  date: string;
  items: RestaurantItem[];
  discount: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  notes: string;
}

export type ExpenseCategory = 'salary' | 'electricity' | 'water' | 'internet' | 'food' | 'fuel' | 'maintenance' | 'tax' | 'purchase' | 'miscellaneous';

export interface Expense extends StorageRecord {
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  /** Optional link to a purchase that auto-generated this expense */
  sourcePurchaseId?: string;
}

export interface CashBookEntry extends StorageRecord {
  date: string;
  openingCash: number;
  cashIn: number;
  cashOut: number;
  closingCash: number;
  reason: string;
  notes: string;
}

export interface CreditPayment {
  id?: string;
  date: string;
  amount: number;
  note: string;
  paymentMethod?: Exclude<PaymentMethod, 'split' | 'credit'>;
  financialAccountId?: string | null;
  reference?: string | null;
}

export interface Credit extends StorageRecord {
  customerId: string;
  customerName: string;
  phone: string;
  description: string;
  amount: number;
  paidAmount: number;
  date: string;
  dueDate: string | null;
  status: 'pending' | 'partial' | 'paid';
  paidAt: string | null;
  notes: string;
  sourceSaleId?: string;
  payments: CreditPayment[];
}

export interface FeatureConfig {
  inventory: {
    batches: boolean;
    expiry: boolean;
    variants: boolean;
    serialNumbers: boolean;
    barcodeSupport: boolean;
    multiUnits: boolean;
  };
  sales: {
    returns: boolean;
    creditSales: boolean;
    discounts: boolean;
    layaway: boolean;
    quotations: boolean;
  };
  customers: {
    loyalty: boolean;
    membership: boolean;
  };
  hospitality: {
    hotelGrid: boolean;
    restaurantBilling: boolean;
  };
  production: {
    enabled: boolean;      // production/transformation transactions
  };
  consumption: {
    enabled: boolean;      // internal consumption tracking
  };
}

export interface AppSettings {
  businessName: string;
  businessLogoBase64: string | null;
  phone: string;
  address: string;
  vatNumber: string;
  currency: string;
  currencySymbol: string;
  taxRate: number;
  lowStockThreshold: number;
  defaultLocationId?: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  features: FeatureConfig;
  financialAccountMapping?: Partial<Record<Exclude<PaymentMethod, 'split' | 'credit'>, string>>;
}

export type UserRole = 'admin' | 'manager' | 'cashier' | 'receptionist' | 'staff';

export interface AppUser extends StorageRecord {
  name: string;
  pin: string;
  role: UserRole;
  isActive: boolean;
}


/** Shared types for the POS cart subsystem. */
export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  sellingRate: number;
  maxQuantity: number;
  subtotal: number;
  /** Optional variant selected for this cart line. */
  variantName?: string;
}
