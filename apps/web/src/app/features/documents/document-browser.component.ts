import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TreeModule } from 'primeng/tree';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MenuModule } from 'primeng/menu';
import { FileUploadModule } from 'primeng/fileupload';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService, type MenuItem, type TreeNode } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface FolderDto { id: string; name: string; parentId: string | null; scope: string; ownerUserId: string | null; sortOrder: number; }
interface DocFile {
  id: string; name: string; fileName: string; mimeType: string; fileSize: number;
  sortOrder: number; createdAt: string; updatedAt: string;
  entityLinks: Array<{ id: string; entityType: string; entityId: string }>;
}
interface EntityLink { id: string; entityType: string; entityId: string; entityName: string | null; }

@Component({
  selector: 'app-document-browser',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TreeModule, TableModule, DialogModule, InputTextModule, SelectModule, ToastModule, ConfirmDialogModule, MenuModule, FileUploadModule, TagModule, TooltipModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast /><p-confirmDialog />
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold flex items-center gap-2"><i class="pi pi-folder-open text-blue-600"></i> Documents</h2>
        <div class="flex gap-2">
          @if (selectedNode) {
            <p-button label="Upload File" icon="pi pi-upload" (onClick)="uploadVisible = true" />
            <p-button icon="pi pi-trash" severity="danger" [outlined]="true" [text]="true" pTooltip="Delete selected folder" (onClick)="deleteFolder()" />
          }
          <p-button label="New Folder" icon="pi pi-plus" [outlined]="true" (onClick)="openNewFolderDialog()" />
        </div>
      </div>

      <div class="flex gap-4">
        <!-- Left: Folder Tree -->
        <div class="w-[432px] flex-shrink-0">
          <div class="bg-white rounded-lg shadow-sm border border-gray-200">
            <!-- Scope toggle -->
            <div class="flex border-b border-gray-200">
              <button class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
                [class]="activeScope === 'SHARED' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
                (click)="activeScope = 'SHARED'; loadFolders()">Shared</button>
              <button class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
                [class]="activeScope === 'PERSONAL' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'"
                (click)="activeScope = 'PERSONAL'; loadFolders()">My Documents</button>
            </div>
            <div class="p-2">
              <p-tree [value]="folderTree()" selectionMode="single" [(selection)]="selectedNode"
                (onNodeSelect)="onFolderSelect()" [filter]="true" filterPlaceholder="Search folders..."
                styleClass="border-0" />
              @if (folderTree().length === 0 && !loading()) {
                <p class="text-sm text-center py-6 opacity-50">No folders yet. Create one to get started.</p>
              }
            </div>
          </div>
        </div>

        <!-- Right: File List -->
        <div class="flex-1">
          <!-- Breadcrumb -->
          @if (breadcrumb.length > 0) {
            <div class="flex items-center gap-1 text-sm mb-3 opacity-70">
              @for (bc of breadcrumb; track bc.id; let last = $last) {
                <span class="cursor-pointer hover:underline" (click)="navigateToFolder(bc.id)">{{ bc.name }}</span>
                @if (!last) { <i class="pi pi-chevron-right text-xs"></i> }
              }
            </div>
          }

          <div class="bg-white rounded-lg shadow-sm border border-gray-200">
            @if (!selectedNode) {
              <div class="text-center py-16 opacity-40">
                <i class="pi pi-folder text-5xl mb-4"></i>
                <p>Select a folder to view documents</p>
              </div>
            } @else {
              <p-table [value]="files()" [loading]="loadingFiles()" styleClass="p-datatable-sm">
                <ng-template pTemplate="header">
                  <tr>
                    <th style="width:30px"></th>
                    <th>Name</th>
                    <th style="width:100px">Size</th>
                    <th style="width:160px">Modified</th>
                    <th style="width:80px">Links</th>
                    <th style="width:60px"></th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-f>
                  <tr>
                    <td>
                      @if (loadingFileId() === f.id) {
                        <i class="pi pi-spin pi-spinner text-blue-500"></i>
                      } @else {
                        <i [class]="fileIcon(f.mimeType)"></i>
                      }
                    </td>
                    <td class="font-medium cursor-pointer hover:underline" (click)="viewFile(f)">{{ f.name }}</td>
                    <td class="text-sm opacity-70">{{ formatSize(f.fileSize) }}</td>
                    <td class="text-sm opacity-70">{{ f.createdAt | date:'MMM d, y' }}</td>
                    <td>
                      @if (f.entityLinks.length > 0) {
                        <p-tag [value]="f.entityLinks.length + ' linked'" severity="info" />
                      }
                    </td>
                    <td>
                      <p-button icon="pi pi-ellipsis-v" [text]="true" [rounded]="true" size="small" (onClick)="openFileMenu($event, f)" />
                      <p-menu #fileMenu [model]="fileMenuItems" [popup]="true" appendTo="body" />
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="6" class="text-center py-8 opacity-40">No files in this folder</td></tr>
                </ng-template>
              </p-table>
            }
          </div>

          <!-- Entity links for selected file -->
          @if (selectedFile) {
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mt-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold flex items-center gap-2">
                  <i class="pi pi-link"></i> Linked Entities — {{ selectedFile.name }}
                </h3>
                <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="secondary" (onClick)="selectedFile = null; fileLinks = []" />
              </div>
              <div class="flex flex-wrap gap-2 mb-3">
                @for (link of fileLinks; track link.id) {
                  <span class="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-sm">
                    <span class="opacity-60 font-medium">{{ link.entityType }}</span>
                    <span>{{ link.entityName || link.entityId }}</span>
                    <button class="opacity-40 hover:opacity-100 ml-1" (click)="removeLink(link.id)"><i class="pi pi-times text-xs"></i></button>
                  </span>
                }
                @if (fileLinks.length === 0) {
                  <span class="text-sm opacity-40">No linked entities</span>
                }
              </div>
              <div class="flex gap-2 items-end">
                <p-select appendTo="body" [(ngModel)]="linkEntityType" [options]="entityTypeOptions" optionLabel="label" optionValue="value" placeholder="Type" class="w-40" (onChange)="loadEntityOptions()" />
                <p-select appendTo="body" [(ngModel)]="linkEntityId" [options]="entityOptions" optionLabel="name" optionValue="id" [filter]="true" placeholder="Search..." class="flex-1" />
                <p-button icon="pi pi-plus" label="Link" size="small" [disabled]="!linkEntityType || !linkEntityId" (onClick)="addLink()" />
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- New Folder Dialog -->
    <p-dialog header="New Folder" [(visible)]="newFolderVisible" [modal]="true" [style]="{width:'400px'}">
      <div class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Folder Name *</label>
          <input pInputText [(ngModel)]="newFolderName" placeholder="Enter folder name" class="w-full" (keyup.enter)="createFolder()" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="newFolderVisible = false" />
        <p-button label="Create" icon="pi pi-check" [disabled]="!newFolderName.trim()" (onClick)="createFolder()" />
      </ng-template>
    </p-dialog>

    <!-- Rename Dialog -->
    <p-dialog header="Rename" [(visible)]="renameVisible" [modal]="true" [style]="{width:'400px'}">
      <div class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">New Name *</label>
          <input pInputText [(ngModel)]="renameName" class="w-full" (keyup.enter)="confirmRename()" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="renameVisible = false" />
        <p-button label="Rename" icon="pi pi-check" [disabled]="!renameName.trim()" (onClick)="confirmRename()" />
      </ng-template>
    </p-dialog>

    <!-- Upload Dialog -->
    <p-dialog header="Upload File" [(visible)]="uploadVisible" [modal]="true" [style]="{width:'500px'}">
      <div class="flex flex-col gap-3 pt-2">
        <p-fileUpload mode="advanced" [auto]="false" [multiple]="true" [maxFileSize]="25000000"
          chooseLabel="Choose Files" uploadLabel="Upload" (uploadHandler)="onUpload($event)"
          [customUpload]="true" />
      </div>
    </p-dialog>
  `,
})
export class DocumentBrowserComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly msg = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  loading = signal(false);
  loadingFiles = signal(false);
  folderTree = signal<TreeNode[]>([]);
  files = signal<DocFile[]>([]);
  folders: FolderDto[] = [];

  activeScope: 'SHARED' | 'PERSONAL' = 'SHARED';
  selectedNode: TreeNode | null = null;
  breadcrumb: Array<{ id: string; name: string }> = [];

  // File menu
  loadingFileId = signal<string | null>(null);
  fileMenuItems: MenuItem[] = [];
  selectedFile: DocFile | null = null;
  fileLinks: EntityLink[] = [];

  // New folder
  newFolderVisible = false;
  newFolderName = '';

  // Rename
  renameVisible = false;
  renameName = '';
  renameTarget: { type: 'folder' | 'file'; id: string } | null = null;

  // Upload
  uploadVisible = false;

  // Entity linking
  linkEntityType = '';
  linkEntityId = '';
  entityOptions: Array<{ id: string; name: string }> = [];
  entityTypeOptions = [
    { label: 'Opportunity', value: 'OPPORTUNITY' },
    { label: 'Project', value: 'PROJECT' },
    { label: 'Tender', value: 'TENDER' },
    { label: 'Initiative', value: 'INITIATIVE' },
    { label: 'Account', value: 'ACCOUNT' },
  ];

  ngOnInit(): void {
    this.loadFolders();
  }

  loadFolders(): void {
    this.loading.set(true);
    this.selectedNode = null;
    this.selectedFile = null;
    this.files.set([]);
    this.breadcrumb = [];

    this.http.get<{ data: FolderDto[] }>(`${environment.apiBaseUrl}/documents/folders?scope=${this.activeScope}`).subscribe({
      next: (r) => {
        this.folders = r.data;
        this.folderTree.set(this.buildTree(r.data));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  private buildTree(folders: FolderDto[]): TreeNode[] {
    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const f of folders) {
      map.set(f.id, { key: f.id, label: f.name, data: f, icon: 'pi pi-folder', children: [], expandedIcon: 'pi pi-folder-open', collapsedIcon: 'pi pi-folder' });
    }

    for (const f of folders) {
      const node = map.get(f.id)!;
      if (f.parentId && map.has(f.parentId)) {
        map.get(f.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  onFolderSelect(): void {
    if (!this.selectedNode?.key) return;
    this.selectedFile = null;
    this.fileLinks = [];
    this.buildBreadcrumb(this.selectedNode.key as string);
    this.loadFiles(this.selectedNode.key as string);
  }

  navigateToFolder(folderId: string): void {
    const node = this.findNode(this.folderTree(), folderId);
    if (node) {
      this.selectedNode = node;
      this.onFolderSelect();
    }
  }

  private findNode(nodes: TreeNode[], key: string): TreeNode | null {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const found = this.findNode(n.children, key);
        if (found) return found;
      }
    }
    return null;
  }

  private buildBreadcrumb(folderId: string): void {
    const crumbs: Array<{ id: string; name: string }> = [];
    let current = this.folders.find((f) => f.id === folderId);
    while (current) {
      crumbs.unshift({ id: current.id, name: current.name });
      current = current.parentId ? this.folders.find((f) => f.id === current!.parentId) : undefined;
    }
    this.breadcrumb = crumbs;
  }

  loadFiles(folderId: string): void {
    this.loadingFiles.set(true);
    this.http.get<{ data: DocFile[] }>(`${environment.apiBaseUrl}/documents/files?folderId=${folderId}`).subscribe({
      next: (r) => { this.files.set(r.data); this.loadingFiles.set(false); },
      error: () => { this.loadingFiles.set(false); },
    });
  }

  // ===== Folder CRUD =====

  openNewFolderDialog(): void {
    this.newFolderName = '';
    this.newFolderVisible = true;
  }

  createFolder(): void {
    if (!this.newFolderName.trim()) return;
    const parentId = this.selectedNode?.key as string || null;
    this.http.post(`${environment.apiBaseUrl}/documents/folders`, {
      name: this.newFolderName.trim(), parentId, scope: this.activeScope,
    }).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Folder created' });
        this.newFolderVisible = false;
        this.loadFolders();
      },
      error: (err) => { this.msg.add({ severity: 'error', summary: err.error?.error?.message || 'Failed to create folder' }); },
    });
  }

  deleteFolder(): void {
    if (!this.selectedNode?.key) return;
    const folderId = this.selectedNode.key as string;
    const folderName = this.selectedNode.label;
    this.confirm.confirm({
      message: `Delete folder "${folderName}"?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/documents/folders/${folderId}`).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Folder deleted' });
            this.selectedNode = null;
            this.files.set([]);
            this.loadFolders();
          },
          error: (err) => { this.msg.add({ severity: 'error', summary: err.error?.error?.message || 'Failed to delete' }); },
        });
      },
    });
  }

  // ===== File Actions =====

  openFileMenu(event: Event, file: DocFile): void {
    this.selectedFile = file;
    this.loadFileLinks(file.id);
    this.fileMenuItems = [
      { label: 'View', icon: 'pi pi-eye', command: () => this.viewFile(file) },
      { label: 'Download', icon: 'pi pi-download', command: () => this.downloadFile(file) },
      { label: 'Rename', icon: 'pi pi-pencil', command: () => this.openRenameDialog('file', file.id, file.name) },
      { separator: true },
      { label: 'Delete', icon: 'pi pi-trash', command: () => this.deleteFile(file) },
    ];
    // Find the menu and toggle it
    const btn = event.currentTarget as HTMLElement;
    const menu = btn.closest('td')?.querySelector('p-menu') as unknown as { toggle: (e: Event) => void } | null;
    if (menu?.toggle) menu.toggle(event);
  }

  viewFile(file: DocFile): void {
    this.loadingFileId.set(file.id);
    this.http.get(`${environment.apiBaseUrl}/documents/files/${file.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.loadingFileId.set(null);
        const viewBlob = new Blob([blob], { type: file.mimeType });
        const url = URL.createObjectURL(viewBlob);
        window.open(url, '_blank');
      },
      error: () => { this.loadingFileId.set(null); this.msg.add({ severity: 'error', summary: 'Failed to open file' }); },
    });
  }

  downloadFile(file: DocFile): void {
    this.loadingFileId.set(file.id);
    this.http.get(`${environment.apiBaseUrl}/documents/files/${file.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.loadingFileId.set(null);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.fileName; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.loadingFileId.set(null); this.msg.add({ severity: 'error', summary: 'Download failed' }); },
    });
  }

  deleteFile(file: DocFile): void {
    this.confirm.confirm({
      message: `Delete "${file.name}"?`,
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/documents/files/${file.id}`).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'File deleted' });
            this.selectedFile = null;
            this.fileLinks = [];
            if (this.selectedNode?.key) this.loadFiles(this.selectedNode.key as string);
          },
          error: () => { this.msg.add({ severity: 'error', summary: 'Failed to delete' }); },
        });
      },
    });
  }

  openRenameDialog(type: 'folder' | 'file', id: string, currentName: string): void {
    this.renameTarget = { type, id };
    this.renameName = currentName;
    this.renameVisible = true;
  }

  confirmRename(): void {
    if (!this.renameTarget || !this.renameName.trim()) return;
    const { type, id } = this.renameTarget;
    const url = type === 'folder'
      ? `${environment.apiBaseUrl}/documents/folders/${id}`
      : `${environment.apiBaseUrl}/documents/files/${id}`;

    this.http.patch(url, { name: this.renameName.trim() }).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Renamed' });
        this.renameVisible = false;
        if (type === 'folder') this.loadFolders();
        else if (this.selectedNode?.key) this.loadFiles(this.selectedNode.key as string);
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Rename failed' }); },
    });
  }

  // ===== Upload =====

  onUpload(event: { files: File[] }): void {
    if (!this.selectedNode?.key || !event.files.length) return;
    const folderId = this.selectedNode.key as string;
    let completed = 0;
    const total = event.files.length;

    for (const file of event.files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folderId', folderId);
      fd.append('name', file.name.replace(/\.[^.]+$/, ''));

      this.http.post(`${environment.apiBaseUrl}/documents/files`, fd).subscribe({
        next: () => {
          completed++;
          if (completed === total) {
            this.msg.add({ severity: 'success', summary: `${total} file(s) uploaded` });
            this.uploadVisible = false;
            this.loadFiles(folderId);
          }
        },
        error: () => {
          completed++;
          this.msg.add({ severity: 'error', summary: `Failed to upload ${file.name}` });
        },
      });
    }
  }

  // ===== Entity Links =====

  loadFileLinks(fileId: string): void {
    this.http.get<{ data: EntityLink[] }>(`${environment.apiBaseUrl}/documents/files/${fileId}/links`).subscribe({
      next: (r) => { this.fileLinks = r.data; },
    });
  }

  loadEntityOptions(): void {
    this.linkEntityId = '';
    this.entityOptions = [];
    if (!this.linkEntityType) return;
    let url = '';
    switch (this.linkEntityType) {
      case 'OPPORTUNITY': url = `${environment.apiBaseUrl}/opportunities?limit=200&openStatus=all`; break;
      case 'PROJECT': url = `${environment.apiBaseUrl}/projects?limit=200`; break;
      case 'TENDER': url = `${environment.apiBaseUrl}/tenders?limit=200`; break;
      case 'INITIATIVE': url = `${environment.apiBaseUrl}/initiatives?limit=200`; break;
      case 'ACCOUNT': url = `${environment.apiBaseUrl}/accounts?limit=200`; break;
    }
    this.http.get<{ data: Array<{ id: string; title?: string; name?: string }> }>(url).subscribe({
      next: (r) => { this.entityOptions = r.data.map((e) => ({ id: e.id, name: e.title ?? e.name ?? e.id })); },
    });
  }

  addLink(): void {
    if (!this.selectedFile || !this.linkEntityType || !this.linkEntityId) return;
    this.http.post(`${environment.apiBaseUrl}/documents/files/${this.selectedFile.id}/links`, {
      entityType: this.linkEntityType, entityId: this.linkEntityId,
    }).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Linked' });
        this.loadFileLinks(this.selectedFile!.id);
        this.linkEntityType = '';
        this.linkEntityId = '';
      },
      error: () => { this.msg.add({ severity: 'error', summary: 'Failed to link' }); },
    });
  }

  removeLink(linkId: string): void {
    if (!this.selectedFile) return;
    this.http.delete(`${environment.apiBaseUrl}/documents/files/${this.selectedFile.id}/links/${linkId}`).subscribe({
      next: () => { this.fileLinks = this.fileLinks.filter((l) => l.id !== linkId); },
    });
  }

  // ===== Helpers =====

  fileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'pi pi-image text-green-500';
    if (mimeType.includes('pdf')) return 'pi pi-file-pdf text-red-500';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'pi pi-file-word text-blue-500';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'pi pi-file-excel text-green-600';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'pi pi-file text-orange-500';
    return 'pi pi-file text-gray-400';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
