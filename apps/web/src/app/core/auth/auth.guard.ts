import { inject } from '@angular/core';
import { type CanActivateFn } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { filter, map, take } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const oidc = inject(OidcSecurityService);

  return oidc.checkAuth().pipe(
    take(1),
    map(({ isAuthenticated }) => {
      if (isAuthenticated) return true;
      // Save current URL so callback can restore it after login
      const url = window.location.pathname + window.location.search;
      if (url && !url.startsWith('/callback')) {
        sessionStorage.setItem('post_login_redirect', url);
      }
      oidc.authorize();
      return false;
    })
  );
};
