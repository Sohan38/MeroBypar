import { Link, useLocation } from 'wouter';
import { Home, Package, ShoppingCart, Building2, Grid } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Haptics } from '@/services/haptics';

export function BottomNav() {
  const [location] = useLocation();

  // Modern 5-tab layout:
  // 1. Home / Dashboard
  // 2. POS / Sales
  // 3. Stock / Inventory
  // 4. Accounts & Banking
  // 5. Menu / Hub
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
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/85 backdrop-blur-xl border-t border-border/60 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
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
              onClick={() => Haptics.light()}
              className="flex-1 flex justify-center items-center py-1 group touch-manipulation focus:outline-none"
            >
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center w-full py-1 px-1 rounded-2xl transition-all duration-150 active:scale-90",
                  isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {/* Smooth sliding pill indicator */}
                {isActive && (
                  <motion.span
                    layoutId="bottomNavPill"
                    className="absolute -top-1.5 w-7 h-1 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}

                <div
                  className={cn(
                    "p-1.5 rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-primary/12 scale-110 shadow-xs"
                      : "group-hover:bg-muted/40"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5 transition-transform duration-200",
                      isActive ? "stroke-[2.5] text-primary" : "stroke-[1.8]"
                    )}
                  />
                </div>

                <span
                  className={cn(
                    "text-[10px] tracking-tight leading-none mt-0.5 transition-all duration-150",
                    isActive ? "font-bold text-primary" : "font-medium text-muted-foreground"
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

