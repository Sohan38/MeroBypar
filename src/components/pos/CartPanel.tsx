/**
 * CartPanel — Standalone memoized component for the POS cart sidebar / drawer.
 *
 * Extracted from SalesPos to prevent React re-creating the component function
 * reference on every parent render.  Wrapped in React.memo so it only
 * re-renders when its own props actually change.
 */
import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShoppingCart, User, Trash2, Minus, Plus, Banknote, QrCode,
  CreditCard, SplitSquareHorizontal, BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomerPicker } from '@/components/pos/CustomerPicker';
import { VariantPicker } from '@/components/pos/VariantPicker';
import { PaymentMethod, CartItem, Product } from '@/types';
import { BankSelector } from '@/components/pos/BankSelector';

interface VariantDraft {
  productId: string;
  product: Product;
  expanded: boolean;
}

interface CartPanelProps {
  inDrawer?: boolean;
  cart: CartItem[];
  cartCount: number;
  discount: number;
  discountType: 'flat' | 'percent';
  discountValue: number;
  taxPercent: number;
  taxAmount: number;
  subtotal: number;
  grandTotal: number;
  paidAmount: number | '';
  paymentMethod: PaymentMethod;
  selectedBankAccountId?: string | null;
  onSetBankAccountId?: (id: string) => void;
  customerId: string;
  showCustomer: boolean;
  selectedCustomerName?: string;
  change: number;
  isDiscountsEnabled: boolean;
  symbol: string;
  format: (n: number) => string;
  onSetDiscountType: (t: 'flat' | 'percent') => void;
  onSetDiscountValue: (v: number) => void;
  onSetTaxPercent: (v: number) => void;
  onSetPaymentMethod: (m: PaymentMethod) => void;
  onSetPaidAmount: (v: number | '') => void;
  onSetCustomerId: (id: string) => void;
  onToggleCustomer: () => void;
  onCloseCustomer: () => void;
  onClearCart: () => void;
  onRemoveFromCart: (lineKey: string) => void;
  onUpdateCartQuantity: (lineKey: string, delta: number) => void;
  onSetCartQuantity: (lineKey: string, qty: number) => void;
  variantDrafts: VariantDraft[];
  onToggleVariantDraft: (productId: string) => void;
  onRemoveVariantDraft: (productId: string) => void;
  onSetVariantQuantity: (productId: string, name: string, quantity: number) => void;
  onCheckout: () => void;
}

export const CartPanel = React.memo(({
  inDrawer = false,
  cart,
  cartCount,
  discount,
  discountType,
  discountValue,
  taxPercent,
  taxAmount,
  subtotal,
  grandTotal,
  paidAmount,
  paymentMethod,
  selectedBankAccountId,
  onSetBankAccountId,
  customerId: _customerId,
  showCustomer,
  selectedCustomerName,
  change,
  isDiscountsEnabled,
  symbol,
  format,
  onSetDiscountType,
  onSetDiscountValue,
  onSetTaxPercent,
  onSetPaymentMethod,
  onSetPaidAmount,
  onToggleCustomer,
  onCloseCustomer,
  onSetCustomerId,
  onClearCart,
  onRemoveFromCart,
  onUpdateCartQuantity,
  onSetCartQuantity,
  variantDrafts,
  onToggleVariantDraft,
  onRemoveVariantDraft,
  onSetVariantQuantity,
  onCheckout,
}: CartPanelProps) => {
  const visibleCart = cart;

  // Quick cash suggestion amounts
  const quickCashPresets = React.useMemo(() => {
    if (grandTotal <= 0) return [];
    const presets = new Set<number>();
    presets.add(Math.ceil(grandTotal));
    // Nearest round 50, 100, 500, 1000
    [50, 100, 500, 1000].forEach(denom => {
      const next = Math.ceil(grandTotal / denom) * denom;
      if (next >= grandTotal && next <= grandTotal + 2000) {
        presets.add(next);
      }
    });
    return Array.from(presets).sort((a, b) => a - b).slice(0, 4);
  }, [grandTotal]);

  return (
    <div className={`flex flex-col ${inDrawer ? 'h-full' : 'flex-1'}`}>
      {/* Cart header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between shrink-0">
        <h2 className="text-base font-bold flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <span>Current Order</span>
          {cart.length > 0 && (
            <span className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-2 py-0.5 shadow-xs">
              {cartCount}
            </span>
          )}
        </h2>
        <div className="flex gap-1.5 items-center">
          <Button
            variant={selectedCustomerName ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 text-xs gap-1.5 rounded-lg transition-colors",
              selectedCustomerName && "bg-primary/10 text-primary border border-primary/20 font-semibold"
            )}
            onClick={onToggleCustomer}
          >
            <User className="h-3.5 w-3.5" />
            <span className="max-w-24 truncate">{selectedCustomerName ? selectedCustomerName.split(' ')[0] : 'Add Customer'}</span>
          </Button>
          {(cart.length > 0 || variantDrafts.length > 0) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:bg-destructive/10"
              onClick={onClearCart}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Customer picker */}
      {showCustomer && (
        <CustomerPicker
          customerId={_customerId}
          onChange={onSetCustomerId}
          onClose={onCloseCustomer}
        />
      )}

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          {visibleCart.length === 0 && variantDrafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground py-16 px-4 text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
                <ShoppingCart className="h-7 w-7 opacity-30 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">Cart is empty</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Scan barcode or select products from the catalog to build this order
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {variantDrafts.map(draft => (
                <VariantPicker
                  key={draft.productId}
                  product={draft.product}
                  cart={cart}
                  format={format}
                  expanded={draft.expanded}
                  onToggle={() => onToggleVariantDraft(draft.productId)}
                  onClose={() => onRemoveVariantDraft(draft.productId)}
                  onSetQuantity={(name, quantity) => onSetVariantQuantity(draft.productId, name, quantity)}
                />
              ))}
              {visibleCart.map(item => {
                const lineKey = `${item.productId}::${item.variantName ?? ''}`;
                return (
                  <div key={lineKey}
                    className="flex flex-col gap-2 p-3 bg-card rounded-xl border shadow-xs hover:border-primary/30 transition-all">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-sm line-clamp-2 leading-snug">{item.productName}</span>
                        {item.variantName && (
                          <span className="mt-1 inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {item.variantName}
                          </span>
                        )}
                      </div>
                      <button onClick={() => onRemoveFromCart(lineKey)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1 -mr-1 -mt-1 rounded-md"
                        aria-label="Remove item">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex justify-between items-center pt-0.5">
                      <span className="text-xs text-muted-foreground font-medium">{format(item.sellingRate)} each</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg border bg-muted/30 flex items-center justify-center hover:bg-destructive/10 text-destructive transition-colors active:scale-95"
                          onClick={() => {
                            if (item.quantity === 1) onRemoveFromCart(lineKey);
                            else onUpdateCartQuantity(lineKey, -1);
                          }}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <Input
                          type="number"
                          inputMode="numeric"
                          className="h-8 w-12 text-center text-sm p-0 font-bold bg-background"
                          value={item.quantity}
                          onChange={e => onSetCartQuantity(lineKey, parseInt(e.target.value))}
                          min={1}
                          max={item.maxQuantity}
                          aria-label="Item quantity"
                        />
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg border bg-muted/30 flex items-center justify-center hover:bg-green-500/10 text-green-600 transition-colors active:scale-95"
                          onClick={() => onUpdateCartQuantity(lineKey, 1)}
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <span className="font-bold text-sm ml-1 w-20 text-right tabular-nums text-foreground">{format(item.subtotal)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Checkout panel */}
      <div className="p-3.5 border-t bg-muted/20 space-y-3 shrink-0 shadow-xs">
        {/* Compact Discount & Tax Bar */}
        <div className={isDiscountsEnabled ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1'}>
          {isDiscountsEnabled && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Discount</span>
                <div className="flex border rounded-md overflow-hidden bg-background h-5 text-[10px]">
                  <button
                    type="button"
                    className={cn(
                      'px-1.5 font-semibold transition-colors',
                      discountType === 'flat' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                    )}
                    onClick={() => { onSetDiscountType('flat'); onSetDiscountValue(0); }}
                  >
                    {symbol}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'px-1.5 font-semibold transition-colors border-l',
                      discountType === 'percent' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                    )}
                    onClick={() => { onSetDiscountType('percent'); onSetDiscountValue(0); }}
                  >
                    %
                  </button>
                </div>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  className="h-9 text-xs pr-7 bg-background font-medium"
                  value={discountValue || ''}
                  min={0}
                  max={discountType === 'percent' ? 100 : subtotal}
                  onChange={e => {
                    const val = Number(e.target.value);
                    const maxLimit = discountType === 'percent' ? 100 : subtotal;
                    onSetDiscountValue(Math.max(0, Math.min(maxLimit, val)));
                  }}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground select-none pointer-events-none">
                  {discountType === 'percent' ? '%' : symbol}
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Tax %</label>
            <Select value={taxPercent.toString()} onValueChange={v => onSetTaxPercent(Number(v))}>
              <SelectTrigger className="h-9 text-xs bg-background font-medium"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No Tax</SelectItem>
                <SelectItem value="13">13% VAT</SelectItem>
                <SelectItem value="5">5%</SelectItem>
                <SelectItem value="10">10%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Order Subtotal / Grand Total Breakdown */}
        <div className="space-y-1 text-xs bg-background/60 p-2.5 rounded-xl border border-border/70">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span><span className="tabular-nums font-medium">{format(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600 font-medium">
              <span>Discount</span><span className="tabular-nums">- {format(discount)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Tax ({taxPercent}%)</span><span className="tabular-nums font-medium">{format(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1.5 border-t font-extrabold text-base">
            <span className="text-foreground">Total Payable</span>
            <span className="text-primary text-xl tabular-nums tracking-tight">{format(grandTotal)}</span>
          </div>
        </div>

        {/* Payment Methods Grid */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Payment Method
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {(['cash', 'qr', 'card', 'bank', 'credit'] as PaymentMethod[]).map(m => {
              const isSelected = paymentMethod === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSetPaymentMethod(m)}
                  className={cn(
                    "flex flex-col items-center justify-center h-13 gap-1 rounded-xl border text-xs font-semibold transition-all active:scale-95",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background hover:bg-muted border-border text-foreground hover:border-primary/40"
                  )}
                >
                  {m === 'cash' && <Banknote className="h-4 w-4" />}
                  {m === 'qr' && <QrCode className="h-4 w-4" />}
                  {m === 'card' && <CreditCard className="h-4 w-4" />}
                  {m === 'bank' && <SplitSquareHorizontal className="h-4 w-4" />}
                  {m === 'credit' && <BookOpen className="h-4 w-4" />}
                  <span className="capitalize text-[11px] leading-tight font-medium">
                    {m === 'bank' ? 'Bank' : m === 'credit' ? 'Credit' : m}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* If Bank transfer is selected, show BankSelector (only if 2+ banks exist) */}
        {paymentMethod === 'bank' && onSetBankAccountId && (
          <div className="pt-0.5">
            <BankSelector
              selectedAccountId={selectedBankAccountId}
              onSelectAccountId={onSetBankAccountId}
              label="Deposit Destination Bank"
            />
          </div>
        )}

        {/* Paid Amount Input & Quick Cash Presets */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs text-muted-foreground font-semibold">
              {paymentMethod === 'credit' ? 'Paid now (optional)' : 'Paid Amount'}
            </label>
            {paymentMethod === 'credit' && (
              <span className="text-[11px] text-orange-600 font-semibold">0 = Full credit</span>
            )}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder={paymentMethod === 'credit' ? '0 for full credit' : `${format(grandTotal)} (exact)`}
            className={cn(
              "h-11 text-base font-bold bg-background rounded-xl transition-all",
              paidAmount !== '' && Number(paidAmount) < grandTotal && "border-destructive focus-visible:ring-destructive"
            )}
            value={paidAmount === 0 ? '' : paidAmount}
            onChange={e => onSetPaidAmount(e.target.value ? Number(e.target.value) : '')}
          />

          {/* Quick Cash Suggestions for fast mobile checkout */}
          {paymentMethod === 'cash' && grandTotal > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-0.5">
              {quickCashPresets.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSetPaidAmount(preset)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all shrink-0",
                    Number(paidAmount) === preset
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background hover:bg-muted border-border text-foreground"
                  )}
                >
                  {preset === grandTotal ? 'Exact' : format(preset)}
                </button>
              ))}
            </div>
          )}

          {paidAmount !== '' && Number(paidAmount) < grandTotal && (
            <p className={`text-xs font-semibold ${paymentMethod === 'credit' ? 'text-orange-600' : 'text-destructive'}`}>
              {paymentMethod === 'credit'
                ? `Credit balance due: ${format(grandTotal - Number(paidAmount))}`
                : `Short by ${format(grandTotal - Number(paidAmount))}`}
            </p>
          )}
          {change > 0 && (
            <div className="flex items-center justify-between text-xs font-bold text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <span>Change Return:</span>
              <span className="text-sm tabular-nums">{format(change)}</span>
            </div>
          )}
        </div>

        {paymentMethod === 'credit' && !selectedCustomerName && (
          <p className="rounded-xl bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-700 dark:text-orange-300 border border-orange-500/20">
            ⚠️ Please select a customer above before saving this sale as credit.
          </p>
        )}

        {/* Primary Action Button */}
        <Button
          size="lg"
          className="w-full h-12 text-sm font-bold shadow-md rounded-xl active:scale-98 transition-all"
          disabled={cart.length === 0 || (paymentMethod !== 'credit' && paidAmount !== '' && Number(paidAmount) < grandTotal) || (paymentMethod === 'credit' && !selectedCustomerName)}
          onClick={onCheckout}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          {paymentMethod === 'credit' ? 'Save Credit' : 'Complete Sale'} • {format(grandTotal)}
        </Button>
      </div>
    </div>
  );
});

CartPanel.displayName = 'CartPanel';
