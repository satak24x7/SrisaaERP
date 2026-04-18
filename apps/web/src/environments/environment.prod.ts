export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
  keycloak: {
    authority: 'https://auth.govprojects.example.com/realms/govprojects',
    clientId: 'govprojects-web',
    redirectUrl: 'https://app.govprojects.example.com',
    postLogoutRedirectUri: 'https://app.govprojects.example.com',
    scope: 'openid profile email',
  },
};
