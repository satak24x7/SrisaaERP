import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center py-24 text-gray-400">
      <i [class]="icon + ' text-5xl mb-4'"></i>
      <h2 class="text-2xl font-semibold text-gray-700 mb-2">{{ title }}</h2>
      <p class="text-sm">This module is coming soon.</p>
    </div>
  `,
})
export class PlaceholderComponent {
  private readonly route = inject(ActivatedRoute);
  title = '';
  icon = 'pi pi-box';

  constructor() {
    const data = this.route.snapshot.data;
    this.title = (data['title'] as string) ?? 'Coming Soon';
    this.icon = (data['icon'] as string) ?? 'pi pi-box';
  }
}
