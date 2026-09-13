import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sohan.merobyapar',
  appName: 'MeroByapar',
  webDir: 'dist',
  android: {
    // Allow the web layer to draw under system bars
    backgroundColor: '#00000000',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK', // icon style: DARK = dark icons on light bg
      backgroundColor: '#00000000',
    },
    SplashScreen: {
      launchShowDuration: 300,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
  },
};

export default config;
