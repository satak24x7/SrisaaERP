import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MenuModule } from 'primeng/menu';
import { ConfirmationService, MessageService, type MenuItem } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { MailComposeComponent, type ComposeData } from './mail-compose.component';

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
  imports: [CommonModule, FormsModule, ButtonModule, TableModule, TagModule, SelectModule, ToastModule, CheckboxModule, ConfirmDialogModule, MenuModule, MailComposeComponent],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2"><i class="pi pi-envelope text-blue-600"></i> Mail</h2>
        <div class="flex gap-2 items-center">
          @if (accounts().length > 0) {
            <p-select [(ngModel)]="selectedAccountId" [options]="accounts()" optionLabel="label" optionValue="id" (onChange)="onAccountChange()" class="w-56" />
          }
          <div class="flex items-center gap-2 border border-gray-500 rounded-lg px-3 py-2 bg-gray-800">
            <i class="pi pi-search text-gray-400"></i>
            <input [(ngModel)]="searchQuery" placeholder="Search emails..." class="bg-transparent border-0 outline-none text-white placeholder-gray-400 w-56 text-sm" (keyup.enter)="doSearch()" />
            @if (searchQuery) {
              <i class="pi pi-times text-gray-400 hover:text-white cursor-pointer text-sm" (click)="clearSearch()"></i>
            }
          </div>
          <p-button label="Compose" icon="pi pi-pencil" (onClick)="openCompose()" />
          @if (selectedUids.length > 0) {
            <p-button label="Delete ({{ selectedUids.length }})" icon="pi pi-trash" severity="danger" [outlined]="true" (onClick)="bulkDelete()" />
            <p-button label="Move to" icon="pi pi-folder" severity="secondary" [outlined]="true" (onClick)="moveMenu.toggle($event)" />
            <p-menu #moveMenu [model]="moveMenuItems" [popup]="true" appendTo="body" />
          }
          @if (selectedUids.length > 0 && isJunkOrSpam()) {
            <p-button label="Not Spam ({{ selectedUids.length }})" icon="pi pi-check" severity="success" [outlined]="true" (onClick)="markNotSpam()" />
          }
          @if (isTrashOrJunk() && messages().length > 0) {
            <p-button label="Empty Folder" icon="pi pi-trash" severity="danger" (onClick)="emptyFolder()" />
          }
          <p-button icon="pi pi-refresh" [outlined]="true" (onClick)="refreshMessages()" [loading]="loadingMessages()" />
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
                  (click)="selectedFolder = f.path; currentPage = 1; buildMoveMenu(); loadMessages()">
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
                    <th style="width:40px"><p-checkbox [binary]="true" [(ngModel)]="selectAll" (onChange)="toggleSelectAll()" /></th>
                    <th style="width:30px"></th>
                    <th>{{ isSentFolder() ? 'To' : 'From' }}</th>
                    <th>Subject</th>
                    <th style="width:140px">Date</th>
                    <th style="width:30px"></th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-m>
                  <tr class="cursor-pointer hover:bg-blue-50" [class]="!m.isRead ? 'font-semibold' : ''">
                    <td (click)="$event.stopPropagation()">
                      <p-checkbox [binary]="true" [ngModel]="isSelected(m.uid)" (onChange)="toggleSelect(m.uid)" />
                    </td>
                    <td (click)="openMessage(m)">
                      @if (!m.isRead) { <span class="inline-block w-2 h-2 rounded-full bg-blue-600"></span> }
                    </td>
                    <td (click)="openMessage(m)">
                      @if (isSentFolder()) {
                        <div class="text-sm">{{ m.toAddresses[0]?.name || m.toAddresses[0]?.address || '(unknown)' }}</div>
                        @if (m.toAddresses.length > 1) { <div class="text-xs text-gray-400">+{{ m.toAddresses.length - 1 }} more</div> }
                      } @else {
                        <div class="text-sm">{{ m.fromName || m.fromAddress }}</div>
                        @if (m.fromName) { <div class="text-xs text-gray-400">{{ m.fromAddress }}</div> }
                      }
                    </td>
                    <td (click)="openMessage(m)">
                      <div class="text-sm flex items-center gap-2">
                        {{ m.subject || '(no subject)' }}
                        @if (m.hasAttachments) { <i class="pi pi-paperclip text-gray-400 text-xs"></i> }
                      </div>
                    </td>
                    <td class="text-xs text-gray-500" (click)="openMessage(m)">{{ m.sentAt | date:'MMM d, h:mm a' }}</td>
                    <td (click)="openMessage(m)">
                      @if (m.isFlagged) { <i class="pi pi-star-fill text-yellow-500 text-xs"></i> }
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="6" class="text-center text-gray-400 py-12">
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
    <app-mail-compose #composeDialog />
  `,
})
export class MailInboxComponent implements OnInit {
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  @ViewChild('composeDialog') composeDialog!: MailComposeComponent;

  accounts = signal<MailAccount[]>([]);
  folders = signal<FolderInfo[]>([]);
  messages = signal<MessageRow[]>([]);
  loadingAccounts = signal(true);
  loadingFolders = signal(false);
  loadingMessages = signal(false);

  selectedAccountId = '';
  selectedFolder = 'INBOX';

  isSentFolder(): boolean {
    const f = this.selectedFolder.toLowerCase();
    return f === 'sent' || f === 'sent items' || f === 'sentitems' || f === 'outbox' || f === 'drafts';
  }
  currentPage = 1;
  pageSize = 50;
  totalMessages = 0;
  selectedUids: number[] = [];
  selectAll = false;
  searchQuery = '';
  isSearching = false;
  private initialLoadDone = false;
  moveMenuItems: MenuItem[] = [];

  // Map uid → db id for navigation
  private uidToDbId = new Map<number, string>();

  ngOnInit(): void {
    // Restore folder from query params (when returning from reader)
    const qFolder = this.route.snapshot.queryParamMap.get('folder');
    if (qFolder) this.selectedFolder = qFolder;

    this.http.get<{ data: MailAccount[] }>(`${environment.apiBaseUrl}/mail/accounts`).subscribe({
      next: (r) => {
        this.accounts.set(r.data);
        this.loadingAccounts.set(false);
        if (r.data.length > 0) {
          // Use saved default account if it still exists, otherwise first account
          const savedDefault = localStorage.getItem('mail_default_account');
          const match = savedDefault ? r.data.find((a) => a.id === savedDefault) : null;
          this.selectedAccountId = match ? match.id : r.data[0]!.id;
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
    localStorage.setItem('mail_default_account', this.selectedAccountId);
    this.loadFolders();
    this.loadMessages();
  }

  loadFolders(): void {
    if (!this.selectedAccountId) return;
    // Show default folders immediately, then refresh from IMAP in background
    if (this.folders().length === 0) {
      this.folders.set([
        { path: 'INBOX', name: 'Inbox', messagesCount: 0, unseenCount: 0, specialUse: '\\Inbox' },
        { path: 'Sent', name: 'Sent', messagesCount: 0, unseenCount: 0, specialUse: '\\Sent' },
        { path: 'Drafts', name: 'Drafts', messagesCount: 0, unseenCount: 0, specialUse: '\\Drafts' },
        { path: 'Trash', name: 'Trash', messagesCount: 0, unseenCount: 0, specialUse: '\\Trash' },
      ]);
    }
    this.http.get<{ data: FolderInfo[] }>(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/folders`).subscribe({
      next: (r) => { this.folders.set(r.data); this.buildMoveMenu(); },
      error: () => {},
    });
  }

  refreshMessages(): void {
    this.loadMessages(true);
  }

  loadMessages(refresh = false): void {
    if (!this.selectedAccountId) return;
    this.loadingMessages.set(true);
    let params = `folder=${encodeURIComponent(this.selectedFolder)}&page=${this.currentPage}&limit=${this.pageSize}`;
    if (refresh) params += '&refresh=true';
    this.http.get<{ data: MessageRow[]; meta: { total: number } }>(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/messages?${params}`).subscribe({
      next: (r) => {
        this.messages.set(r.data);
        this.totalMessages = r.meta.total;
        this.loadingMessages.set(false);
        // Restore scroll position if returning from reader
        const savedScroll = sessionStorage.getItem('mail-inbox-scroll');
        if (savedScroll) {
          sessionStorage.removeItem('mail-inbox-scroll');
          setTimeout(() => window.scrollTo({ top: Number(savedScroll) }), 0);
        }
      },
      error: () => {
        this.loadingMessages.set(false);
        this.msg.add({ severity: 'error', summary: 'Failed to load messages' });
      },
    });
  }

  openMessage(m: MessageRow): void {
    sessionStorage.setItem('mail-inbox-scroll', String(window.scrollY));
    this.router.navigate(['/mail/message', this.selectedAccountId], {
      queryParams: { folder: this.selectedFolder, uid: m.uid },
    });
  }

  doSearch(): void {
    if (!this.searchQuery.trim() || !this.selectedAccountId) return;
    this.isSearching = true;
    this.loadingMessages.set(true);
    this.selectedUids = [];
    this.selectAll = false;
    const params = `folder=${encodeURIComponent(this.selectedFolder)}&q=${encodeURIComponent(this.searchQuery.trim())}&limit=50`;
    this.http.get<{ data: MessageRow[]; meta: { total: number } }>(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/search?${params}`).subscribe({
      next: (r) => { this.messages.set(r.data); this.totalMessages = r.meta.total; this.loadingMessages.set(false); },
      error: () => { this.loadingMessages.set(false); this.msg.add({ severity: 'error', summary: 'Search failed' }); },
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.isSearching = false;
    this.loadMessages();
  }

  isJunkOrSpam(): boolean {
    const f = this.selectedFolder.toLowerCase();
    return f.includes('junk') || f.includes('spam');
  }

  markNotSpam(): void {
    this.http.post(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/not-spam`, {
      folder: this.selectedFolder, uids: this.selectedUids,
    }).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Moved to Inbox', detail: `${this.selectedUids.length} message(s) moved` });
        this.selectedUids = [];
        this.selectAll = false;
        this.loadMessages();
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Failed to move' }); },
    });
  }

  isTrashOrJunk(): boolean {
    const f = this.selectedFolder.toLowerCase();
    return f.includes('trash') || f.includes('junk') || f.includes('spam') || f.includes('deleted');
  }

  emptyFolder(): void {
    this.confirm.confirm({
      message: `Permanently delete ALL ${this.messages().length} messages in ${this.selectedFolder}?`,
      header: 'Empty Folder',
      accept: () => {
        const allUids = this.messages().map((m) => m.uid);
        this.http.post(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/delete-messages`, {
          folder: this.selectedFolder, uids: allUids,
        }).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Emptied', detail: `${allUids.length} messages deleted` });
            this.selectedUids = [];
            this.selectAll = false;
            this.loadMessages();
          },
          error: () => { this.msg.add({ severity: 'error', summary: 'Failed to empty folder' }); },
        });
      },
    });
  }

  isSelected(uid: number): boolean { return this.selectedUids.includes(uid); }

  toggleSelect(uid: number): void {
    if (this.selectedUids.includes(uid)) {
      this.selectedUids = this.selectedUids.filter((u) => u !== uid);
    } else {
      this.selectedUids = [...this.selectedUids, uid];
    }
    this.selectAll = this.selectedUids.length === this.messages().length;
  }

  toggleSelectAll(): void {
    if (this.selectAll) {
      this.selectedUids = this.messages().map((m) => m.uid);
    } else {
      this.selectedUids = [];
    }
  }

  bulkDelete(): void {
    this.confirm.confirm({
      message: `Delete ${this.selectedUids.length} selected email(s)?`,
      accept: () => {
        this.http.post(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/delete-messages`, {
          folder: this.selectedFolder, uids: this.selectedUids,
        }).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Deleted', detail: `${this.selectedUids.length} email(s) deleted` });
            this.selectedUids = [];
            this.selectAll = false;
            this.loadMessages();
          },
          error: () => { this.msg.add({ severity: 'error', summary: 'Failed to delete' }); },
        });
      },
    });
  }

  openCompose(): void {
    if (!this.selectedAccountId) return;
    this.composeDialog.open({ mode: 'compose', accountId: this.selectedAccountId });
  }

  buildMoveMenu(): void {
    this.moveMenuItems = this.folders()
      .filter((f) => f.path !== this.selectedFolder)
      .map((f) => ({
        label: f.name,
        icon: this.folderIcon(f),
        command: () => this.moveToFolder(f.path),
      }));
  }

  moveToFolder(toFolder: string): void {
    if (!this.selectedAccountId || this.selectedUids.length === 0) return;
    this.http.post(`${environment.apiBaseUrl}/mail/accounts/${this.selectedAccountId}/move-messages`, {
      folder: this.selectedFolder, uids: this.selectedUids, toFolder,
    }).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Moved', detail: `${this.selectedUids.length} message(s) moved to ${toFolder}` });
        this.selectedUids = [];
        this.selectAll = false;
        this.loadMessages();
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Failed to move messages' }); },
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
