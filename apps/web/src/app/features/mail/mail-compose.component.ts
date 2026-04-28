import { Component, inject, signal, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { ChipsModule } from 'primeng/chips';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

export interface ComposeData {
  mode: 'compose' | 'reply' | 'replyAll' | 'forward';
  accountId: string;
  messageId?: string; // DB id of original message (for reply/forward)
  to?: string[];
  cc?: string[];
  subject?: string;
  quotedHtml?: string;
  fromAddress?: string;
}

@Component({
  selector: 'app-mail-compose',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, DialogModule, TextareaModule, ChipsModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <p-dialog [header]="dialogTitle" [(visible)]="visible" [modal]="true" [style]="{width:'700px', 'max-width': '95vw'}" [maximizable]="true" (onHide)="onClose()">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-gray-500">To *</label>
          <p-chips [(ngModel)]="toAddresses" [addOnBlur]="true" [addOnTab]="true" separator="," placeholder="email@example.com" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-gray-500">Cc</label>
          <p-chips [(ngModel)]="ccAddresses" [addOnBlur]="true" [addOnTab]="true" separator="," placeholder="cc@example.com" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-gray-500">Subject</label>
          <input pInputText [(ngModel)]="subject" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-gray-500">Message</label>
          <textarea pTextarea [(ngModel)]="bodyText" [rows]="12" class="w-full font-sans text-sm" [autoResize]="true"></textarea>
        </div>
        @if (data?.quotedHtml) {
          <div class="border-l-4 border-gray-300 pl-3 text-xs text-gray-500">
            Original message included below
          </div>
        }
        @if (error) {
          <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ error }}</div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="visible = false" />
        <p-button label="Send" icon="pi pi-send" [loading]="sending" [disabled]="toAddresses.length === 0 || sending" (onClick)="send()" />
      </ng-template>
    </p-dialog>
  `,
})
export class MailComposeComponent {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);

  visible = false;
  sending = false;
  error = '';
  data: ComposeData | null = null;

  toAddresses: string[] = [];
  ccAddresses: string[] = [];
  subject = '';
  bodyText = '';

  get dialogTitle(): string {
    switch (this.data?.mode) {
      case 'reply': return 'Reply';
      case 'replyAll': return 'Reply All';
      case 'forward': return 'Forward';
      default: return 'Compose';
    }
  }

  open(data: ComposeData): void {
    this.data = data;
    this.toAddresses = data.to ?? [];
    this.ccAddresses = data.cc ?? [];
    this.subject = data.subject ?? '';
    this.bodyText = '';
    this.error = '';
    this.sending = false;
    this.visible = true;
  }

  onClose(): void {
    this.data = null;
  }

  send(): void {
    if (!this.data || this.toAddresses.length === 0) return;
    this.sending = true;
    this.error = '';

    // Build HTML body
    let html = this.bodyText.replace(/\n/g, '<br/>');
    if (this.data.quotedHtml) {
      html += `<br/><br/><hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/><div style="color:#666">${this.data.quotedHtml}</div>`;
    }

    if (this.data.mode === 'compose') {
      this.http.post<{ data: { messageId: string } }>(`${environment.apiBaseUrl}/mail/accounts/${this.data.accountId}/send`, {
        to: this.toAddresses, cc: this.ccAddresses.length ? this.ccAddresses : undefined,
        subject: this.subject, html,
      }).subscribe({
        next: () => { this.sending = false; this.visible = false; this.msg.add({ severity: 'success', summary: 'Sent' }); },
        error: (err: HttpErrorResponse) => { this.sending = false; this.error = err.error?.error?.message ?? 'Failed to send'; },
      });
    } else if (this.data.mode === 'reply' || this.data.mode === 'replyAll') {
      this.http.post<{ data: { messageId: string } }>(`${environment.apiBaseUrl}/mail/messages/${this.data.messageId}/reply`, {
        html, to: this.toAddresses, cc: this.ccAddresses.length ? this.ccAddresses : undefined,
        replyAll: this.data.mode === 'replyAll',
      }).subscribe({
        next: () => { this.sending = false; this.visible = false; this.msg.add({ severity: 'success', summary: 'Reply sent' }); },
        error: (err: HttpErrorResponse) => { this.sending = false; this.error = err.error?.error?.message ?? 'Failed to send'; },
      });
    } else if (this.data.mode === 'forward') {
      this.http.post<{ data: { messageId: string } }>(`${environment.apiBaseUrl}/mail/messages/${this.data.messageId}/forward`, {
        to: this.toAddresses, cc: this.ccAddresses.length ? this.ccAddresses : undefined, html,
      }).subscribe({
        next: () => { this.sending = false; this.visible = false; this.msg.add({ severity: 'success', summary: 'Forwarded' }); },
        error: (err: HttpErrorResponse) => { this.sending = false; this.error = err.error?.error?.message ?? 'Failed to send'; },
      });
    }
  }
}
