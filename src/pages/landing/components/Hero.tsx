import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Play,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Printer,
  Barcode,
  Layers,
  Monitor,
  Smartphone,
  Globe,
} from 'lucide-react';

interface HeroProps {
  onExploreDemo: () => void;
}

export function Hero({ onExploreDemo }: HeroProps) {
  const [, setLocation] = useLocation();

  return (
    <section className="relative overflow-hidden pt-8 pb-16 md:pt-14 md:pb-24">
      {/* Subtle radial background gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-primary/8 blur-3xl rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          {/* Top Pill / Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-semibold mb-6 animate-in fade-in duration-500">
            <span className="flex size-2 rounded-full bg-primary animate-pulse" />
            <span>Offline-First Architecture • Zero Cloud Dependency</span>
          </div>

          {/* Master Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            The Modern POS & Business OS Built for{' '}
            <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary/90 to-teal-500">
              Real-World Trade.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            MeroByapar delivers ultra-fast barcode billing, multi-location stock tracking, batch-level FEFO expiry control, thermal receipt printing, and customer Khata ledgers — completely operational with or without an active internet connection.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <Button
              size="lg"
              onClick={() => setLocation('/')}
              className="w-full sm:w-auto font-semibold px-7 h-12 rounded-xl shadow-md shadow-primary/20 gap-2 text-sm sm:text-base active:scale-95 transition-all"
            >
              <span>Launch Web POS</span>
              <ArrowRight className="size-4" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={onExploreDemo}
              className="w-full sm:w-auto font-medium px-6 h-12 rounded-xl gap-2 text-sm sm:text-base hover:bg-muted/80 active:scale-95 transition-all"
            >
              <Play className="size-3.5 fill-current text-primary" />
              <span>Interactive POS Sandbox</span>
            </Button>
          </div>

          {/* Platform Availability Badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">Available On:</span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border/80 shadow-2xs">
              <Monitor className="size-3.5 text-primary" />
              <span>Windows Desktop</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border/80 shadow-2xs">
              <Smartphone className="size-3.5 text-primary" />
              <span>Android App</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border/80 shadow-2xs">
              <Globe className="size-3.5 text-primary" />
              <span>Modern Web PWA</span>
            </div>
          </div>
        </div>

        {/* 4 Core Value Cards */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-card/70 border border-border/80 backdrop-blur-sm shadow-2xs hover:border-primary/40 transition-colors">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <ShieldCheck className="size-5" />
            </div>
            <h3 className="font-bold text-sm text-foreground mb-1">100% Local-First Storage</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Powered by IndexedDB and Dexie. Your registers never stall when the network drops.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-card/70 border border-border/80 backdrop-blur-sm shadow-2xs hover:border-primary/40 transition-colors">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Barcode className="size-5" />
            </div>
            <h3 className="font-bold text-sm text-foreground mb-1">Hardware Barcode Ready</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Plug-and-play USB/Bluetooth handheld scanners plus built-in camera scanning.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-card/70 border border-border/80 backdrop-blur-sm shadow-2xs hover:border-primary/40 transition-colors">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Printer className="size-5" />
            </div>
            <h3 className="font-bold text-sm text-foreground mb-1">Thermal Receipt Engine</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Formatted 58mm & 80mm roll prints with silent desktop output and mobile sharing.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-card/70 border border-border/80 backdrop-blur-sm shadow-2xs hover:border-primary/40 transition-colors">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Layers className="size-5" />
            </div>
            <h3 className="font-bold text-sm text-foreground mb-1">Unified Business Loop</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Integrated POS, multi-location stock, recipes, Khata credit, and financial cashbooks.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
