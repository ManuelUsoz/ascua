import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { appRoutes } from './app.routes';
import { RoomState } from './core/room/room-state';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(appRoutes)],
    }).compileComponents();
  });

  it('renders the home screen inside the room', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#room main h1')?.textContent).toContain(
      'Hello',
    );
    fixture.destroy();
  });

  it('mounts the avatar and a hidden bubble', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#ascua-host .ascua')).not.toBeNull();
    expect(compiled.querySelector('#bubble-face .ascua')).not.toBeNull();
    expect(compiled.querySelector('#bubble')?.hasAttribute('hidden')).toBe(
      true,
    );
    fixture.destroy();
  });
});

describe('App window bindings', () => {
  const room = {
    open: signal(false),
    isCompact: () => true,
    anchor: vi.fn(),
    expand: vi.fn(async () => undefined),
    collapse: vi.fn(),
    close: vi.fn(),
    resized: vi.fn(),
  };

  beforeEach(async () => {
    room.collapse.mockClear();
    room.resized.mockClear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(appRoutes),
        { provide: RoomState, useValue: room },
      ],
    }).compileComponents();
  });

  it('collapses the room on Escape and forwards window resizes', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(room.collapse).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(room.collapse).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('resize'));
    expect(room.resized).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
});
