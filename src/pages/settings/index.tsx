import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStorageProvider } from '@/storage/StorageContext';
import { FeatureConfig } from '@/types';
import LicenseCard from './License';
import { LocationsTab } from './Locations';
import { useLicense } from '@/license/LicenseContext';
import { Save, Upload, Download, AlertTriangle, Monitor, Moon, Sun, Trash2, Database, Building, Globe, Key, Settings as SettingsIcon, Lock, RefreshCw, CheckCircle2, Printer, Laptop, AlertCircle, Zap, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { seedDemoData } from '@/utils/seedHelper';
import { getSystemPrinters, SystemPrinterInfo, printHTMLDocument, getPrintPlatform } from '@/services/printService';
//finals
export default function Settings() {
  const { settings, updateSettings, theme, setTheme } = useApp();
  const { state } = useLicense();
  const storage = useStorageProvider();
  const [formData, setFormData] = useState(settings);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab && ['profile', 'preferences', 'hardware', 'locations', 'license', 'data', 'diagnostics'].includes(tab)) {
        return tab;
      }
    }
    return 'profile';
  });

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
      const paperWidthPx = pConfig?.paperWidth === '58mm' ? '220px' : '302px';
      const now = new Date();
      const testHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Printer Test</title>
  <style>
    @page { margin: 0; }
    body {
      margin: 0;
      padding: 12px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.4;
      width: ${paperWidthPx};
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .title { font-size: 13px; font-weight: 900; letter-spacing: 1px; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="center title">${formData.businessName || 'MeroByapar POS'}</div>
  <div class="center bold">*** PRINTER TEST SLIP ***</div>
  <div class="divider"></div>
  <div class="row"><span>Status:</span><span class="bold">ONLINE / OK</span></div>
  <div class="row"><span>Printer:</span><span>${currentPrinter || 'Default System Printer'}</span></div>
  <div class="row"><span>Paper Roll:</span><span>${pConfig?.paperWidth || '80mm'}</span></div>
  <div class="row"><span>Mode:</span><span>${pConfig?.silentPrint !== false ? 'Instant Silent' : 'System Dialog'}</span></div>
  <div class="row"><span>Date:</span><span>${now.toLocaleDateString()}</span></div>
  <div class="row"><span>Time:</span><span>${now.toLocaleTimeString()}</span></div>
  <div class="divider"></div>
  <div class="center">Thermal printer communication is working perfectly!</div>
  <br><br><br>
</body>
</html>`;

      await printHTMLDocument(testHtml, {
        title: 'Printer Test',
        silent: pConfig?.silentPrint ?? true,
        deviceName: currentPrinter || undefined,
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
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        {/* Horizontal overflow scrollable tab bar for mobile viewports */}
        <div className="w-full overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="flex w-max sm:w-full border border-border bg-muted/40 p-1 rounded-lg gap-1 min-w-full">
            <TabsTrigger value="profile" className="flex-1 min-w-20 sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3">
              <Building className="h-3.5 w-3.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="preferences" className="flex-1 min-w-22.5 sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3">
              <Globe className="h-3.5 w-3.5" /> Preferences
            </TabsTrigger>
            <TabsTrigger value="hardware" className="flex-1 min-w-22.5 sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3">
              <Printer className="h-3.5 w-3.5" /> Hardware
            </TabsTrigger>
            <TabsTrigger value="locations" className="flex-1 min-w-24 sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3">
              <Building className="h-3.5 w-3.5" /> Locations
            </TabsTrigger>
            <TabsTrigger value="license" className="flex-1 min-w-20 sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3">
              <Key className="h-3.5 w-3.5" /> Activation
            </TabsTrigger>
            <TabsTrigger value="data" className="flex-1 min-w-21.25 sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3">
              <Database className="h-3.5 w-3.5" /> Database
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="flex-1 min-w-24 sm:min-w-0 flex items-center justify-center gap-1.5 text-xs py-2 px-3">
              <RefreshCw className="h-3.5 w-3.5" /> Diagnostics
            </TabsTrigger>
          </TabsList>
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
