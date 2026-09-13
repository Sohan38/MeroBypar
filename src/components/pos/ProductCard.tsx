import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Haptics } from '@/services/haptics';

interface Props {
    product: any;
    format: (value: number) => string;
    onClick: () => void;
}

export const ProductCard = memo(function ProductCard({
    product,
    format,
    onClick,
}: Props) {
    const isLowStock = product.quantity <= (product.minStockAlert ?? 5);

    const handleClick = () => {
        Haptics.light();
        onClick();
    };

    return (
        <Card
            className="group cursor-pointer hover:border-primary/50 hover:shadow-xs transition-all duration-150 active:scale-[0.96] select-none overflow-hidden bg-card border-border/70 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.02)]"
            onClick={handleClick}
        >
            <CardContent className="p-3 text-left flex flex-col justify-between h-full space-y-2">
                <div className="space-y-1">
                    <div className="flex items-start justify-between gap-1.5">
                        <span className="font-semibold line-clamp-2 text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors leading-snug">
                            {product.name}
                        </span>
                        {product.hasVariants && (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                Variants
                            </span>
                        )}
                    </div>
                    {product.category && (
                        <p className="text-[10px] text-muted-foreground truncate">
                            {product.category}
                        </p>
                    )}
                </div>

                <div className="pt-1 border-t border-border/40 flex items-center justify-between">
                    <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <span className={cn(
                            "inline-block w-1.5 h-1.5 rounded-full",
                            isLowStock ? "bg-amber-500" : "bg-emerald-500"
                        )} />
                        <span>{product.quantity} {product.unit || 'pcs'}</span>
                    </div>

                    <div className="text-primary font-bold text-xs sm:text-sm tabular-nums tracking-tight">
                        {format(product.sellingRate)}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});