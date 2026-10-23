import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** 24x24 stroke paths from the Ascua design system. */
export const ICONS = {
  folder: [
    'M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  ],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  plus: ['M12 5v14M5 12h14'],
  play: ['M8 5l11 7-11 7z'],
  stop: ['M6 6h12v12H6z'],
  terminal: ['M5 7l4 4-4 4M12 16h7'],
  server: ['M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01'],
  window: ['M3 5h18v14H3zM3 9h18'],
  edit: ['M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'],
  trash: ['M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'],
  file: ['M7 3h7l5 5v13H7zM14 3v5h5'],
  search: ['M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14zM20 20l-4-4'],
  external: ['M14 4h6v6M20 4l-9 9M18 14v5H5V6h5'],
  settings: [
    'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3a1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  ],
  minimize: ['M5 18h14'],
  close: ['M6 6l12 12M18 6L6 18'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  template: `<svg
    class="as-ico"
    [class.as-ico--l]="large()"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    @for (d of paths(); track d) {
      <path [attr.d]="d" />
    }
  </svg>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly large = input(false);
  protected readonly paths = computed(() => ICONS[this.name()]);
}
