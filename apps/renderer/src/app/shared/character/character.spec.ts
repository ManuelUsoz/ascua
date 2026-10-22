import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Act, Ascua } from '@ascua/character';
import { Character } from './character';

@Component({
  selector: 'app-character-host',
  imports: [Character],
  template: `<div
    id="host"
    appCharacter="spec"
    [characterAct]="act()"
    [characterPaused]="paused()"
    (characterMount)="mounted = $event"
  ></div>`,
})
class CharacterHost {
  readonly act = signal<Act | undefined>(undefined);
  readonly paused = signal(false);
  mounted?: Ascua;
}

async function render() {
  const fixture = TestBed.createComponent(CharacterHost);
  await fixture.whenStable();
  const element = (
    fixture.nativeElement as HTMLElement
  ).querySelector<HTMLElement>('#host .ascua');
  return { fixture, host: fixture.componentInstance, element };
}

describe('Character', () => {
  it('mounts the character into its host element and reports it', async () => {
    const { host, element } = await render();
    expect(element).not.toBeNull();
    expect(host.mounted?.element).toBe(element);
    expect(element?.dataset['act']).toBe('idle');
  });

  it('plays the act it is given', async () => {
    const { fixture, host, element } = await render();
    host.act.set('warn');
    await fixture.whenStable();
    expect(element?.dataset['act']).toBe('warn');
  });

  it('pauses and resumes', async () => {
    const { fixture, host, element } = await render();
    host.paused.set(true);
    await fixture.whenStable();
    expect(element?.classList.contains('paused')).toBe(true);
    host.paused.set(false);
    await fixture.whenStable();
    expect(element?.classList.contains('paused')).toBe(false);
  });
});
