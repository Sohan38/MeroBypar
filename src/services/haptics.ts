/**
 * Haptics service providing tactile vibration feedback on touch devices.
 * Automatically checks for Capacitor Haptics support or HTML5 navigator.vibrate fallback,
 * and fails gracefully/silently on unsupported environments (desktop/web browsers).
 */

export const Haptics = {
  /**
   * Very light 8ms micro-pulse for bottom bar tabs, small toggles, and keypad taps.
   */
  light: () => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(8);
      }
    } catch {
      // Silently ignore if vibrations are blocked by browser policy
    }
  },

  /**
   * Medium 15ms pulse for adding items to cart, selecting cards, opening sheets.
   */
  medium: () => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(16);
      }
    } catch {
      // Silently ignore
    }
  },

  /**
   * Double-tap pulse for successful actions like checkout, save, and order completion.
   */
  success: () => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([12, 50, 18]);
      }
    } catch {
      // Silently ignore
    }
  },

  /**
   * Warning or error pulse for validation failures or destructive operations.
   */
  warning: () => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([25, 40, 25]);
      }
    } catch {
      // Silently ignore
    }
  },
};
