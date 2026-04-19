export const environment = {
  production: true,
  // For local testing: use your machine's LAN IP (phone must be on same WiFi)
  // For real deployment: replace with your production server URL
  apiBaseUrl: 'http://192.168.1.7:3000/api/v1',
  keycloak: {
    authority: 'http://192.168.1.7:8080/realms/govprojects',
    clientId: 'govprojects-web',
    // Capacitor Android WebView origin (androidScheme: 'http')
    redirectUrl: 'http://localhost/callback',
    postLogoutRedirectUri: 'http://localhost',
    scope: 'openid profile email',
  },
};
