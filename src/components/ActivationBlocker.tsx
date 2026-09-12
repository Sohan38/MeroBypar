import React, { useState } from 'react';
import { useLicense } from '@/license/LicenseContext';
import { useLocation } from 'wouter';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Key, ShieldAlert, AlertCircle, RefreshCw } from 'lucide-react';
import { ACTIVATION_ERROR_MESSAGES } from '@/license/constants';
import { toast } from 'sonner';

export function ActivationBlocker() {
  const { state, activate } = useLicense();
  const [, setLocation] = useLocation();
  const [keyInput, setKeyInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<{ message: string; code?: string } | null>(null);

  // Render nothing if the workspace is usable.
  if (state.isUsable) {
    return null;
  }

  // During initial app boot, show a clean fullscreen loading state.
  if (state.isLoading && !isActivating) {
    return (
      <div className="fixed inset-0 z-9999 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground animate-pulse font-medium">Verifying license status...</p>
        </div>
      </div>
    );
  }

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
        // Redirect to settings page → license tab
        setLocation('/settings?tab=license');
      } else {
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

  const getStatusText = () => {
    switch (state.status) {
      case 'suspended':
        return 'Your commercial license has been suspended. Please contact support or enter a new activation key.';
      case 'expired':
      case 'trial_expired':
        return 'Your trial period or license has expired. Please activate Sohan POS to resume using the application.';
      case 'offline_expired':
        return 'License verification is overdue. Please connect to the internet to re-verify your license, or enter a new activation key.';
      case 'invalid':
        return 'License cryptographic verification failed. Enter a valid activation key.';
      default:
        return 'Please enter a valid activation key to unlock Sohan POS.';
    }
  };

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-background/90 backdrop-blur-md overflow-y-auto select-none">
      <Card className="w-full max-w-md shadow-2xl border-destructive/20 relative animate-in zoom-in-95 duration-200">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl flex items-center justify-center gap-2">
            <Key className="h-5 w-5 text-primary" /> Activation Required
          </CardTitle>
          <CardDescription className="text-xs mt-2 px-2">
            {getStatusText()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleActivate} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="blocker-license-key" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Activation Key
              </label>
              <div className="flex flex-col gap-2">
                <Input
                  id="blocker-license-key"
                  placeholder="SOHAN-XXXX-XXXX-XXXX"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  disabled={isActivating}
                  className="font-mono uppercase tracking-wider text-center text-sm h-11"
                  required
                />
                <Button type="submit" className="w-full h-11" disabled={isActivating || !keyInput.trim()}>
                  {isActivating ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Activate POS Workspace
                </Button>
              </div>
              {activationError && (
                <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-semibold text-destructive">
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
                        <RefreshCw className="h-3 w-3 animate-spin" /> Try again
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
