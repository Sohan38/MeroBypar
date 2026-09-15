import React from 'react';
import {
  Printer,
  Barcode,
  Monitor,
  Smartphone,
  Globe,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';

export function HardwareShowcase() {
  const hardwareItems = [
    {
      icon: Printer,
      title: '58mm & 80mm Thermal Receipt Printers',
      description:
        'Custom-styled thermal receipt layouts designed for standard 58mm and 80mm paper rolls. Windows Desktop includes background silent auto-printing without print dialog prompts.',
      supported: [
        '58mm & 80mm paper widths',
        'Silent printing on Windows Desktop (Electron)',
        'Native PrintManager on Android',
        'Standard print dialog in web browsers',
      ],
    },
    {
      icon: Barcode,
      title: 'Barcode Scanners (Hardware & Camera)',
      description:
        'High-compatibility barcode recognition supporting 1D retail barcodes (EAN-13, EAN-8, Code-128, Code-39, UPC-A, UPC-E) and QR codes.',
      supported: [
        'USB & Bluetooth handheld barcode guns (Keyboard Wedge)',
        'Built-in device camera scanner via @zxing/library',
        'Native Android camera scanner via MLKit',
        'Automatic product lookup and quick-add to cart',
      ],
    },
    {
      icon: Monitor,
      title: 'Cross-Platform Deployment',
      description:
        'Deploy on the exact hardware your business already owns — from dedicated Windows cashier terminals to handheld Android tablets.',
      supported: [
        'Windows Desktop App (.exe via Electron)',
        'Android Native App (via Capacitor)',
        'Modern Web Progressive Web App (PWA)',
        'Local Dexie IndexedDB storage across all platforms',
      ],
    },
  ];

  return (
    <section id="hardware" className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-14">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          Hardware & Platforms
        </span>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mt-2">
          Compatible with Your Existing POS Hardware
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground">
          No need to purchase expensive proprietary POS hardware locks. MeroByapar works seamlessly with standard retail peripherals and devices.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {hardwareItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className="p-6 rounded-2xl bg-card border border-border/80 shadow-2xs hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-bold text-base text-foreground mb-2">{item.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                  {item.description}
                </p>
              </div>

              <div className="pt-4 border-t border-border/60 space-y-2">
                {item.supported.map((sup, sIdx) => (
                  <div key={sIdx} className="flex items-center gap-2 text-xs text-foreground/90 font-medium">
                    <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                    <span>{sup}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
