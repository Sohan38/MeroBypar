/**
 * @file pages/settings/License.tsx
 * @description Professional Licensing and Activation management component.
 *
 * Implements a responsive, clean, mobile-first card interface mapping all
 * license states (Trial, Active, Grace, Expired, Suspended, etc.).
 * Includes key input, status display, device details, and locked modules info.
 */

import React, { useState } from 'react';
import { useLicense } from '@/license/LicenseContext';
import { PLAN_LABELS, ACTIVATION_ERROR_MESSAGES, ALL_MODULES } from '@/license/constants';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { deviceService } from '@/license/DeviceService';
import { Key, ShieldCheck, ShieldAlert, Cpu, Calendar, Building, HelpCircle, Lock, AlertCircle, RefreshCw, Factory, Utensils } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Human-readable module display names and descriptions
 */
const MODULE_DISPLAY_NAMES: Record<string, { name: string; description: string; icon?: React.ReactNode }> = {
  'inventory.batches': { name: 'Batch Tracking', description: 'Track product batches and manufacturing dates' },
  'inventory.expiry': { name: 'Expiry Management', description: 'Track and enforce expiration dates' },
  'inventory.variants': { name: 'Product Variants', description: 'Support product sizes, colors, and variations' },
  'inventory.serialNumbers': { name: 'Serial Numbers', description: 'Track individual item serial numbers' },
  'inventory.barcodeSupport': { name: 'Barcode Support', description: 'Barcode scanning and generation' },
  'inventory.multiUnits': { name: 'Multi-Unit Support', description: 'Support multiple units of measure per product' },
  'sales.returns': { name: 'Sales Returns', description: 'Process product returns and refunds' },
  'sales.creditSales': { name: 'Credit Sales', description: 'Extended payment terms and credit management' },
  'sales.discounts': { name: 'Discounts', description: 'Apply discounts to sales' },
  'sales.layaway': { name: 'Layaway Orders', description: 'Hold orders for later pickup' },
  'sales.quotations': { name: 'Quotations', description: 'Generate and manage sales quotes' },
  'customers.loyalty': { name: 'Loyalty Program', description: 'Customer loyalty and points system' },
  'customers.membership': { name: 'Memberships', description: 'Customer membership tiers and benefits' },
  'hospitality.hotelGrid': { name: 'Hotel Grid', description: 'Hotel room management interface' },
  'hospitality.restaurantBilling': { name: 'Restaurant Billing', description: 'Restaurant table and billing management' },
  'production.enabled': { name: 'Production & Transformation', description: 'Create and track production transactions' },
  'consumption.enabled': { name: 'Internal Consumption', description: 'Track internal consumption without sales' },
};

export default function LicenseCard() {
  const { state, activate, deactivate, syncLicense } = useLicense();
  const [keyInput, setKeyInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [activationError, setActivationError] = useState<{ message: string; code?: string } | null>(null);

  const getStatusBadge = () => {
    switch (state.status) {
      case 'active':
        return <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>;
      case 'trial':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Trial Mode</Badge>;
      case 'grace':
        return <Badge className="bg-amber-500 hover:bg-amber-600">Grace Period</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'trial_expired':
        return <Badge variant="destructive">Trial Expired</Badge>;
      case 'suspended':
        return <Badge variant="destructive">Suspended</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Invalid Signature</Badge>;
      default:
        return <Badge variant="secondary">Unknown Status</Badge>;
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setIsActivating(true);
    setActivationError(null);
    try {
      const res = await activate(keyInput);
      if (res.success) {
        toast.success('Application activated successfully!');
        setKeyInput('');
      } else {
        // Look up local human-readable message, fall back to backend's own message
        const localMessage = ACTIVATION_ERROR_MESSAGES[res.errorCode || ''];
        const displayMessage = localMessage || res.error || 'Failed to activate license.';
        setActivationError({ message: displayMessage, code: res.errorCode });
        toast.error(displayMessage, { duration: 5000 });
      }
    } catch (err) {
      const msg = 'A connection error occurred. Please check your internet and try again.';
      setActivationError({ message: msg, code: 'NETWORK_ERROR' });
    } finally {
      setIsActivating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Are you sure you want to deactivate and remove your license from this device?')) {
      return;
    }

    setIsDeactivating(true);
    try {
      await deactivate();
      toast.info('License removed. Returned to trial/activation screen.');
    } catch (err) {
      toast.error('Failed to deactivate license.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncLicense = async () => {
    setIsSyncing(true);
    try {
      const res = await syncLicense(true, false);
      if (res.success) {
        if (res.updated && res.message) {
          toast.success(res.message);
        } else {
          toast.info(res.message || 'License is up to date.');
        }
      } else {
        toast.error(res.error || 'Failed to sync license with server.');
      }
    } catch (err) {
      toast.error('Network error. Unable to contact license server.');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatISO = (isoString: string | null) => {
    if (!isoString) return 'Never';
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card className="shadow-md border border-border">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> Application License
            </CardTitle>
            <CardDescription>
              Manage your commercial license activation and plan features.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* State Banners */}
        {state.status === 'trial' && state.trial && (
          <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 p-4 flex gap-3 items-start">
            <HelpCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-blue-800 dark:text-blue-300">Free Trial Active</h4>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                You have {state.trial.daysRemaining} days remaining in your trial period. Activate a license key to secure permanent access.
              </p>
            </div>
          </div>
        )}

        {(state.status === 'expired' || state.status === 'trial_expired' || state.status === 'suspended' || state.status === 'offline_expired') && (
          <div className="rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/50 p-4 flex gap-3 items-start">
            <ShieldAlert className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-red-800 dark:text-red-300">
                {state.status === 'offline_expired' ? 'Verification Required' : 'Activation Required'}
              </h4>
              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                {state.status === 'offline_expired'
                  ? 'Your license requires online verification. Please connect to the internet and click Sync License.'
                  : 'Your access has expired or been suspended. Please enter a valid activation key below to unlock your workspace.'}
              </p>
            </div>
          </div>
        )}

        {/* License details display */}
        {state.license && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/40 rounded-lg p-4 text-sm border border-border">
            <div className="flex items-center gap-3">
              <Building className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs text-muted-foreground block">Business / Owner</span>
                <span className="font-medium">{state.license.businessName}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs text-muted-foreground block">License Plan</span>
                <span className="font-medium capitalize">{PLAN_LABELS[state.license.plan] || state.license.plan}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs text-muted-foreground block">Expires On</span>
                <span className="font-medium">
                  {state.license.expiresAt ? formatISO(state.license.expiresAt) : 'Perpetual / Lifetime'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs text-muted-foreground block">Hardware / Installation ID</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono select-all">
                  {deviceService.getMaskedDeviceId()}
                </code>
              </div>
            </div>
            <div className="md:col-span-2 pt-2 border-t border-border flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Last verified: {formatISO(state.license.lastVerifiedAt)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs flex items-center gap-1.5 border-border hover:bg-accent"
                  disabled={isSyncing}
                  onClick={handleSyncLicense}
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync License'}
                </Button>
              </div>
              <Button
                variant="link"
                className="h-auto p-0 text-destructive text-xs hover:no-underline"
                disabled={isDeactivating}
                onClick={handleDeactivate}
              >
                {isDeactivating ? <Spinner className="mr-1 h-3 w-3" /> : null}
                Remove License
              </Button>
            </div>
          </div>
        )}

        {/* Activation Form */}
        {!state.license && (
          <form onSubmit={handleActivate} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="license-key" className="text-sm font-medium">Activation Key</label>
              <div className="flex gap-2">
                <Input
                  id="license-key"
                  placeholder="SOHAN-XXXX-XXXX-XXXX"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  disabled={isActivating}
                  className="font-mono uppercase tracking-wider"
                  required
                />
                <Button type="submit" disabled={isActivating || !keyInput.trim()}>
                  {isActivating ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Activate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your purchased activation key. The device ID and platform are captured automatically.
              </p>
              {activationError && (
                <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-destructive leading-snug">
                      Activation Failed
                    </p>
                    <p className="text-xs text-destructive/80 mt-0.5 leading-relaxed">
                      {activationError.message}
                    </p>
                    {activationError.code === 'NETWORK_ERROR' && (
                      <button
                        type="submit"
                        className="mt-1.5 text-xs text-destructive underline underline-offset-2 hover:no-underline flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" /> Try again
                      </button>
                    )}
                    {activationError.code === 'DEVICE_LIMIT_REACHED' && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Please contact your license administrator to release the previous device.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </form>
        )}

        {/* Feature Lock Summary */}
        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" /> Module Access Status
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {ALL_MODULES.map((modId) => {
              const isEnabled = state.isUsable && (state.status === 'trial' || (state.license?.enabledModules.includes(modId) ?? false));
              const displayInfo = MODULE_DISPLAY_NAMES[modId] || { name: modId, description: '' };

              return (
                <div
                  key={modId}
                  className={`flex flex-col gap-1.5 px-3 py-2 rounded-md text-xs border transition-colors ${isEnabled
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-muted/40 border-border'
                    }`}
                  title={displayInfo.description}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-semibold ${isEnabled ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                      {displayInfo.name}
                    </span>
                    <Badge variant={isEnabled ? 'outline' : 'secondary'} className={isEnabled ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/5' : 'text-muted-foreground'}>
                      {isEnabled ? '✓ Unlocked' : '◯ Locked'}
                    </Badge>
                  </div>
                  <p className={`text-[10px] leading-tight ${isEnabled ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-muted-foreground/60'}`}>
                    {displayInfo.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
