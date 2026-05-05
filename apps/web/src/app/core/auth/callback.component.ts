import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';

@Component({
  selector: 'app-callback',
  standalone: true,
  template: `<div class="flex items-center justify-center h-screen"><p class="text-lg text-gray-500">Signing in...</p></div>`,
})
export class CallbackComponent implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.oidc.checkAuth().subscribe({
      next: ({ isAuthenticated }) => {
        if (isAuthenticated) {
          // Restore the page the user was on before auth redirect
          const savedUrl = sessionStorage.getItem('post_login_redirect');
          sessionStorage.removeItem('post_login_redirect');
          this.router.navigateByUrl(savedUrl || '/');
        } else {
          // Code exchange failed (expired/stale code) — restart login
          this.oidc.authorize();
        }
      },
      error: () => {
        // Auth check failed entirely — restart login
        this.oidc.authorize();
      },
    });
  }
}
