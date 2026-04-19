import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonButton,
  IonInput,
  IonSpinner,
  IonItem,
  IonList,
  IonText,
} from '@ionic/angular/standalone';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    IonContent,
    IonButton,
    IonInput,
    IonSpinner,
    IonItem,
    IonList,
    IonText,
  ],
  template: `
    <ion-content class="ion-padding">
      <div class="login-container">
        <h1>GovProjects</h1>
        <p class="subtitle">Sign in to continue</p>

        <ion-list class="login-form">
          <ion-item>
            <ion-input
              label="Username"
              labelPlacement="floating"
              type="text"
              [(ngModel)]="username"
              (keyup.enter)="login()"
              [disabled]="loading()"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Password"
              labelPlacement="floating"
              type="password"
              [(ngModel)]="password"
              (keyup.enter)="login()"
              [disabled]="loading()"
            ></ion-input>
          </ion-item>
        </ion-list>

        @if (auth.error()) {
          <ion-text color="danger">
            <p class="error-msg">{{ auth.error() }}</p>
          </ion-text>
        }

        <ion-button
          expand="block"
          size="large"
          (click)="login()"
          [disabled]="loading() || !username || !password"
        >
          @if (loading()) {
            <ion-spinner name="crescent"></ion-spinner>
          } @else {
            Sign In
          }
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    .login-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 12px;
      padding: 24px;
      max-width: 400px;
      margin: 0 auto;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      color: var(--ion-color-primary);
      margin-bottom: 0;
    }
    .subtitle {
      color: var(--ion-color-medium);
      margin-top: 0;
      margin-bottom: 16px;
    }
    .login-form {
      width: 100%;
      margin-bottom: 8px;
    }
    .error-msg {
      font-size: 0.85rem;
      text-align: center;
      padding: 0 8px;
    }
    ion-button {
      width: 100%;
      margin-top: 8px;
    }
  `],
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  readonly loading = signal(false);

  async login(): Promise<void> {
    if (!this.username || !this.password) return;
    this.loading.set(true);

    const success = await this.auth.login(this.username, this.password);

    this.loading.set(false);
    if (success) {
      this.router.navigate(['/tabs']);
    }
  }
}
