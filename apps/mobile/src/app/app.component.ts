import { Component, inject, effect } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { AuthService } from './core/services/auth.service';
import { UsageTrackerService } from './core/services/usage-tracker.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `<ion-app><ion-router-outlet /></ion-app>`,
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly usageTracker = inject(UsageTrackerService);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.usageTracker.init();
      }
    });
  }
}
