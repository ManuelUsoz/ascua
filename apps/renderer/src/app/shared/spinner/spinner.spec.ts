import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Spinner, SpinnerMode, SpinnerSize } from './spinner';

function render(inputs: {
  mode?: SpinnerMode;
  size?: SpinnerSize;
  label?: string;
  title?: string;
  subtitle?: string;
}) {
  const fixture = TestBed.createComponent(Spinner);
  for (const [k, v] of Object.entries(inputs)) {
    fixture.componentRef.setInput(k, v);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Spinner', () => {
  it('is a status region', () => {
    expect(render({}).getAttribute('role')).toBe('status');
  });

  it('only mode uses size and sets aria-label', () => {
    const el = render({ size: 24, label: 'Loading' });
    expect(el.getAttribute('aria-label')).toBe('Loading');
    expect(el.querySelector('.as-spinner--l')).not.toBeNull();
  });

  it('withHorizText ignores size and renders the label', () => {
    const el = render({ mode: 'withHorizText', size: 40, label: 'Loading' });
    expect(el.querySelector('.as-spinner--s')).not.toBeNull();
    expect(el.querySelector('.as-spinner--xl')).toBeNull();
    expect(el.querySelector('.as-spinner-block__text')?.textContent).toBe(
      'Loading',
    );
    expect(el.getAttribute('aria-label')).toBeNull();
  });

  it('withTitleAndSubt maps 12 to the 16px default', () => {
    const el = render({ mode: 'withTitleAndSubt', size: 12 });
    const ring = el.querySelector('.as-spinner') as HTMLElement;
    expect(ring.className).toBe('as-spinner');
  });

  it('withTitleAndSubt renders title above subtitle at 40', () => {
    const el = render({
      mode: 'withTitleAndSubt',
      size: 40,
      title: 'T',
      subtitle: 'S',
    });
    expect(el.querySelector('.as-spinner--xl')).not.toBeNull();
    const title = el.querySelector('.as-spinner-block__title') as Element;
    const sub = el.querySelector('.as-spinner-block__sub') as Element;
    expect(title.textContent).toBe('T');
    expect(sub.textContent).toBe('S');
    expect(
      title.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
