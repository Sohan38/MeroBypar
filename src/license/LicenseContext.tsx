/**
 * @file license/LicenseContext.tsx
 * @description React Provider and hooks for consuming license state globally.
 *
 * Design Decisions:
 * - Boots the LicenseService asynchronously on mount.
 * - Exposes full license state (trial status, plan, expires, etc.).
 * - Offers callback methods for activating and deactivating.
 * - Incorporates feature module checks to determine if a feature is enabled.
 *
 * Enforcement hooks (industry-grade):
 * - Periodic heartbeat interval (HEARTBEAT_INTERVAL_HOURS) for background
 *   re-verification while the app is running.
 * - Visibility change listener — re-verifies when the tab/app returns
 *   from being hidden (catches users who leave the app open for days).
 * - Online event listener — re-verifies immediately when connectivity
 *   is restored (syncs status as soon as the device comes back online).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { LicenseState, ActivationResponse, DeactivationResponse } from './types';
import { licenseService } from './LicenseService';
import { isDomainFeatureAllowed } from './LicenseValidator';
import { HEARTBEAT_INTERVAL_HOURS } from './constants';
import { useApp } from '@/contexts/AppContext';

interface LicenseContextType {
  state: LicenseState;
  activate: (key: string) => Promise<ActivationResponse>;
  deactivate: () => Promise<DeactivationResponse>;
  refresh: () => Promise<void>;
  checkFeature: (domain: string, flag: string) => boolean;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LicenseState>(licenseService.getState());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Refresh helper (shared by heartbeat, visibility, online) ──────────
  const silentRefresh = useCallback(async () => {
    const refreshedState = await licenseService.refreshIfNeeded();
    if (refreshedState) {
      setState(refreshedState);
    }
  }, []);

  // ── Initialization ────────────────────────────────────────────────────
  const init = useCallback(async () => {
    const initializedState = await licenseService.initialize();
    setState(initializedState);
    
    // Attempt silent refresh check if initialized license needs it
    await silentRefresh();
  }, [silentRefresh]);

  useEffect(() => {
    init();
  }, [init]);

  // ── Periodic heartbeat ────────────────────────────────────────────────
  useEffect(() => {
    const intervalMs = HEARTBEAT_INTERVAL_HOURS * 60 * 60 * 1000;

    heartbeatRef.current = setInterval(() => {
      silentRefresh();
    }, intervalMs);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [silentRefresh]);

  // ── Visibility change listener ────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        silentRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [silentRefresh]);

  // ── Online event listener ─────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      silentRefresh();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [silentRefresh]);

  // ── Actions ───────────────────────────────────────────────────────────

  const { updateSettings } = useApp();

  const activate = useCallback(async (key: string): Promise<ActivationResponse> => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const result = await licenseService.activate(key);
    setState(licenseService.getState());
    if (result.success && result.license?.businessName) {
      updateSettings({ businessName: result.license.businessName });
    }
    return result;
  }, [updateSettings]);

  const deactivate = useCallback(async (): Promise<DeactivationResponse> => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const result = await licenseService.deactivate();
    setState(licenseService.getState());
    return result;
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await silentRefresh();
  }, [silentRefresh]);

  const checkFeature = useCallback((domain: string, flag: string): boolean => {
    return isDomainFeatureAllowed(state.license, state.status, domain, flag);
  }, [state.license, state.status]);

  return (
    <LicenseContext.Provider value={{ state, activate, deactivate, refresh, checkFeature }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (context === undefined) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}
