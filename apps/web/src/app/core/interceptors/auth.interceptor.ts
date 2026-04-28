import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { switchMap, take, catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) return next(req);

  const oidc = inject(OidcSecurityService);
  return oidc.getAccessToken().pipe(
    take(1),
    switchMap((token) => {
      if (!token) {
        // No token available — trigger re-authentication instead of sending without auth
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
        oidc.authorize();
      }
      return throwError(() => err);
    }),
  );
};
