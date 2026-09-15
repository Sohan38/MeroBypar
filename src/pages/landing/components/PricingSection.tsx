import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, ShieldCheck, Zap, Building2, HelpCircle } from 'lucide-react';
import { useLocation } from 'wouter';

export function PricingSection() {
  const [, setLocation] = useLocation();

  const tiers = [
    {
      name: 'Starter Trial',
      badge: 'Evaluation Tier',
      price: 'Free Evaluation',
      period: 'Full access to core features',
      description: 'Ideal for testing MeroByapar in your store and evaluating the offline POS workflow.',
      features: [
        'Single-device offline POS billing',
        'Barcode scanner integration',
        'Inventory tracking & low stock alerts',
        'Thermal receipt printing (58mm & 80mm)',
        'Customer credit (Khata) management',
        'Local database backup & JSON export',
      ],
      ctaText: 'Launch Free Trial',
      ctaVariant: 'outline' as const,
      popular: false,
    },
    {
      name: 'Business Pro',
      badge: 'Most Popular',
      price: 'Contact for License',
      period: 'Local-first offline license',
      description: 'Complete commercial package for grocery stores, supermarkets, retail shops, and wholesalers.',
      features: [
        'Everything in Starter Trial',
        'Multi-location & warehouse transfers',
        'Batch tracking & automated FEFO expiry',
        'Silent background thermal printing (Windows)',
        'Recipe & BOM raw material consumption',
        'Financial cashbook, daybook & audit ledger',
        'Comprehensive sales & product reports',
      ],
      ctaText: 'Get Business License',
      ctaVariant: 'default' as const,
      popular: true,
    },
    {
      name: 'Hospitality & Enterprise',
      badge: 'Complete Suite',
      price: 'Custom Deployment',
      period: 'Multi-branch & specialized modules',
      description: 'Tailored for hotels, lodges, restaurants, and manufacturing bakeries needing specialized workflows.',
      features: [
        'Everything in Business Pro',
        'Hotel room grid & front-desk stay billing',
        'Restaurant & cafe table order billing',
        'Advanced manufacturing recipe costing',
        'Custom receipt header & invoice numbering',
        'Multi-terminal network setup consultation',
      ],
      ctaText: 'Contact for Enterprise',
      ctaVariant: 'outline' as const,
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-14">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          Plans & Licensing
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mt-2">
          Transparent, Feature-Driven Business Plans
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground">
          Your business data remains locally on your devices. Activate features according to your operational model without monthly cloud lock-ins.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
        {tiers.map((tier, idx) => (
          <div
            key={idx}
            className={`relative p-6 sm:p-8 rounded-2xl bg-card border transition-all flex flex-col justify-between ${
              tier.popular
                ? 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/30'
                : 'border-border/80 shadow-2xs hover:border-border'
            }`}
          >
            {tier.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-sm">
                {tier.badge}
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-foreground">{tier.name}</h3>
                {!tier.popular && (
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {tier.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-5 min-h-[36px]">
                {tier.description}
              </p>

              <div className="mb-6 pb-6 border-b border-border/70">
                <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  {tier.price}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{tier.period}</div>
              </div>

              <div className="space-y-3 mb-8">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Included Capabilities:
                </span>
                {tier.features.map((feat, fIdx) => (
                  <div key={fIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-foreground/90">
                    <Check className="size-4 text-primary shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Button
                variant={tier.ctaVariant}
                onClick={() => setLocation('/')}
                className="w-full h-11 font-semibold text-xs sm:text-sm rounded-xl active:scale-95 transition-all"
              >
                {tier.ctaText}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center text-xs text-muted-foreground max-w-xl mx-auto flex items-center justify-center gap-1.5">
        <HelpCircle className="size-4 text-muted-foreground shrink-0" />
        <span>
          Looking to evaluate MeroByapar? Launch the web application directly to explore all modules in live sandbox mode.
        </span>
      </div>
    </section>
  );
}
