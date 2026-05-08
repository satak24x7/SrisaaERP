import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, TextareaModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />

    <div class="mb-6">
      <h2 class="text-2xl font-semibold text-gray-800">Configuration</h2>
      <p class="text-sm text-gray-500 mt-1">Platform-wide settings</p>
    </div>

    @if (loading()) {
      <div class="flex items-center gap-2 text-gray-500 py-12 justify-center">
        <i class="pi pi-spin pi-spinner text-2xl"></i> Loading...
      </div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="onSave()">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="pi pi-cog text-blue-600"></i>
            General Settings
          </h3>
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">BU Head Role Name</label>
              <input pInputText formControlName="buHeadRoleName" placeholder="e.g. bu_head or BUHEAD" class="w-full" />
              <small class="text-gray-500">The role name used to identify BU Heads in dropdowns</small>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Statutory Registrations Reveal Password</label>
              <input pInputText formControlName="statutoryRevealPassword" type="password" placeholder="Set a password to protect sensitive data" class="w-full" />
              <small class="text-gray-500">Users must enter this password to view login/password/mobile/email in Statutory Registrations</small>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="pi pi-sparkles text-purple-600"></i>
            AI Integration
          </h3>
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Gemini API Key</label>
              <input pInputText formControlName="geminiApiKey" type="password" placeholder="Enter Google Gemini API key" class="w-full" />
              <small class="text-gray-500">Used for AI-powered RFP analysis in Bid Management → Tenders. Get a free key from <a href="https://aistudio.google.com/apikey" target="_blank" class="text-blue-600 hover:underline">Google AI Studio</a></small>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Gemini Model</label>
              <input pInputText formControlName="geminiModel" placeholder="gemini-2.0-flash" class="w-full" />
              <small class="text-gray-500">Default: gemini-2.0-flash. Alternatives: gemini-2.0-flash-lite, gemini-2.5-flash-preview-05-20</small>
            </div>

            <!-- AI Usage Status -->
            @if (aiUsage()) {
              <div class="border-t border-gray-200 pt-4 mt-2">
                <label class="text-sm font-semibold text-gray-700 flex items-center gap-1 mb-3">
                  <i class="pi pi-chart-bar text-purple-500"></i> Today's Usage
                </label>
                <div class="grid grid-cols-2 gap-3">
                  <div class="rounded-lg bg-purple-50 border border-purple-200 p-3">
                    <div class="text-xs text-purple-600 font-medium">API Requests</div>
                    <div class="text-lg font-bold text-purple-800">{{ aiUsage()!.today.requests }} <span class="text-sm font-normal text-purple-500">/ {{ aiUsage()!.limits.requestsPerDay | number }}</span></div>
                    <div class="mt-1 h-1.5 bg-purple-200 rounded-full overflow-hidden">
                      <div class="h-full rounded-full" [class]="aiUsageReqPct() > 80 ? 'bg-red-500' : 'bg-purple-500'" [style.width.%]="aiUsageReqPct()"></div>
                    </div>
                  </div>
                  <div class="rounded-lg bg-blue-50 border border-blue-200 p-3">
                    <div class="text-xs text-blue-600 font-medium">Tokens Used Today</div>
                    <div class="text-lg font-bold text-blue-800">{{ formatTokens(aiUsage()!.today.tokens) }}</div>
                    <div class="text-xs text-blue-500 mt-1">Model: {{ aiUsage()!.model }}</div>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="pi pi-folder-open text-blue-600"></i>
            Document Storage
          </h3>
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Storage Type</label>
              <p-select appendTo="body" formControlName="dmsStorageType" [options]="storageTypes" optionLabel="label" optionValue="value" class="w-full" />
              <small class="text-gray-500">LOCAL: files on disk (can be a mounted cloud drive). GOOGLE_DRIVE: files uploaded to your Google Drive via OAuth.</small>
            </div>
            @if (form.get('dmsStorageType')?.value === 'LOCAL') {
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Local Storage Path</label>
                <input pInputText formControlName="dmsLocalPath" placeholder="Leave blank for default (uploads/documents)" class="w-full" />
                <small class="text-gray-500">Absolute or relative path. Can point to a cloud-mounted folder (e.g. OneDrive, Dropbox sync folder).</small>
              </div>
            }
            @if (form.get('dmsStorageType')?.value === 'GOOGLE_DRIVE') {
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Google Drive OAuth Credentials (JSON)</label>
                <textarea pTextarea formControlName="dmsGoogleCredentials" [rows]="4" placeholder='{"client_id":"...","client_secret":"...","refresh_token":"..."}' class="w-full font-mono text-xs"></textarea>
                <small class="text-gray-500">Run <code class="bg-gray-100 px-1 rounded">node scripts/google-drive-auth.js &lt;client_id&gt; &lt;client_secret&gt;</code> to generate this JSON. Requires an OAuth Desktop App from Google Cloud Console → Credentials.</small>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium text-gray-700">Google Drive Root Folder ID</label>
                <input pInputText formControlName="dmsGoogleFolderId" placeholder="e.g. 1AbCdEfGhIjKlMnOpQr..." class="w-full" />
                <small class="text-gray-500">The Drive folder ID where all DMS files will be stored. Copy from the folder URL: drive.google.com/drive/folders/<b>&lt;this-id&gt;</b></small>
              </div>
            }
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="pi pi-microsoft text-blue-500"></i>
            Microsoft 365 Mail Integration
          </h3>
          <div class="flex flex-col gap-5">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Client ID</label>
              <input pInputText formControlName="ms365ClientId" placeholder="Azure AD App Registration Client ID" class="w-full" />
              <small class="text-gray-500">From Azure Portal → App registrations → your app → Application (client) ID</small>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Client Secret</label>
              <input pInputText formControlName="ms365ClientSecret" type="password" placeholder="Azure AD Client Secret" class="w-full" />
              <small class="text-gray-500">From Azure Portal → App registrations → Certificates & secrets → New client secret</small>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Tenant ID</label>
              <input pInputText formControlName="ms365TenantId" placeholder="common (default — multi-tenant)" class="w-full" />
              <small class="text-gray-500">Use "common" for multi-tenant, or your specific tenant ID for single-tenant</small>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium text-gray-700">Redirect URI</label>
              <input pInputText formControlName="ms365RedirectUri" placeholder="http://localhost:4200/mail/settings" class="w-full" />
              <small class="text-gray-500">Must match the redirect URI configured in Azure AD. Default: current page URL (/mail/settings)</small>
            </div>
          </div>
        </div>
        </div><!-- end grid -->

        @if (serverError) {
          <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
        }
        <div class="flex justify-end pt-4">
          <p-button label="Save" type="submit" icon="pi pi-save" [loading]="saving"
                    [disabled]="form.pristine || saving" />
        </div>
      </form>
    }
  `,
})
export class ConfigurationComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly msg = inject(MessageService);

  loading = signal(true);
  saving = false;
  serverError = '';

  aiUsage = signal<{ today: { requests: number; tokens: number }; limits: { requestsPerDay: number; tokensPerMinute: number }; model: string } | null>(null);
  aiUsageReqPct = computed(() => {
    const u = this.aiUsage();
    if (!u) return 0;
    return Math.min(100, Math.round((u.today.requests / u.limits.requestsPerDay) * 100));
  });

  storageTypes = [
    { label: 'Local Folder', value: 'LOCAL' },
    { label: 'Google Drive', value: 'GOOGLE_DRIVE' },
  ];

  form = this.fb.group({
    buHeadRoleName: [''],
    statutoryRevealPassword: [''],
    geminiApiKey: [''],
    geminiModel: [''],
    dmsStorageType: ['LOCAL'],
    dmsLocalPath: [''],
    dmsGoogleCredentials: [''],
    dmsGoogleFolderId: [''],
    ms365ClientId: [''],
    ms365ClientSecret: [''],
    ms365TenantId: [''],
    ms365RedirectUri: [''],
  });

  ngOnInit(): void {
    this.http.get<{ data: Record<string, string> }>(`${environment.apiBaseUrl}/config`).subscribe({
      next: (r) => {
        this.form.patchValue({
          buHeadRoleName: r.data['buHeadRoleName'] ?? '',
          statutoryRevealPassword: r.data['statutoryRevealPassword'] ?? '',
          geminiApiKey: r.data['gemini_api_key'] ?? '',
          geminiModel: r.data['gemini_model'] ?? '',
          dmsStorageType: r.data['dms_storage_type'] || 'LOCAL',
          dmsLocalPath: r.data['dms_local_path'] ?? '',
          dmsGoogleCredentials: r.data['dms_google_credentials'] ?? '',
          dmsGoogleFolderId: r.data['dms_google_folder_id'] ?? '',
          ms365ClientId: r.data['ms365_client_id'] ?? '',
          ms365ClientSecret: r.data['ms365_client_secret'] ?? '',
          ms365TenantId: r.data['ms365_tenant_id'] ?? '',
          ms365RedirectUri: r.data['ms365_redirect_uri'] ?? '',
        });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
    this.loadAiUsage();
  }

  private loadAiUsage(): void {
    this.http.get<{ data: { today: { requests: number; tokens: number }; limits: { requestsPerDay: number; tokensPerMinute: number }; model: string } }>(`${environment.apiBaseUrl}/config/ai-usage`).subscribe({
      next: (r) => this.aiUsage.set(r.data),
    });
  }

  formatTokens(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  onSave(): void {
    this.saving = true; this.serverError = '';
    const v = this.form.value;
    const items = [
      { key: 'buHeadRoleName', value: v.buHeadRoleName ?? '' },
      { key: 'statutoryRevealPassword', value: v.statutoryRevealPassword ?? '' },
      { key: 'gemini_api_key', value: v.geminiApiKey ?? '' },
      { key: 'gemini_model', value: v.geminiModel ?? '' },
      { key: 'dms_storage_type', value: v.dmsStorageType ?? 'LOCAL' },
      { key: 'dms_local_path', value: v.dmsLocalPath ?? '' },
      { key: 'dms_google_credentials', value: v.dmsGoogleCredentials ?? '' },
      { key: 'dms_google_folder_id', value: v.dmsGoogleFolderId ?? '' },
      { key: 'ms365_client_id', value: v.ms365ClientId ?? '' },
      { key: 'ms365_client_secret', value: v.ms365ClientSecret ?? '' },
      { key: 'ms365_tenant_id', value: v.ms365TenantId ?? '' },
      { key: 'ms365_redirect_uri', value: v.ms365RedirectUri ?? '' },
    ];

    this.http.put(`${environment.apiBaseUrl}/config`, { items }).subscribe({
      next: () => {
        this.saving = false;
        this.form.markAsPristine();
        this.msg.add({ severity: 'success', summary: 'Saved', detail: 'Configuration updated' });
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.serverError = err.error?.error?.message ?? 'Failed to save';
      },
    });
  }
}
