import React, { useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { InteractivePosDemo } from './components/InteractivePosDemo';
import { FeatureGrid } from './components/FeatureGrid';
import { SolutionsTabs } from './components/SolutionsTabs';
import { HardwareShowcase } from './components/HardwareShowcase';
import { RoiCalculator } from './components/RoiCalculator';
import { PricingSection } from './components/PricingSection';
import { FaqSection } from './components/FaqSection';
import { Footer } from './components/Footer';

export default function LandingPage() {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'MeroByapar — Offline-First POS & Business Operations Platform';
    window.scrollTo({ top: 0, behavior: 'instant' });

    return () => {
      document.title = originalTitle;
    };
  }, []);

  const handleNavigateSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      const topOffset = 72; // navbar height offset
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Top Sticky Navigation */}
      <Navbar onNavigateSection={handleNavigateSection} />

      {/* Main Content Sections */}
      <main className="flex-1 w-full overflow-x-hidden">
        {/* Hero Section */}
        <Hero onExploreDemo={() => handleNavigateSection('demo')} />

        {/* Core Architecture Features */}
        <FeatureGrid />

        {/* Live Interactive POS Sandbox */}
        <InteractivePosDemo />

        {/* Industry Solutions Showcase */}
        <SolutionsTabs />

        {/* Hardware & Multi-Platform Matrix */}
        <HardwareShowcase />

        {/* Interactive Time & Cost ROI Calculator */}
        <RoiCalculator />

        {/* Transparent Feature-Oriented Plans */}
        <PricingSection />

        {/* Frequently Asked Questions */}
        <FaqSection />
      </main>

      {/* Footer */}
      <Footer onNavigateSection={handleNavigateSection} />
    </div>
  );
}
