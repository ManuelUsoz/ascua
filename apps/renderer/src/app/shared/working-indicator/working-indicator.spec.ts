import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { i18nTesting } from '../../testing/i18n';
import { WorkingIndicator } from './working-indicator';

describe('WorkingIndicator', () => {
  it('renders the label and a violeta spinner', () => {
    TestBed.configureTestingModule({
      imports: [WorkingIndicator, i18nTesting('es')],
    });
    const fixture = TestBed.createComponent(WorkingIndicator);
    fixture.componentRef.setInput('label', { key: 'notice.error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('.as-working__label')?.textContent).toBe('Error');
    expect(el.querySelector('.as-spinner--violeta')).not.toBeNull();
  });
});
