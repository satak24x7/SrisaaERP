export const environment = {
  production: true,
  // For local testing: use your machine's LAN IP (phone must be on same WiFi)
  // For real deployment: replace with your production server URL
  apiBaseUrl: 'http://192.168.1.5:3000/api/v1',
  keycloak: {
    authority: 'http://192.168.1.5:8080/realms/govprojects',
    clientId: 'govprojects-web',
    redirectUrl: 'com.govprojects.mobile://callback',
    postLogoutRedirectUri: 'com.govprojects.mobile://logout',
    scope: 'openid profile email',
  },
};
