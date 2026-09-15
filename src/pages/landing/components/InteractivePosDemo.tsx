import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Minus,
  Trash2,
  Receipt,
  RotateCcw,
  CheckCircle2,
  CreditCard,
  Banknote,
  QrCode,
  BookOpen,
  ShoppingBag,
  Sparkles,
  Printer,
} from 'lucide-react';

interface DemoProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  barcode: string;
  stock: number;
}

interface CartItem {
  product: DemoProduct;
  quantity: number;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  { id: 'dp-1', name: 'Wai Wai Quick Noodles', category: 'Grocery', price: 25, barcode: '890123456001', stock: 48 },
  { id: 'dp-2', name: 'DDC Fresh Milk (500ml)', category: 'Dairy', price: 55, barcode: '890123456002', stock: 24 },
  { id: 'dp-3', name: 'Tokla Gold Tea (250g)', category: 'Beverage', price: 180, barcode: '890123456003', stock: 15 },
  { id: 'dp-4', name: 'Aashirvaad Atta (5kg)', category: 'Staples', price: 540, barcode: '890123456004', stock: 10 },
  { id: 'dp-5', name: 'Fresh Bakery Croissant', category: 'Bakery', price: 120, barcode: '890123456005', stock: 18 },
  { id: 'dp-6', name: 'Himalayan Mineral Water', category: 'Beverage', price: 30, barcode: '890123456006', stock: 60 },
];

export function InteractivePosDemo() {
  const [cart, setCart] = useState<CartItem[]>([
    { product: DEMO_PRODUCTS[0], quantity: 2 },
    { product: DEMO_PRODUCTS[2], quantity: 1 },
  ]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr' | 'credit'>('cash');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [taxRate] = useState<number>(13); // 13% standard VAT
  const [checkedOut, setCheckedOut] = useState<boolean>(false);
  const [invoiceNumber] = useState<string>(() => `INV-DEMO-${Math.floor(1000 + Math.random() * 9000)}`);

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    return (subtotal * discountPercent) / 100;
  }, [subtotal, discountPercent]);

  const taxableAmount = subtotal - discountAmount;
  const taxAmount = (taxableAmount * taxRate) / 100;
  const total = taxableAmount + taxAmount;

  const handleAddToCart = (product: DemoProduct) => {
    setCheckedOut(false);
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setCheckedOut(false);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCheckedOut(false);
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleResetDemo = () => {
    setCart([
      { product: DEMO_PRODUCTS[0], quantity: 2 },
      { product: DEMO_PRODUCTS[2], quantity: 1 },
    ]);
    setDiscountPercent(0);
    setPaymentMethod('cash');
    setCheckedOut(false);
  };

  return (
    <section id="demo" className="py-16 md:py-24 bg-muted/40 border-y border-border/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
            <Sparkles className="size-3.5" />
            <span>Try It Right Now • Live Interactive Preview</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            Experience the High-Speed POS Workflow
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Test how items, barcode keys, tax calculations, and 58mm/80mm thermal receipts work. This sandbox runs 100% locally in your browser with demo data.
          </p>
        </div>

        {/* Interactive POS Sandbox Container */}
        <div className="bg-card rounded-2xl border border-border/80 shadow-xl overflow-hidden">
          {/* Mock Window Top Bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-red-400" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className="size-2.5 rounded-full bg-emerald-400" />
              <span className="font-semibold text-foreground ml-2">MeroByapar POS Terminal Sandbox</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                ● Local Database Active
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetDemo}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                title="Reset Sandbox"
              >
                <RotateCcw className="size-3" />
                <span className="hidden sm:inline">Reset Sandbox</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-border">
            {/* Left Column: Product Selection Grid (7 cols) */}
            <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="size-4 text-primary" />
                    <h3 className="font-bold text-sm text-foreground">Catalog Quick-Pick (Tap to Add)</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">Click item to bill</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {DEMO_PRODUCTS.map((prod) => (
                    <button
                      key={prod.id}
                      onClick={() => handleAddToCart(prod)}
                      className="group p-3 rounded-xl border border-border/80 bg-card hover:border-primary/50 hover:bg-primary/5 active:scale-95 transition-all text-left flex flex-col justify-between h-28 shadow-2xs"
                    >
                      <div>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
                          {prod.category}
                        </span>
                        <h4 className="font-semibold text-xs sm:text-sm text-foreground line-clamp-2 mt-0.5 group-hover:text-primary transition-colors">
                          {prod.name}
                        </h4>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40">
                        <span className="font-bold text-xs sm:text-sm text-primary">
                          Rs. {prod.price}
                        </span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          +{prod.stock}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Barcode Simulator Hint */}
              <div className="mt-6 p-3 rounded-xl bg-muted/50 border border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono bg-background">
                    Scanner Ready
                  </Badge>
                  <span>Supports USB handheld barcode guns and device camera scanning.</span>
                </div>
              </div>
            </div>

            {/* Right Column: Active Cart & Calculation / Receipt (5 cols) */}
            <div className="lg:col-span-5 p-4 sm:p-6 bg-card flex flex-col justify-between">
              {!checkedOut ? (
                <div>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Receipt className="size-4 text-primary" />
                      <h3 className="font-bold text-sm text-foreground">Current Bill</h3>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {cart.reduce((s, i) => s + i.quantity, 0)} Items
                    </span>
                  </div>

                  {/* Cart Items List */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        Cart is empty. Click a product on the left to add it!
                      </div>
                    ) : (
                      cart.map((item) => (
                        <div
                          key={item.product.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-border/60 text-xs"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-semibold text-foreground truncate">{item.product.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Rs. {item.product.price} × {item.quantity} = Rs. {item.product.price * item.quantity}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-6 rounded-md"
                              onClick={() => handleUpdateQty(item.product.id, -1)}
                            >
                              <Minus className="size-3" />
                            </Button>
                            <span className="w-5 text-center font-bold text-xs">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-6 rounded-md"
                              onClick={() => handleUpdateQty(item.product.id, 1)}
                            >
                              <Plus className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 rounded-md text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveItem(item.product.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Payment Method Selector */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1.5">
                      Tender / Payment Mode
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        onClick={() => setPaymentMethod('cash')}
                        className={`py-1.5 px-1 rounded-lg text-xs font-medium flex flex-col items-center gap-1 border transition-all ${
                          paymentMethod === 'cash'
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'border-border/80 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Banknote className="size-3.5" />
                        <span>Cash</span>
                      </button>
                      <button
                        onClick={() => setPaymentMethod('card')}
                        className={`py-1.5 px-1 rounded-lg text-xs font-medium flex flex-col items-center gap-1 border transition-all ${
                          paymentMethod === 'card'
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'border-border/80 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <CreditCard className="size-3.5" />
                        <span>Card</span>
                      </button>
                      <button
                        onClick={() => setPaymentMethod('qr')}
                        className={`py-1.5 px-1 rounded-lg text-xs font-medium flex flex-col items-center gap-1 border transition-all ${
                          paymentMethod === 'qr'
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'border-border/80 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <QrCode className="size-3.5" />
                        <span>QR / Fone</span>
                      </button>
                      <button
                        onClick={() => setPaymentMethod('credit')}
                        className={`py-1.5 px-1 rounded-lg text-xs font-medium flex flex-col items-center gap-1 border transition-all ${
                          paymentMethod === 'credit'
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'border-border/80 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <BookOpen className="size-3.5" />
                        <span>Khata</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Totals */}
                  <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-medium text-foreground">Rs. {subtotal.toFixed(2)}</span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Discount ({discountPercent}%)</span>
                        <span>-Rs. {discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>VAT ({taxRate}%)</span>
                      <span className="font-medium text-foreground">Rs. {taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-foreground pt-2 border-t border-border/80">
                      <span>Total Due</span>
                      <span className="text-primary text-base">Rs. {total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Complete Sale Button */}
                  <Button
                    onClick={() => setCheckedOut(true)}
                    disabled={cart.length === 0}
                    className="w-full mt-4 h-11 rounded-xl font-semibold text-xs sm:text-sm shadow-md active:scale-95 transition-all"
                  >
                    <span>Complete Checkout & Print Receipt</span>
                  </Button>
                </div>
              ) : (
                /* Simulated Thermal Receipt Preview */
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      <CheckCircle2 className="size-4" />
                      <span>Sale Completed!</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCheckedOut(false)}
                      className="h-7 text-xs"
                    >
                      New Sale
                    </Button>
                  </div>

                  {/* Thermal Roll Mock (58mm/80mm Style) */}
                  <div className="bg-muted/70 p-4 rounded-xl border border-dashed border-border font-mono text-[11px] leading-relaxed shadow-inner">
                    <div className="text-center pb-2 border-b border-border/60">
                      <p className="font-bold text-xs text-foreground uppercase">MeroByapar Retail Store</p>
                      <p className="text-[10px] text-muted-foreground">Kathmandu, Nepal • PAN: 601234567</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Tax Invoice: {invoiceNumber}</p>
                      <p className="text-[9px] text-muted-foreground">{new Date().toLocaleString()}</p>
                    </div>

                    {/* Receipt Items */}
                    <div className="py-2 border-b border-border/60 space-y-1">
                      {cart.map((item) => (
                        <div key={item.product.id} className="flex justify-between">
                          <span className="truncate max-w-[150px]">
                            {item.quantity}x {item.product.name}
                          </span>
                          <span>{(item.product.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Receipt Totals */}
                    <div className="pt-2 space-y-0.5">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal:</span>
                        <span>Rs. {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>VAT (13%):</span>
                        <span>Rs. {taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-foreground text-xs pt-1 border-t border-border/40">
                        <span>GRAND TOTAL:</span>
                        <span>Rs. {total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                        <span>Payment:</span>
                        <span className="uppercase font-semibold text-foreground">{paymentMethod}</span>
                      </div>
                    </div>

                    <div className="text-center pt-3 mt-2 border-t border-dashed border-border/60 text-[9px] text-muted-foreground">
                      <p>*** THANK YOU FOR YOUR BUSINESS ***</p>
                      <p className="mt-0.5">Printed via MeroByapar Thermal Engine</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <Printer className="size-3.5 text-primary" />
                    <span>Silent instant output supported on Windows Desktop & Mobile.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
