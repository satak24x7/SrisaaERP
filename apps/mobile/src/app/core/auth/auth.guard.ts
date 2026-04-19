import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  // Try token refresh before redirecting to login
  const refreshed = await auth.refreshAccessToken();
  if (refreshed) return true;

  return router.createUrlTree(['/login']);
};
