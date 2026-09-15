/**
 * printService.ts
 * ───────────────
 * Platform-aware printing service.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  Platform   │  Method                                            │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  Web / PWA  │  window.open() popup → window.print() → close     │
 * │  Capacitor  │  native Android PrintManager plugin                │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Native Android uses the platform PrintManager through the small
 * NativePrint Capacitor plugin. Browser and desktop wrappers use their
 * system print APIs and can provide an optional native bridge.
 */

// ─── Platform detection ───────────────────────────────────────────────────────

export type PrintPlatform = 'web' | 'mobile' | 'desktop';

/**
 * Returns 'mobile' when running inside a Capacitor native WebView,
 * 'web' otherwise (browser, PWA, SSR, test environment).
 */
export function getPrintPlatform(): PrintPlatform {
    try {
        // Electron check MUST come before Capacitor: @capacitor/core is bundled
        // in the Electron build too, so `window.Capacitor` exists but
        // `isNativePlatform()` returns false — which would incorrectly return 'web'
        // and skip the electronAPI bridge entirely.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (window as any).electronAPI?.printHTML === 'function') return 'desktop';

        // Capacitor sets this global before React hydrates.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cap = (window as any).Capacitor;
        if (cap && typeof cap.isNativePlatform === 'function') {
            return cap.isNativePlatform() ? 'mobile' : 'web';
        }
    } catch {
        // Not in a browser context at all (e.g. Jest) — treat as web.
    }
    return 'web';
}

/** Convenience boolean — true when running inside Android/iOS WebView */
export function isNativeMobile(): boolean {
    return getPrintPlatform() === 'mobile';
}

export interface SystemPrinterInfo {
    name: string;
    displayName?: string;
    description?: string;
    status: number;
    isDefault: boolean;
}

export interface PrintOptions {
    title?: string;
    silent?: boolean;
    deviceName?: string;
}

export class NoPrintersDetectedError extends Error {
    constructor(message = 'No installed printers detected on this computer.') {
        super(message);
        this.name = 'NoPrintersDetectedError';
    }
}

export interface PrintResult {
    success: boolean;
    fallbackUsed?: boolean;
    message?: string;
}

/**
 * Returns available system printers when running in Electron.
 * Returns empty array on Web and Android.
 */
export async function getSystemPrinters(): Promise<SystemPrinterInfo[]> {
    try {
        const bridge = (window as any).electronAPI;
        if (typeof bridge?.getPrinters === 'function') {
            const list = await bridge.getPrinters();
            if (Array.isArray(list)) return list;
        }
    } catch (e) {
        console.warn('Failed to query system printers:', e);
    }
    return [];
}

/**
 * Print a complete HTML document string.
 * Automatically selects the correct strategy for the current platform.
 *
 * @param html    A full `<!DOCTYPE html>…</html>` string
 * @param options Optional title, silent flag, and device name
 * @returns       Resolves when printing has been initiated (not necessarily finished)
 */
export function printHTMLDocument(
    html: string,
    options: PrintOptions = {},
): Promise<void> {
    const platform = getPrintPlatform();
    if (platform === 'mobile') {
        return printViaAndroidManager(html, options.title);
    }
    if (platform === 'desktop') {
        return printViaDesktopBridge(html, options);
    }
    return printViaPopup(html, options.title);
}

async function printViaAndroidManager(html: string, title = 'Receipt'): Promise<void> {
    try {
        const { registerPlugin } = await import('@capacitor/core');
        const NativePrint = registerPlugin<{ print(options: { html: string; title: string }): Promise<{ started: boolean }> }>('NativePrint');
        await NativePrint.print({ html, title });
    } catch (error) {
        throw new Error(
            error instanceof Error
                ? error.message
                : 'Android printing is unavailable. Install a system print service or use Share/PDF.',
        );
    }
}

async function printViaDesktopBridge(html: string, options: PrintOptions = {}): Promise<void> {
    const bridge = (window as any).electronAPI;
    if (typeof bridge?.printHTML === 'function') {
        // Check for printers on desktop
        const printers = await getSystemPrinters();

        // If no printers at all and silent printing was requested
        if (printers.length === 0 && options.silent !== false) {
            throw new NoPrintersDetectedError('No installed printers detected on this computer.');
        }

        // If a specific printer name was requested, verify it exists
        if (options.deviceName && printers.length > 0) {
            const found = printers.some(p => p.name === options.deviceName);
            if (!found) {
                console.warn(`[POS Print] Configured printer "${options.deviceName}" not detected. Falling back to default printer.`);
                const defaultPrinter = printers.find(p => p.isDefault) || printers[0];
                options = {
                    ...options,
                    deviceName: defaultPrinter?.name,
                };
            }
        }

        await bridge.printHTML(html, options);
        return;
    }
    return printViaPopup(html, options.title);
}

// ─── Web strategy: popup window ───────────────────────────────────────────────

function printViaPopup(html: string, title = 'Receipt'): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const win = window.open('', '_blank', 'width=420,height=720,menubar=no,toolbar=no');
            if (!win) {
                reject(
                    new Error(
                        'Popup blocked. Please allow popups for this site, then try again.',
                    ),
                );
                return;
            }
            win.document.write(html);
            win.document.close();
            win.document.title = title;
            win.focus();

            // Brief delay lets the browser finish layout before the print dialog opens.
            const timer = setTimeout(() => {
                try {
                    win.print();
                    win.close();
                    resolve();
                } catch (err) {
                    win.close();
                    reject(err instanceof Error ? err : new Error('Print failed'));
                }
            }, 320);

            // If the user closes the popup manually before the timer fires, clean up.
            win.onbeforeunload = () => clearTimeout(timer);
        } catch (err) {
            reject(err instanceof Error ? err : new Error('Print failed'));
        }
    });
}

// ─── Mobile strategy: hidden iframe ──────────────────────────────────────────

const FRAME_ID = '__pos_print_frame__';
/** Extra delay (ms) for Capacitor WebView layout before calling print(). */
const MOBILE_SETTLE_MS = 650;

function printViaMobileIframe(html: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Remove any leftover frame from a previous (possibly failed) print.
        cleanupFrame();

        const iframe = document.createElement('iframe');
        iframe.id = FRAME_ID;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.setAttribute('tabindex', '-1');
        Object.assign(iframe.style, {
            position: 'fixed',
            top: '-9999px',
            left: '-9999px',
            width: '1px',
            height: '1px',
            border: 'none',
            opacity: '0',
            pointerEvents: 'none',
        });

        document.body.appendChild(iframe);

        const iDoc = iframe.contentWindow?.document;
        if (!iDoc) {
            cleanupFrame();
            reject(new Error('Could not create print frame. Please try again.'));
            return;
        }

        // Write receipt HTML into the sandboxed frame document.
        iDoc.open();
        iDoc.write(html);
        iDoc.close();

        let didPrint = false;

        const doPrint = () => {
            if (didPrint) return;
            didPrint = true;

            try {
                iframe.contentWindow?.print();
                // Keep the frame alive long enough for Android's print chooser to open,
                // then remove it so it doesn't accumulate in the DOM.
                setTimeout(() => {
                    cleanupFrame();
                    resolve();
                }, 1800);
            } catch (err) {
                cleanupFrame();
                reject(err instanceof Error ? err : new Error('Mobile print failed'));
            }
        };

        // Primary trigger: wait for iframe load event.
        iframe.onload = () => setTimeout(doPrint, MOBILE_SETTLE_MS);

        // Safety fallback: if onload never fires (can happen in some WebViews),
        // trigger after a generous timeout.
        setTimeout(doPrint, MOBILE_SETTLE_MS + 400);
    });
}

function cleanupFrame() {
    document.getElementById(FRAME_ID)?.remove();
}
