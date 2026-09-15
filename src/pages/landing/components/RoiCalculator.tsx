import React, { useState, useMemo } from 'react';
import { Calculator, Clock, PiggyBank, Sparkles, HelpCircle } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

export function RoiCalculator() {
  const [dailyTransactions, setDailyTransactions] = useState<number>(120);
  const [minutesSavedPerBill, setMinutesSavedPerBill] = useState<number>(1.2);
  const [operatingDays, setOperatingDays] = useState<number>(28);
  const [estimatedCloudFeePerMonth, setEstimatedCloudFeePerMonth] = useState<number>(2500);

  const calculations = useMemo(() => {
    // Total minutes saved per month
    const totalMinutesPerMonth = dailyTransactions * minutesSavedPerBill * operatingDays;
    const hoursSavedPerMonth = totalMinutesPerMonth / 60;
    const hoursSavedPerYear = hoursSavedPerMonth * 12;

    // Annual software cost avoidance vs recurring cloud POS services
    const annualSubscriptionSaved = estimatedCloudFeePerMonth * 12;

    return {
      hoursSavedPerMonth: Math.round(hoursSavedPerMonth),
      hoursSavedPerYear: Math.round(hoursSavedPerYear),
      annualSubscriptionSaved,
    };
  }, [dailyTransactions, minutesSavedPerBill, operatingDays, estimatedCloudFeePerMonth]);

  return (
    <section id="calculator" className="py-16 md:py-24 bg-muted/40 border-y border-border/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-3">
            <Calculator className="size-3.5" />
            <span>Interactive Efficiency Estimator</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
            Estimate Your Time & Friction Savings
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Calculate estimated cashier time saved with barcode scanning and thermal roll printing vs manual paper invoices or sluggish online tools.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-card rounded-2xl border border-border/80 p-6 sm:p-8 lg:p-10 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            {/* Left Controls (7 cols) */}
            <div className="md:col-span-7 space-y-6">
              {/* Daily Transactions */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-semibold text-foreground">
                    Estimated Daily Transactions
                  </label>
                  <span className="font-bold text-sm text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {dailyTransactions} bills / day
                  </span>
                </div>
                <Slider
                  value={[dailyTransactions]}
                  min={20}
                  max={500}
                  step={10}
                  onValueChange={([val]) => setDailyTransactions(val)}
                  className="py-1"
                />
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Typical retail stores process between 50 to 300 bills daily.
                </span>
              </div>

              {/* Time saved per transaction */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-semibold text-foreground">
                    Estimated Seconds Saved Per Bill
                  </label>
                  <span className="font-bold text-sm text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {Math.round(minutesSavedPerBill * 60)} seconds
                  </span>
                </div>
                <Slider
                  value={[minutesSavedPerBill]}
                  min={0.3}
                  max={3}
                  step={0.1}
                  onValueChange={([val]) => setMinutesSavedPerBill(val)}
                  className="py-1"
                />
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Automated barcode lookup, auto-tax, and instant silent printing vs handwritten bills.
                </span>
              </div>

              {/* Operating Days */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-semibold text-foreground">
                    Store Operating Days / Month
                  </label>
                  <span className="font-bold text-sm text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {operatingDays} days
                  </span>
                </div>
                <Slider
                  value={[operatingDays]}
                  min={20}
                  max={31}
                  step={1}
                  onValueChange={([val]) => setOperatingDays(val)}
                  className="py-1"
                />
              </div>

              {/* Monthly Subscription Benchmark */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs sm:text-sm font-semibold text-foreground">
                    Benchmark Cloud POS Monthly Cost
                  </label>
                  <span className="font-bold text-sm text-primary bg-primary/10 px-2 py-0.5 rounded">
                    Rs. {estimatedCloudFeePerMonth.toLocaleString()} / mo
                  </span>
                </div>
                <Slider
                  value={[estimatedCloudFeePerMonth]}
                  min={1000}
                  max={8000}
                  step={500}
                  onValueChange={([val]) => setEstimatedCloudFeePerMonth(val)}
                  className="py-1"
                />
                <span className="text-[11px] text-muted-foreground mt-1 block">
                  Typical recurring cloud POS monthly subscriptions in the market.
                </span>
              </div>
            </div>

            {/* Right Output Dashboard (5 cols) */}
            <div className="md:col-span-5 bg-muted/60 rounded-xl border border-border p-6 space-y-5">
              <div className="border-b border-border/80 pb-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-1">
                  <Clock className="size-4 text-primary" />
                  <span>Time Saved At Checkout</span>
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl sm:text-4xl font-extrabold text-foreground">
                    {calculations.hoursSavedPerMonth}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">hours / month</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  ~{calculations.hoursSavedPerYear} hours saved annually from faster cashier turnover.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground mb-1">
                  <PiggyBank className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Recurring SaaS Fees Avoided</span>
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    Rs. {calculations.annualSubscriptionSaved.toLocaleString()}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">/ year</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Estimated annual savings vs recurring cloud POS subscriptions with internet dependency.
                </p>
              </div>

              {/* Disclaimer Notice */}
              <div className="pt-3 border-t border-border/60 text-[10px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
                <HelpCircle className="size-3.5 text-muted-foreground/80 shrink-0 mt-0.5" />
                <span>
                  <strong>Note:</strong> Figures shown are illustrative estimates based on user-selected inputs. Actual business outcomes vary by store workflow and catalog size.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
