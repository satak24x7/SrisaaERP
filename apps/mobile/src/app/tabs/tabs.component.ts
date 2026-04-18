import { Component } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkboxOutline, calendarOutline, airplaneOutline } from 'ionicons/icons';

addIcons({ checkboxOutline, calendarOutline, airplaneOutline });

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="activities">
          <ion-icon name="checkbox-outline"></ion-icon>
          <ion-label>Activities</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="calendar">
          <ion-icon name="calendar-outline"></ion-icon>
          <ion-label>Calendar</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="travels">
          <ion-icon name="airplane-outline"></ion-icon>
          <ion-label>Travels</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsComponent {}
