import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.govprojects.mobile',
  appName: 'GovProjects',
  webDir: 'dist/mobile/browser',
  server: {
    // Use http to avoid mixed-content blocking when calling http:// API/Keycloak
    androidScheme: 'http',
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
