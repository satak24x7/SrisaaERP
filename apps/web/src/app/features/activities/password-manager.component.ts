import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TextareaModule } from 'primeng/textarea';
import { PasswordModule } from 'primeng/password';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface Ref { id: string; name: string; }
interface SecurityQuestion { id: string; question: string; answer: string; }
interface PasswordListRow {
  id: string; portal: string; location: string | null; username: string;
  visibility: string; ownerUserId: string; ownerName: string;
  sharedRoleId: string | null; sharedRoleName: string | null;
  createdAt: string;
}
interface PasswordDetail extends PasswordListRow {
  password: string; notes: string | null;
  securityQuestions: SecurityQuestion[];
  updatedAt: string;
}

const VISIBILITY_OPTIONS = [
  { label: 'Personal', value: 'PERSONAL' },
  { label: 'Shared with Role', value: 'ROLE' },
  { label: 'Shared with All', value: 'ALL' },
];

@Component({
  selector: 'app-password-manager',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, SelectModule, TableModule, TagModule, DialogModule, ToastModule, ConfirmDialogModule, TextareaModule, PasswordModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Password Manager</h2>
        <p class="text-sm text-gray-500 mt-1">Securely store and share credentials</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button class="px-3 py-1.5 transition-colors" [class]="showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="showMine=true; loadEntries()">My Items</button>
          <button class="px-3 py-1.5 transition-colors" [class]="!showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'" (click)="showMine=false; loadEntries()">All Items</button>
        </div>
        <p-button label="Add Credential" icon="pi pi-plus" (onClick)="openDialog()" />
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <p-select appendTo="body" [(ngModel)]="filterVisibility" [options]="visibilityOptions" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All Visibility" class="w-full" (onChange)="loadEntries()" />
        <input pInputText [(ngModel)]="filterSearch" placeholder="Search portals..." class="w-full" (keyup.enter)="loadEntries()" />
        <p-button label="Search" icon="pi pi-search" (onClick)="loadEntries()" />
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow-sm border border-gray-200">
      <p-table [value]="entries()" styleClass="p-datatable-sm" [paginator]="true" [rows]="20">
        <ng-template pTemplate="header">
          <tr>
            <th>Portal</th><th>Location</th><th>Username</th><th>Visibility</th><th>Owner</th><th>Shared With</th><th style="width:140px">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-e>
          <tr>
            <td class="font-medium">{{ e.portal }}</td>
            <td class="text-sm text-gray-500">{{ e.location || '-' }}</td>
            <td>{{ e.username }}</td>
            <td><p-tag [value]="e.visibility" [severity]="visSeverity(e.visibility)" /></td>
            <td class="text-sm">{{ e.ownerName }}</td>
            <td class="text-sm">{{ e.visibility === 'ROLE' ? e.sharedRoleName : (e.visibility === 'ALL' ? 'Everyone' : '-') }}</td>
            <td>
              <div class="flex gap-1">
                <p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small" pTooltip="View" (onClick)="viewEntry(e.id)" />
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" pTooltip="Edit" (onClick)="editEntry(e.id)" />
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" pTooltip="Delete" (onClick)="deleteEntry(e.id)" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" class="text-center text-gray-400 py-8">No credentials stored</td></tr>
        </ng-template>
      </p-table>
    </div>

    <!-- View Dialog (read-only with reveal) -->
    <p-dialog header="Credential Details" [(visible)]="viewVisible" [modal]="true" [style]="{width:'550px'}">
      @if (viewEntry$()) {
        <div class="flex flex-col gap-4 pt-2">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-xs text-gray-500 font-medium mb-1">Portal</div>
              <div class="font-medium">{{ viewEntry$()!.portal }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 font-medium mb-1">Location</div>
              <div>{{ viewEntry$()!.location || '-' }}</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-xs text-gray-500 font-medium mb-1">Username</div>
              <div class="flex items-center gap-2">
                <span class="font-mono">{{ viewEntry$()!.username }}</span>
                <button class="text-blue-500 hover:text-blue-700 text-xs" (click)="copyToClipboard(viewEntry$()!.username, 'Username')"><i class="pi pi-copy"></i></button>
              </div>
            </div>
            <div>
              <div class="text-xs text-gray-500 font-medium mb-1">Password</div>
              <div class="flex items-center gap-2">
                @if (showPassword) {
                  <span class="font-mono">{{ viewEntry$()!.password }}</span>
                } @else {
                  <span class="font-mono text-gray-400">••••••••</span>
                }
                <button class="text-blue-500 hover:text-blue-700 text-xs" (click)="showPassword=!showPassword"><i [class]="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'"></i></button>
                <button class="text-blue-500 hover:text-blue-700 text-xs" (click)="copyToClipboard(viewEntry$()!.password, 'Password')"><i class="pi pi-copy"></i></button>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <p-tag [value]="viewEntry$()!.visibility" [severity]="visSeverity(viewEntry$()!.visibility)" />
            @if (viewEntry$()!.visibility === 'ROLE') { <span class="text-sm text-gray-500">Shared with: {{ viewEntry$()!.sharedRoleName }}</span> }
            @if (viewEntry$()!.visibility === 'ALL') { <span class="text-sm text-gray-500">Shared with: Everyone</span> }
          </div>
          @if (viewEntry$()!.notes) {
            <div>
              <div class="text-xs text-gray-500 font-medium mb-1">Notes</div>
              <p class="text-sm whitespace-pre-wrap">{{ viewEntry$()!.notes }}</p>
            </div>
          }
          @if (viewEntry$()!.securityQuestions.length > 0) {
            <div>
              <div class="text-xs text-gray-500 font-medium mb-2">Security Questions</div>
              @for (sq of viewEntry$()!.securityQuestions; track sq.id) {
                <div class="bg-gray-50 rounded p-3 mb-2">
                  <div class="text-sm font-medium">{{ sq.question }}</div>
                  <div class="flex items-center gap-2 mt-1">
                    @if (showAnswers[sq.id]) {
                      <span class="text-sm font-mono">{{ sq.answer }}</span>
                    } @else {
                      <span class="text-sm font-mono text-gray-400">••••••••</span>
                    }
                    <button class="text-blue-500 hover:text-blue-700 text-xs" (click)="showAnswers[sq.id]=!showAnswers[sq.id]"><i [class]="showAnswers[sq.id] ? 'pi pi-eye-slash' : 'pi pi-eye'"></i></button>
                    <button class="text-blue-500 hover:text-blue-700 text-xs" (click)="copyToClipboard(sq.answer, 'Answer')"><i class="pi pi-copy"></i></button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Close" severity="secondary" [text]="true" (onClick)="viewVisible=false; showPassword=false; showAnswers={}" />
      </ng-template>
    </p-dialog>

    <!-- Add/Edit Dialog -->
    <p-dialog [header]="editId ? 'Edit Credential' : 'Add Credential'" [(visible)]="formVisible" [modal]="true" [style]="{width:'600px'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Portal / Site *</label>
            <input pInputText formControlName="portal" class="w-full" placeholder="e.g. Gmail, AWS Console" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Location / URL</label>
            <input pInputText formControlName="location" class="w-full" placeholder="e.g. https://console.aws.amazon.com" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Username *</label>
            <input pInputText formControlName="username" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Password *</label>
            <p-password appendTo="body" formControlName="password" [toggleMask]="true" [feedback]="false" styleClass="w-full" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Visibility *</label>
            <p-select appendTo="body" formControlName="visibility" [options]="visibilityOptions" optionLabel="label" optionValue="value" class="w-full" />
          </div>
          @if (form.get('visibility')?.value === 'ROLE') {
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Share with Role *</label>
              <p-select appendTo="body" formControlName="sharedRoleId" [options]="roleOptions()" optionLabel="name" optionValue="id" [filter]="true" class="w-full" />
            </div>
          }
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Notes</label>
          <textarea pTextarea formControlName="notes" [rows]="2" class="w-full"></textarea>
        </div>

        <!-- Security Questions -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-gray-700">Security Questions</label>
            <p-button label="Add Question" icon="pi pi-plus" [text]="true" size="small" (onClick)="addQuestion()" />
          </div>
          @for (q of questionsArray.controls; track $index) {
            <div class="flex gap-2 items-start bg-gray-50 rounded p-3" [formGroup]="asFormGroup(q)">
              <div class="flex-1 flex flex-col gap-2">
                <input pInputText formControlName="question" placeholder="Question" class="w-full text-sm" />
                <input pInputText formControlName="answer" placeholder="Answer" class="w-full text-sm" />
              </div>
              <p-button icon="pi pi-times" [text]="true" [rounded]="true" severity="danger" size="small" (onClick)="removeQuestion($index)" />
            </div>
          }
        </div>

        @if (formError) {
          <div class="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ formError }}</div>
        }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="formVisible=false" />
        <p-button [label]="editId ? 'Update' : 'Save'" icon="pi pi-check" [disabled]="form.invalid" (onClick)="saveEntry()" />
      </ng-template>
    </p-dialog>
  `,
})
export class PasswordManagerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  showMine = true;
  entries = signal<PasswordListRow[]>([]);
  roleOptions = signal<Ref[]>([]);
  visibilityOptions = VISIBILITY_OPTIONS;

  filterVisibility = '';
  filterSearch = '';

  formVisible = false;
  editId: string | null = null;
  formError = '';

  viewVisible = false;
  viewEntry$ = signal<PasswordDetail | null>(null);
  showPassword = false;
  showAnswers: Record<string, boolean> = {};

  form = this.fb.group({
    portal: ['', [Validators.required, Validators.maxLength(255)]],
    location: [''],
    username: ['', [Validators.required, Validators.maxLength(255)]],
    password: ['', Validators.required],
    visibility: ['PERSONAL', Validators.required],
    sharedRoleId: [''],
    notes: [''],
    securityQuestions: this.fb.array([] as ReturnType<typeof this.createQuestionGroup>[]),
  });

  get questionsArray(): FormArray { return this.form.get('securityQuestions') as FormArray; }

  // Needed for template binding
  asFormGroup(control: import('@angular/forms').AbstractControl) { return control as import('@angular/forms').FormGroup; }

  ngOnInit(): void {
    this.loadEntries();
    this.http.get<{ data: Array<{ id: string; name: string; displayName: string | null }> }>(`${environment.apiBaseUrl}/roles?limit=200`).subscribe({
      next: (r) => this.roleOptions.set(r.data.map((role) => ({ id: role.id, name: role.displayName ?? role.name }))),
    });
  }

  loadEntries(): void {
    const params: string[] = ['limit=200'];
    if (this.showMine) params.push('mine=true');
    if (this.filterVisibility) params.push(`visibility=${this.filterVisibility}`);
    if (this.filterSearch) params.push(`q=${encodeURIComponent(this.filterSearch)}`);

    this.http.get<{ data: PasswordListRow[] }>(`${environment.apiBaseUrl}/passwords?${params.join('&')}`).subscribe({
      next: (r) => this.entries.set(r.data),
    });
  }

  viewEntry(id: string): void {
    this.showPassword = false;
    this.showAnswers = {};
    this.http.get<{ data: PasswordDetail }>(`${environment.apiBaseUrl}/passwords/${id}`).subscribe({
      next: (r) => { this.viewEntry$.set(r.data); this.viewVisible = true; },
      error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to load' }),
    });
  }

  openDialog(): void {
    this.editId = null;
    this.formError = '';
    this.form.reset({ visibility: 'PERSONAL' });
    this.questionsArray.clear();
    this.formVisible = true;
  }

  editEntry(id: string): void {
    this.http.get<{ data: PasswordDetail }>(`${environment.apiBaseUrl}/passwords/${id}`).subscribe({
      next: (r) => {
        const e = r.data;
        this.editId = e.id;
        this.formError = '';
        this.form.patchValue({
          portal: e.portal,
          location: e.location ?? '',
          username: e.username,
          password: e.password,
          visibility: e.visibility,
          sharedRoleId: e.sharedRoleId ?? '',
          notes: e.notes ?? '',
        });
        this.questionsArray.clear();
        for (const sq of e.securityQuestions) {
          this.questionsArray.push(this.createQuestionGroup(sq.question, sq.answer));
        }
        this.formVisible = true;
      },
    });
  }

  saveEntry(): void {
    if (this.form.invalid) return;
    const v = this.form.value;
    const body: Record<string, unknown> = {
      portal: v.portal, location: v.location || null,
      username: v.username, password: v.password,
      visibility: v.visibility,
      sharedRoleId: v.visibility === 'ROLE' ? v.sharedRoleId : null,
      notes: v.notes || null,
      securityQuestions: (v.securityQuestions ?? [])
        .filter((sq) => sq.question && sq.answer)
        .map((sq) => ({ question: sq.question!, answer: sq.answer! })),
    };

    const url = `${environment.apiBaseUrl}/passwords`;
    const req$ = this.editId
      ? this.http.patch(`${url}/${this.editId}`, body)
      : this.http.post(url, body);

    req$.subscribe({
      next: () => {
        this.formVisible = false;
        this.loadEntries();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: `Credential ${this.editId ? 'updated' : 'added'}` });
      },
      error: (err: HttpErrorResponse) => {
        this.formError = err.error?.error?.message ?? 'An error occurred';
      },
    });
  }

  deleteEntry(id: string): void {
    this.confirm.confirm({
      message: 'Delete this credential? This cannot be undone.',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/passwords/${id}`).subscribe({
          next: () => { this.loadEntries(); this.msg.add({ severity: 'success', summary: 'Deleted' }); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }

  addQuestion(): void {
    this.questionsArray.push(this.createQuestionGroup());
  }

  removeQuestion(index: number): void {
    this.questionsArray.removeAt(index);
  }

  private createQuestionGroup(question = '', answer = '') {
    return this.fb.group({
      question: [question, Validators.required],
      answer: [answer, Validators.required],
    });
  }

  copyToClipboard(text: string, label: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.msg.add({ severity: 'info', summary: 'Copied', detail: `${label} copied to clipboard`, life: 2000 });
    });
  }

  visSeverity(v: string): 'info' | 'success' | 'warn' {
    if (v === 'PERSONAL') return 'info';
    if (v === 'ROLE') return 'warn';
    return 'success';
  }
}
