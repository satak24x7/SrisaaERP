import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [IonContent, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <div class="callback-container">
        <ion-spinner name="crescent" color="primary"></ion-spinner>
        <p>Signing in...</p>
      </div>
    </ion-content>
  `,
  styles: [`
    .callback-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 16px;
    }
    p {
      color: var(--ion-color-medium);
      font-size: 1rem;
    }
  `],
})
export class CallbackComponent implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.oidc.checkAuth().subscribe(({ isAuthenticated }) => {
      if (isAuthenticated) {
        this.router.navigate(['/tabs']);
      }
    });
  }
}
