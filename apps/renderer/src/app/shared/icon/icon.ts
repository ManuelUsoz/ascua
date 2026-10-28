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
  branch: [
    'M6 4v10M6 18a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM6 8a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM18 8a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM18 8c0 5-6 4-12 6',
  ],
  repo: ['M5 4h13v16H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11'],
  'pull-request': ['M7 4v16M17 20V11a3 3 0 0 0-3-3h-4M12 5l-2.5 3L12 11'],
  'git-branch': [
    'M7 4v16M17 9a2 2 0 1 0 0-4a2 2 0 0 0 0 4zM17 9c0 5-10 3-10 8',
  ],
  copy: ['M9 9h10v11H9zM5 15V4h10'],
  clock: ['M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 7v5l3 2'],
  'chevron-left': ['M15 5l-7 7 7 7'],
  check: ['M5 12l4.5 4.5L19 7'],
  refresh: ['M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4'],
  chat: ['M4 5h16v11H10l-5 4v-4H4z'],
  mic: ['M9 4h6v8a3 3 0 0 1-6 0zM6 11a6 6 0 0 0 12 0M12 17v3'],
  volume: ['M4 10h4l5-4v12l-5-4H4zM16 9a4 4 0 0 1 0 6'],
  'volume-off': ['M4 10h4l5-4v12l-5-4H4zM16 10l5 5M21 10l-5 5'],
  minimize: ['M5 18h14'],
  close: ['M6 6l12 12M18 6L6 18'],
  lock: ['M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  unlock: ['M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2'],
  sparkles: [
    'M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z',
  ],
  'arrow-up': ['M12 19V5M6 11l6-6 6 6'],
  paperclip: [
    'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7',
  ],
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
