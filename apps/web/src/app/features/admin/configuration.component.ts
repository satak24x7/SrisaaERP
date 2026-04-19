import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, ToastModule],
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
      <form [formGroup]="form" (ngSubmit)="onSave()" class="max-w-xl">
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

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
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
          </div>
          @if (serverError) {
            <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ serverError }}</div>
          }
          <div class="flex justify-end pt-4">
            <p-button label="Save" type="submit" icon="pi pi-save" [loading]="saving"
                      [disabled]="form.pristine || saving" />
          </div>
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

  form = this.fb.group({
    buHeadRoleName: [''],
    statutoryRevealPassword: [''],
    geminiApiKey: [''],
    geminiModel: [''],
  });

  ngOnInit(): void {
    this.http.get<{ data: Record<string, string> }>(`${environment.apiBaseUrl}/config`).subscribe({
      next: (r) => {
        this.form.patchValue({
          buHeadRoleName: r.data['buHeadRoleName'] ?? '',
          statutoryRevealPassword: r.data['statutoryRevealPassword'] ?? '',
          geminiApiKey: r.data['gemini_api_key'] ?? '',
          geminiModel: r.data['gemini_model'] ?? '',
        });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  onSave(): void {
    this.saving = true; this.serverError = '';
    const v = this.form.value;
    const items = [
      { key: 'buHeadRoleName', value: v.buHeadRoleName ?? '' },
      { key: 'statutoryRevealPassword', value: v.statutoryRevealPassword ?? '' },
      { key: 'gemini_api_key', value: v.geminiApiKey ?? '' },
      { key: 'gemini_model', value: v.geminiModel ?? '' },
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
