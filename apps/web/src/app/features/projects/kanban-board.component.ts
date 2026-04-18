import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { environment } from '../../../environments/environment';

interface TaskCard {
  id: string;
  title: string;
  priority: string;
  kanbanColumn: string;
  sortOrder: number;
  ownerName: string | null;
  milestoneName: string | null;
  labels: string | null;
  estimateHours: number | null;
  actualHours: number | null;
}

interface KanbanColumn {
  key: string;
  label: string;
  colorClass: string;
  tasks: TaskCard[];
}

const COLUMN_DEFS: Array<{ key: string; label: string; colorClass: string }> = [
  { key: 'BACKLOG', label: 'Backlog', colorClass: 'bg-gray-500' },
  { key: 'TODO', label: 'To Do', colorClass: 'bg-blue-500' },
  { key: 'IN_PROGRESS', label: 'In Progress', colorClass: 'bg-yellow-500' },
  { key: 'BLOCKED', label: 'Blocked', colorClass: 'bg-red-500' },
  { key: 'IN_REVIEW', label: 'In Review', colorClass: 'bg-purple-500' },
  { key: 'DONE', label: 'Done', colorClass: 'bg-green-500' },
];

const PRIORITY_SEVERITY: Record<string, string> = {
  LOW: 'secondary',
  MEDIUM: 'info',
  HIGH: 'warn',
  CRITICAL: 'danger',
};

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [
    CommonModule,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    TagModule,
    ButtonModule,
    DialogModule,
  ],
  template: `
    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i> Loading board...
      </div>
    } @else if (error()) {
      <div class="flex flex-col items-center gap-3 py-12 text-red-600">
        <i class="pi pi-exclamation-triangle text-3xl"></i>
        <span>{{ error() }}</span>
        <p-button label="Retry" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="loadTasks()" />
      </div>
    } @else {
      <div class="flex gap-4 overflow-x-auto pb-4" cdkDropListGroup>
        @for (col of columns(); track col.key) {
          <div class="flex flex-col flex-1 min-w-[220px]">
            <!-- Column Header -->
            <div class="rounded-t-lg px-3 py-2 text-white font-semibold text-sm flex items-center justify-between {{ col.colorClass }}">
              <span>{{ col.label }}</span>
              <span class="bg-white/25 rounded-full px-2 py-0.5 text-xs font-bold">{{ col.tasks.length }}</span>
            </div>

            <!-- Drop Area -->
            <div
              cdkDropList
              [cdkDropListData]="col.tasks"
              [id]="col.key"
              [cdkDropListConnectedTo]="columnKeys()"
              (cdkDropListDropped)="onDrop($event)"
              class="flex flex-col gap-2 p-2 bg-gray-100 rounded-b-lg min-h-[200px] flex-1"
            >
              @for (task of col.tasks; track task.id) {
                <div
                  cdkDrag
                  class="bg-white rounded-lg shadow-sm border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                >
                  <!-- Title -->
                  <div class="font-semibold text-sm text-gray-800 mb-1">{{ task.title }}</div>

                  <!-- Owner -->
                  @if (task.ownerName) {
                    <div class="text-xs text-gray-500 mb-1">
                      <i class="pi pi-user mr-1"></i>{{ task.ownerName }}
                    </div>
                  }

                  <!-- Priority -->
                  <p-tag
                    [value]="task.priority"
                    [severity]="getPrioritySeverity(task.priority)"
                    class="text-xs"
                  />

                  <!-- Milestone -->
                  @if (task.milestoneName) {
                    <div class="text-xs text-gray-500 mt-1">
                      <i class="pi pi-flag mr-1"></i>{{ task.milestoneName }}
                    </div>
                  }

                  <!-- Labels -->
                  @if (task.labels) {
                    <div class="flex flex-wrap gap-1 mt-1">
                      @for (label of parseLabels(task.labels); track label) {
                        <span class="inline-block bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0.5 rounded-full">{{ label }}</span>
                      }
                    </div>
                  }

                  <!-- Hours -->
                  @if (task.estimateHours !== null || task.actualHours !== null) {
                    <div class="text-[10px] text-gray-400 mt-1">
                      @if (task.estimateHours !== null) { Est: {{ task.estimateHours }}h }
                      @if (task.actualHours !== null) { Act: {{ task.actualHours }}h }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class KanbanBoardComponent implements OnInit {
  @Input({ required: true }) projectId!: string;

  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiBaseUrl;

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly columns = signal<KanbanColumn[]>([]);

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    this.loading.set(true);
    this.error.set(null);

    this.http
      .get<{ data: Array<{
        id: string;
        title: string;
        priority: string;
        kanbanColumn: string;
        sortOrder: number;
        owner: { fullName: string } | null;
        milestone: { name: string } | null;
        labels: string | null;
        estimateHours: number | null;
        actualHours: number | null;
      }> }>(`${this.apiBase}/projects/${this.projectId}/tasks?limit=500`)
      .subscribe({
        next: (res) => {
          const taskMap = new Map<string, TaskCard[]>();
          for (const def of COLUMN_DEFS) {
            taskMap.set(def.key, []);
          }

          for (const t of res.data) {
            const card: TaskCard = {
              id: t.id,
              title: t.title,
              priority: t.priority,
              kanbanColumn: t.kanbanColumn,
              sortOrder: t.sortOrder,
              ownerName: t.owner?.fullName ?? null,
              milestoneName: t.milestone?.name ?? null,
              labels: t.labels,
              estimateHours: t.estimateHours ?? null,
              actualHours: t.actualHours ?? null,
            };
            const bucket = taskMap.get(t.kanbanColumn);
            if (bucket) {
              bucket.push(card);
            } else {
              // Unknown column falls into BACKLOG
              taskMap.get('BACKLOG')!.push(card);
            }
          }

          // Sort each column by sortOrder
          for (const tasks of taskMap.values()) {
            tasks.sort((a, b) => a.sortOrder - b.sortOrder);
          }

          this.columns.set(
            COLUMN_DEFS.map((def) => ({
              key: def.key,
              label: def.label,
              colorClass: def.colorClass,
              tasks: taskMap.get(def.key)!,
            })),
          );
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load tasks. Please try again.');
          this.loading.set(false);
        },
      });
  }

  columnKeys(): string[] {
    return COLUMN_DEFS.map((d) => d.key);
  }

  getPrioritySeverity(priority: string): string {
    return PRIORITY_SEVERITY[priority] ?? 'secondary';
  }

  parseLabels(labels: string): string[] {
    return labels.split(',').map((l) => l.trim()).filter(Boolean);
  }

  onDrop(event: CdkDragDrop<TaskCard[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    }

    // Update local state: reassign kanbanColumn and sortOrder
    const targetColumn = event.container.id;
    const movedTask = event.container.data[event.currentIndex];
    movedTask.kanbanColumn = targetColumn;
    movedTask.sortOrder = event.currentIndex;

    // Trigger signal update
    this.columns.update((cols) => [...cols]);

    // Persist to API
    this.http
      .post(
        `${this.apiBase}/projects/${this.projectId}/tasks/${movedTask.id}/move`,
        { kanbanColumn: targetColumn, sortOrder: event.currentIndex },
      )
      .subscribe({
        error: () => {
          // Revert on failure by reloading
          this.loadTasks();
        },
      });
  }
}
