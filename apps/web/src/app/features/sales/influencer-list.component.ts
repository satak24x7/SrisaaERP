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
import { RatingModule } from 'primeng/rating';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Influencer {
  id: string; name: string; influencerType: string; governmentId: string;
  governmentName: string | null; governmentType: string | null;
  partyName: string | null; qualifier: string | null;
  phone: string | null; email: string | null; influenceLevel: string | null;
  rating: number | null; notes: string | null; createdAt: string;
}
interface GovOption { id: string; name: string; governmentType: string; }

@Component({
  selector: 'app-influencer-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, TextareaModule, SelectModule, RatingModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Influencers</h2>
        <p class="text-sm text-gray-500 mt-1">Key people who can influence government decisions</p>
      </div>
      <p-button label="Add Influencer" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>
    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center"><i class="pi pi-spin pi-spinner text-2xl"></i> Loading...</div>
    } @else {
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        <p-table [value]="items()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th class="font-semibold">Name</th>
              <th class="font-semibold">Type</th>
              <th class="font-semibold">Government</th>
              <th class="font-semibold">Party / Qualifier</th>
              <th class="font-semibold">Rating</th>
              <th class="font-semibold">Phone</th>
              <th class="font-semibold" style="width:150px">Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-inf>
            <tr>
              <td><span class="font-medium">{{ inf.name }}</span></td>
              <td>
                <p-tag [value]="formatType(inf.influencerType)"
                  [severity]="inf.influencerType === 'POLITICAL' ? 'warn' : inf.influencerType === 'BUREAUCRAT' ? 'info' : 'secondary'"
                  [style]="{'font-size':'0.7rem'}" />
              </td>
              <td><span class="text-sm">{{ inf.governmentName || '—' }}</span></td>
              <td>
                <div class="text-sm">
                  @if (inf.partyName) { <span class="font-medium">{{ inf.partyName }}</span> }
                  @if (inf.qualifier) { <span class="text-gray-500">{{ inf.partyName ? ' · ' : '' }}{{ inf.qualifier }}</span> }
                  @if (!inf.partyName && !inf.qualifier) { <span class="text-gray-400">—</span> }
                </div>
              </td>
              <td>
                @if (inf.rating) {
                  <p-rating [(ngModel)]="inf.rating" [readonly]="true" [disabled]="true" [stars]="5" />
                } @else { <span class="text-sm text-gray-400">—</span> }
              </td>
              <td><span class="text-sm">{{ inf.phone || '—' }}</span></td>
              <td>
                <div class="flex gap-1">
                  <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEdit(inf)" />
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDelete(inf)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="7" class="text-center py-8 text-gray-500">No influencers added yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    }
    <p-dialog [header]="editItem ? 'Edit Influencer' : 'Add Influencer'" [(visible)]="formVisible" [modal]="true" [style]="{width:'550px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Name *</label>
          <input pInputText formControlName="name" class="w-full" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Type *</label>
            <p-select appendTo="body" formControlName="influencerType" [options]="typeOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Government *</label>
            <p-select appendTo="body" formControlName="governmentId" [options]="govOptions()" optionLabel="name" optionValue="id" [filter]="true" filterBy="name" placeholder="Select" class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Party Name</label>
            <input pInputText formControlName="partyName" placeholder="For party candidates" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Qualifier</label>
            <input pInputText formControlName="qualifier" placeholder="Constituency, designation..." class="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Phone</label>
            <input pInputText formControlName="phone" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Email</label>
            <input pInputText formControlName="email" type="email" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Rating</label>
          <p-rating formControlName="rating"  [stars]="5" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Notes</label>
          <textarea pTextarea formControlName="notes" rows="2" class="w-full"></textarea>
        </div>
        @if (serverError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div> }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
        <p-button [label]="editItem ? 'Save' : 'Create'" [loading]="saving" [disabled]="form.invalid||saving" (onClick)="onSubmit()" />
      </ng-template>
    </p-dialog>
  `,
})
export class InfluencerListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  items = signal<Influencer[]>([]);
  govOptions = signal<GovOption[]>([]);
  loading = signal(true);
  formVisible = false;
  editItem: Influencer | null = null;
  saving = false;
  serverError = '';

  typeOptions = [
    { label: 'Political', value: 'POLITICAL' },
    { label: 'Bureaucrat', value: 'BUREAUCRAT' },
    { label: 'Other', value: 'OTHER' },
  ];
  influenceOptions = [
    { label: 'Low', value: 'LOW' }, { label: 'Medium', value: 'MEDIUM' },
    { label: 'High', value: 'HIGH' }, { label: 'Champion', value: 'CHAMPION' },
  ];

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    influencerType: ['BUREAUCRAT', Validators.required],
    governmentId: ['', Validators.required],
    partyName: [''], qualifier: [''],
    phone: [''], email: [''], rating: [null as number | null], notes: [''],
  });

  ngOnInit(): void { this.load(); this.loadGovs(); }

  load(): void {
    this.loading.set(true);
    this.http.get<{ data: Influencer[] }>(`${environment.apiBaseUrl}/influencers?limit=200`).subscribe({
      next: (r) => { this.items.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  private loadGovs(): void {
    this.http.get<{ data: GovOption[] }>(`${environment.apiBaseUrl}/governments?limit=200`).subscribe({
      next: (r) => this.govOptions.set(r.data),
    });
  }

  formatType(t: string): string { return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  influenceSeverity(level: string): 'info' | 'success' | 'warn' | 'danger' {
    switch (level) { case 'CHAMPION': return 'success'; case 'HIGH': return 'info'; case 'MEDIUM': return 'warn'; default: return 'info'; }
  }

  openCreate(): void { this.editItem = null; this.form.reset({ influencerType: 'BUREAUCRAT' }); this.serverError = ''; this.formVisible = true; }

  openEdit(inf: Influencer): void {
    this.editItem = inf;
    this.form.patchValue({
      name: inf.name, influencerType: inf.influencerType, governmentId: inf.governmentId,
      partyName: inf.partyName ?? '', qualifier: inf.qualifier ?? '',
      phone: inf.phone ?? '', email: inf.email ?? '',
      rating: inf.rating, notes: inf.notes ?? '',
    });
    this.serverError = ''; this.formVisible = true;
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.saving = true; this.serverError = '';
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.form.value)) { if (v) body[k] = v; }
    const url = `${environment.apiBaseUrl}/influencers`;
    const req$ = this.editItem ? this.http.patch(`${url}/${this.editItem.id}`, body) : this.http.post(url, body);
    req$.subscribe({
      next: () => { this.saving = false; this.formVisible = false; this.msg.add({ severity: 'success', summary: 'Success' }); this.load(); },
      error: (err: HttpErrorResponse) => { this.saving = false; this.serverError = err.error?.error?.message ?? 'Error'; },
    });
  }

  confirmDelete(inf: Influencer): void {
    this.confirm.confirm({
      message: `Delete "${inf.name}"?`, header: 'Delete Influencer', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/influencers/${inf.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.load(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
