import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonToggle,
  IonButtons,
  IonSpinner,
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { ActivityService } from '../../core/services/activity.service';
import { DayEventsComponent, CalendarEvent } from './day-events.component';

addIcons({ chevronBackOutline, chevronForwardOutline });

interface DayCell {
  date: string; // YYYY-MM-DD
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dots: ('primary' | 'warning' | 'success')[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonToggle,
    IonButtons,
    IonSpinner,
    DayEventsComponent,
  ],
  styles: [
    `
      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
        padding: 8px;
      }

      .day-header {
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        color: var(--ion-color-medium);
        padding: 4px 0;
      }

      .day-cell {
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        cursor: pointer;
        position: relative;
        font-size: 14px;
        min-height: 40px;
      }

      .day-cell.other-month {
        color: var(--ion-color-light-shade);
      }

      .day-cell.today {
        font-weight: 700;
        color: var(--ion-color-primary);
      }

      .day-cell.selected {
        background: var(--ion-color-primary);
        color: #fff;
      }

      .day-cell.selected.today {
        color: #fff;
      }

      .dot-row {
        display: flex;
        gap: 3px;
        position: absolute;
        bottom: 3px;
      }

      .dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
      }

      .dot.primary {
        background: var(--ion-color-primary);
      }
      .dot.warning {
        background: var(--ion-color-warning);
      }
      .dot.success {
        background: var(--ion-color-success);
      }

      .day-cell.selected .dot.primary,
      .day-cell.selected .dot.warning,
      .day-cell.selected .dot.success {
        background: rgba(255, 255, 255, 0.8);
      }

      .month-nav {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 8px 0;
      }

      .month-label {
        font-size: 16px;
        font-weight: 600;
        min-width: 140px;
        text-align: center;
      }

      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 16px 4px;
        gap: 8px;
        font-size: 13px;
      }
    `,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Calendar</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="toggle-row">
        <span>My Items</span>
        <ion-toggle
          [checked]="myItems()"
          (ionChange)="toggleMyItems($event)"
          enableOnOffLabels
        ></ion-toggle>
      </div>

      <!-- Month navigation -->
      <div class="month-nav">
        <ion-button fill="clear" size="small" (click)="prevMonth()">
          <ion-icon slot="icon-only" name="chevron-back-outline"></ion-icon>
        </ion-button>
        <span class="month-label">{{ monthLabel() }}</span>
        <ion-button fill="clear" size="small" (click)="nextMonth()">
          <ion-icon slot="icon-only" name="chevron-forward-outline"></ion-icon>
        </ion-button>
      </div>

      <!-- Calendar grid -->
      <div class="calendar-grid">
        @for (h of dayHeaders; track h) {
          <div class="day-header">{{ h }}</div>
        }
        @for (cell of dayCells(); track cell.date) {
          <div
            class="day-cell"
            [class.other-month]="!cell.isCurrentMonth"
            [class.today]="cell.isToday"
            [class.selected]="cell.date === selectedDate()"
            (click)="selectDay(cell.date)"
          >
            {{ cell.day }}
            @if (cell.dots.length > 0) {
              <div class="dot-row">
                @for (dot of cell.dots; track $index) {
                  <span class="dot" [class]="dot"></span>
                }
              </div>
            }
          </div>
        }
      </div>

      @if (loading()) {
        <div class="ion-text-center ion-padding">
          <ion-spinner name="crescent"></ion-spinner>
        </div>
      } @else {
        <app-day-events
          [events]="dayEvents()"
          [selectedDate]="selectedDate()"
        ></app-day-events>
      }
    </ion-content>
  `,
})
export class CalendarPage implements OnInit {
  private readonly activityService = inject(ActivityService);

  readonly dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  readonly currentMonth = signal<Date>(new Date());
  readonly selectedDate = signal<string>(this.toDateStr(new Date()));
  readonly monthEvents = signal<CalendarEvent[]>([]);
  readonly myItems = signal<boolean>(true);
  readonly loading = signal<boolean>(false);

  readonly monthLabel = computed(() => {
    const d = this.currentMonth();
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  });

  readonly dayCells = computed<DayCell[]>(() => {
    const month = this.currentMonth();
    const events = this.monthEvents();
    return this.buildCells(month, events);
  });

  readonly dayEvents = computed<CalendarEvent[]>(() => {
    const sel = this.selectedDate();
    return this.monthEvents().filter((e) => e.date === sel);
  });

  ngOnInit(): void {
    this.loadEvents();
  }

  prevMonth(): void {
    const d = new Date(this.currentMonth());
    d.setMonth(d.getMonth() - 1);
    this.currentMonth.set(d);
    this.selectedDate.set(this.toDateStr(d));
    this.loadEvents();
  }

  nextMonth(): void {
    const d = new Date(this.currentMonth());
    d.setMonth(d.getMonth() + 1);
    this.currentMonth.set(d);
    this.selectedDate.set(this.toDateStr(d));
    this.loadEvents();
  }

  selectDay(date: string): void {
    this.selectedDate.set(date);
  }

  toggleMyItems(event: CustomEvent): void {
    this.myItems.set(event.detail.checked);
    this.loadEvents();
  }

  private loadEvents(): void {
    const d = this.currentMonth();
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const startStr = this.toDateStr(start);
    const endStr = this.toDateStr(end);

    this.loading.set(true);
    this.activityService
      .calendarEvents(startStr, endStr, this.myItems() || undefined)
      .subscribe({
        next: (res: unknown) => {
          // API returns FullCalendar format: { id, title, start, end, allDay, extendedProps }
          // Transform to CalendarEvent format
          const payload = res as { data?: Array<{
            id: string; title: string; start: string; end: string; allDay: boolean;
            extendedProps?: { activityType?: string; travelPlanId?: string };
          }> };
          const events: CalendarEvent[] = [];
          for (const item of payload.data ?? []) {
            const startDt = new Date(item.start);
            const endDt = item.end ? new Date(item.end) : startDt;
            const type: CalendarEvent['type'] = item.extendedProps?.travelPlanId
              ? 'TRAVEL'
              : item.extendedProps?.activityType === 'EVENT'
                ? 'EVENT'
                : 'TASK';
            const eventId = item.extendedProps?.travelPlanId ?? item.id;
            const startTime = item.allDay ? undefined : startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const endTime = item.allDay ? undefined : endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Expand multi-day items: one entry per day
            // FullCalendar uses exclusive end dates for all-day/travel events, so subtract 1 day
            const dayStart = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate());
            const rawEnd = new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate());
            const dayEnd = (item.allDay || type === 'TRAVEL') && rawEnd > dayStart
              ? new Date(rawEnd.getFullYear(), rawEnd.getMonth(), rawEnd.getDate() - 1)
              : rawEnd;
            const cursor = new Date(dayStart);
            while (cursor <= dayEnd) {
              events.push({
                id: eventId,
                title: item.title,
                type,
                date: this.toDateStr(cursor),
                startTime: cursor.getTime() === dayStart.getTime() ? startTime : undefined,
                endTime: cursor.getTime() === dayEnd.getTime() ? endTime : undefined,
              });
              cursor.setDate(cursor.getDate() + 1);
            }
          }
          this.monthEvents.set(events);
          this.loading.set(false);
        },
        error: () => {
          this.monthEvents.set([]);
          this.loading.set(false);
        },
      });
  }

  private buildCells(month: Date, events: CalendarEvent[]): DayCell[] {
    const year = month.getFullYear();
    const mon = month.getMonth();
    const firstDay = new Date(year, mon, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, mon + 1, 0).getDate();
    const todayStr = this.toDateStr(new Date());

    // Group events by date for dot indicators
    const eventsByDate = new Map<string, Set<string>>();
    for (const ev of events) {
      if (!eventsByDate.has(ev.date)) {
        eventsByDate.set(ev.date, new Set());
      }
      eventsByDate.get(ev.date)!.add(ev.type);
    }

    const cells: DayCell[] = [];

    // Previous month fill
    const prevMonthDays = new Date(year, mon, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const prevDate = new Date(year, mon - 1, day);
      cells.push({
        date: this.toDateStr(prevDate),
        day,
        isCurrentMonth: false,
        isToday: false,
        dots: [],
      });
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = this.toDateStr(new Date(year, mon, day));
      const types = eventsByDate.get(dateStr);
      const dots: ('primary' | 'warning' | 'success')[] = [];
      if (types) {
        if (types.has('EVENT')) dots.push('primary');
        if (types.has('TASK')) dots.push('warning');
        if (types.has('TRAVEL')) dots.push('success');
      }
      cells.push({
        date: dateStr,
        day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        dots,
      });
    }

    // Next month fill (to complete the last week row)
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let day = 1; day <= remaining; day++) {
        const nextDate = new Date(year, mon + 1, day);
        cells.push({
          date: this.toDateStr(nextDate),
          day,
          isCurrentMonth: false,
          isToday: false,
          dots: [],
        });
      }
    }

    return cells;
  }

  private toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
