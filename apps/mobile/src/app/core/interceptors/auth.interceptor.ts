import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { switchMap, take } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) return next(req);

  const oidc = inject(OidcSecurityService);
  return oidc.getAccessToken().pipe(
    take(1),
    switchMap((token) => {
      if (!token) return next(req);
      const authed = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
      return next(authed);
    })
  );
};
