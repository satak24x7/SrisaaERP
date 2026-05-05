import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface AiRule {
  id: string; title: string; ruleText: string; category: string;
  severity: string; enabled: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
}

interface LookupItem { label: string; value: string; }

@Component({
  selector: 'app-ai-rules',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule,
    InputTextModule, TextareaModule, SelectModule, InputSwitchModule, ConfirmDialogModule, ToastModule, TooltipModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">AI Analysis Rules</h2>
        <p class="text-sm text-gray-500 mt-1">Configure risk assessment rules applied during RFP analysis</p>
      </div>
      <p-button label="Add Rule" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4 items-center">
      <p-select [options]="categoryFilterOptions()" [(ngModel)]="selectedCategory" (ngModelChange)="loadRules()"
                placeholder="All Categories" [showClear]="true" appendTo="body" styleClass="w-48" />
      <p-select [options]="severityOptions" [(ngModel)]="selectedSeverity" (ngModelChange)="loadRules()"
                placeholder="All Severities" [showClear]="true" appendTo="body" styleClass="w-40" />
      <div class="flex items-center gap-2 ml-auto text-sm text-gray-500">
        <span>{{ enabledCount() }} of {{ items().length }} rules enabled</span>
      </div>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="filteredItems()" styleClass="p-datatable-sm" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold" style="width:50px">On</th>
              <th class="font-semibold" style="width:250px">Title</th>
              <th class="font-semibold">Rule Description</th>
              <th class="font-semibold" style="width:140px">Category</th>
              <th class="font-semibold" style="width:90px">Severity</th>
              <th class="font-semibold" style="width:120px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr [class.opacity-50]="!r.enabled">
              <td>
                <p-inputSwitch [(ngModel)]="r.enabled" (ngModelChange)="toggleEnabled(r)" [style]="{'transform':'scale(0.75)'}" />
              </td>
              <td><span class="font-medium text-sm">{{ r.title }}</span></td>
              <td><span class="text-sm text-gray-600 line-clamp-2">{{ r.ruleText }}</span></td>
              <td><p-tag [value]="categoryLabel(r.category)" [severity]="categorySeverity(r.category)" [style]="{'font-size':'0.7rem'}" /></td>
              <td>
                <p-tag [value]="r.severity"
                       [severity]="r.severity === 'HIGH' ? 'danger' : r.severity === 'MEDIUM' ? 'warn' : 'info'"
                       [style]="{'font-size':'0.7rem'}" />
              </td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(r)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(r)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" class="text-center py-8 text-gray-500">No rules found. Click "Add Rule" to create your first risk assessment rule.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <!-- Add/Edit Dialog -->
    <p-dialog [header]="editItem ? 'Edit Rule' : 'Add Rule'" [(visible)]="formVisible" [modal]="true" [style]="{width:'600px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Title *</label>
          <input pInputText formControlName="title" placeholder="e.g. Excessive retention" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Rule Description *</label>
          <textarea pTextarea formControlName="ruleText" [rows]="4" placeholder="Describe the condition the AI should look for in RFP documents..." class="w-full"></textarea>
          <span class="text-xs text-gray-400">This text is sent to the AI as an instruction. Be specific about what to flag and what thresholds to use.</span>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Category *</label>
            <p-select formControlName="category" [options]="categoryOptions()" placeholder="Select category" appendTo="body" styleClass="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Severity *</label>
            <p-select formControlName="severity" [options]="severityOptions" placeholder="Select severity" appendTo="body" styleClass="w-full" />
          </div>
        </div>
        <div class="flex items-center gap-3">
          <p-inputSwitch formControlName="enabled" />
          <label class="text-sm text-gray-700">Enabled — rule will be applied during RFP analysis</label>
        </div>
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [text]="true" (onClick)="formVisible = false" />
        <p-button [label]="editItem ? 'Update' : 'Create'" icon="pi pi-check" (onClick)="save()" [disabled]="form.invalid" [loading]="saving" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    :host ::ng-deep .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  `]
})
export class AiRulesComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);

  loading = signal(false);
  items = signal<AiRule[]>([]);
  categories = signal<LookupItem[]>([]);

  formVisible = false;
  editItem: AiRule | null = null;
  saving = false;

  selectedCategory: string | null = null;
  selectedSeverity: string | null = null;

  severityOptions = [
    { label: 'High', value: 'HIGH' },
    { label: 'Medium', value: 'MEDIUM' },
    { label: 'Low', value: 'LOW' },
  ];

  form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(255)]],
    ruleText: ['', Validators.required],
    category: ['', Validators.required],
    severity: ['', Validators.required],
    enabled: [true],
  });

  enabledCount = signal(0);

  categoryOptions = signal<{ label: string; value: string }[]>([]);
  categoryFilterOptions = signal<{ label: string; value: string }[]>([]);

  filteredItems = signal<AiRule[]>([]);

  ngOnInit() {
    this.loadCategories();
    this.loadRules();
  }

  loadCategories() {
    this.http.get<{ data: { label: string; value: string }[] }>(`${environment.apiBaseUrl}/lookup-lists/by-code/ai_rule_category/items`).subscribe({
      next: (r) => {
        this.categories.set(r.data);
        this.categoryOptions.set(r.data.map(c => ({ label: c.label, value: c.value })));
        this.categoryFilterOptions.set(r.data.map(c => ({ label: c.label, value: c.value })));
      },
    });
  }

  loadRules() {
    this.loading.set(true);
    const params: Record<string, string> = { limit: '200' };
    if (this.selectedCategory) params['category'] = this.selectedCategory;
    if (this.selectedSeverity) params['severity'] = this.selectedSeverity;

    this.http.get<{ data: AiRule[] }>(`${environment.apiBaseUrl}/ai-rules`, { params }).subscribe({
      next: (r) => {
        this.items.set(r.data);
        this.enabledCount.set(r.data.filter(x => x.enabled).length);
        this.applyFilters();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.msg.add({ severity: 'error', summary: 'Failed to load AI rules' });
      },
    });
  }

  applyFilters() {
    let data = this.items();
    // Filters already applied via API params, but just in case:
    this.filteredItems.set(data);
  }

  categoryLabel(value: string): string {
    return this.categories().find(c => c.value === value)?.label ?? value;
  }

  categorySeverity(category: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    const map: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
      PAYMENT: 'warn', LEGAL: 'danger', FINANCIAL: 'info',
      SCOPE: 'secondary', TIMELINE: 'contrast', ELIGIBILITY: 'success',
    };
    return map[category] ?? 'info';
  }

  openCreate() {
    this.editItem = null;
    this.form.reset({ enabled: true });
    this.formVisible = true;
  }

  openEdit(r: AiRule) {
    this.editItem = r;
    this.form.patchValue({ title: r.title, ruleText: r.ruleText, category: r.category, severity: r.severity, enabled: r.enabled });
    this.formVisible = true;
  }

  save() {
    if (this.form.invalid) return;
    this.saving = true;
    const body = this.form.getRawValue();
    const obs = this.editItem
      ? this.http.patch(`${environment.apiBaseUrl}/ai-rules/${this.editItem.id}`, body)
      : this.http.post(`${environment.apiBaseUrl}/ai-rules`, body);

    obs.subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: this.editItem ? 'Rule updated' : 'Rule created' });
        this.formVisible = false;
        this.saving = false;
        this.loadRules();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message || 'Failed to save' });
      },
    });
  }

  toggleEnabled(r: AiRule) {
    this.http.patch(`${environment.apiBaseUrl}/ai-rules/${r.id}/toggle`, {}).subscribe({
      next: () => {
        this.enabledCount.set(this.items().filter(x => x.enabled).length);
      },
      error: () => {
        r.enabled = !r.enabled; // revert
        this.msg.add({ severity: 'error', summary: 'Failed to toggle rule' });
      },
    });
  }

  confirmDelete(r: AiRule) {
    this.confirm.confirm({
      message: `Delete rule "${r.title}"? This cannot be undone.`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/ai-rules/${r.id}`).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Rule deleted' });
            this.loadRules();
          },
          error: () => this.msg.add({ severity: 'error', summary: 'Failed to delete' }),
        });
      },
    });
  }
}
