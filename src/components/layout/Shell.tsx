import React from 'react';
import { useLocation } from 'wouter';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { DesktopSidebar } from './DesktopSidebar';
import { LicenseBanner } from '../LicenseBanner';
import { ActivationBlocker } from '../ActivationBlocker';
import { ScrollToTop } from './ScrollToTop';

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-dvh flex flex-col bg-background selection:bg-primary/20">
      <ScrollToTop />
      <ActivationBlocker />
      <LicenseBanner />
      <TopNav />
      <div className="flex flex-1">
        <DesktopSidebar />
        <main
          key={location}
          className="flex-1 md:pl-64 pb-16 md:pb-0 w-full overflow-x-hidden animate-in fade-in-50 duration-200"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

