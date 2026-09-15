import React, { useState } from 'react';
import {
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  Hotel,
  Factory,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

export function SolutionsTabs() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>('retail');

  const solutions = [
    {
      id: 'retail',
      label: 'Retail & Supermarkets',
      icon: ShoppingBag,
      title: 'Built for Fast-Paced Retail & Grocery Counters',
      description:
        'Handle high-volume customer lines smoothly. Fast barcode scanning, quick change calculation, and instant thermal printing keep your queues moving without internet delays.',
      highlights: [
        'Hardware barcode scanner support (USB / Bluetooth / Camera)',
        'Batch tracking & FEFO expiry alerts for packaged food and FMCG',
        'Customer credit ledger (Khata) for trusted regular shoppers',
        'Flexible tenders: Cash, Card, Fonepay QR, and split payments',
      ],
      tagline: 'Zero queue delays during peak hours',
    },
    {
      id: 'wholesale',
      label: 'Wholesale & Trade',
      icon: Truck,
      title: 'Precision Multi-Location & Credit Management',
      description:
        'Designed for distributors managing bulk goods across multiple warehouses. Monitor warehouse balances, move stock between branches, and enforce customer credit limits.',
      highlights: [
        'Multi-location stock visibility with inter-branch transfers',
        'Customer credit ledgers with balance limits and payment receipts',
        'Vendor purchase tracking with accounts payable reconciliation',
        'Comprehensive movement history and stock audit logs',
      ],
      tagline: 'Track every sack, carton, and crate across warehouses',
    },
    {
      id: 'restaurant',
      label: 'Restaurants & Cafes',
      icon: UtensilsCrossed,
      title: 'Streamlined Dine-In & Table Operations',
      description:
        'Manage table orders, handle customer bills quickly, and track kitchen ingredient consumption so food costs remain tightly controlled.',
      highlights: [
        'Interactive table order management and billing workflow',
        'Direct raw material consumption tracking for kitchen ingredients',
        'Item discounts, service tax options, and split payment modes',
        'Integrated daily cashbook for tracking shift expenses and revenue',
      ],
      tagline: 'Keep front-of-house and kitchen operations aligned',
    },
    {
      id: 'hotel',
      label: 'Hotels & Lodges',
      icon: Hotel,
      title: 'Visual Room Grid & Front-Desk Billing',
      description:
        'Get a clear, color-coded room status overview for front desk staff. Manage guest check-ins, record stays, and bill room folios directly in your POS.',
      highlights: [
        'Live room grid displaying Available, Occupied, and Cleaning states',
        'Guest check-in, duration, and room rate management',
        'Consolidated room billing with taxes and service charges',
        'Direct posting into daily accounting and cashbook journals',
      ],
      tagline: 'Simplified lodge front-desk operations',
    },
    {
      id: 'manufacturing',
      label: 'Bakeries & Production',
      icon: Factory,
      title: 'Recipe BOM & Raw Material Consumption',
      description:
        'Transform raw ingredients into finished, sellable products. Set up standard recipes, record batch yields, and calculate true unit production costs.',
      highlights: [
        'Bill of Materials (BOM) templates for repeatable recipes',
        'Atomic raw material stock deduction upon production execution',
        'Automatic calculation of finished goods unit cost from ingredients',
        'Scrap, damage, and batch disposition tracking',
      ],
      tagline: 'Accurate batch yield costing and raw material control',
    },
  ];

  const current = solutions.find((s) => s.id === activeTab) || solutions[0];
  const CurrentIcon = current.icon;

  return (
    <section id="solutions" className="py-16 md:py-24 bg-muted/30 border-y border-border/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Tailored Workflows
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mt-2">
            Tailored Solutions for Your Specific Business Model
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Activate the specific operational modules your business needs while keeping the interface focused and uncluttered.
          </p>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-3 mb-8 no-scrollbar">
          {solutions.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border/70 hover:border-border'
                }`}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Solution Content Card */}
        <div className="bg-card rounded-2xl border border-border/80 p-6 sm:p-8 lg:p-10 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content (7 cols) */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
                <CurrentIcon className="size-3.5" />
                <span>{current.tagline}</span>
              </div>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight mb-3">
                {current.title}
              </h3>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-6">
                {current.description}
              </p>

              <div className="space-y-3 mb-8">
                {current.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="size-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="size-3" />
                    </div>
                    <span className="text-xs sm:text-sm text-foreground font-medium">{h}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => setLocation('/')}
                className="font-semibold text-xs sm:text-sm gap-2 h-10 px-5 rounded-xl shadow-xs"
              >
                <span>Launch App to Test Workflow</span>
                <ArrowRight className="size-4" />
              </Button>
            </div>

            {/* Right Visual Graphic (5 cols) */}
            <div className="lg:col-span-5 bg-muted/50 rounded-xl border border-border/80 p-6 flex flex-col justify-center">
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-card border border-border/80 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-primary block">Verified Module</span>
                  <p className="text-sm font-bold text-foreground mt-0.5">{current.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Toggle this module in Settings &gt; Features at any time to enable or disable it.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-border/80 shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Offline Capable</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Operates without cloud connectivity using local IndexedDB storage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
