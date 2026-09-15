import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import {
  Store,
  Sun,
  Moon,
  Laptop,
  Menu,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface NavbarProps {
  onNavigateSection: (sectionId: string) => void;
}

export function Navbar({ onNavigateSection }: NavbarProps) {
  const { theme, setTheme } = useApp();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const navLinks = [
    { label: 'Features', id: 'features' },
    { label: 'Solutions', id: 'solutions' },
    { label: 'Hardware', id: 'hardware' },
    { label: 'Live Demo', id: 'demo' },
    { label: 'ROI Estimator', id: 'calculator' },
    { label: 'Plans', id: 'pricing' },
    { label: 'FAQ', id: 'faq' },
  ];

  const handleLinkClick = (id: string) => {
    setMobileMenuOpen(false);
    onNavigateSection(id);
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'border-b border-border/80 bg-background/85 backdrop-blur-xl shadow-sm'
          : 'border-b border-transparent bg-background/60 backdrop-blur-md'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-18">
          {/* Brand Logo */}
          <div
            className="flex items-center gap-2.5 cursor-pointer group select-none"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="size-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
              <Store className="size-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-tight text-foreground">
                  MeroByapar
                </span>
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  POS & ERP
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground hidden sm:block -mt-1">
                Offline-First Business OS
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5" aria-label="Main Navigation">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleLinkClick(link.id)}
                className="px-3 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/70 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Action CTAs & Theme Toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="size-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
              title={`Theme: ${theme}`}
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? (
                <Sun className="size-4 text-amber-500" />
              ) : theme === 'dark' ? (
                <Moon className="size-4 text-sky-400" />
              ) : (
                <Laptop className="size-4" />
              )}
            </Button>

            <Button
              onClick={() => setLocation('/')}
              size="sm"
              className="hidden sm:inline-flex items-center gap-1.5 font-semibold text-xs md:text-sm px-4 h-9 rounded-xl shadow-sm active:scale-95 transition-all"
            >
              <span>Launch POS</span>
              <ArrowRight className="size-3.5" />
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden size-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Open mobile menu"
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-card/95 backdrop-blur-xl animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleLinkClick(link.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-between"
              >
                <span>{link.label}</span>
                <span className="text-xs text-muted-foreground/60">→</span>
              </button>
            ))}
            <div className="pt-2 pb-1">
              <Button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setLocation('/');
                }}
                className="w-full justify-center gap-2 h-10 font-semibold text-sm rounded-xl shadow-sm"
              >
                <span>Launch POS & Dashboard</span>
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
