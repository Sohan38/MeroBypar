import { useLocation } from 'wouter';
import { Search, ArrowLeft, Sun, Moon, Laptop, Settings } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Haptics } from '@/services/haptics';

export function TopNav() {
  const { settings, theme, setTheme, currentUser } = useApp();
  const [location, setLocation] = useLocation();

  // Determine if we're on a root tab or deep screen
  const isRootTab = location === '/' || location === '/sales' || location === '/inventory' || location === '/accounts' || location === '/more' || location === '/extras';

  const handleBack = () => {
    Haptics.light();
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/');
    }
  };

  const toggleTheme = () => {
    Haptics.light();
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border/60 bg-card/85 backdrop-blur-xl px-3 sm:px-4 md:h-16 lg:px-6 pt-safe transition-all shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-2 min-w-0">
        {!isRootTab && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9 -ml-1 rounded-xl text-foreground hover:bg-muted active:scale-90 transition-transform"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </Button>
        )}

        <div className="flex flex-col min-w-0">
          <span className="font-bold text-base sm:text-lg text-foreground truncate tracking-tight">
            {settings.businessName || 'MeroByapar'}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium truncate -mt-1 hidden sm:block">
            {currentUser?.name || 'Admin'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {location !== '/search' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/search')}
            className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 active:scale-95 transition-all"
            title="Search"
            aria-label="Search"
          >
            <Search className="size-4.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 active:scale-95 transition-all"
          title="Toggle Theme"
          aria-label="Toggle Theme"
        >
          {theme === 'light' ? (
            <Sun className="size-4.5 text-amber-500" />
          ) : theme === 'dark' ? (
            <Moon className="size-4.5 text-blue-400" />
          ) : (
            <Laptop className="size-4.5" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8.5 w-8.5 rounded-full p-0 active:scale-95 transition-transform">
              <Avatar className="h-8.5 w-8.5 border border-border/80">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                  {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-2xl shadow-xl border-border/80 p-1.5">
            <div className="flex items-center gap-2.5 p-2 bg-muted/40 rounded-xl mb-1">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
                  {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <p className="font-semibold text-xs text-foreground truncate">
                  {currentUser ? currentUser.name : 'Administrator'}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {currentUser?.role || 'Admin Mode'}
                </p>
              </div>
            </div>

            <DropdownMenuItem
              onClick={() => setLocation('/settings')}
              className="rounded-xl text-xs font-medium cursor-pointer py-2"
            >
              <Settings className="mr-2 size-4 text-muted-foreground" />
              <span>System Settings</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
