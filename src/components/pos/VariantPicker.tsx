import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Layers, Minus, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CartItem, Product } from '@/types';
import { rankSearch } from '@/utils/search/rank';
import { normalize } from '@/utils/search/normalize';

interface VariantPickerProps {
    product: Product;
    cart: CartItem[];
    format: (value: number) => string;
    expanded?: boolean;
    onToggle?: () => void;
    onClose: () => void;
    onSetQuantity: (name: string, quantity: number) => void;
}

export function VariantPicker({
    product,
    cart,
    format,
    expanded = true,
    onToggle,
    onClose,
    onSetQuantity,
}: VariantPickerProps) {
    const [query, setQuery] = useState('');
    const variants = useMemo(
        () => (product.variants ?? []).filter(variant => variant.name.trim()),
        [product.variants],
    );
    const filteredVariants = useMemo(() => {
        const normalizedQuery = normalize(query);
        if (!normalizedQuery) return variants.slice(0, 2);

        return rankSearch(
            variants.map(variant => ({
                ...variant,
                name: variant.name,
            })),
            query,
            2,
        );
    }, [query, variants]);
    const getQuantity = (name: string) =>
        cart.find(item => item.productId === product.id && item.variantName === name)?.quantity ?? 0;
    const totalSelected = variants.reduce((sum, variant) => sum + getQuantity(variant.name), 0);
    const productStock = product.quantity;

    return (
        <div className="rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Layers className="h-4 w-4" />
                </div>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggle}>
                    <p className="truncate text-sm font-semibold">{product.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                        {totalSelected} / {productStock} {product.unit} selected · {variants.length} options
                    </p>
                </button>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {format(product.sellingRate)} each
                </span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Close variant editor">
                    <X className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onToggle} aria-label={expanded ? 'Collapse variants' : 'Expand variants'}>
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </div>

            {expanded && (
                <div className="pt-3">
                    <div className="relative mb-2">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Filter options…"
                            className="h-9 rounded-lg bg-background pl-8 pr-8 text-sm"
                            aria-label="Filter variants"
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear variant filter">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="max-h-56 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
                        {filteredVariants.length === 0 ? (
                            <p className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
                                {variants.length === 0 ? 'No variants available for this product' : 'No matching options'}
                            </p>
                        ) : (
                            filteredVariants.map(variant => {
                                const quantity = getQuantity(variant.name);
                                const otherSelected = totalSelected - quantity;
                                const isOutOfStock = variant.quantity <= 0;
                                const atProductLimit = otherSelected + quantity >= productStock;
                                return (
                                    <VariantRow
                                        key={variant.name}
                                        variant={variant}
                                        unit={product.unit}
                                        quantity={quantity}
                                        isOutOfStock={isOutOfStock}
                                        atProductLimit={atProductLimit}
                                        onSetQuantity={onSetQuantity}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface VariantRowProps {
    variant: { name: string; quantity: number };
    unit: string;
    quantity: number;
    isOutOfStock: boolean;
    atProductLimit: boolean;
    onSetQuantity: (name: string, quantity: number) => void;
}

function VariantRow({
    variant,
    unit,
    quantity,
    isOutOfStock,
    atProductLimit,
    onSetQuantity,
}: VariantRowProps) {
    const [draftQty, setDraftQty] = useState<string>(String(quantity));

    // Sync draft with external quantity change
    useMemo(() => {
        setDraftQty(String(quantity));
    }, [quantity]);

    const commitValue = () => {
        const parsed = parseInt(draftQty, 10);
        if (isNaN(parsed) || parsed < 0) {
            setDraftQty(String(quantity));
        } else {
            const clamped = Math.min(parsed, variant.quantity);
            onSetQuantity(variant.name, clamped);
            setDraftQty(String(clamped));
        }
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const val = event.target.value;
        if (val === '') {
            setDraftQty('');
            return;
        }
        const num = parseInt(val, 10);
        if (!isNaN(num)) {
            setDraftQty(val);
            if (num >= 0) {
                onSetQuantity(variant.name, num);
            }
        }
    };

    return (
        <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${quantity > 0 ? 'border-primary/30 bg-background' : 'bg-background/60'}`}>
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${quantity > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {quantity > 0 ? <Check className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{variant.name}</p>
                <p className={`text-[11px] ${isOutOfStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {isOutOfStock ? 'Out of stock' : `${variant.quantity} ${unit} available`}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    disabled={quantity === 0}
                    onClick={() => onSetQuantity(variant.name, quantity - 1)}
                    aria-label={`Decrease ${variant.name} quantity`}
                >
                    <Minus className="h-3 w-3" />
                </Button>
                <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draftQty}
                    disabled={isOutOfStock}
                    onFocus={e => e.target.select()}
                    onChange={handleChange}
                    onBlur={commitValue}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.currentTarget.blur();
                        }
                    }}
                    className="h-8 w-12 rounded-lg p-0 text-center text-sm font-bold"
                    aria-label={`${variant.name} quantity`}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    disabled={isOutOfStock || quantity >= variant.quantity || atProductLimit}
                    onClick={() => onSetQuantity(variant.name, quantity + 1)}
                    aria-label={`Increase ${variant.name} quantity`}
                >
                    <Plus className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}