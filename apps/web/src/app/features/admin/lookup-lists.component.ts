import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { InputSwitchModule } from 'primeng/inputswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

interface LookupList { id: string; code: string; name: string; itemCount: number; }
interface LookupItem { id: string; label: string; value: string; sortOrder: number; isActive: boolean; }

@Component({
  selector: 'app-lookup-lists',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonModule, InputTextModule, TableModule, DialogModule, TagModule, InputSwitchModule, ConfirmDialogModule, ToastModule],
  providers: [ConfirmationService, MessageService],
  template: `
    <p-toast /><p-confirmDialog />

    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-semibold text-gray-800">Lookup Lists</h2>
        <p class="text-sm text-gray-500 mt-1">Manage dropdown options used across the platform</p>
      </div>
      <p-button label="Create List" icon="pi pi-plus" (onClick)="openCreateList()" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Lists -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 class="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">Lists</h3>
        @if (listsLoading()) {
          <div class="text-center py-8 text-gray-400"><i class="pi pi-spin pi-spinner"></i></div>
        } @else {
          <div class="flex flex-col gap-1">
            @for (list of lists(); track list.id) {
              <div class="flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors"
                   [class]="selectedList()?.id === list.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'"
                   (click)="selectList(list)">
                <div>
                  <div class="text-sm font-medium">{{ list.name }}</div>
                  <div class="text-xs text-gray-400 font-mono">{{ list.code }} &middot; {{ list.itemCount }} items</div>
                </div>
                <div class="flex gap-0.5">
                  <p-button icon="pi pi-pencil" [text]="true" size="small" severity="info" (onClick)="openEditList(list, $event)" />
                  <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmDeleteList(list, $event)" />
                </div>
              </div>
            }
            @if (lists().length === 0) {
              <p class="text-sm text-gray-400 text-center py-6">No lists yet</p>
            }
          </div>
        }
      </div>

      <!-- Right: Items for selected list -->
      <div class="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        @if (!selectedList()) {
          <div class="text-center py-16 text-gray-400">
            <i class="pi pi-list text-4xl mb-3"></i>
            <p>Select a list to manage its items</p>
          </div>
        } @else {
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-gray-600 uppercase tracking-wider">
              {{ selectedList()!.name }} — Items
            </h3>
            <p-button label="Add Item" icon="pi pi-plus" size="small" (onClick)="openCreateItem()" />
          </div>
          @if (itemsLoading()) {
            <div class="text-center py-8 text-gray-400"><i class="pi pi-spin pi-spinner"></i></div>
          } @else {
            <p-table [value]="items()" styleClass="p-datatable-sm">
              <ng-template pTemplate="header">
                <tr>
                  <th class="font-semibold">Label</th>
                  <th class="font-semibold">Value</th>
                  <th class="font-semibold">Active</th>
                  <th class="font-semibold" style="width:120px">Actions</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-item>
                <tr>
                  <td><span class="font-medium">{{ item.label }}</span></td>
                  <td><span class="text-sm font-mono text-gray-600">{{ item.value }}</span></td>
                  <td>
                    <p-tag [value]="item.isActive ? 'Active' : 'Inactive'" [severity]="item.isActive ? 'success' : 'warn'" [style]="{'font-size':'0.7rem'}" />
                  </td>
                  <td>
                    <div class="flex gap-1">
                      <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" size="small" (onClick)="openEditItem(item)" />
                      <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" size="small" (onClick)="confirmDeleteItem(item)" />
                    </div>
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="4" class="text-center py-6 text-gray-400">No items. Add some above.</td></tr>
              </ng-template>
            </p-table>
          }
        }
      </div>
    </div>

    <!-- Create/Edit List Dialog -->
    <p-dialog [header]="editListItem ? 'Edit List' : 'Create List'" [(visible)]="listDialogVisible" [modal]="true" [style]="{width:'400px'}">
      <form [formGroup]="listForm" class="flex flex-col gap-4 pt-2">
        @if (!editListItem) {
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium text-gray-700">Code *</label>
            <input pInputText formControlName="code" placeholder="e.g. account_type" class="w-full font-mono" />
            <small class="text-gray-500">Lowercase, underscores. Cannot change later.</small>
          </div>
        }
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Name *</label>
          <input pInputText formControlName="name" placeholder="e.g. Account Type" class="w-full" />
        </div>
        @if (listError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ listError }}</div> }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="listDialogVisible=false" />
        <p-button [label]="editListItem ? 'Save' : 'Create'" [loading]="listSaving" [disabled]="listForm.invalid||listSaving" (onClick)="saveList()" />
      </ng-template>
    </p-dialog>

    <!-- Create/Edit Item Dialog -->
    <p-dialog [header]="editItem ? 'Edit Item' : 'Add Item'" [(visible)]="itemDialogVisible" [modal]="true" [style]="{width:'400px'}">
      <form [formGroup]="itemForm" class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Label *</label>
          <input pInputText formControlName="label" placeholder="Display text" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Value *</label>
          <input pInputText formControlName="value" placeholder="Stored value" class="w-full font-mono" />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700">Active</label>
          <p-inputSwitch formControlName="isActive" />
        </div>
        @if (itemError) { <div class="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{{ itemError }}</div> }
      </form>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="itemDialogVisible=false" />
        <p-button [label]="editItem ? 'Save' : 'Add'" [loading]="itemSaving" [disabled]="itemForm.invalid||itemSaving" (onClick)="saveItem()" />
      </ng-template>
    </p-dialog>
  `,
})
export class LookupListsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly msg = inject(MessageService);

  lists = signal<LookupList[]>([]);
  listsLoading = signal(true);
  selectedList = signal<LookupList | null>(null);
  items = signal<LookupItem[]>([]);
  itemsLoading = signal(false);

  // List dialog
  listDialogVisible = false;
  editListItem: LookupList | null = null;
  listSaving = false;
  listError = '';
  listForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]*$/)]],
    name: ['', Validators.required],
  });

  // Item dialog
  itemDialogVisible = false;
  editItem: LookupItem | null = null;
  itemSaving = false;
  itemError = '';
  itemForm = this.fb.group({
    label: ['', Validators.required],
    value: ['', Validators.required],
    isActive: [true],
  });

  ngOnInit(): void { this.loadLists(); }

  loadLists(): void {
    this.listsLoading.set(true);
    this.http.get<{ data: LookupList[] }>(`${environment.apiBaseUrl}/lookup-lists`).subscribe({
      next: (r) => { this.lists.set(r.data); this.listsLoading.set(false); },
      error: () => { this.listsLoading.set(false); },
    });
  }

  selectList(list: LookupList): void {
    this.selectedList.set(list);
    this.loadItems(list.id);
  }

  loadItems(listId: string): void {
    this.itemsLoading.set(true);
    this.http.get<{ data: LookupItem[] }>(`${environment.apiBaseUrl}/lookup-lists/${listId}/items`).subscribe({
      next: (r) => { this.items.set(r.data); this.itemsLoading.set(false); },
      error: () => { this.itemsLoading.set(false); },
    });
  }

  // --- List CRUD ---
  openCreateList(): void { this.editListItem = null; this.listForm.reset(); this.listForm.get('code')?.enable(); this.listError = ''; this.listDialogVisible = true; }

  openEditList(list: LookupList, event: Event): void {
    event.stopPropagation();
    this.editListItem = list;
    this.listForm.patchValue({ code: list.code, name: list.name });
    this.listForm.get('code')?.disable();
    this.listError = ''; this.listDialogVisible = true;
  }

  saveList(): void {
    this.listSaving = true; this.listError = '';
    const url = `${environment.apiBaseUrl}/lookup-lists`;
    if (this.editListItem) {
      this.http.patch(`${url}/${this.editListItem.id}`, { name: this.listForm.value.name }).subscribe({
        next: () => { this.listSaving = false; this.listDialogVisible = false; this.msg.add({ severity: 'success', summary: 'Updated' }); this.loadLists(); },
        error: (err: HttpErrorResponse) => { this.listSaving = false; this.listError = err.error?.error?.message ?? 'Error'; },
      });
    } else {
      const v = this.listForm.getRawValue();
      this.http.post(url, { code: v.code, name: v.name }).subscribe({
        next: () => { this.listSaving = false; this.listDialogVisible = false; this.msg.add({ severity: 'success', summary: 'Created' }); this.loadLists(); },
        error: (err: HttpErrorResponse) => { this.listSaving = false; this.listError = err.error?.error?.message ?? 'Error'; },
      });
    }
  }

  confirmDeleteList(list: LookupList, event: Event): void {
    event.stopPropagation();
    this.confirm.confirm({
      message: `Delete list "${list.name}" and all its items?`, header: 'Delete List', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/lookup-lists/${list.id}`).subscribe({
          next: () => {
            this.msg.add({ severity: 'success', summary: 'Deleted' });
            if (this.selectedList()?.id === list.id) { this.selectedList.set(null); this.items.set([]); }
            this.loadLists();
          },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }

  // --- Item CRUD ---
  openCreateItem(): void { this.editItem = null; this.itemForm.reset({ isActive: true }); this.itemError = ''; this.itemDialogVisible = true; }

  openEditItem(item: LookupItem): void {
    this.editItem = item;
    this.itemForm.patchValue({ label: item.label, value: item.value, isActive: item.isActive });
    this.itemError = ''; this.itemDialogVisible = true;
  }

  saveItem(): void {
    if (!this.selectedList()) return;
    this.itemSaving = true; this.itemError = '';
    const body = this.itemForm.value;
    if (this.editItem) {
      this.http.patch(`${environment.apiBaseUrl}/lookup-lists/items/${this.editItem.id}`, body).subscribe({
        next: () => { this.itemSaving = false; this.itemDialogVisible = false; this.msg.add({ severity: 'success', summary: 'Updated' }); this.loadItems(this.selectedList()!.id); this.loadLists(); },
        error: (err: HttpErrorResponse) => { this.itemSaving = false; this.itemError = err.error?.error?.message ?? 'Error'; },
      });
    } else {
      this.http.post(`${environment.apiBaseUrl}/lookup-lists/${this.selectedList()!.id}/items`, body).subscribe({
        next: () => { this.itemSaving = false; this.itemDialogVisible = false; this.msg.add({ severity: 'success', summary: 'Added' }); this.loadItems(this.selectedList()!.id); this.loadLists(); },
        error: (err: HttpErrorResponse) => { this.itemSaving = false; this.itemError = err.error?.error?.message ?? 'Error'; },
      });
    }
  }

  confirmDeleteItem(item: LookupItem): void {
    this.confirm.confirm({
      message: `Delete item "${item.label}"?`, header: 'Delete Item', icon: 'pi pi-exclamation-triangle', acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.http.delete(`${environment.apiBaseUrl}/lookup-lists/items/${item.id}`).subscribe({
          next: () => { this.msg.add({ severity: 'success', summary: 'Deleted' }); this.loadItems(this.selectedList()!.id); this.loadLists(); },
          error: (err: HttpErrorResponse) => this.msg.add({ severity: 'error', summary: 'Error', detail: err.error?.error?.message ?? 'Failed' }),
        });
      },
    });
  }
}
