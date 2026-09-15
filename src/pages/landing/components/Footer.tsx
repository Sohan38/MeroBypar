import React from 'react';
import { useLocation } from 'wouter';
import { Store, ShieldCheck, ArrowRight, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FooterProps {
  onNavigateSection: (sectionId: string) => void;
}

export function Footer({ onNavigateSection }: FooterProps) {
  const [, setLocation] = useLocation();

  return (
    <footer className="bg-card border-t border-border/80 text-muted-foreground text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Col 1: Brand & Overview (5 cols) */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
                <Store className="size-4" />
              </div>
              <span className="font-bold text-base text-foreground tracking-tight">
                MeroByapar
              </span>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                v1.0.1
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
              MeroByapar is an offline-first Point of Sale & Business Operations management system built for high-performance retail, wholesale, hospitality, and trade in Nepal.
            </p>

            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted/70 border border-border/80 text-[11px] text-foreground font-medium">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Local-First Dexie Engine • Zero Cloud Latency</span>
            </div>
          </div>

          {/* Col 2: Navigation Links (3 cols) */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">
              Navigation
            </h4>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigateSection('features')}
                  className="hover:text-foreground transition-colors"
                >
                  Core Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('solutions')}
                  className="hover:text-foreground transition-colors"
                >
                  Industry Solutions
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('hardware')}
                  className="hover:text-foreground transition-colors"
                >
                  Hardware Compatibility
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('demo')}
                  className="hover:text-foreground transition-colors"
                >
                  Interactive POS Sandbox
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('calculator')}
                  className="hover:text-foreground transition-colors"
                >
                  Time & ROI Estimator
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('pricing')}
                  className="hover:text-foreground transition-colors"
                >
                  Plans & Evaluation
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigateSection('faq')}
                  className="hover:text-foreground transition-colors"
                >
                  FAQ
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: App Access CTA (4 cols) */}
          <div className="md:col-span-4 space-y-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">
              Ready to Get Started?
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Launch the live web POS directly in your browser to experience fast billing, multi-location stock, and thermal printing.
            </p>
            <div>
              <Button
                onClick={() => setLocation('/')}
                className="w-full sm:w-auto h-10 font-semibold text-xs px-5 rounded-xl gap-2 shadow-xs"
              >
                <span>Launch POS & Dashboard</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-muted-foreground">
          <p>© {new Date().getFullYear()} MeroByapar. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-primary" />
              <span>100% Local Data Privacy</span>
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="size-3.5 text-primary" />
              <span>Offline-First Resilient</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
