import React, { useMemo } from 'react';
import { useFinancialAccounts } from '@/contexts/GlobalProviders';
import { Landmark, ChevronDown, Check, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface BankSelectorProps {
  selectedAccountId?: string | null;
  onSelectAccountId: (accountId: string) => void;
  className?: string;
  label?: string;
}

/**
 * BankSelector
 * 
 * Industry-grade, mobile-first component for selecting which bank/cooperative
 * receives or disburses funds when payment method is 'bank'.
 *
 * Rules:
 * - If 0 or 1 bank account exists, does not force unnecessary clicks or clutter.
 * - If 2+ bank accounts exist, displays an elegant, tactile dropdown / selector.
 * - Automatically selects the first active bank if none is selected yet.
 */
export const BankSelector: React.FC<BankSelectorProps> = ({
  selectedAccountId,
  onSelectAccountId,
  className,
  label = 'Deposit Bank',
}) => {
  const { items: accounts } = useFinancialAccounts();

  // Filter only active bank & cooperative accounts
  const bankAccounts = useMemo(() => {
    return accounts.filter(
      acc => acc.status === 'active' && (acc.type === 'bank' || acc.type === 'cooperative')
    );
  }, [accounts]);

  // Auto-select first account if not already selected
  React.useEffect(() => {
    if (bankAccounts.length > 0 && !selectedAccountId) {
      onSelectAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedAccountId, onSelectAccountId]);

  // If there's 1 or 0 bank accounts, no need to show complex selector
  if (bankAccounts.length <= 1) {
    if (bankAccounts.length === 1) {
      const single = bankAccounts[0];
      return (
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300", className)}>
          <Landmark className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">
            Bank: {single.name} {single.accountNumber ? `(•••${single.accountNumber.slice(-4)})` : ''}
          </span>
        </div>
      );
    }
    return null;
  }

  const currentAccount = bankAccounts.find(a => a.id === selectedAccountId) || bankAccounts[0];

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Landmark className="h-3 w-3 text-blue-500" />
          {label}
        </label>
        <span className="text-[10px] text-muted-foreground">
          {bankAccounts.length} banks available
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-10 px-3 bg-background border-border hover:border-primary/50 text-left font-normal"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-6 w-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-tight">
                  {currentAccount?.name}
                </p>
                {currentAccount?.institutionName && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {currentAccount.institutionName}
                    {currentAccount.accountNumber ? ` • •••${currentAccount.accountNumber.slice(-4)}` : ''}
                  </p>
                )}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-80 p-1.5 space-y-1">
          <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            Choose Bank / Cooperative
          </div>
          {bankAccounts.map(acc => {
            const isSelected = acc.id === currentAccount?.id;
            return (
              <DropdownMenuItem
                key={acc.id}
                onClick={() => onSelectAccountId(acc.id)}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                  isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <Landmark className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{acc.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {acc.institutionName || 'Commercial Bank'}
                      {acc.accountNumber ? ` • •••${acc.accountNumber.slice(-4)}` : ''}
                    </p>
                  </div>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
