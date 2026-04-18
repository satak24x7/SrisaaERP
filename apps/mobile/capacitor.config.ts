import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.govprojects.mobile',
  appName: 'GovProjects',
  webDir: 'dist/mobile/browser',
  server: {
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
