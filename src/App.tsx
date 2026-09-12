import { Suspense, lazy, useEffect, useState } from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
import { useFeature } from '@/hooks/useFeature';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SplashScreen } from '@/components/SplashScreen';

import { AppProvider } from '@/contexts/AppContext';
import { GlobalProviders } from '@/contexts/GlobalProviders';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { Shell } from '@/components/layout/Shell';
import { isStaleChunkError, markAppBooted, reloadOnceForUpdate } from '@/lib/updateRecovery';

/**
 * Retries a dynamic import up to `retries` times with exponential backoff.
 * Capacitor's WebView can fail to load JS chunks on cold start; this prevents
 * those transient failures from turning into a permanent blank screen.
 */
function retryLazy<T extends { default: any }>(
  factory: () => Promise<T>,
  retries = 3
): React.LazyExoticComponent<T['default']> {
  return lazy(() =>
    factory().catch((err) => {
      if (isStaleChunkError(err) && reloadOnceForUpdate()) {
        return new Promise<T>(() => { });
      }
      if (retries <= 0) throw err;
      return new Promise<T>((resolve, reject) =>
        setTimeout(() => {
          factory().then(resolve).catch(reject);
        }, 500)
      );
    })
  );
}

const Dashboard = retryLazy(() => import('@/pages/Dashboard'));
const InventoryList = retryLazy(() => import('@/pages/inventory/List'));
const InventoryForm = retryLazy(() => import('@/pages/inventory/Form'));
const InventoryDetail = retryLazy(() => import('@/pages/inventory/Detail'));
const InventoryMovements = retryLazy(() => import('@/pages/inventory/Movements'));
const ConsumptionList = retryLazy(() => import('@/pages/inventory/consumption/List').then(m => ({ default: m.ConsumptionList })));
const ConsumptionForm = retryLazy(() => import('@/pages/inventory/consumption/Form').then(m => ({ default: m.ConsumptionForm })));
const ConsumptionDetail = retryLazy(() => import('@/pages/inventory/consumption/Detail').then(m => ({ default: m.ConsumptionDetail })));
const ProductionList = retryLazy(() => import('@/pages/inventory/production/List').then(m => ({ default: m.ProductionList })));
const ProductionForm = retryLazy(() => import('@/pages/inventory/production/Form').then(m => ({ default: m.ProductionForm })));
const RecipeList = retryLazy(() => import('@/pages/inventory/recipes/List').then(m => ({ default: m.RecipeList })));
const RecipeForm = retryLazy(() => import('@/pages/inventory/recipes/Form').then(m => ({ default: m.RecipeForm })));
const LocationsList = retryLazy(() => import('@/pages/locations/List'));
const LocationDetail = retryLazy(() => import('@/pages/locations/Detail'));
const MoveStock = retryLazy(() => import('@/pages/locations/MoveStock'));
const SalesPos = retryLazy(() => import('@/pages/sales/Pos'));
const SalesList = retryLazy(() => import('@/pages/sales/List'));
const SaleDetail = retryLazy(() => import('@/pages/sales/Detail'));
const Settings = retryLazy(() => import('@/pages/settings'));
const Reports = retryLazy(() => import('@/pages/Reports'));
const Search = retryLazy(() => import('@/pages/Search'));
const NotFound = retryLazy(() => import('@/pages/not-found'));

const CustomerList = retryLazy(() => import('@/pages/customers/List'));
const CustomerDetail = retryLazy(() => import('@/pages/customers/Detail'));
const SupplierList = retryLazy(() => import('@/pages/suppliers/List'));
const SupplierDetail = retryLazy(() => import('@/pages/suppliers/Detail'));
const SupplierForm = retryLazy(() => import('@/pages/suppliers/Form'));
const ExpenseList = retryLazy(() => import('@/pages/expenses/List'));
const ExpenseForm = retryLazy(() => import('@/pages/expenses/Form'));
const ExpenseDetail = retryLazy(() => import('@/pages/expenses/Detail'));
const PurchaseList = retryLazy(() => import('@/pages/purchases/List'));
const PurchaseForm = retryLazy(() => import('@/pages/purchases/Form'));
const PurchaseDetail = retryLazy(() => import('@/pages/purchases/Detail'));
const DispositionList = retryLazy(() => import('@/pages/dispositions/List'));
const DispositionDetail = retryLazy(() => import('@/pages/dispositions/Detail'));
const CreditList = retryLazy(() => import('@/pages/credit/List'));
const CreditForm = retryLazy(() => import('@/pages/credit/Form'));
const CreditDetail = retryLazy(() => import('@/pages/credit/Detail'));
const PayablesList = retryLazy(() => import('@/pages/payables/List'));
const PayableDetail = retryLazy(() => import('@/pages/payables/Detail'));
const CashBookList = retryLazy(() => import('@/pages/cash-book/List'));
const CashBookForm = retryLazy(() => import('@/pages/cash-book/Form'));
const DaybookList = retryLazy(() => import('@/pages/daybook/List'));
const AccountsList = retryLazy(() => import('@/pages/accounts/List'));
const MoreHub = retryLazy(() => import('@/pages/MoreHub'));
const HotelGrid = retryLazy(() => import('@/pages/hotel/Grid'));
const HotelRoomForm = retryLazy(() => import('@/pages/hotel/RoomForm'));
const HotelBillingList = retryLazy(() => import('@/pages/hotel/BillingList'));
const HotelBillingForm = retryLazy(() => import('@/pages/hotel/BillingForm'));
const RestaurantBillingList = retryLazy(() => import('@/pages/restaurant/BillingList'));
const RestaurantBillingForm = retryLazy(() => import('@/pages/restaurant/BillingForm'));

import { LicenseProvider } from '@/license/LicenseContext';
import { ConfirmProvider } from './contexts/ConfirmContext';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <ErrorBoundary>
        <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center opacity-0 animate-[fadeIn_0.15s_ease-in_0.15s_forwards]"><Spinner className="size-5 text-muted-foreground" /></div>}>
          <Switch>
            <Route path="/" component={Dashboard} />

            <Route path="/inventory" component={InventoryList} />
            <Route path="/inventory/new" component={InventoryForm} />
            <Route path="/inventory/movements" component={InventoryMovements} />
            <Route path="/inventory/consumption" component={ConsumptionList} />
            <Route path="/inventory/consumption/new" component={ConsumptionForm} />
            <Route path="/inventory/consumption/:id" component={ConsumptionDetail} />
            <Route path="/inventory/production" component={ProductionList} />
            <Route path="/inventory/production/new" component={ProductionForm} />
            <Route path="/inventory/recipes" component={RecipeList} />
            <Route path="/inventory/recipes/new" component={RecipeForm} />
            <Route path="/inventory/recipes/:id/edit" component={RecipeForm} />
            <Route path="/inventory/:id/edit" component={InventoryForm} />
            <Route path="/inventory/:id" component={InventoryDetail} />

            <Route path="/locations" component={LocationsList} />
            <Route path="/locations/move-stock" component={MoveStock} />
            <Route path="/locations/:id/move-from" component={MoveStock} />
            <Route path="/locations/:id" component={LocationDetail} />

            <Route path="/sales" component={SalesList} />
            <Route path="/sales/new" component={SalesPos} />
            <Route path="/sales/:id" component={SaleDetail} />

            <Route path="/purchases" component={PurchaseList} />
            <Route path="/purchases/new" component={PurchaseForm} />
            <Route path="/purchases/:id/edit" component={PurchaseForm} />
            <Route path="/purchases/:id" component={PurchaseDetail} />

            <Route path="/dispositions" component={DispositionList} />
            <Route path="/dispositions/:id" component={DispositionDetail} />

            <Route path="/hotel">
              {() => {
                const isEnabled = useFeature('hospitality', 'hotelGrid');
                return isEnabled ? <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><HotelGrid /></Suspense> : <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><NotFound /></Suspense>;
              }}
            </Route>
            <Route path="/hotel/rooms/new">
              {() => {
                const isEnabled = useFeature('hospitality', 'hotelGrid');
                return isEnabled ? <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><HotelRoomForm /></Suspense> : <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><NotFound /></Suspense>;
              }}
            </Route>
            <Route path="/hotel/rooms/:id">
              {() => {
                const isEnabled = useFeature('hospitality', 'hotelGrid');
                return isEnabled ? <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><HotelRoomForm /></Suspense> : <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><NotFound /></Suspense>;
              }}
            </Route>
            <Route path="/hotel/billing">
              {() => {
                const isEnabled = useFeature('hospitality', 'hotelGrid');
                return isEnabled ? <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><HotelBillingList /></Suspense> : <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><NotFound /></Suspense>;
              }}
            </Route>
            <Route path="/hotel/billing/new">
              {() => {
                const isEnabled = useFeature('hospitality', 'hotelGrid');
                return isEnabled ? <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><HotelBillingForm /></Suspense> : <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><NotFound /></Suspense>;
              }}
            </Route>

            <Route path="/restaurant">
              {() => {
                const isEnabled = useFeature('hospitality', 'restaurantBilling');
                return isEnabled ? <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><RestaurantBillingList /></Suspense> : <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><NotFound /></Suspense>;
              }}
            </Route>
            <Route path="/restaurant/new">
              {() => {
                const isEnabled = useFeature('hospitality', 'restaurantBilling');
                return isEnabled ? <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><RestaurantBillingForm /></Suspense> : <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><Spinner /></div>}><NotFound /></Suspense>;
              }}
            </Route>

            <Route path="/expenses" component={ExpenseList} />
            <Route path="/expenses/new" component={ExpenseForm} />
            <Route path="/expenses/:id/edit" component={ExpenseForm} />
            <Route path="/expenses/:id" component={ExpenseDetail} />

            <Route path="/cash-book" component={CashBookList} />
            <Route path="/cash-book/entry/:type" component={CashBookForm} />
            <Route path="/daybook" component={DaybookList} />
            <Route path="/accounts" component={AccountsList} />
            <Route path="/more" component={MoreHub} />
            <Route path="/extras" component={MoreHub} />

            <Route path="/credit" component={CreditList} />
            <Route path="/credit/new" component={CreditForm} />
            <Route path="/credit/:id" component={CreditDetail} />
            <Route path="/credit/:id/edit" component={CreditForm} />


            <Route path="/payables" component={PayablesList} />
            <Route path="/payables/:id" component={PayableDetail} />

            <Route path="/customers" component={CustomerList} />
            <Route path="/customers/:id" component={CustomerDetail} />
            <Route path="/suppliers" component={SupplierList} />
            <Route path="/suppliers/new">
              {() => <SupplierForm />}
            </Route>
            <Route path="/suppliers/:id/edit">
              {(params) => <SupplierForm id={params.id} />}
            </Route>
            <Route path="/suppliers/:id" component={SupplierDetail} />

            <Route path="/settings" component={Settings} />
            <Route path="/reports" component={Reports} />
            <Route path="/search" component={Search} />

            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </Shell>
  );
}

function App() {
  useEffect(() => {
    markAppBooted();
  }, []);

  // Show splash only on first install. After chunks are cached, skip it entirely.
  const [splashDone, setSplashDone] = useState(() => {
    try {
      return localStorage.getItem('app_initialized') === 'true';
    } catch {
      return true; // If storage is unavailable, skip splash
    }
  });

  const handleSplashDone = () => {
    try {
      localStorage.setItem('app_initialized', 'true');
    } catch { /* ignore */ }
    setSplashDone(true);
  };

  return (
    <ErrorBoundary>
      {!splashDone && <SplashScreen onDone={handleSplashDone} />}
      <AppProvider>
        <LicenseProvider>
          <QueryClientProvider client={queryClient}>
            <GlobalProviders>
              <TooltipProvider>
                {/* Use hash-based routing on file:// (packaged Electron) since
                     pathname-based routing doesn't work with file:// protocol */}
                <WouterRouter
                  {...(window.location.protocol === 'file:'
                    ? { hook: useHashLocation }
                    : { base: import.meta.env.BASE_URL.replace(/\/$/, '') })}
                >
                  <NavigationProvider>
                    <ConfirmProvider>
                      <Router />
                    </ConfirmProvider>
                  </NavigationProvider>
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </GlobalProviders>
          </QueryClientProvider>
        </LicenseProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;

