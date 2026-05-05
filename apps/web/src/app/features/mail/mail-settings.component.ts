import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { PasswordModule } from 'primeng/password';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface MailAccount {
  id: string; label: string; emailAddress: string; senderName: string | null;
  accountType: string;
  imapHost: string | null; imapPort: number | null; imapSsl: boolean;
  smtpHost: string | null; smtpPort: number | null; smtpSsl: boolean;
  isActive: boolean; lastSyncAt: string | null; lastSyncError: string | null;
  createdAt: string;
}

@Component({
  selector: 'app-mail-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, InputNumberModule, DialogModule, TableModule, TagModule, ToastModule, CheckboxModule, PasswordModule, ConfirmDialogModule, TooltipModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2"><i class="pi pi-cog text-blue-600"></i> Mail Settings</h2>
          <p class="text-sm text-gray-500 mt-1">Configure your email accounts</p>
        </div>
        <div class="flex gap-2">
          <p-button label="Back to Inbox" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" (onClick)="router.navigate(['/mail/inbox'])" />
          <p-button label="Connect Microsoft 365" icon="pi pi-microsoft" severity="help" [outlined]="true" (onClick)="connectMicrosoft()" [loading]="connectingMs" />
          <p-button label="Add IMAP Account" icon="pi pi-plus" (onClick)="openDialog()" />
        </div>
      </div>

      <p-table [value]="accounts()" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Label</th><th>Email</th><th>Type</th><th>Server</th><th>Default</th><th>Status</th><th>Last Sync</th><th style="width:180px">Actions</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr>
            <td class="font-medium">{{ a.label }}</td>
            <td>{{ a.emailAddress }}</td>
            <td>
              @if (a.accountType === 'MICROSOFT_365') {
                <p-tag value="Microsoft 365" severity="info" icon="pi pi-microsoft" />
              } @else {
                <p-tag value="IMAP" severity="secondary" />
              }
            </td>
            <td class="text-sm">
              @if (a.accountType === 'MICROSOFT_365') {
                <span class="text-gray-400">Microsoft Graph API</span>
              } @else {
                {{ a.imapHost }}:{{ a.imapPort }}
              }
            </td>
            <td class="text-center">
              @if (defaultAccountId === a.id) {
                <i class="pi pi-star-fill text-amber-500" pTooltip="Default account"></i>
              } @else {
                <button (click)="setDefault(a)" class="text-gray-300 hover:text-amber-500 transition-colors" pTooltip="Set as default">
                  <i class="pi pi-star"></i>
                </button>
              }
            </td>
            <td><p-tag [value]="a.isActive ? 'Active' : 'Disabled'" [severity]="a.isActive ? 'success' : 'secondary'" /></td>
            <td class="text-sm">
              @if (a.lastSyncError) { <span class="text-red-600" [title]="a.lastSyncError">Error</span> }
              @else if (a.lastSyncAt) { {{ a.lastSyncAt | date:'short' }} }
              @else { <span class="text-gray-400">Never</span> }
            </td>
            <td>
              <div class="flex gap-1">
                <p-button icon="pi pi-check-circle" label="Test" size="small" [outlined]="true" (onClick)="testConnection(a)" [loading]="testingId === a.id" />
                @if (a.accountType !== 'MICROSOFT_365') {
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" (onClick)="openDialog(a)" />
                }
                @if (a.accountType === 'MICROSOFT_365') {
                  <p-button icon="pi pi-refresh" [text]="true" [rounded]="true" size="small" pTooltip="Reconnect" (onClick)="connectMicrosoft()" />
                }
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" (onClick)="deleteAccount(a)" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" class="text-center text-gray-400 py-8">No mail accounts configured. Add an IMAP account or connect Microsoft 365.</td></tr>
        </ng-template>
      </p-table>
    </div>

    <!-- IMAP Account Dialog -->
    <p-dialog [header]="editId ? 'Edit IMAP Account' : 'Add IMAP Account'" [(visible)]="dialogVisible" [modal]="true" [style]="{width:'520px', 'max-width': '95vw'}" [contentStyle]="{'overflow-x': 'hidden'}">
      <form [formGroup]="form" class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Label *</label>
            <input pInputText formControlName="label" placeholder="e.g. Work Email" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Email Address *</label>
            <input pInputText formControlName="emailAddress" placeholder="user@example.com" class="w-full" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Sender Name</label>
          <input pInputText formControlName="senderName" placeholder="e.g. Srisaa Tech" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Password *</label>
          <div class="flex gap-2">
            <input pInputText formControlName="password" [type]="showPassword ? 'text' : 'password'" class="flex-1" />
            <p-button [icon]="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" [text]="true" [rounded]="true" (onClick)="showPassword = !showPassword" />
          </div>
        </div>
        <div class="bg-gray-50 rounded p-4 border border-gray-200">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">IMAP Settings (Incoming)</h4>
          <div class="flex gap-3">
            <div class="flex-1 flex flex-col gap-1">
              <label class="text-xs text-gray-500">Host</label>
              <input pInputText formControlName="imapHost" class="w-full" />
            </div>
            <div class="w-24 flex-shrink-0 flex flex-col gap-1">
              <label class="text-xs text-gray-500">Port</label>
              <p-inputNumber formControlName="imapPort" [useGrouping]="false" class="w-full" />
            </div>
          </div>
        </div>
        <div class="bg-gray-50 rounded p-4 border border-gray-200">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">SMTP Settings (Outgoing)</h4>
          <div class="flex gap-3">
            <div class="flex-1 flex flex-col gap-1">
              <label class="text-xs text-gray-500">Host</label>
              <input pInputText formControlName="smtpHost" class="w-full" />
            </div>
            <div class="w-24 flex-shrink-0 flex flex-col gap-1">
              <label class="text-xs text-gray-500">Port</label>
              <p-inputNumber formControlName="smtpPort" [useGrouping]="false" class="w-full" />
            </div>
          </div>
        </div>
        @if (dialogError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ dialogError }}</div> }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogVisible=false" />
        <p-button [label]="editId ? 'Update' : 'Add Account'" icon="pi pi-check" [disabled]="form.invalid" [loading]="saving" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
})
export class MailSettingsComponent implements OnInit {
  readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  accounts = signal<MailAccount[]>([]);
  loading = signal(true);
  defaultAccountId = localStorage.getItem('mail_default_account') ?? '';
  dialogVisible = false;
  editId: string | null = null;
  saving = false;
  dialogError = '';
  testingId: string | null = null;
  showPassword = false;
  connectingMs = false;

  form = this.fb.group({
    label: ['', [Validators.required, Validators.maxLength(128)]],
    emailAddress: ['', [Validators.required, Validators.email]],
    senderName: [''],
    password: ['', Validators.required],
    imapHost: ['imap.secureserver.net', Validators.required],
    imapPort: [993, Validators.required],
    smtpHost: ['smtpout.secureserver.net', Validators.required],
    smtpPort: [465, Validators.required],
  });

  ngOnInit(): void {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.loading.set(true);
    this.http.get<{ data: MailAccount[] }>(`${environment.apiBaseUrl}/mail/accounts`).subscribe({
      next: (r) => { this.accounts.set(r.data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  // ===== Microsoft 365 OAuth =====

  connectMicrosoft(): void {
    this.connectingMs = true;
    this.http.get<{ data: { url: string } }>(`${environment.apiBaseUrl}/mail/oauth/microsoft/authorize`).subscribe({
      next: (r) => {
        this.connectingMs = false;
        // Redirect to Microsoft login
        window.location.href = r.data.url;
      },
      error: (err: HttpErrorResponse) => {
        this.connectingMs = false;
        this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed to start Microsoft OAuth' });
      },
    });
  }

  setDefault(account: MailAccount): void {
    this.defaultAccountId = account.id;
    localStorage.setItem('mail_default_account', account.id);
    this.msg.add({ severity: 'success', summary: 'Default Set', detail: `"${account.label}" is now the default mail account` });
  }

  // ===== IMAP Account CRUD =====

  openDialog(account?: MailAccount): void {
    this.dialogError = '';
    if (account) {
      this.editId = account.id;
      this.form.patchValue({
        label: account.label, emailAddress: account.emailAddress, senderName: account.senderName ?? '', password: '',
        imapHost: account.imapHost ?? 'imap.secureserver.net', imapPort: account.imapPort ?? 993,
        smtpHost: account.smtpHost ?? 'smtpout.secureserver.net', smtpPort: account.smtpPort ?? 465,
      });
      this.form.get('password')!.clearValidators();
      this.form.get('password')!.updateValueAndValidity();
    } else {
      this.editId = null;
      this.form.reset({ imapHost: 'imap.secureserver.net', imapPort: 993, smtpHost: 'smtpout.secureserver.net', smtpPort: 465 });
      this.form.get('password')!.setValidators(Validators.required);
      this.form.get('password')!.updateValueAndValidity();
    }
    this.dialogVisible = true;
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving = true; this.dialogError = '';
    const v = this.form.value;
    const body: Record<string, unknown> = {
      label: v.label, emailAddress: v.emailAddress, senderName: v.senderName || null,
      imapHost: v.imapHost, imapPort: v.imapPort, imapSsl: true,
      smtpHost: v.smtpHost, smtpPort: v.smtpPort, smtpSsl: true,
    };
    if (v.password) body['password'] = v.password;

    const req$ = this.editId
      ? this.http.patch(`${environment.apiBaseUrl}/mail/accounts/${this.editId}`, body)
      : this.http.post(`${environment.apiBaseUrl}/mail/accounts`, body);

    req$.subscribe({
      next: () => {
        this.saving = false; this.dialogVisible = false;
        this.msg.add({ severity: 'success', summary: 'Saved' });
        this.loadAccounts();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.dialogError = err.error?.error?.message ?? 'Error';
      },
    });
  }

  testConnection(account: MailAccount): void {
    this.testingId = account.id;
    this.http.post<{ data: { imap: boolean; error?: string } }>(`${environment.apiBaseUrl}/mail/accounts/${account.id}/test`, {}).subscribe({
      next: (r) => {
        this.testingId = null;
        if (r.data.imap) this.msg.add({ severity: 'success', summary: 'Connection OK', detail: account.accountType === 'MICROSOFT_365' ? 'Microsoft Graph API connected' : 'IMAP connected successfully' });
        else this.msg.add({ severity: 'error', summary: 'Connection Failed', detail: r.data.error ?? 'Unknown error' });
      },
      error: () => { this.testingId = null; this.msg.add({ severity: 'error', summary: 'Test Failed' }); },
    });
  }

  deleteAccount(account: MailAccount): void {
    this.confirm.confirm({
      message: `Delete "${account.label}" (${account.emailAddress})?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/mail/accounts/${account.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.loadAccounts(); },
          error: () => { this.msg.add({ severity: 'error', summary: 'Error' }); },
        });
      },
    });
  }
}
