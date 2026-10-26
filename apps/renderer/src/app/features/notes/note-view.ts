import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { noteKey } from '@ascua/notes';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { HEADING_ID_PREFIX } from './note-markdown';

/**
 * A rendered note. `html` must be the output of `renderNoteHtml` (already run
 * through DOMPurify): it is the only thing allowed past Angular's sanitizer.
 * Links never navigate on their own; clicks are handled here.
 */
@Component({
  selector: 'app-note-view',
  template: '',
  host: {
    '[innerHTML]': 'safeHtml()',
    '(click)': 'onClick($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteView {
  readonly html = input.required<string>();
  /** Heading slug to scroll to once rendered (route fragment). */
  readonly fragment = input<string | null | undefined>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly api = inject(ASCUA_API);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly safeHtml = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.html()),
  );

  constructor() {
    afterRenderEffect(() => {
      this.html();
      const fragment = this.fragment();
      if (fragment) this.scrollTo(fragment);
    });
  }

  protected onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor || !this.host.nativeElement.contains(anchor)) return;
    event.preventDefault();

    const note = anchor.getAttribute('data-note');
    if (note !== null) {
      const heading = anchor.getAttribute('data-heading') || undefined;
      if (note === '' || this.isCurrentNote(note)) {
        // Same note: navigating to an unchanged fragment would do nothing.
        if (heading) this.scrollTo(heading);
      } else {
        void this.router.navigate(['/notas', note], { fragment: heading });
      }
      return;
    }
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      this.scrollTo(href.slice(1));
    } else if (/^https?:\/\//i.test(href)) {
      void this.api?.openNoteLink(href);
    }
  }

  private isCurrentNote(note: string): boolean {
    const path = this.router.url.split(/[?#]/)[0] ?? '';
    const [root, current] = path.split('/').filter(Boolean);
    if (root !== 'notas' || !current) return false;
    try {
      return noteKey(decodeURIComponent(current)) === noteKey(note);
    } catch {
      return false;
    }
  }

  private scrollTo(slug: string): void {
    const id = HEADING_ID_PREFIX + slug;
    const el = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[id]'),
    ).find((e) => e.id === id);
    // jsdom has no scrollIntoView.
    el?.scrollIntoView?.({ block: 'start' });
  }
}
