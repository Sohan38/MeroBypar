import React, { createContext, useContext, useState, useEffect } from 'react';
import { useStorageProvider } from '../storage/StorageContext';
import { AppSettings, AppUser, FeatureConfig } from '../types';

interface AppContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  currentUser: AppUser | null;
  setCurrentUser: (user: AppUser | null) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

const defaultFeatures: FeatureConfig = {
  inventory: {
    batches: true,
    expiry: true,
    variants: true,
    serialNumbers: true,
    barcodeSupport: true,
    multiUnits: true,
  },
  sales: {
    returns: true,
    creditSales: true,
    discounts: true,
    layaway: true,
    quotations: true,
  },
  customers: {
    loyalty: true,
    membership: true,
  },
  hospitality: {
    hotelGrid: true,
    restaurantBilling: true,
  },
  production: {
    enabled: true,
  },
  consumption: {
    enabled: true,
  },
};

const defaultSettings: AppSettings = {
  businessName: 'Sohan Manager',
  businessLogoBase64: null,
  phone: '',
  address: '',
  vatNumber: '',
  currency: 'NPR',
  currencySymbol: 'Rs',
  taxRate: 13,
  lowStockThreshold: 10,
  defaultLocationId: 'loc-default',
  theme: 'system',
  language: 'en',
  features: defaultFeatures,
  printerSettings: {
    deviceName: '',
    paperWidth: '80mm',
    silentPrint: true,
    autoPrintOnSale: false,
  },
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const storage = useStorageProvider();

  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);

  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  useEffect(() => {
    storage.getSettings().then((loaded) => {
      if (loaded) {
        setSettingsState((prev) => ({ ...prev, ...loaded }));
      }
    });
  }, [storage]);

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettingsState(updated);
    await storage.saveSettings(updated);
  };

  const setTheme = (theme: 'light' | 'dark' | 'system') => {
    updateSettings({ theme });
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (settings.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(settings.theme);
    }
  }, [settings.theme]);

  return (
    <AppContext.Provider value={{ settings, updateSettings, currentUser, setCurrentUser, theme: settings.theme, setTheme }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
