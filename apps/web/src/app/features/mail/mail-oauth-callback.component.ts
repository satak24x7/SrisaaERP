import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Callback landing — main.ts already redirected away from here.
 * This is a fallback if someone lands here directly.
 */
@Component({
  selector: 'app-mail-oauth-callback',
  standalone: true,
  template: `<div class="flex items-center justify-center h-screen"><p class="text-lg text-gray-500">Redirecting...</p></div>`,
})
export class MailOAuthCallbackComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.router.navigate(['/mail/settings'], { replaceUrl: true });
  }
}

/**
 * Completes the Microsoft OAuth flow.
 * Reads code+state from sessionStorage (saved by main.ts),
 * exchanges with our API, and redirects to mail settings.
 */
@Component({
  selector: 'app-mail-oauth-complete',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center justify-center h-screen gap-4 p-8">
      @if (!error) {
        <i class="pi pi-spin pi-spinner text-4xl text-blue-600"></i>
        <p class="text-lg text-gray-600">{{ message }}</p>
      } @else {
        <i class="pi pi-exclamation-circle text-5xl text-red-500"></i>
        <p class="text-lg font-semibold text-red-600">Microsoft 365 Connection Failed</p>
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 max-w-lg text-sm text-red-700 whitespace-pre-wrap">{{ errorDetail }}</div>
      }
      <div class="bg-gray-100 border rounded p-3 max-w-lg text-xs text-gray-500 font-mono whitespace-pre-wrap mt-4">{{ debugInfo }}</div>
      <button (click)="goToSettings()" class="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Go to Mail Settings</button>
    </div>
  `,
})
export class MailOAuthCompleteComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  message = 'Finishing Microsoft 365 setup...';
  error = false;
  errorDetail = '';
  debugInfo = '';

  ngOnInit(): void {
    const code = sessionStorage.getItem('ms365_oauth_code');
    const state = sessionStorage.getItem('ms365_oauth_state');

    this.debugInfo = `code: ${code ? code.substring(0, 20) + '...' : 'null'}, state: ${state ? state.substring(0, 20) + '...' : 'null'}`;

    if (!code || !state) {
      this.error = true;
      this.errorDetail = 'No pending Microsoft OAuth data found in session storage. Please try "Connect Microsoft 365" again from Mail Settings.';
      return;
    }

    this.message = 'Exchanging authorization code with Microsoft...';

    this.http.post<{ data: { emailAddress: string } }>(
      `${environment.apiBaseUrl}/mail/oauth/microsoft/callback`,
      { code, state },
    ).subscribe({
      next: (r) => {
        sessionStorage.removeItem('ms365_oauth_code');
        sessionStorage.removeItem('ms365_oauth_state');
        this.message = `Connected: ${r.data.emailAddress}`;
        setTimeout(() => this.goToSettings(), 1500);
      },
      error: (err: HttpErrorResponse) => {
        sessionStorage.removeItem('ms365_oauth_code');
        sessionStorage.removeItem('ms365_oauth_state');
        this.error = true;
        if (err.status === 0) {
          this.errorDetail = 'Network error — could not reach the API server.';
        } else if (err.status === 401) {
          this.errorDetail = 'Your session has expired. Please log in and try again.';
        } else {
          this.errorDetail = err.error?.error?.message ?? err.message ?? JSON.stringify(err.error);
          this.debugInfo += `\nHTTP ${err.status} ${err.statusText}`;
        }
      },
    });
  }

  goToSettings(): void {
    this.router.navigate(['/mail/settings']);
  }
}
