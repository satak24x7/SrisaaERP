import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Intercept Microsoft OAuth callback BEFORE Angular/OIDC bootstraps.
// The OIDC library sees "code" in the URL and tries to exchange it with Keycloak,
// which fails because it's a Microsoft authorization code.
// Fix: strip the params into sessionStorage and do a full redirect to a clean URL.
if (window.location.pathname === '/mail/oauth/callback') {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (code && state) {
    sessionStorage.setItem('ms365_oauth_code', code);
    sessionStorage.setItem('ms365_oauth_state', state);
    // Full page redirect — not just history.replaceState
    window.location.replace('/mail/oauth/complete');
  }
} else {
  bootstrapApplication(AppComponent, appConfig).catch((err) =>
    console.error(err)
  );
}
