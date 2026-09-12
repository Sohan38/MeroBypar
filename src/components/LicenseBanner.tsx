import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLicense } from '@/license/LicenseContext';
import { ShieldAlert, HelpCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function LicenseBanner() {
  const { state, syncLicense } = useLicense();
  const [location, setLocation] = useLocation();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncLicense(true, false);
      if (res.success) {
        if (res.updated && res.message) {
          toast.success(res.message);
        } else {
          toast.info(res.message || 'License verified successfully.');
        }
      } else {
        toast.error(res.error || 'Verification failed.');
      }
    } catch {
      toast.error('Network error. Unable to contact license server.');
    } finally {
      setIsSyncing(false);
    }
  };

  // If the license is active, do not display the banner.
  if (state.status === 'active') {
    return null;
  }

  // Handle Trial Mode
  if (state.status === 'trial' && state.trial) {
    return (
      <div className="bg-linear-to-r from-blue-600/95 to-indigo-600/95 text-white py-1.5 px-4 text-xs font-medium flex items-center justify-center gap-2 shadow-sm animate-in slide-in-from-top duration-300">
        <HelpCircle className="h-3.5 w-3.5 animate-pulse" />
        <span>Trial Mode: {state.trial.daysRemaining} days remaining.</span>
        <button
          onClick={() => setLocation('/settings?tab=license')}
          className="inline-flex items-center gap-0.5 bg-white/10 hover:bg-white/20 active:bg-white/30 px-2 py-0.5 rounded transition-all font-semibold ml-2"
        >
          Activate Now <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Handle Expiry / Revocation / Suspended states (requires activation)
  if (!state.isUsable) {
    const getStatusText = () => {
      switch (state.status) {
        case 'suspended':
          return 'Your commercial license has been suspended.';
        case 'expired':
        case 'trial_expired':
          return 'Your access has expired. Please activate a valid license key.';
        case 'offline_expired':
          return 'License verification overdue. Please connect to the internet.';
        case 'invalid':
          return 'License verification failed (invalid signature).';
        default:
          return 'Activation required to unlock all features.';
      }
    };

    return (
      <div className="bg-linear-to-r from-destructive/95 via-red-600/95 to-destructive/95 text-white py-2 px-4 text-xs font-semibold flex items-center justify-center gap-2 shadow-md animate-in slide-in-from-top duration-300">
        <ShieldAlert className="h-4 w-4" />
        <span>{getStatusText()}</span>
        {state.status === 'offline_expired' ? (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1 bg-white text-destructive hover:bg-white/90 active:bg-white/80 px-2.5 py-0.5 rounded-full transition-all ml-2 shadow-sm"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Verifying...' : 'Re-verify'}
          </button>
        ) : (
          <button
            onClick={() => setLocation('/settings?tab=license')}
            className="inline-flex items-center gap-0.5 bg-white text-destructive hover:bg-white/90 active:bg-white/80 px-2.5 py-0.5 rounded-full transition-all ml-2 shadow-sm"
          >
            Activate License <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  // Grace Period warning
  if (state.status === 'grace' && state.daysUntilExpiry !== null) {
    return (
      <div className="bg-linear-to-r from-amber-500/95 to-orange-500/95 text-white py-1.5 px-4 text-xs font-medium flex items-center justify-center gap-2 shadow-sm animate-in slide-in-from-top duration-300">
        <ShieldAlert className="h-3.5 w-3.5" />
        <span>License expired. Grace period active ({state.daysUntilExpiry + (state.license?.gracePeriodDays ?? 7)} days left).</span>
        <button
          onClick={() => setLocation('/settings?tab=license')}
          className="inline-flex items-center gap-0.5 bg-white/15 hover:bg-white/25 active:bg-white/35 px-2 py-0.5 rounded transition-all font-semibold ml-2"
        >
          Renew Now <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return null;
}
