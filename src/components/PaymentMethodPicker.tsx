import { Button } from '@/components/ui/button';
import { Banknote, CreditCard, Landmark, MoreHorizontal, QrCode, SplitSquareHorizontal } from 'lucide-react';

export const SETTLE_PAYMENT_METHODS = ['cash', 'qr', 'card', 'bank', 'other'] as const;
export type SettlePaymentMethod = (typeof SETTLE_PAYMENT_METHODS)[number];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Cash',
    qr: 'QR / Mobile Pay',
    card: 'Card',
    bank: 'Bank Transfer',
    split: 'Split Payment',
    other: 'Other',
};

interface PaymentMethodPickerProps<T extends string = SettlePaymentMethod> {
    label?: string;
    selectedMethod: T | string;
    onSelect: (method: any) => void;
    methods?: readonly (T | string)[];
}

export function PaymentMethodPicker<T extends string = SettlePaymentMethod>({
    label = 'Payment method',
    selectedMethod,
    onSelect,
    methods = SETTLE_PAYMENT_METHODS as unknown as readonly T[],
}: PaymentMethodPickerProps<T>) {
    return (
        <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                {label}
            </label>

            {/* Swipeable row */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
                {methods.map((method) => (
                    <Button
                        key={method}
                        type="button"
                        variant={selectedMethod === method ? 'default' : 'outline'}
                        className="flex-col h-14 min-w-20 gap-1 text-xs shrink-0 snap-start transition-all"
                        onClick={() => onSelect(method)}
                    >
                        {method === 'cash' && <Banknote className="h-4 w-4" />}
                        {method === 'qr' && <QrCode className="h-4 w-4" />}
                        {method === 'card' && <CreditCard className="h-4 w-4" />}
                        {method === 'bank' && <Landmark className="h-4 w-4" />}
                        {method === 'split' && <SplitSquareHorizontal className="h-4 w-4" />}
                        {method === 'other' && <MoreHorizontal className="h-4 w-4" />}
                        <span className="text-center leading-tight whitespace-nowrap">
                            {PAYMENT_METHOD_LABELS[method] || method}
                        </span>
                    </Button>
                ))}
            </div>
        </div>
    );
}