export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  keycloak: {
    authority: 'http://localhost:8080/realms/govprojects',
    clientId: 'govprojects-web',
    redirectUrl: 'http://localhost:4200/callback',
    postLogoutRedirectUri: 'http://localhost:4200',
    scope: 'openid profile email',
  },
};
