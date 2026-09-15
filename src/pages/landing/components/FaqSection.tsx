import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export function FaqSection() {
  const faqs = [
    {
      q: 'Does MeroByapar work completely without an internet connection?',
      a: 'Yes. MeroByapar is built local-first using IndexedDB and Dexie. All product catalogs, inventory levels, sales, and customer ledgers are stored directly on your machine. Billing, barcode scanning, daybook posting, and thermal printing function with zero internet dependency.',
    },
    {
      q: 'Where is my business data stored and who owns it?',
      a: 'Your data lives 100% locally on your computer or mobile device. MeroByapar does not lock your data in remote proprietary clouds. You can export complete encrypted or plain JSON database backups and CSV spreadsheets at any time from System Settings.',
    },
    {
      q: 'What thermal receipt printers can I use with MeroByapar?',
      a: 'MeroByapar supports industry-standard 58mm and 80mm thermal receipt roll printers. On the Windows Desktop application, it provides silent background printing directly to your designated USB thermal printer with zero popup dialogs. On web browsers and Android, it utilizes the system print dialog and Android PrintManager.',
    },
    {
      q: 'Can I connect a physical barcode scanner gun?',
      a: 'Yes. Plug-and-play USB and Bluetooth handheld barcode scanners (keyboard wedge mode) are supported automatically. As soon as you scan a barcode, MeroByapar recognizes the input, looks up the product, and adds it to the checkout cart. You can also use your device camera as a barcode scanner.',
    },
    {
      q: 'Can I track stock across multiple branches or warehouses?',
      a: 'Yes. MeroByapar supports multi-location inventory. You can define separate physical locations (e.g., Main Warehouse, Counter 1, Cold Storage) and record inter-location stock movements with full audit logging and quantity reconciliation.',
    },
    {
      q: 'How does batch tracking and FEFO expiry management work?',
      a: 'When batch tracking is enabled, products can have multiple batches with independent batch numbers, manufacture dates, and expiry dates. Sales and recipe consumption automatically prioritize First-Expired, First-Out (FEFO) batches to reduce dead stock and wastage.',
    },
    {
      q: 'Can I manage customer credit accounts (Udharo Khata)?',
      a: 'Yes. The Khata / Credit module lets you assign credit sales to specific customer accounts, set maximum credit limits, record partial or full cash settlements, and view complete transaction statements.',
    },
    {
      q: 'What operating systems and devices are supported?',
      a: 'MeroByapar runs on Windows Desktop (packaged via Electron with silent thermal printing), Android mobile devices and tablets (via Capacitor), and any modern web browser as an offline-capable Progressive Web App (PWA).',
    },
  ];

  return (
    <section id="faq" className="py-16 md:py-24 bg-muted/30 border-t border-border/80">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Frequently Asked Questions
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mt-2">
            Clear Answers to Common Questions
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Everything you need to know about MeroByapar's offline architecture, hardware support, and licensing.
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border/80 p-6 sm:p-8 shadow-sm">
          <Accordion type="single" collapsible className="w-full space-y-2">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`} className="border-border/60">
                <AccordionTrigger className="text-left font-semibold text-xs sm:text-sm text-foreground hover:text-primary py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
