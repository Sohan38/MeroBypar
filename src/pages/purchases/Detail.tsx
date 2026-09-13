import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { usePurchases, useSuppliers, useInventory, useProductBatches, useLocations } from '@/contexts/GlobalProviders';
import { useStorageProvider } from '@/storage/StorageContext';
import { useCurrency } from '@/hooks/useCurrency';
import { useSmartBack } from '@/contexts/NavigationContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CalendarDays, Edit, FileText, Package, Trash2, Truck } from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { deletePurchase } from '@/services/purchaseService';

export default function PurchaseDetail() {
    const { id } = useParams<{ id: string }>();
    const [, setLocation] = useLocation();
    const goBack = useSmartBack('/purchases');
    const storage = useStorageProvider();
    const { items: purchases, refresh: refreshPurchases } = usePurchases();
    const { items: suppliers } = useSuppliers();
    const { items: locations } = useLocations();
    const { items: inventory, refresh: refreshInventory } = useInventory();
    const { items: batches, refresh: refreshBatches } = useProductBatches();
    const { format } = useCurrency();
    const [deleting, setDeleting] = useState(false);

    const purchase = purchases.find(candidate => candidate.id === id);
    const supplier = suppliers.find(candidate => candidate.id === purchase?.supplierId);
    const purchaseLocation = purchase?.locationId ? locations.find(candidate => candidate.id === purchase.locationId) : null;

    const items = useMemo(() => purchase?.items.map(item => ({
        item,
        product: inventory.find(product => product.id === item.productId),
        batch: batches.find(batch => batch.id === item.batchId) ??
            batches.find(batch => batch.purchaseInvoiceId === purchase?.id && batch.productId === item.productId),
    })) ?? [], [purchase, inventory, batches]);

    if (!purchase) {
        return (
            <div className="p-6 text-center">
                <p className="text-muted-foreground">Purchase not found.</p>
                <Button variant="outline" className="mt-4" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back to Purchases</Button>
            </div>
        );
    }

    const purchaseId = purchase.id;
    const status = purchase.status ?? 'received';
    const statusClass = status === 'received'
        ? 'bg-green-100 text-green-700 border-green-300'
        : status === 'cancelled'
            ? 'bg-red-100 text-red-700 border-red-300'
            : 'bg-amber-100 text-amber-700 border-amber-300';

    async function handleDelete() {
        if (!window.confirm('Cancel this purchase and reverse its inventory changes?')) return;
        setDeleting(true);
        try {
            await deletePurchase(storage, purchaseId);
            refreshPurchases();
            refreshInventory();
            refreshBatches();
            toast.success('Purchase cancelled and inventory recalculated');
            setLocation('/purchases');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to cancel purchase');
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto pb-28 md:pb-8">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
                    <div className="min-w-0">
                        <h1 className="text-xl md:text-2xl font-bold truncate">{purchase.invoiceNumber || 'Purchase receipt'}</h1>
                        <p className="text-sm text-muted-foreground">{supplier?.name ?? purchase.supplierName ?? 'Unknown supplier'}</p>
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    {status !== 'cancelled' && <Button variant="outline" size="sm" onClick={() => setLocation(`/purchases/${purchase.id}/edit`)}><Edit className="h-4 w-4 mr-1" /> Edit</Button>}
                    {status !== 'cancelled' && <Button variant="ghost" size="sm" className="text-destructive" disabled={deleting} onClick={handleDelete}><Trash2 className="h-4 w-4 mr-1" /> Cancel</Button>}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Date</p><p className="font-semibold mt-1">{formatDate(parseISO(purchase.date), 'dd MMM yyyy')}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Supplier</p><p className="font-semibold mt-1 truncate">{supplier?.name ?? purchase.supplierName ?? '—'}</p></CardContent></Card>
                {purchaseLocation && <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Location</p><p className="font-semibold mt-1 truncate">{purchaseLocation.name}</p></CardContent></Card>}
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Status</p><Badge className={`mt-2 capitalize ${statusClass}`}>{status}</Badge></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payment</p><p className="font-semibold mt-1 capitalize">{purchase.paymentStatus ?? purchase.paymentMethod}</p></CardContent></Card>
            </div>

            <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Products received <Badge variant="secondary" className="ml-auto">{purchase.items.length}</Badge></CardTitle></CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y">
                        {items.map(({ item, product, batch }) => (
                            <div key={`${item.productId}-${item.batchId ?? item.productName}`} className="p-4 space-y-2">
                                <div className="flex justify-between gap-3">
                                    <div>
                                        <p className="font-medium">{item.productName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.packQuantity && item.packQuantity > 0
                                                ? `${item.packQuantity} ${item.packUnit || 'pack'}(s) · ${item.quantity} ${product?.unit ?? 'unit'} × ${format(item.purchaseRate)}`
                                                : `${product?.unit ?? 'unit'} · ${item.quantity} × ${format(item.purchaseRate)}`}
                                        </p>
                                    </div>
                                    <p className="font-semibold">{format(item.subtotal)}</p>
                                </div>
                                {batch && <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1"><span>Batch {batch.batchNumber}</span><span>Remaining {batch.quantity}</span>{batch.expiryDate && <span>Expires {batch.expiryDate}</span>}</div>}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 md:p-6 space-y-3">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{format(purchase.items.reduce((sum, item) => sum + item.subtotal, 0))}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span>{format(purchase.discount)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Tax</span><span>{format(purchase.tax)}</span></div>
                    <div className="border-t pt-3 flex justify-between"><span className="font-bold">Total</span><span className="font-bold text-xl text-primary">{format(purchase.grandTotal)}</span></div>
                    {(purchase.referenceNumber || purchase.notes) && <div className="border-t pt-3 text-sm space-y-2"><p className="font-medium flex items-center gap-1"><FileText className="h-4 w-4" /> Notes</p>{purchase.referenceNumber && <p className="text-muted-foreground">Reference: {purchase.referenceNumber}</p>}{purchase.notes && <p className="text-muted-foreground whitespace-pre-wrap">{purchase.notes}</p>}</div>}
                </CardContent>
            </Card>
        </div>
    );
}