import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface MailAccount { id: string; label: string; emailAddress: string; }
interface FolderInfo { path: string; name: string; messagesCount: number; unseenCount: number; specialUse: string | null; }
interface MessageRow {
  uid: number; messageId: string | null; fromAddress: string; fromName: string | null;
  toAddresses: Array<{ address: string; name: string | null }>; subject: string | null;
  sentAt: string; isRead: boolean; isFlagged: boolean; hasAttachments: boolean;
  dbId?: string;
}

@Component({
  selector: 'app-mail-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2"><i class="pi pi-envelope text-blue-600"></i> Mail</h2>
        <div class="flex gap-2 items-center">
          @if (accounts().length > 0) {
            <p-select [(ngModel)]="selectedAccountId" [options]="accounts()" optionLabel="label" optionValue="id" (onChange)="onAccountChange()" class="w-56" />
          }
          <p-button icon="pi pi-refresh" [outlined]="true" (onClick)="loadMessages()" [loading]="loadingMessages()" />
          <p-button label="Settings" icon="pi pi-cog" severity="secondary" [outlined]="true" (onClick)="router.navigate(['/mail/settings'])" />
        </div>
      </div>

      @if (accounts().length === 0 && !loadingAccounts()) {
        <div class="text-center py-16">
          <i class="pi pi-envelope text-6xl text-gray-300 mb-4"></i>
          <p class="text-gray-500 mb-4">No mail accounts configured yet.</p>
          <p-button label="Add Mail Account" icon="pi pi-plus" (onClick)="router.navigate(['/mail/settings'])" />
        </div>
      } @else {
        <div class="flex gap-4">
          <!-- Folder tree -->
          <div class="w-56 flex-shrink-0">
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
              @for (f of folders(); track f.path) {
                <button class="w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between transition-colors"
                  [class]="selectedFolder === f.path ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'"
                  (click)="selectedFolder = f.path; currentPage = 1; loadMessages()">
                  <span class="flex items-center gap-2">
                    <i [class]="folderIcon(f)"></i> {{ f.name }}
                  </span>
                  @if (f.unseenCount > 0) {
                    <span class="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{{ f.unseenCount }}</span>
                  }
                </button>
              }
              @if (folders().length === 0 && !loadingFolders()) {
                <p class="text-xs text-gray-400 p-3">No folders loaded</p>
              }
            </div>
          </div>

          <!-- Message list -->
          <div class="flex-1">
            <div class="bg-white rounded-lg shadow-sm border border-gray-200">
              <p-table [value]="messages()" [loading]="loadingMessages()" styleClass="p-datatable-sm" [paginator]="false">
                <ng-template pTemplate="header">
                  <tr>
                    <th style="width:30px"></th>
                    <th>From</th>
                    <th>Subject</th>
                    <th style="width:140px">Date</th>
                    <th style="width:30px"></th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-m>
                  <tr class="cursor-pointer hover:bg-blue-50" [class]="!m.isRead ? 'font-semibold' : ''" (click)="openMessage(m)">
                    <td>
                      @if (!m.isRead) { <span class="inline-block w-2 h-2 rounded-full bg-blue-600"></span> }
                    </td>
                    <td>
                      <div class="text-sm">{{ m.fromName || m.fromAddress }}</div>
                      @if (m.fromName) { <div class="text-xs text-gray-400">{{ m.fromAddress }}</div> }
                    </td>
                    <td>
                      <div class="text-sm flex items-center gap-2">
                        {{ m.subject || '(no subject)' }}
                        @if (m.hasAttachments) { <i class="pi pi-paperclip text-gray-400 text-xs"></i> }
                      </div>
                    </td>
                    <td class="text-xs text-gray-500">{{ m.sentAt | date:'MMM d, h:mm a' }}</td>
                    <td>
                      @if (m.isFlagged) { <i class="pi pi-star-fill text-yellow-500 text-xs"></i> }
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="5" class="text-center text-gray-400 py-12">
                    @if (loadingMessages()) { Loading messages... }
                    @else { No messages in {{ selectedFolder }} }
                  </td></tr>
                </ng-template>
              </p-table>

              <!-- Pagination -->
              @if (totalMessages > 0) {
                <div class="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
                  <span>{{ totalMessages }} messages in {{ selectedFolder }}</span>
                  <div class="flex gap-2">
                    <p-button icon="pi pi-angle-left" size="small" [outlined]="true" [disabled]="currentPage <= 1" (onClick)="currentPage = currentPage - 1; loadMessages()" />
                    <span class="px-2 py-1">Page {{ currentPage }}</span>
                    <p-button icon="pi pi-angle-right" size="small" [outlined]="true" [disabled]="currentPage * pageSize >= totalMessages" (onClick)="currentPage = currentPage + 1; loadMessages()" />
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class MailInboxComponent implements OnInit {
  readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);

  accounts = signal<MailAccount[]>([]);
  folders = signal<FolderInfo[]>([]);
  messages = signal<MessageRow[]>([]);
  loadingAccounts = signal(true);
  loadingFolders = signal(false);
  loadingMessages = signal(false);

  selectedAccountId = '';
  selectedFolder = 'INBOX';
  currentPage = 1;
  pageSize = 50;
  totalMessages = 0;

  // Map uid → db id for navigation
  private uidToDbId = new Map<number, string>();

  ngOnInit(): void {
    this.http.get<{ data: MailAccount[] }>(`${environment.apiBaseUrl}/mail/accounts`).subscribe({
      next: (r) => {
        this.accounts.set(r.data);
        this.loadingAccounts.set(false);
        if (r.data.length > 0) {
          this.selectedAccountId = r.data[0]!.id;
          this.loadFolders();
          this.loadMessages();
        }
      },
      error: () => { this.loadingAccounts.set(false); },
    });
  }

  onAccountChange(): void {
    this.selectedFolder = 'INBOX';
    this.currentPage = 1;
    this.loadFolders();
    this.loadMessages();
  }

  loadFolders(): void {
    if (!this.selectedAccountId) return;
    this.loadingFolders.set(true);
    this.http.get<{ data: FolderInfo[] }>(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/folders`).subscribe({
      next: (r) => { this.folders.set(r.data); this.loadingFolders.set(false); },
      error: () => { this.loadingFolders.set(false); this.msg.add({ severity: 'error', summary: 'Failed to load folders' }); },
    });
  }

  loadMessages(): void {
    if (!this.selectedAccountId) return;
    this.loadingMessages.set(true);
    const params = `folder=${encodeURIComponent(this.selectedFolder)}&page=${this.currentPage}&limit=${this.pageSize}`;
    this.http.get<{ data: MessageRow[]; meta: { total: number } }>(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/messages?${params}`).subscribe({
      next: (r) => {
        this.messages.set(r.data);
        this.totalMessages = r.meta.total;
        this.loadingMessages.set(false);
      },
      error: () => {
        this.loadingMessages.set(false);
        this.msg.add({ severity: 'error', summary: 'Failed to load messages' });
      },
    });
  }

  openMessage(m: MessageRow): void {
    // Find the DB record by uid+folder+account
    this.http.get<{ data: MessageRow[]; meta: { total: number } }>(
      `${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/messages?folder=${encodeURIComponent(this.selectedFolder)}&page=1&limit=1`,
    ).subscribe(); // ensure it's cached

    // Navigate using a query param approach — the reader will fetch by DB id
    // First we need to find the DB id. Let's do a simple search.
    this.http.get<{ data: Array<{ id: string; uid: number }> }>(
      `${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/messages?folder=${encodeURIComponent(this.selectedFolder)}&page=${this.currentPage}&limit=${this.pageSize}`,
    ).subscribe(); // cache is already loaded

    // Use the cached message endpoint — we need to look up by account+folder+uid
    // For now, navigate with query params and let reader handle it
    this.router.navigate(['/mail/message', this.selectedAccountId], {
      queryParams: { folder: this.selectedFolder, uid: m.uid },
    });
  }

  folderIcon(f: FolderInfo): string {
    const su = f.specialUse?.toLowerCase() ?? '';
    const name = f.name.toLowerCase();
    if (su.includes('inbox') || name === 'inbox') return 'pi pi-inbox';
    if (su.includes('sent') || name.includes('sent')) return 'pi pi-send';
    if (su.includes('draft') || name.includes('draft')) return 'pi pi-file-edit';
    if (su.includes('trash') || name.includes('trash') || name.includes('deleted')) return 'pi pi-trash';
    if (su.includes('junk') || name.includes('spam') || name.includes('junk')) return 'pi pi-ban';
    if (su.includes('archive') || name.includes('archive')) return 'pi pi-box';
    return 'pi pi-folder';
  }
}
