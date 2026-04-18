import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonChip,
  IonNote,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  checkboxOutline,
  airplaneOutline,
} from 'ionicons/icons';

addIcons({ calendarOutline, checkboxOutline, airplaneOutline });

export interface CalendarEvent {
  id: string;
  title: string;
  type: 'EVENT' | 'TASK' | 'TRAVEL';
  startTime?: string;
  endTime?: string;
  dueDate?: string;
  date: string;
}

@Component({
  selector: 'app-day-events',
  standalone: true,
  imports: [
    CommonModule,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonChip,
    IonNote,
  ],
  template: `
    @if (events.length === 0) {
      <div class="ion-text-center ion-padding" style="color: var(--ion-color-medium)">
        <ion-icon name="calendar-outline" style="font-size: 48px"></ion-icon>
        <p>No events on {{ selectedDate }}</p>
      </div>
    } @else {
      <ion-list lines="full">
        @for (event of events; track event.id) {
          <ion-item button (click)="onEventTap(event)" detail>
            <ion-icon
              slot="start"
              [name]="getIcon(event.type)"
              [color]="getColor(event.type)"
            ></ion-icon>
            <ion-label>
              <h2>{{ event.title }}</h2>
              <p>{{ formatTime(event) }}</p>
            </ion-label>
            <ion-chip
              slot="end"
              [color]="getColor(event.type)"
              style="font-size: 11px"
            >
              {{ event.type }}
            </ion-chip>
          </ion-item>
        }
      </ion-list>
    }
  `,
})
export class DayEventsComponent {
  @Input() events: CalendarEvent[] = [];
  @Input() selectedDate = '';

  constructor(private readonly router: Router) {}

  getIcon(type: string): string {
    switch (type) {
      case 'EVENT':
        return 'calendar-outline';
      case 'TASK':
        return 'checkbox-outline';
      case 'TRAVEL':
        return 'airplane-outline';
      default:
        return 'calendar-outline';
    }
  }

  getColor(type: string): string {
    switch (type) {
      case 'EVENT':
        return 'primary';
      case 'TASK':
        return 'warning';
      case 'TRAVEL':
        return 'success';
      default:
        return 'medium';
    }
  }

  formatTime(event: CalendarEvent): string {
    if (event.startTime && event.endTime) {
      return `${this.toTime(event.startTime)} - ${this.toTime(event.endTime)}`;
    }
    if (event.startTime) {
      return this.toTime(event.startTime);
    }
    if (event.dueDate) {
      return `Due: ${this.toTime(event.dueDate)}`;
    }
    return 'All day';
  }

  onEventTap(event: CalendarEvent): void {
    if (event.type === 'TRAVEL') {
      this.router.navigate(['/tabs/travels', event.id]);
    } else {
      this.router.navigate(['/tabs/activities', event.id]);
    }
  }

  private toTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  }
}
