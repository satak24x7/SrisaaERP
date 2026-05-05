import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { switchMap, take, catchError, throwError } from 'rxjs';

function saveCurrentUrl(): void {
  const url = window.location.pathname + window.location.search;
  if (url && !url.startsWith('/callback')) {
    sessionStorage.setItem('post_login_redirect', url);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) return next(req);

  const oidc = inject(OidcSecurityService);
  return oidc.getAccessToken().pipe(
    take(1),
    switchMap((token) => {
      if (!token) {
        // No token available — save current URL and trigger re-authentication
        saveCurrentUrl();
        oidc.authorize();
        return throwError(() => new HttpErrorResponse({
          status: 401,
          statusText: 'No access token — redirecting to login',
        }));
      }
      const authed = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
      return next(authed);
    }),
    catchError((err) => {
      // If the API returns 401, trigger re-auth
      if (err instanceof HttpErrorResponse && err.status === 401) {
        saveCurrentUrl();
        oidc.authorize();
      }
      return throwError(() => err);
    }),
  );
};
