import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { NoteView } from './note-view';

@Component({ selector: 'app-blank', template: '' })
class Blank {}

const HTML =
  '<h2 id="note-h-intro">Intro</h2>' +
  '<a data-note="Mi Nota" data-heading="intro" href="#">same</a>' +
  '<a data-note="Otra" data-heading="intro" href="#">other</a>';

describe('NoteView', () => {
  const original = Element.prototype.scrollIntoView;
  let scroll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll as never;
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
  });

  async function setup() {
    TestBed.configureTestingModule({
      imports: [NoteView],
      providers: [
        provideRouter([{ path: 'notas/:name', component: Blank }]),
        { provide: ASCUA_API, useValue: undefined },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/notas/mi%20nota#intro');
    const fixture = TestBed.createComponent(NoteView);
    fixture.componentRef.setInput('html', HTML);
    fixture.detectChanges();
    await fixture.whenStable();
    scroll.mockClear();
    return { fixture, router };
  }

  it('scrolls directly when the link targets the current note', async () => {
    const { fixture, router } = await setup();
    const nav = vi.spyOn(router, 'navigate');
    const links = fixture.nativeElement.querySelectorAll('a');
    (links[0] as HTMLElement).click();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
  });

  it('navigates when the link targets another note', async () => {
    const { fixture, router } = await setup();
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const links = fixture.nativeElement.querySelectorAll('a');
    (links[1] as HTMLElement).click();
    expect(nav).toHaveBeenCalledWith(['/notas', 'Otra'], { fragment: 'intro' });
    expect(scroll).not.toHaveBeenCalled();
  });
});
