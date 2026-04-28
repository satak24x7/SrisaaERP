import { Component, OnInit, inject, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

interface Attachment { index: number; filename: string; contentType: string; size: number; }
interface MailMessage {
  id: string; folder: string; uid: number; messageId: string | null;
  fromAddress: string; fromName: string | null;
  toAddresses: Array<{ address: string; name: string | null }>;
  ccAddresses: Array<{ address: string; name: string | null }> | null;
  subject: string | null; sentAt: string;
  bodyHtml: string | null; bodyText: string | null;
  attachments: Attachment[]; isRead: boolean; isFlagged: boolean;
}

@Component({
  selector: 'app-mail-reader',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-6">
      @if (loading()) {
        <div class="flex items-center justify-center h-64"><i class="pi pi-spin pi-spinner text-4xl text-blue-500"></i></div>
      } @else if (message()) {
        <!-- Header -->
        <div class="flex items-center gap-3 mb-4">
          <p-button icon="pi pi-arrow-left" [text]="true" [rounded]="true" (onClick)="goBack()" />
          <h2 class="text-xl font-bold text-gray-800 flex-1">{{ message()!.subject || '(no subject)' }}</h2>
        </div>

        <!-- Message metadata -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <div class="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-lg">
                  {{ (message()!.fromName || message()!.fromAddress).charAt(0).toUpperCase() }}
                </div>
                <div>
                  <div class="font-semibold text-gray-800">{{ message()!.fromName || message()!.fromAddress }}</div>
                  <div class="text-xs text-gray-500">{{ message()!.fromAddress }}</div>
                </div>
              </div>
              <div class="text-sm text-gray-500 mt-2">
                <span class="font-medium">To:</span>
                {{ formatAddresses(message()!.toAddresses) }}
              </div>
              @if (message()!.ccAddresses && message()!.ccAddresses!.length > 0) {
                <div class="text-sm text-gray-500 mt-1">
                  <span class="font-medium">Cc:</span>
                  {{ formatAddresses(message()!.ccAddresses!) }}
                </div>
              }
            </div>
            <div class="text-sm text-gray-400">{{ message()!.sentAt | date:'medium' }}</div>
          </div>
        </div>

        <!-- Body -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
          @if (message()!.bodyHtml) {
            <iframe #bodyFrame [srcdoc]="cachedSrcdoc" sandbox="allow-same-origin"
              class="w-full border-0 min-h-[400px]" (load)="resizeIframe()"></iframe>
          } @else {
            <pre class="p-5 text-sm text-gray-700 whitespace-pre-wrap font-sans">{{ message()!.bodyText || '(empty message)' }}</pre>
          }
        </div>

        <!-- Attachments -->
        @if (message()!.attachments.length > 0) {
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <i class="pi pi-paperclip"></i> Attachments ({{ message()!.attachments.length }})
            </h3>
            <div class="flex flex-wrap gap-3">
              @for (att of message()!.attachments; track att.index) {
                <a class="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 cursor-pointer transition-colors text-sm"
                  (click)="downloadAttachment(att)">
                  <i [class]="attachmentIcon(att.contentType)"></i>
                  <div>
                    <div class="font-medium text-gray-700">{{ att.filename }}</div>
                    <div class="text-xs text-gray-400">{{ formatSize(att.size) }}</div>
                  </div>
                  <i class="pi pi-download text-gray-400 ml-2"></i>
                </a>
              }
            </div>
          </div>
        }
      } @else {
        <div class="text-center py-16 text-gray-400">
          <i class="pi pi-envelope text-5xl mb-4"></i>
          <p>Message not found</p>
          <p-button label="Back to Inbox" icon="pi pi-arrow-left" [outlined]="true" class="mt-4" (onClick)="goBack()" />
        </div>
      }
    </div>
  `,
})
export class MailReaderComponent implements OnInit, AfterViewChecked {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('bodyFrame') bodyFrame?: ElementRef<HTMLIFrameElement>;

  message = signal<MailMessage | null>(null);
  loading = signal(true);
  cachedSrcdoc = '';
  private needsResize = false;

  ngOnInit(): void {
    const accountId = this.route.snapshot.paramMap.get('id');
    const folder = this.route.snapshot.queryParamMap.get('folder') ?? 'INBOX';
    const uid = this.route.snapshot.queryParamMap.get('uid');

    if (!accountId || !uid) {
      this.loading.set(false);
      return;
    }

    this.http.get<{ data: MailMessage }>(`${environment.apiBaseUrl}/mail/messages/by-uid?accountId=${accountId}&folder=${encodeURIComponent(folder)}&uid=${uid}`).subscribe({
      next: (r) => {
        this.message.set(r.data);
        if (r.data.bodyHtml) {
          this.cachedSrcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;color:#333;margin:16px;word-wrap:break-word;}img{max-width:100%;height:auto;}</style></head><body>${r.data.bodyHtml}</body></html>`;
        }
        this.loading.set(false);
        this.needsResize = true;
      },
      error: () => { this.loading.set(false); },
    });
  }

  ngAfterViewChecked(): void {
    if (this.needsResize && this.bodyFrame) {
      this.resizeIframe();
      this.needsResize = false;
    }
  }

  goBack(): void { this.router.navigate(['/mail/inbox']); }

  sanitizedHtml(): SafeResourceUrl {
    const html = this.message()?.bodyHtml ?? '';
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;color:#333;margin:16px;word-wrap:break-word;}img{max-width:100%;height:auto;}</style></head><body>${html}</body></html>`;
    return this.sanitizer.bypassSecurityTrustHtml(doc);
  }

  resizeIframe(): void {
    if (!this.bodyFrame) return;
    const iframe = this.bodyFrame.nativeElement;
    try {
      const body = iframe.contentDocument?.body;
      if (body) {
        iframe.style.height = Math.max(400, body.scrollHeight + 40) + 'px';
      }
    } catch { /* cross-origin safety */ }
  }

  formatAddresses(addrs: Array<{ address: string; name: string | null }>): string {
    return addrs.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ');
  }

  downloadAttachment(att: Attachment): void {
    const msg = this.message();
    if (!msg) return;
    this.http.get(`${environment.apiBaseUrl}/mail/messages/${msg.id}/attachment/${att.index}`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = att.filename; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Download failed' }); },
    });
  }

  attachmentIcon(contentType: string): string {
    if (contentType.startsWith('image/')) return 'pi pi-image';
    if (contentType.includes('pdf')) return 'pi pi-file-pdf';
    if (contentType.includes('word') || contentType.includes('document')) return 'pi pi-file-word';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'pi pi-file-excel';
    return 'pi pi-file';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
