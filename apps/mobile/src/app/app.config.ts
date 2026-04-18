import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideAuth } from 'angular-auth-oidc-client';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideIonicAngular({ mode: 'md' }),
    provideAuth({
      config: {
        authority: environment.keycloak.authority,
        redirectUrl: environment.keycloak.redirectUrl,
        postLogoutRedirectUri: environment.keycloak.postLogoutRedirectUri,
        clientId: environment.keycloak.clientId,
        scope: environment.keycloak.scope,
        responseType: 'code',
        silentRenew: false,
        useRefreshToken: true,
        autoUserInfo: true,
      },
    }),
  ],
};
