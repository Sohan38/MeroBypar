import { Link, useLocation } from 'wouter';
import { Home, Package, ShoppingCart, Building2, Grid } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const [location] = useLocation();

  // Modern 5-tab layout:
  // 1. Home / Dashboard
  // 2. POS / Sales
  // 3. Inventory
  // 4. Accounts & Banking (Directly in bottom nav!)
  // 5. More / Hub (Dedicated modern page)
  const navItems = [
    { href: '/', label: 'Home', icon: Home, exact: true },
    { href: '/sales', label: 'Sales', icon: ShoppingCart, exact: false },
    { href: '/inventory', label: 'Stock', icon: Package, exact: false },
    { href: '/accounts', label: 'Accounts', icon: Building2, exact: false },
    { href: '/more', label: 'Menu', icon: Grid, exact: false, altHrefs: ['/extras'] },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border/70 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center justify-around h-16 px-1.5 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = item.exact
            ? location === item.href
            : location === item.href ||
              location.startsWith(item.href + '/') ||
              (item.altHrefs && item.altHrefs.some(alt => location === alt || location.startsWith(alt + '/')));

          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex justify-center items-center py-1 group touch-manipulation"
            >
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center w-full py-1 px-1 rounded-xl transition-all duration-200",
                  isActive
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground active:scale-95"
                )}
              >
                {/* Active Indicator Top Glow / Pill */}
                {isActive && (
                  <span className="absolute -top-1.5 w-8 h-1 rounded-full bg-primary animate-in fade-in zoom-in duration-200" />
                )}

                <div
                  className={cn(
                    "p-1.5 rounded-xl transition-all duration-200",
                    isActive ? "bg-primary/10 scale-110 shadow-xs" : "group-hover:bg-muted/50"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5 transition-transform",
                      isActive ? "stroke-[2.4] text-primary" : "stroke-[1.8]"
                    )}
                  />
                </div>

                <span
                  className={cn(
                    "text-[10px] tracking-tight leading-none mt-0.5 transition-colors",
                    isActive ? "font-bold text-primary" : "font-medium"
                  )}
                >
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
