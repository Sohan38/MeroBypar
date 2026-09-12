import { useLocation } from 'wouter';
import { useLicense } from '@/license/LicenseContext';
import { ShieldAlert, HelpCircle, ArrowRight } from 'lucide-react';

export function LicenseBanner() {
  const { state } = useLicense();
  const [location, setLocation] = useLocation();

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
        <button
          onClick={() => setLocation('/settings?tab=license')}
          className="inline-flex items-center gap-0.5 bg-white text-destructive hover:bg-white/90 active:bg-white/80 px-2.5 py-0.5 rounded-full transition-all ml-2 shadow-sm"
        >
          {state.status === 'offline_expired' ? 'View Status' : 'Activate License'} <ArrowRight className="h-3 w-3" />
        </button>
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
