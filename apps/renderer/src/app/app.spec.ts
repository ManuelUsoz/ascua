import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { appRoutes } from './app.routes';

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
    expect(compiled.querySelector('#room main h1')?.textContent).toContain('Hello');
    fixture.destroy();
  });

  it('mounts the avatar and a hidden bubble', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#ascua-host .ascua')).not.toBeNull();
    expect(compiled.querySelector('#bubble-face .ascua')).not.toBeNull();
    expect(compiled.querySelector('#bubble')?.hasAttribute('hidden')).toBe(true);
    fixture.destroy();
  });
});
