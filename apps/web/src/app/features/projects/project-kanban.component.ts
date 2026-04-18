import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { environment } from '../../../environments/environment';
import { KanbanBoardComponent } from './kanban-board.component';

interface ProjectOption {
  id: string;
  name: string;
  projectCode: string | null;
  status: string;
  businessUnitName: string | null;
}

@Component({
  selector: 'app-project-kanban',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, ButtonModule, TagModule, KanbanBoardComponent],
  template: `
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Kanban Board</h2>
    </div>

    <!-- Project Selector -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div class="flex items-center gap-4">
        <label class="text-sm font-medium text-gray-700 whitespace-nowrap">Select Project</label>
        <p-select
          appendTo="body"
          [(ngModel)]="selectedProjectId"
          [options]="projects()"
          optionLabel="name"
          optionValue="id"
          [filter]="true"
          filterBy="name,projectCode"
          placeholder="Choose a project..."
          class="flex-1 max-w-xl"
          (onChange)="onProjectChange()"
        >
          <ng-template let-item pTemplate="item">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ item.name }}</span>
              @if (item.projectCode) {
                <span class="text-xs text-gray-500">({{ item.projectCode }})</span>
              }
              @if (item.businessUnitName) {
                <span class="text-xs text-gray-400">— {{ item.businessUnitName }}</span>
              }
            </div>
          </ng-template>
          <ng-template let-item pTemplate="selectedItem">
            <div class="flex items-center gap-2">
              <span>{{ item.name }}</span>
              @if (item.projectCode) {
                <span class="text-xs text-gray-500">({{ item.projectCode }})</span>
              }
            </div>
          </ng-template>
        </p-select>
        @if (selectedProjectId) {
          <p-button
            label="View Project"
            icon="pi pi-external-link"
            severity="secondary"
            [outlined]="true"
            size="small"
            (onClick)="router.navigate(['/projects', selectedProjectId])"
          />
        }
      </div>
    </div>

    <!-- Kanban Board -->
    @if (selectedProjectId) {
      <app-kanban-board [projectId]="selectedProjectId" />
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-16 text-center">
        <i class="pi pi-th-large text-5xl text-gray-300 mb-4"></i>
        <p class="text-gray-500 text-lg">Select a project above to view its Kanban board</p>
      </div>
    }
  `,
})
export class ProjectKanbanComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);

  projects = signal<ProjectOption[]>([]);
  selectedProjectId = '';

  ngOnInit(): void {
    this.loadProjects();

    // If a projectId is passed as query param, pre-select it
    const qp = this.route.snapshot.queryParamMap.get('projectId');
    if (qp) {
      this.selectedProjectId = qp;
    }
  }

  private loadProjects(): void {
    this.http
      .get<{ data: ProjectOption[]; meta: unknown }>(
        `${environment.apiBaseUrl}/projects?limit=200&status=ACTIVE`,
      )
      .subscribe({
        next: (r) => {
          // Also load DRAFT projects so user can see all
          this.http
            .get<{ data: ProjectOption[]; meta: unknown }>(
              `${environment.apiBaseUrl}/projects?limit=200`,
            )
            .subscribe({
              next: (all) => this.projects.set(all.data),
              error: () => this.projects.set(r.data),
            });
        },
        error: () => {},
      });
  }

  onProjectChange(): void {
    // Update URL query param without navigation
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.selectedProjectId ? { projectId: this.selectedProjectId } : {},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
