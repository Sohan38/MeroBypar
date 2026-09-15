import React from 'react';
import {
  WifiOff,
  Zap,
  Building2,
  CalendarClock,
  Factory,
  BookOpen,
  Printer,
  ReceiptText,
} from 'lucide-react';

export function FeatureGrid() {
  const features = [
    {
      icon: WifiOff,
      title: '100% Offline-First Architecture',
      description:
        'Engineered with local Dexie & IndexedDB databases. Continue billing and managing inventory completely offline with zero dependency on cloud internet connections.',
      badge: 'Core Engine',
    },
    {
      icon: Zap,
      title: 'High-Speed POS & Barcode Engine',
      description:
        'Rapid keyboard shortcuts, instant item search, and seamless support for handheld USB/Bluetooth barcode guns and mobile camera scanners.',
      badge: 'Billing',
    },
    {
      icon: Building2,
      title: 'Multi-Location Stock Control',
      description:
        'Track stock levels independently across warehouses, retail counters, and branch locations. Perform internal stock transfers with full movement audit logs.',
      badge: 'Inventory',
    },
    {
      icon: CalendarClock,
      title: 'Batch Tracking & FEFO Expiry',
      description:
        'Track items by batch and expiry date. Automated First-Expired, First-Out (FEFO) logic ensures older inventory is sold or consumed first, minimizing spoilage.',
      badge: 'Perishables',
    },
    {
      icon: Factory,
      title: 'Production & Recipe BOM',
      description:
        'Define Bills of Materials (BOM) for manufacturing and kitchens. Atomically deduct raw ingredients and output finished goods with real-time cost calculation.',
      badge: 'Manufacturing',
    },
    {
      icon: BookOpen,
      title: 'Customer Khata & Supplier Payables',
      description:
        'Manage customer credit (Udharo) accounts, set credit limits, record partial payments, and track vendor payables with dedicated statement histories.',
      badge: 'Credit Ledger',
    },
    {
      icon: Printer,
      title: '58mm & 80mm Thermal Printing',
      description:
        'Customized thermal roll layouts with silent instant printing in the Windows desktop app, native Android print manager, and web browser printing.',
      badge: 'Hardware',
    },
    {
      icon: ReceiptText,
      title: 'Financial Cashbook & Daybook',
      description:
        'Comprehensive cash book and daybook for tracking daily cash in/out, expenses, sales reconciliation, and idempotent financial ledger postings.',
      badge: 'Accounting',
    },
  ];

  return (
    <section id="features" className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-14">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          Engineered for Reliability
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mt-2">
          Everything Your Business Needs in One Offline-Ready System
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
          From high-volume supermarket counters to multi-warehouse distributors and production kitchens, MeroByapar unites your operational workflows.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <div
              key={i}
              className="group relative p-6 rounded-2xl bg-card border border-border/80 hover:border-primary/40 shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                    <Icon className="size-5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                    {feature.badge}
                  </span>
                </div>
                <h3 className="font-bold text-base text-foreground mb-2 group-hover:text-primary transition-colors">
                  {feature.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
