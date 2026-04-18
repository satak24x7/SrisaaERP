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
    this.oidc.checkAuth().subscribe(({ isAuthenticated }) => {
      if (isAuthenticated) {
        this.router.navigate(['/']);
      }
    });
  }
}
