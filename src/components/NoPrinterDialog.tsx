import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, RefreshCw, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getSystemPrinters, SystemPrinterInfo } from '@/services/printService';
import { toast } from 'sonner';

interface NoPrinterDialogProps {
  open: boolean;
  onClose: () => void;
  onRetryPrint?: (selectedPrinter?: string) => void;
  onFallbackSystemPrint?: () => void;
}

export function NoPrinterDialog({
  open,
  onClose,
  onRetryPrint,
  onFallbackSystemPrint,
}: NoPrinterDialogProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [detectedPrinters, setDetectedPrinters] = useState<SystemPrinterInfo[] | null>(null);

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      const printers = await getSystemPrinters();
      setDetectedPrinters(printers);
      if (printers.length > 0) {
        toast.success(`Found ${printers.length} printer(s)!`);
        if (onRetryPrint) {
          const defaultP = printers.find(p => p.isDefault) || printers[0];
          onRetryPrint(defaultP?.name);
          onClose();
        }
      } else {
        toast.error('Still no printers detected. Please check cable or driver.');
      }
    } catch (e) {
      toast.error('Failed to scan hardware.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-5 pb-3 border-b bg-amber-500/10 dark:bg-amber-500/5">
          <DialogTitle className="flex items-center gap-2.5 text-base font-semibold text-amber-700 dark:text-amber-400">
            <div className="p-2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            No Printer Detected
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            MeroByapar could not find any active printer connected to this computer. Silent POS thermal printing requires an installed printer device.
          </p>

          <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2.5 text-xs">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Printer className="h-3.5 w-3.5 text-primary" /> Troubleshooting Checklist:
            </div>
            <ul className="space-y-1.5 text-muted-foreground list-disc pl-4">
              <li>Check that the USB or network cable is plugged in firmly.</li>
              <li>Ensure the thermal printer power switch is ON and paper is loaded.</li>
              <li>Check Windows <strong>Printers & scanners</strong> in Settings to ensure the driver is installed.</li>
            </ul>
          </div>

          {detectedPrinters !== null && detectedPrinters.length > 0 && (
            <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Detected {detectedPrinters.length} printer(s). Ready to print!</span>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 bg-muted/20 border-t flex flex-col sm:flex-row gap-2 sm:justify-between items-stretch sm:items-center">
          {onFallbackSystemPrint ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onFallbackSystemPrint();
                onClose();
              }}
              className="text-xs h-9"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Windows Dialog / PDF
            </Button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleRescan}
              disabled={isScanning}
              className="text-xs h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning…' : 'Rescan Hardware'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
