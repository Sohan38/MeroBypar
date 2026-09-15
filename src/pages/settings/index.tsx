import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStorageProvider } from '@/storage/StorageContext';
import { FeatureConfig, ReceiptCustomization } from '@/types';
import LicenseCard from './License';
import { LocationsTab } from './Locations';
import { useLicense } from '@/license/LicenseContext';
import { Save, Upload, Download, AlertTriangle, Monitor, Moon, Sun, Trash2, Database, Building, Globe, Key, Settings as SettingsIcon, Lock, RefreshCw, CheckCircle2, Printer, Laptop, AlertCircle, Zap, Check, FileText, Eye, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { seedDemoData } from '@/utils/seedHelper';
import { getSystemPrinters, SystemPrinterInfo, printHTMLDocument, getPrintPlatform } from '@/services/printService';
import { generateReceiptHTML } from '@/services/receiptTemplate';
import { cn } from '@/lib/utils';

export const SETTINGS_TABS = [
  { id: 'profile', label: 'Profile', icon: Building },
  { id: 'preferences', label: 'Preferences', icon: Globe },
  { id: 'hardware', label: 'Hardware', icon: Printer },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'license', label: 'Activation', icon: Key },
  { id: 'data', label: 'Database', icon: Database },
  { id: 'diagnostics', label: 'Diagnostics', icon: RefreshCw },
] as const;

//finals
export default function Settings() {
  const { settings, updateSettings, theme, setTheme } = useApp();
  const { state } = useLicense();
  const storage = useStorageProvider();
  const [formData, setFormData] = useState(settings);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab && SETTINGS_TABS.some(t => t.id === tab)) {
        return tab;
      }
    }
    return 'profile';
  });

  const tabsScrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = tabsScrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
  }, []);

  const scrollToTab = useCallback((tabId: string, smooth: boolean = true) => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;
    const tabEl = container.querySelector(`[data-tab="${tabId}"]`) as HTMLElement | null;
    if (!tabEl) return;

    const containerWidth = container.clientWidth;
    const tabLeft = tabEl.offsetLeft;
    const tabWidth = tabEl.offsetWidth;

    // Center the target tab in the scrollable bar
    const targetScroll = tabLeft - (containerWidth / 2) + (tabWidth / 2);

    container.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', newTab);
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const handleScrollStep = (direction: 'left' | 'right') => {
    const container = tabsScrollContainerRef.current;
    if (!container) return;
    const step = Math.min(220, Math.max(140, container.clientWidth * 0.6));
    container.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  // Whenever activeTab changes, auto-center the active tab smoothly
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      scrollToTab(activeTab, true);
      updateScrollIndicators();
    }, 40);
    return () => clearTimeout(timeoutId);
  }, [activeTab, scrollToTab, updateScrollIndicators]);

  // Initial scroll and resize listener
  useEffect(() => {
    updateScrollIndicators();
    scrollToTab(activeTab, false);

    const container = tabsScrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      updateScrollIndicators();
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', updateScrollIndicators);

    const onPopState = () => {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab && SETTINGS_TABS.some(t => t.id === tab)) {
        setActiveTab(tab);
      }
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateScrollIndicators);
      window.removeEventListener('popstate', onPopState);
    };
  }, [updateScrollIndicators, scrollToTab, activeTab]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hardware printer states
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinterInfo[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTestingPrinter, setIsTestingPrinter] = useState(false);
  const isDesktop = typeof window !== 'undefined' && getPrintPlatform() === 'desktop';

  const refreshPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    try {
      const list = await getSystemPrinters();
      setSystemPrinters(list);
    } catch (err) {
      console.warn('Failed to load printers:', err);
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'hardware' && isDesktop) {
      refreshPrinters();
    }
  }, [activeTab, isDesktop, refreshPrinters]);

  const handleTestPrint = async () => {
    setIsTestingPrinter(true);
    try {
      const pConfig = formData.printerSettings;
      const currentPrinter = pConfig?.deviceName || '';
      const now = new Date();
      const testHtml = generateReceiptHTML(
        {
          sale: {
            id: 'TEST-' + Math.floor(100000 + Math.random() * 900000),
            date: now.toISOString(),
            paymentMethod: 'cash',
            paidAmount: 250,
            grandTotal: 250,
            dueAmount: 0,
            discount: 0,
            tax: 28.76,
            taxRate: 13,
            items: [
              { productName: 'Sample Retail Item 1', quantity: 2, unit: 'pcs', sellingRate: 75, subtotal: 150 },
              { productName: 'Sample Grocery Item 2', quantity: 1, unit: 'kg', sellingRate: 100, subtotal: 100 },
            ],
          } as any,
          settings: formData,
          customerName: 'Sample Customer',
          cashierName: 'Admin',
        },
        {
          paperWidth: pConfig?.paperWidth === '58mm' ? 'narrow' : 'standard',
          customization: pConfig?.receiptCustomization,
        }
      );

      await printHTMLDocument(testHtml, {
        title: 'Printer Test',
        silent: pConfig?.silentPrint ?? true,
        deviceName: currentPrinter || undefined,
        paperWidth: pConfig?.paperWidth || '80mm',
      });
      toast.success('Test slip sent to printer!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test print failed');
    } finally {
      setIsTestingPrinter(false);
    }
  };

  // Sync state if settings are loaded/restored asynchronously
  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  // Check if settings have unsaved modifications
  const isDirty = JSON.stringify(formData) !== JSON.stringify(settings);

  // Loading & Dialog States
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [showBackupLockedNotice, setShowBackupLockedNotice] = useState(false);
  const [pendingImportContent, setPendingImportContent] = useState<string | null>(null);

  const handleSave = () => {
    updateSettings(formData);
    toast.success('Settings saved successfully');
  };

  const handleStockSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      // Force a fresh read of inventoryLocationStocks — this triggers ensureDefaultLocationStocks
      await storage.get('inventoryLocationStocks');
      await storage.get('productBatchLocations');
      setSyncResult({ ok: true, message: 'Stock levels are now synchronized across all locations.' });
      toast.success('Stock sync complete!');
    } catch (err) {
      setSyncResult({ ok: false, message: 'Sync failed. Please try again or reload the app.' });
      toast.error('Stock sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await new Promise(r => setTimeout(r, 400));
      const data = await storage.exportAll();
      const filename = `sohan_backup_${new Date().toISOString().split('T')[0]}.json`;
      const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

      if (isNative) {
        try {
          const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
          const { Share } = await import('@capacitor/share');
          const cacheResult = await Filesystem.writeFile({
            path: filename,
            data: data,
            directory: Directory.Cache,
            encoding: Encoding.UTF8
          });

          const canShare = await Share.canShare();
          if (canShare.value) {
            await Share.share({
              title: 'Sohan data backup',
              url: cacheResult.uri,
              dialogTitle: 'Share or save backup'
            });
            toast.success('Backup ready to share or save');
          } else {
            const savedResult = await Filesystem.writeFile({
              path: filename,
              data,
              directory: Directory.Documents,
              encoding: Encoding.UTF8
            });
            toast.success(`Backup saved! File: ${savedResult.uri || filename}`);
          }
          return;
        } catch (err) {
          console.error('Native filesystem export failed:', err);
          toast.error('Export failed — try sharing again or check storage access');
        }
      } else {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Backup exported successfully');
      }
    } catch (err) {
      toast.error('Failed to export backup');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPendingImportContent(content);
      setShowImportConfirm(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const executeImport = async () => {
    if (!pendingImportContent) return;
    setIsImporting(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      const success = await storage.importAll(pendingImportContent);
      if (success) {
        toast.success('Data imported successfully. App will reload.');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error('Invalid backup file');
      }
    } catch (err) {
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
      setPendingImportContent(null);
    }
  };

  const executeReset = async () => {
    setIsResetting(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      await storage.clearAll();
      toast.success('All data cleared. App will reload.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error('Failed to reset data');
    } finally {
      setIsResetting(false);
    }
  };

  const executeSeedDemo = async () => {
    setIsSeeding(true);
    try {
      await new Promise(r => setTimeout(r, 800));
      await seedDemoData(true);
      toast.success('Demo data restored successfully. App will reload.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error('Failed to seed demo data');
    } finally {
      setIsSeeding(false);
    }
  };

  if (!formData) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-4xl mx-auto pb-28 md:pb-6">
      {/* Header section optimized for scanning */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" /> Settings
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Configure default variables and device activations.
          </p>
        </div>
        {/* Desktop Save Button (hidden on mobile, visible only when dirty and on editable tab) */}
        {isDirty && (activeTab === 'profile' || activeTab === 'preferences' || activeTab === 'hardware') && (
          <div className="hidden sm:block">
            <Button onClick={handleSave} size="default" className="shadow-sm">
              <Save className="mr-2 h-4 w-4" /> Save Changes
            </Button>
          </div>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        {/* Dynamic auto-scrolling tab bar with overflow fade indicators */}
        <div className="relative group/tabs -mx-3 px-3 sm:mx-0 sm:px-0">
          {/* Left scroll chevron & fade mask */}
          <div
            className={cn(
              "absolute left-0 top-0 bottom-0 z-10 flex items-center pl-1 sm:pl-0 pr-4 sm:pr-6 bg-gradient-to-r from-background via-background/90 to-transparent transition-opacity duration-200 pointer-events-none",
              canScrollLeft ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              type="button"
              onClick={() => handleScrollStep('left')}
              className="pointer-events-auto h-7 w-7 rounded-full bg-background/95 border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all active:scale-90"
              aria-label="Scroll tabs left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Right scroll chevron & fade mask */}
          <div
            className={cn(
              "absolute right-0 top-0 bottom-0 z-10 flex items-center pr-1 sm:pr-0 pl-4 sm:pl-6 bg-gradient-to-l from-background via-background/90 to-transparent transition-opacity duration-200 pointer-events-none justify-end",
              canScrollRight ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              type="button"
              onClick={() => handleScrollStep('right')}
              className="pointer-events-auto h-7 w-7 rounded-full bg-background/95 border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all active:scale-90"
              aria-label="Scroll tabs right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Horizontal overflow scrollable tab bar with auto-centering */}
          <div
            ref={tabsScrollContainerRef}
            className="w-full overflow-x-auto scroll-smooth touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5"
          >
            <TabsList className="flex w-max min-w-full border border-border/80 bg-muted/35 dark:bg-muted/20 backdrop-blur-xs p-1 rounded-xl gap-1 shadow-xs">
              {SETTINGS_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    data-tab={tab.id}
                    className={cn(
                      "flex-1 min-w-[5.25rem] sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3 rounded-lg font-medium transition-all duration-200 select-none",
                      "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:font-semibold",
                      "hover:text-foreground/90 active:scale-[0.97]"
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isActive && "text-primary scale-110")} />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </div>

        {/* Tab 1: Profile */}
        <TabsContent value="profile" className="outline-none space-y-4">
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Business Profile</CardTitle>
              <CardDescription className="text-xs">Receipt invoice billing info.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Business Name</label>
                <Input
                  className="h-10 sm:h-11 text-sm"
                  value={formData.businessName}
                  onChange={e => setFormData({ ...formData, businessName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Phone Number</label>
                  <Input
                    type="tel"
                    className="h-10 sm:h-11 text-sm"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">VAT / PAN Number</label>
                  <Input
                    className="h-10 sm:h-11 text-sm"
                    value={formData.vatNumber}
                    onChange={e => setFormData({ ...formData, vatNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Address</label>
                <Input
                  className="h-10 sm:h-11 text-sm"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Preferences */}
        <TabsContent value="preferences" className="outline-none space-y-4">
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Defaults & Localization</CardTitle>
              <CardDescription className="text-xs">Manage system configurations and symbols.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Currency Symbol</label>
                  <Input
                    className="h-10 sm:h-11 text-sm"
                    value={formData.currencySymbol}
                    onChange={e => setFormData({ ...formData, currencySymbol: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Currency Code</label>
                  <Input
                    className="h-10 sm:h-11 text-sm"
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Default VAT / Tax (%)</label>
                  <Input
                    type="number"
                    className="h-10 sm:h-11 text-sm"
                    value={formData.taxRate}
                    onChange={e => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Low Stock Threshold</label>
                  <Input
                    type="number"
                    className="h-10 sm:h-11 text-sm"
                    value={formData.lowStockThreshold}
                    onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Theme</label>
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger className="h-10 sm:h-11">
                      <SelectValue placeholder="Select Theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <span className="flex items-center gap-2"><Sun className="h-4 w-4 text-amber-500" /> Light</span>
                      </SelectItem>
                      <SelectItem value="dark">
                        <span className="flex items-center gap-2"><Moon className="h-4 w-4 text-blue-400" /> Dark</span>
                      </SelectItem>
                      <SelectItem value="system">
                        <span className="flex items-center gap-2"><Monitor className="h-4 w-4" /> System</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">System Language</label>
                  <Select value={formData.language} onValueChange={val => setFormData({ ...formData, language: val })}>
                    <SelectTrigger className="h-10 sm:h-11">
                      <SelectValue placeholder="Select Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ne">Nepali</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Hardware & Thermal Printers */}
        <TabsContent value="hardware" className="outline-none space-y-4">
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Printer className="h-5 w-5 text-primary" /> Thermal Receipt Printer
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Configure direct thermal POS printing, paper sizes, and hardware auto-routing.
                  </CardDescription>
                </div>
                {isDesktop && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Laptop className="h-3.5 w-3.5" /> Desktop Engine Active
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-5">
              {/* If no printers detected on desktop */}
              {isDesktop && !isLoadingPrinters && systemPrinters.length === 0 && (
                <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    No Installed Printers Detected
                  </div>
                  <p className="text-muted-foreground dark:text-amber-200/80 leading-relaxed">
                    No physical thermal printers or virtual spoolers were detected on this Windows PC. Make sure your printer is plugged in via USB/Network and recognized in Windows Devices.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={refreshPrinters}
                      className="h-7 text-xs bg-background"
                    >
                      <RefreshCw className="h-3 w-3 mr-1.5" /> Rescan Hardware
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      POS will fall back to System Print Dialog until a printer is connected.
                    </span>
                  </div>
                </div>
              )}

              {/* Printer Device Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    Target Printer Device
                  </label>
                  {isDesktop && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={refreshPrinters}
                      disabled={isLoadingPrinters}
                      className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingPrinters ? 'animate-spin' : ''}`} />
                      Refresh List
                    </Button>
                  )}
                </div>

                {isDesktop ? (
                  <Select
                    value={formData.printerSettings?.deviceName || 'DEFAULT_SYSTEM_PRINTER'}
                    onValueChange={(val) => {
                      const deviceName = val === 'DEFAULT_SYSTEM_PRINTER' ? '' : val;
                      setFormData({
                        ...formData,
                        printerSettings: {
                          paperWidth: formData.printerSettings?.paperWidth || '80mm',
                          silentPrint: formData.printerSettings?.silentPrint ?? true,
                          autoPrintOnSale: formData.printerSettings?.autoPrintOnSale ?? false,
                          deviceName,
                        },
                      });
                    }}
                  >
                    <SelectTrigger className="h-10 sm:h-11">
                      <SelectValue placeholder="Select a printer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEFAULT_SYSTEM_PRINTER">
                        <span className="flex items-center gap-2 font-medium">
                          ⚡ System Default Printer (Auto-Route)
                        </span>
                      </SelectItem>
                      {systemPrinters.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          <span className="flex items-center gap-2">
                            {p.name} {p.isDefault ? '(Default)' : ''}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
                    Web & Mobile use native platform print handlers automatically. To assign dedicated USB thermal printers with zero-dialog instant printing, run the MeroByapar Electron Desktop app.
                  </div>
                )}
              </div>

              {/* Thermal Paper Roll Width */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Receipt Paper Roll Width
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        printerSettings: {
                          deviceName: formData.printerSettings?.deviceName || '',
                          silentPrint: formData.printerSettings?.silentPrint ?? true,
                          autoPrintOnSale: formData.printerSettings?.autoPrintOnSale ?? false,
                          paperWidth: '80mm',
                        },
                      });
                    }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      (formData.printerSettings?.paperWidth || '80mm') === '80mm'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center justify-between">
                      <span>80 mm (Standard)</span>
                      {(formData.printerSettings?.paperWidth || '80mm') === '80mm' && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Recommended for standard POS thermal receipt printers (Epson, Star, POS-80).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        printerSettings: {
                          deviceName: formData.printerSettings?.deviceName || '',
                          silentPrint: formData.printerSettings?.silentPrint ?? true,
                          autoPrintOnSale: formData.printerSettings?.autoPrintOnSale ?? false,
                          paperWidth: '58mm',
                        },
                      });
                    }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      formData.printerSettings?.paperWidth === '58mm'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="font-semibold text-xs flex items-center justify-between">
                      <span>58 mm (Compact)</span>
                      {formData.printerSettings?.paperWidth === '58mm' && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      For mini 2-inch Bluetooth/USB portable thermal printers.
                    </p>
                  </button>
                </div>
              </div>

              {/* Instant Silent Print & Auto Print */}
              <div className="space-y-3 pt-2">
                <div
                  onClick={() => {
                    const currentSilent = formData.printerSettings?.silentPrint ?? true;
                    setFormData({
                      ...formData,
                      printerSettings: {
                        deviceName: formData.printerSettings?.deviceName || '',
                        paperWidth: formData.printerSettings?.paperWidth || '80mm',
                        autoPrintOnSale: formData.printerSettings?.autoPrintOnSale ?? false,
                        silentPrint: !currentSilent,
                      },
                    });
                  }}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/20 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={formData.printerSettings?.silentPrint ?? true}
                    onChange={() => {}}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      Direct Silent Print (Instant POS Mode)
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Bypasses the 3-second Windows print dialog. Print jobs are dispatched directly to the thermal printer spooler in &lt; 100ms.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => {
                    const currentAuto = formData.printerSettings?.autoPrintOnSale ?? false;
                    setFormData({
                      ...formData,
                      printerSettings: {
                        deviceName: formData.printerSettings?.deviceName || '',
                        paperWidth: formData.printerSettings?.paperWidth || '80mm',
                        silentPrint: formData.printerSettings?.silentPrint ?? true,
                        autoPrintOnSale: !currentAuto,
                      },
                    });
                  }}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/20 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={formData.printerSettings?.autoPrintOnSale ?? false}
                    onChange={() => {}}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      Auto-Print Immediately on POS Checkout
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      When enabled, completing a sale at the POS register will instantly feed and cut a bill receipt without asking for confirmation.
                    </p>
                  </div>
                </div>
              </div>

              {/* Hardware Test Action */}
              <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Verify paper alignment, font sharpness, and cutter action.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestPrint}
                  disabled={isTestingPrinter}
                  className="shadow-sm"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {isTestingPrinter ? 'Printing Test Slip…' : 'Print Test Slip'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Receipt Template & Store Customization */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Receipt Template &amp; Layout
              </CardTitle>
              <CardDescription className="text-xs">
                Tailor thermal receipt branding, titles, and section visibility for your store type.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Configuration Controls */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Header Title */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Receipt Header Title</label>
                    <Input
                      className="h-9 sm:h-10 text-xs sm:text-sm"
                      placeholder="e.g. TAX INVOICE, SALES RECEIPT, CASH MEMO"
                      value={formData.printerSettings?.receiptCustomization?.invoiceTitle ?? 'TAX INVOICE'}
                      onChange={(e) => {
                        const newTitle = e.target.value;
                        setFormData({
                          ...formData,
                          printerSettings: {
                            deviceName: formData.printerSettings?.deviceName || '',
                            paperWidth: formData.printerSettings?.paperWidth || '80mm',
                            silentPrint: formData.printerSettings?.silentPrint ?? true,
                            autoPrintOnSale: formData.printerSettings?.autoPrintOnSale ?? false,
                            receiptCustomization: {
                              ...formData.printerSettings?.receiptCustomization,
                              invoiceTitle: newTitle,
                            },
                          },
                        });
                      }}
                    />
                  </div>

                  {/* Footer Message */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Footer Message &amp; Return Policy</label>
                    <Input
                      className="h-9 sm:h-10 text-xs sm:text-sm"
                      placeholder="e.g. Thank you for your visit! Goods once sold are returnable within 7 days."
                      value={formData.printerSettings?.receiptCustomization?.footerMessage ?? formData.receiptFooter ?? 'Thank you for your visit!'}
                      onChange={(e) => {
                        const newMsg = e.target.value;
                        setFormData({
                          ...formData,
                          receiptFooter: newMsg,
                          printerSettings: {
                            deviceName: formData.printerSettings?.deviceName || '',
                            paperWidth: formData.printerSettings?.paperWidth || '80mm',
                            silentPrint: formData.printerSettings?.silentPrint ?? true,
                            autoPrintOnSale: formData.printerSettings?.autoPrintOnSale ?? false,
                            receiptCustomization: {
                              ...formData.printerSettings?.receiptCustomization,
                              footerMessage: newMsg,
                            },
                          },
                        });
                      }}
                    />
                  </div>

                  {/* Section Toggles */}
                  <div className="space-y-2.5 pt-1">
                    <label className="text-xs font-semibold text-muted-foreground">Receipt Sections to Include</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { key: 'showPanVat', label: 'Show PAN / VAT Number', defaultVal: true },
                        { key: 'showCustomerName', label: 'Show Customer Name', defaultVal: true },
                        { key: 'showCashier', label: 'Show Cashier / Operator', defaultVal: true },
                        { key: 'showItemCount', label: 'Show Item & Unit Count', defaultVal: true },
                        { key: 'showTaxBreakdown', label: 'Show Tax / VAT Breakdown', defaultVal: true },
                      ].map((toggle) => {
                        const isChecked = Boolean(formData.printerSettings?.receiptCustomization?.[toggle.key as keyof ReceiptCustomization] ?? toggle.defaultVal);
                        return (
                          <div
                            key={toggle.key}
                            onClick={() => {
                              setFormData({
                                ...formData,
                                printerSettings: {
                                  deviceName: formData.printerSettings?.deviceName || '',
                                  paperWidth: formData.printerSettings?.paperWidth || '80mm',
                                  silentPrint: formData.printerSettings?.silentPrint ?? true,
                                  autoPrintOnSale: formData.printerSettings?.autoPrintOnSale ?? false,
                                  receiptCustomization: {
                                    ...formData.printerSettings?.receiptCustomization,
                                    [toggle.key]: !isChecked,
                                  },
                                },
                              });
                            }}
                            className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 cursor-pointer select-none text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="font-medium text-foreground">{toggle.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Live Preview Column */}
                <div className="lg:col-span-5 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-primary" /> Live Thermal Preview
                    </span>
                    <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded">
                      {formData.printerSettings?.paperWidth || '80mm'}
                    </span>
                  </div>

                  {/* Simulated Receipt Roll */}
                  <div
                    className="bg-white text-black rounded shadow font-mono text-[9px] leading-[1.3] border border-gray-200 w-full select-none"
                    style={{
                      maxWidth: (formData.printerSettings?.paperWidth || '80mm') === '58mm' ? '190px' : '260px',
                      padding: (formData.printerSettings?.paperWidth || '80mm') === '58mm' ? '8px 10px' : '12px 14px',
                    }}
                  >
                    <div className="text-center mb-1">
                      <div className="font-black text-[11px] uppercase tracking-wide leading-tight">
                        {formData.businessName || 'MeroByapar Store'}
                      </div>
                      {formData.address && <div className="text-[8px] text-gray-600 mt-0.5">{formData.address}</div>}
                      {formData.phone && <div className="text-[8px] text-gray-600">Tel: {formData.phone}</div>}
                      {(formData.printerSettings?.receiptCustomization?.showPanVat ?? true) && formData.vatNumber && (
                        <div className="text-[8px] text-gray-700 font-bold">PAN/VAT: {formData.vatNumber}</div>
                      )}
                      <div className="text-[9px] font-extrabold uppercase mt-1 tracking-wider">
                        *** {formData.printerSettings?.receiptCustomization?.invoiceTitle || (formData.vatNumber ? 'TAX INVOICE' : 'SALES RECEIPT')} ***
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-1" />

                    <div className="text-[8px] space-y-0.5">
                      <div className="flex justify-between"><span className="text-gray-500">Invoice #:</span><span className="font-bold">#INV-8921</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Date:</span><span>15/09/2026 04:30 PM</span></div>
                      {(formData.printerSettings?.receiptCustomization?.showCashier ?? true) && (
                        <div className="flex justify-between"><span className="text-gray-500">Cashier:</span><span>Admin</span></div>
                      )}
                      {(formData.printerSettings?.receiptCustomization?.showCustomerName ?? true) && (
                        <div className="flex justify-between"><span className="text-gray-500">Customer:</span><span>Walk-in Customer</span></div>
                      )}
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-1" />

                    <table className="w-full text-[8px]">
                      <thead>
                        <tr className="border-b border-dashed border-gray-300 text-gray-700 font-bold">
                          <th className="text-left py-0.5">Item</th>
                          <th className="text-center py-0.5 w-6">Qty</th>
                          <th className="text-right py-0.5 w-10">Rate</th>
                          <th className="text-right py-0.5 w-10">Amt</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-0.5">Sample Retail Item</td>
                          <td className="text-center py-0.5">2</td>
                          <td className="text-right py-0.5">75.00</td>
                          <td className="text-right py-0.5 font-bold">150.00</td>
                        </tr>
                        <tr>
                          <td className="py-0.5">Sample Store Goods</td>
                          <td className="text-center py-0.5">1</td>
                          <td className="text-right py-0.5">100.00</td>
                          <td className="text-right py-0.5 font-bold">100.00</td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="border-t border-dashed border-gray-400 my-1" />

                    {(formData.printerSettings?.receiptCustomization?.showItemCount ?? true) && (
                      <>
                        <div className="flex justify-between text-[7.5px] font-semibold text-gray-700 py-0.5">
                          <span>Total Items: 2</span>
                          <span>Total Qty: 3</span>
                        </div>
                        <div className="border-t border-dashed border-gray-400 my-1" />
                      </>
                    )}

                    <div className="text-[8px] space-y-0.5 font-mono">
                      <div className="flex justify-between"><span>Subtotal:</span><span>{formData.currencySymbol || 'Rs'} 250.00</span></div>
                      {(formData.printerSettings?.receiptCustomization?.showTaxBreakdown ?? true) && (
                        <div className="flex justify-between"><span>VAT (13%):</span><span>{formData.currencySymbol || 'Rs'} 28.76</span></div>
                      )}
                      <div className="border-y border-black font-black py-0.5 my-1 flex justify-between text-[9.5px]">
                        <span>TOTAL:</span><span>{formData.currencySymbol || 'Rs'} 250.00</span>
                      </div>
                      <div className="flex justify-between"><span>Paid (Cash):</span><span>{formData.currencySymbol || 'Rs'} 250.00</span></div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-1" />

                    <div className="text-center text-[7.5px] text-gray-600 space-y-0.5 pt-0.5">
                      <div className="font-bold text-[8px] text-black">
                        {formData.printerSettings?.receiptCustomization?.footerMessage || formData.receiptFooter || 'Thank you for your visit!'}
                      </div>
                      <div className="text-[7px] text-gray-400">Powered by MeroByapar POS</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Locations */}
        <TabsContent value="locations" className="outline-none">
          <LocationsTab />
        </TabsContent>

        {/* Tab 4: Activation */}
        <TabsContent value="license" className="outline-none">
          <LicenseCard />
        </TabsContent>

        {/* Tab 5: Database Operations */}
        <TabsContent value="data" className="outline-none space-y-4">
          <Card className="border-orange-200 dark:border-orange-950/40">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400 text-base sm:text-lg">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" /> Data Backup & Recovery
              </CardTitle>
              <CardDescription className="text-xs">Export backups, restore previous databases, or run resets.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  onClick={state.status === 'trial' ? () => setShowBackupLockedNotice(true) : handleExport}
                  disabled={isExporting || isImporting || isResetting || isSeeding}
                  className="w-full justify-start h-12 text-xs flex items-center"
                >
                  {isExporting ? <Spinner className="mr-3 h-4 w-4" /> : <Download className="mr-3 h-4 w-4" />}
                  <span className="flex-1 text-left truncate">
                    {isExporting ? 'Exporting...' : 'Export Backup JSON'}
                  </span>
                  {state.status === 'trial' && <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 ml-1.5" />}
                </Button>
                <div className="relative">
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImportFileChange}
                  />
                  <Button
                    variant="outline"
                    onClick={state.status === 'trial' ? () => setShowBackupLockedNotice(true) : () => fileInputRef.current?.click()}
                    disabled={isExporting || isImporting || isResetting || isSeeding}
                    className="w-full justify-start h-12 text-xs flex items-center"
                  >
                    {isImporting ? <Spinner className="mr-3 h-4 w-4" /> : <Upload className="mr-3 h-4 w-4" />}
                    <span className="flex-1 text-left truncate">
                      {isImporting ? 'Restoring...' : 'Restore Backup File'}
                    </span>
                    {state.status === 'trial' && <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 ml-1.5" />}
                  </Button>
                </div>
                <Button variant="outline" onClick={() => setShowSeedConfirm(true)} disabled={isExporting || isImporting || isResetting || isSeeding} className="w-full justify-start h-12 text-xs text-primary border-primary/20 hover:bg-primary/5">
                  {isSeeding ? <Spinner className="mr-3 h-4 w-4" /> : <Database className="mr-3 h-4 w-4" />}
                  {isSeeding ? 'Seeding...' : 'Load Demo Database'}
                </Button>
              </div>

              {/* Trial mode backup locked notice */}
              {showBackupLockedNotice && state.status === 'trial' && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      Feature Locked — Trial Plan
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                      Backup export and restore are unavailable during the trial period. Activate Sohan POS with a valid license key to enable data backup and recovery.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => { setActiveTab('license'); setShowBackupLockedNotice(false); }}
                        className="text-xs font-semibold text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:no-underline"
                      >
                        Activate Now →
                      </button>
                      <button
                        onClick={() => setShowBackupLockedNotice(false)}
                        className="text-xs text-amber-600/60 dark:text-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="pt-4 border-t border-border mt-2">
                <Button variant="destructive" onClick={() => setShowResetConfirm(true)} disabled={isExporting || isImporting || isResetting || isSeeding} className="w-full h-11 text-xs">
                  {isResetting ? <Spinner className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  {isResetting ? 'Resetting Database...' : 'Factory Reset Database'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Diagnostics */}
        <TabsContent value="diagnostics" className="outline-none space-y-4">
          <Card className="border border-border shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary" />
                Stock Synchronization
              </CardTitle>
              <CardDescription className="text-xs">
                Detect and repair any drift between global product quantities and per-location stock records.
                This runs automatically on startup, but you can trigger it manually here.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
              {syncResult && (
                <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${syncResult.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                  }`}>
                  {syncResult.ok
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <span>{syncResult.message}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleStockSync}
                  disabled={isSyncing}
                  className="w-full sm:w-auto h-11 text-xs gap-2"
                >
                  {isSyncing
                    ? <Spinner className="h-4 w-4" />
                    : <RefreshCw className="h-4 w-4" />}
                  {isSyncing ? 'Syncing Stock...' : 'Rebuild Stock Sync'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Safe to run at any time. No data will be deleted — only location quantities are adjusted to match the global total.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating Bottom Sticky Action Bar for Mobile (rendered only when dirty on editable tabs) */}
      {isDirty && (activeTab === 'profile' || activeTab === 'preferences' || activeTab === 'hardware') && (
        <div className="sm:hidden fixed bottom-19 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-card/90 dark:bg-card/95 backdrop-blur-md border border-border p-2 rounded-full flex items-center justify-between z-30 shadow-xl animate-in fade-in slide-in-from-bottom-5 duration-300">
          <span className="text-xs font-medium text-foreground pl-3">
            Unsaved changes
          </span>
          <Button onClick={handleSave} size="sm" className="rounded-full px-4 h-9 text-xs shadow-sm font-semibold flex items-center gap-1.5 bg-primary text-primary-foreground">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      )}

      <ConfirmDialog
        isOpen={showImportConfirm}
        onClose={() => {
          setShowImportConfirm(false);
          setPendingImportContent(null);
        }}
        onConfirm={executeImport}
        title="Restore Backup"
        description="Warning: This will overwrite ALL your current data. Are you sure you want to proceed?"
        confirmText="Restore"
      />

      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={executeReset}
        title="Factory Reset App"
        description="This will permanently delete ALL data. Type 'RESET' to confirm:"
        confirmText="Reset"
        requireTextInput="RESET"
      />

      <ConfirmDialog
        isOpen={showSeedConfirm}
        onClose={() => setShowSeedConfirm(false)}
        onConfirm={executeSeedDemo}
        title="Restore Demo Data"
        description="This will clear your current database and load standard demo records (products, sales, customers). Are you sure?"
        confirmText="Load Demo"
      />
    </div>
  );
}
