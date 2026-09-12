import { useParams, useLocation } from 'wouter';
import { useSales, useCustomers } from '@/contexts/GlobalProviders';
import { useApp } from '@/contexts/AppContext';
import { useSmartBack } from '@/contexts/NavigationContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useStorageProvider } from '@/storage/StorageContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { format as formatDate, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Printer, ShoppingCart, User, Calendar, CreditCard, Undo2, AlertTriangle } from 'lucide-react';
import { SaleBillPrint } from '@/components/SaleBillPrint';
import { useMemo, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { voidSale } from '@/services/saleRollbackService';

import { useFeature } from '@/hooks/useFeature';

export default function SaleDetail() {
  const isDiscountsEnabled = useFeature('sales', 'discounts');
  const goBack = useSmartBack('/sales');
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { items: sales } = useSales();
  const { items: customers } = useCustomers();
  const { settings } = useApp();
  const { format } = useCurrency();
  const storage = useStorageProvider();
  const confirm = useConfirm();
  const [showPrint, setShowPrint] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const sale = useMemo(
    () => sales.find(s => s.id === id),
    [sales, id]
  );

  const customer = useMemo(
    () => sale?.customerId
      ? customers.find(c => c.id === sale.customerId)
      : null,
    [customers, sale]
  );

  const isVoided = sale?.status === 'voided';

  const handleVoidConfirm = useCallback(async () => {
    if (!sale || !voidReason.trim()) return;

    setVoiding(true);
    try {
      const result = await voidSale(storage, {
        saleId: sale.id,
        reason: voidReason.trim(),
      });

      setVoidDialogOpen(false);
      setVoidReason('');

      const messages: string[] = ['Sale voided successfully'];
      if (result.creditRemoved) messages.push('Linked credit removed');
      toast.success(messages.join(' • '));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to void sale');
      console.error('Void sale error:', e);
    } finally {
      setVoiding(false);
    }
  }, [sale, voidReason, storage]);

  const handleVoidClick = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Void this sale?',
      description: 'This will restore all inventory, reverse financial records, and mark this sale as voided. This action cannot be undone.',
      confirmLabel: 'Continue to Void',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });

    if (confirmed) {
      setVoidDialogOpen(true);
    }
  }, [confirm]);

  if (!sale) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Sale not found.</p>
        <Button variant="outline" className="mt-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sales
        </Button>
      </div>
    );
  }

  const { subtotal, saleDate } = useMemo(() => {
    const subtotal = sale.items.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

    let saleDate = '';

    try {
      saleDate = formatDate(
        parseISO(sale.date),
        'PPpp'
      );
    } catch {
      saleDate = formatDate(
        new Date(sale.date),
        'PPpp'
      );
    }

    return {
      subtotal,
      saleDate,
    };

  }, [sale]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">Sale Details</h1>
              {isVoided && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 uppercase font-bold tracking-wider">
                  Voided
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{sale.id.slice(-8).toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isVoided && (
            <Button
              variant="outline"
              onClick={handleVoidClick}
              className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Undo2 className="h-4 w-4" />
              <span className="hidden sm:inline">Void Sale</span>
            </Button>
          )}
          <Button onClick={() => setShowPrint(true)} className="gap-2">
            <Printer className="h-4 w-4" /> Print Bill
          </Button>
        </div>
      </div>

      {/* Voided Banner */}
      {isVoided && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-destructive">This sale has been voided</p>
            <p className="text-xs text-muted-foreground mt-1">
              {sale.voidedAt && (
                <>Voided on {(() => { try { return formatDate(parseISO(sale.voidedAt), 'PPpp'); } catch { return sale.voidedAt; } })()}</>
              )}
              {sale.voidedReason && (
                <> — <span className="font-medium text-foreground">{sale.voidedReason}</span></>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              All inventory has been restored and financial records reversed. This record is preserved for audit purposes.
            </p>
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Date & Time</p>
              <p className="font-medium text-sm">{saleDate}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Payment</p>
              <Badge variant="outline" className="capitalize mt-1">{sale.paymentMethod}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <User className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium text-sm">{customer?.name || 'Walk-in'}</p>
              {customer?.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> Items ({sale.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="hidden md:grid grid-cols-12 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase bg-muted/30">
              <span className="col-span-6">Product</span>
              <span className="col-span-2 text-right">Qty</span>
              <span className="col-span-2 text-right">Rate</span>
              <span className="col-span-2 text-right">Total</span>
            </div>
            {sale.items.map((item, i) => (
              <div key={i} className="flex flex-col md:grid md:grid-cols-12 px-4 py-3 gap-1 md:gap-0 text-sm">
                <span className="col-span-6 font-medium truncate">{item.productName}</span>
                <div className="flex justify-between items-center md:contents text-xs md:text-sm text-muted-foreground md:text-foreground">
                  <span className="md:col-span-2 md:text-right">
                    <span className="md:hidden">Qty: </span>{item.quantity}
                  </span>
                  <span className="md:col-span-2 md:text-right">
                    <span className="md:hidden">Rate: </span>{format(item.sellingRate)}
                  </span>
                  <span className="md:col-span-2 md:text-right font-semibold text-foreground">
                    <span className="md:hidden text-muted-foreground font-normal">Total: </span>{format(item.subtotal)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span><span>{format(subtotal)}</span>
          </div>
          {sale.discount > 0 && isDiscountsEnabled && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span><span>– {format(sale.discount)}</span>
            </div>
          )}
          {sale.tax > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tax</span><span>{format(sale.tax)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-2 border-t">
            <span>Grand Total</span><span className="text-primary">{format(sale.grandTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Paid</span>
            <span className="font-medium">{format(sale.paidAmount)}</span>
          </div>
          {sale.paidAmount > sale.grandTotal && (
            <div className="flex justify-between text-sm text-green-600 font-medium">
              <span>Change</span><span>{format(sale.paidAmount - sale.grandTotal)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {showPrint && (
        <SaleBillPrint
          sale={sale}
          settings={settings}
          customerName={customer?.name}
          open={showPrint}
          onClose={() => setShowPrint(false)}
        />
      )}

      {/* Void Reason Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={(open) => { if (!voiding) setVoidDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Undo2 className="h-5 w-5" />
              Void Sale
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for voiding this sale. This is required for audit purposes and cannot be changed later.
            </p>
            <Input
              placeholder="e.g. Customer returned items, Wrong items scanned, Duplicate entry…"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              autoFocus
              disabled={voiding}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => { setVoidDialogOpen(false); setVoidReason(''); }}
              disabled={voiding}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoidConfirm}
              disabled={!voidReason.trim() || voiding}
            >
              {voiding ? 'Voiding…' : 'Void Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
