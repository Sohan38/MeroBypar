import { ProductUnit } from '../types';

export interface UnitCategory {
  name: string;
  units: { value: ProductUnit; label: string; description?: string }[];
}

export const UNIT_LABELS: Record<ProductUnit, string> = {
  pcs: 'Pieces (pcs)',
  packet: 'Packet (pkt)',
  box: 'Box',
  bottle: 'Bottle',
  kg: 'Kilogram (kg)',
  gram: 'Gram (g)',
  litre: 'Litre (L)',
  ml: 'Millilitre (ml)',
  plate: 'Plate',
  cup: 'Cup',
  glass: 'Glass',
  meter: 'Meter (m)',
  inch: 'Inch (in)',
  feet: 'Feet (ft)',
  yard: 'Yard (yd)',
  roll: 'Roll',
  dozen: 'Dozen (12 pcs)',
  pair: 'Pair (2 pcs)',
  set: 'Set',
  bundle: 'Bundle',
  bag: 'Bag / Sack',
  can: 'Can',
  jar: 'Jar',
  tube: 'Tube',
  sheet: 'Sheet',
  custom: 'Custom Unit',
};

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    name: 'Count & Packaging',
    units: [
      { value: 'pcs', label: 'Pieces (pcs)', description: 'Standard individual items' },
      { value: 'packet', label: 'Packet (pkt)', description: 'Packaged units' },
      { value: 'box', label: 'Box', description: 'Boxes or cartons' },
      { value: 'bottle', label: 'Bottle', description: 'Bottled drinks/goods' },
      { value: 'dozen', label: 'Dozen (12 pcs)', description: 'Sets of 12' },
      { value: 'pair', label: 'Pair (2 pcs)', description: 'Shoes, gloves, etc.' },
      { value: 'set', label: 'Set', description: 'Pre-packaged sets' },
      { value: 'bundle', label: 'Bundle', description: 'Bundled goods' },
      { value: 'bag', label: 'Bag / Sack', description: 'Bulk sacks/bags' },
      { value: 'can', label: 'Can', description: 'Canned drinks/goods' },
      { value: 'jar', label: 'Jar', description: 'Jars / containers' },
      { value: 'tube', label: 'Tube', description: 'Tubes of paste/glue' },
      { value: 'sheet', label: 'Sheet', description: 'Paper, glass, metal sheets' },
    ],
  },
  {
    name: 'Weight',
    units: [
      { value: 'kg', label: 'Kilogram (kg)', description: 'Heavy weight / bulk goods' },
      { value: 'gram', label: 'Gram (g)', description: 'Spices, gold, small weight' },
    ],
  },
  {
    name: 'Volume & Liquid',
    units: [
      { value: 'litre', label: 'Litre (L)', description: 'Oil, milk, liquids' },
      { value: 'ml', label: 'Millilitre (ml)', description: 'Small liquids' },
      { value: 'plate', label: 'Plate', description: 'Food serving' },
      { value: 'cup', label: 'Cup', description: 'Beverage serving' },
      { value: 'glass', label: 'Glass', description: 'Beverage serving' },
    ],
  },
  {
    name: 'Length & Area',
    units: [
      { value: 'meter', label: 'Meter (m)', description: 'Cloth, cable, pipe' },
      { value: 'inch', label: 'Inch (in)', description: 'Hardware, glass, timber' },
      { value: 'feet', label: 'Feet (ft)', description: 'Construction, wire, wood' },
      { value: 'yard', label: 'Yard (yd)', description: 'Textiles and fabrics' },
      { value: 'roll', label: 'Roll', description: 'Tape, film, wallpaper' },
    ],
  },
  {
    name: 'Other',
    units: [
      { value: 'custom', label: 'Custom Unit', description: 'User-specified unit' },
    ],
  },
];

const DECIMAL_CAPABLE_UNITS = new Set<string>([
  'kg',
  'gram',
  'litre',
  'ml',
  'meter',
  'inch',
  'feet',
  'yard',
  'custom',
]);

/**
 * Checks if a unit naturally supports decimal/fractional quantities (e.g. 0.5 kg, 2.5 meters).
 */
export function isDecimalUnit(unit?: string | null): boolean {
  if (!unit) return false;
  return DECIMAL_CAPABLE_UNITS.has(unit.toLowerCase().trim());
}

/**
 * Returns appropriate stepper increment for POS & inputs.
 * Decimal units step by 0.1 (or 0.5/1 depending on need), count units step by 1.
 */
export function getUnitStep(unit?: string | null): number {
  if (!unit) return 1;
  const u = unit.toLowerCase().trim();
  if (u === 'kg' || u === 'litre' || u === 'meter') return 0.1;
  if (u === 'gram' || u === 'ml') return 10;
  if (u === 'inch' || u === 'feet' || u === 'yard') return 0.5;
  if (isDecimalUnit(u)) return 0.1;
  return 1;
}

/**
 * Returns minimum step resolution allowed for raw numeric inputs.
 */
export function getUnitMinInputStep(unit?: string | null): string {
  return isDecimalUnit(unit) ? '0.01' : '1';
}

/**
 * Formats a quantity with clean decimal representation and optional unit suffix.
 * Avoids IEEE-754 floating point artifacts like 0.30000000000000004.
 */
export function formatQuantity(qty?: number | null, unit?: string | null): string {
  if (qty === undefined || qty === null || isNaN(qty)) return '0';
  // Round to max 3 decimal places cleanly
  const cleanQty = Math.round(qty * 1000) / 1000;
  const numStr = cleanQty.toString();
  if (!unit) return numStr;
  return `${numStr} ${unit}`;
}

/**
 * Rounds a quantity accurately to avoid floating-point drift during increments/decrements.
 */
export function roundQuantity(qty: number, unit?: string | null): number {
  if (isNaN(qty)) return 0;
  if (!isDecimalUnit(unit)) {
    return Math.round(qty);
  }
  // Decimal units round to max 3 decimal places
  return Math.round(qty * 1000) / 1000;
}

/**
 * Computes per-unit purchase cost when bought in a bulk pack.
 * Example: packCost = 500, packSize = 30 => 16.6667 (rounded to 2 or 4 decimal places)
 */
export function computePerUnitCost(packCost: number, packSize: number, maxDecimals: number = 2): number {
  if (!packCost || !packSize || packCost <= 0 || packSize <= 0) {
    return 0;
  }
  const perUnit = packCost / packSize;
  const factor = Math.pow(10, maxDecimals);
  return Math.round(perUnit * factor) / factor;
}

/**
 * Provides quick-selection quantity chips contextually based on the unit type.
 */
export function getQuickQuantityPresets(unit?: string | null): number[] {
  if (!unit) return [1, 2, 3, 5, 10];
  const u = unit.toLowerCase().trim();
  if (u === 'kg' || u === 'litre' || u === 'meter') {
    return [0.25, 0.5, 1, 2, 5];
  }
  if (u === 'gram' || u === 'ml') {
    return [50, 100, 250, 500, 1000];
  }
  if (u === 'inch' || u === 'feet' || u === 'yard') {
    return [0.5, 1, 2, 5, 10];
  }
  return [1, 2, 3, 5, 10];
}

/**
 * Safe currency rounding to 2 decimal places to eliminate IEEE-754 drift.
 */
export function safeCurrency(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 100) / 100;
}

/**
 * Safe quantity rounding to 3 decimal places.
 */
export function safeQty(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 1000) / 1000;
}

/**
 * Multiplies two numbers safely, mitigating IEEE-754 floating point drift.
 * Rounds to intermediate precision (default 6 decimals) to prevent rounding cascades.
 */
export function safeMul(a: number | string | null | undefined, b: number | string | null | undefined, decimals: number = 6): number {
  const numA = Number(a) || 0;
  const numB = Number(b) || 0;
  if (!isFinite(numA) || !isFinite(numB)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((numA * numB) * factor) / factor;
}

/**
 * Divides two numbers safely with division-by-zero safeguard and controlled precision.
 */
export function safeDiv(a: number | string | null | undefined, b: number | string | null | undefined, decimals: number = 6): number {
  const numA = Number(a) || 0;
  const numB = Number(b) || 0;
  if (!isFinite(numA) || !isFinite(numB) || Math.abs(numB) < 1e-9) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((numA / numB) * factor) / factor;
}

/**
 * Safely formats currency to 2 decimal places with clean string output.
 * If null/undefined/NaN, returns "0.00".
 */
export function formatMoney(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0.00';
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(num) || !isFinite(num)) return '0.00';
  const rounded = Math.round(num * 100) / 100;
  const abs = Math.abs(rounded) < 0.00001 ? 0 : rounded;
  return abs.toFixed(2);
}

/**
 * Formats a quantity value cleanly for display:
 * - Omits trailing decimal zeros for integers (e.g. 5 -> "5", 5.00 -> "5")
 * - Retains necessary decimals up to maxDecimals (e.g. 5.5 -> "5.5", 5.25 -> "5.25")
 */
export function formatQtyDisplay(val: number | string | null | undefined, maxDecimals: number = 3): string {
  if (val === null || val === undefined || val === '') return '0';
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(num) || !isFinite(num)) return '0';
  const rounded = safeQty(num);
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return Math.round(rounded).toString();
  }
  return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

/**
 * Ensures division-by-zero safeguard when calculating pack numbers.
 */
export function getSafePackSize(packSize?: number | null): number {
  const parsed = Number(packSize);
  return (parsed && parsed > 0) ? parsed : 1;
}

/**
 * Calculates total stock across supplier records with safe quantity math.
 */
export function calculateTotalSupplierStock(supplierStocks: Array<any>): number {
  if (!supplierStocks || !Array.isArray(supplierStocks)) return 0;
  const total = supplierStocks.reduce((sum, ss) => {
    const qty = Number(ss?.baseQuantity ?? ss?.stock ?? 0);
    return sum + (isNaN(qty) ? 0 : qty);
  }, 0);
  return safeQty(total);
}

/**
 * Calculates weighted average purchase cost across supplier stocks.
 * Uses totalPurchaseCost as source of truth when available to avoid rounding drift.
 */
export function calculateWeightedAverageCost(supplierStocks: Array<any>): number {
  if (!supplierStocks || !Array.isArray(supplierStocks) || supplierStocks.length === 0) return 0;

  const totalStock = calculateTotalSupplierStock(supplierStocks);

  if (totalStock > 0) {
    const totalCost = supplierStocks.reduce((sum, ss) => {
      if (ss?.totalPurchaseCost !== undefined && ss?.totalPurchaseCost !== null && !isNaN(Number(ss.totalPurchaseCost))) {
        return sum + Number(ss.totalPurchaseCost);
      }
      const qty = Number(ss?.baseQuantity ?? ss?.stock ?? 0);
      const unitCost = Number(ss?.cost ?? 0);
      return sum + (qty * unitCost);
    }, 0);

    return safeCurrency(totalCost / totalStock);
  }

  // Fallback if stock is 0: average of non-zero unit costs
  const nonZeroCosts = supplierStocks
    .map(ss => Number(ss?.cost ?? 0))
    .filter(c => c > 0);

  if (nonZeroCosts.length > 0) {
    const avg = nonZeroCosts.reduce((a, b) => a + b, 0) / nonZeroCosts.length;
    return safeCurrency(avg);
  }

  return 0;
}

/**
 * Safely converts base stock to pack quantity representation.
 */
export function calculatePacksFromStock(stock: number, packSize?: number | null): number {
  const safeSize = getSafePackSize(packSize);
  return safeQty(stock / safeSize);
}

