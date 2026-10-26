import { renderNoteHtml } from './note-markdown';

const exists = () => ({ exists: true });

function dom(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('renderNoteHtml', () => {
  it('renders a wiki link with note and heading', () => {
    const el = dom(
      renderNoteHtml('See [[Ideas#Big Plan]].', (l) => ({
        exists: true,
        slug: l.heading === 'Big Plan' ? 'big-plan' : undefined,
      })),
    );
    const a = el.querySelector('a.as-note-link');
    expect(a?.getAttribute('data-note')).toBe('Ideas');
    expect(a?.getAttribute('data-heading')).toBe('big-plan');
    expect(a?.textContent).toBe('Ideas › Big Plan');
    expect(a?.classList.contains('is-missing')).toBe(false);
  });

  it('marks a missing note', () => {
    const el = dom(renderNoteHtml('[[Nope]]', () => ({ exists: false })));
    const a = el.querySelector('a.as-note-link');
    expect(a?.classList.contains('is-missing')).toBe(true);
    expect(a?.textContent).toBe('Nope');
  });

  it('uses the alias as label', () => {
    const el = dom(renderNoteHtml('[[Ideas#Plan|my plan]]', exists));
    expect(el.querySelector('a')?.textContent).toBe('my plan');
  });

  it('keeps a same-note link empty and labelled by its heading', () => {
    const el = dom(renderNoteHtml('[[#Intro]]', exists));
    const a = el.querySelector('a');
    expect(a?.getAttribute('data-note')).toBe('');
    expect(a?.getAttribute('data-heading')).toBe('intro');
    expect(a?.textContent).toBe('Intro');
  });

  it('gives duplicate headings distinct ids', () => {
    const el = dom(renderNoteHtml('# A\n\n## A\n\n## A\n', exists));
    expect([...el.querySelectorAll('h1,h2')].map((h) => h.id)).toEqual([
      'note-h-a',
      'note-h-a-1',
      'note-h-a-2',
    ]);
  });

  it('strips scripts and event handlers', () => {
    const html = renderNoteHtml(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">',
      exists,
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
  });

  it('strips style tags, style attributes and forms', () => {
    const html = renderNoteHtml(
      '<style>body{display:none}</style>\n\n<p style="position:fixed">x</p>\n\n<form action="/x"><input name="a"></form>',
      exists,
    );
    expect(html).not.toContain('<style');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('<form');
  });

  it('leaves [[x]] inside code untouched', () => {
    const el = dom(renderNoteHtml('`[[x]]`\n\n```\n[[y]]\n```\n', exists));
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain('[[x]]');
    expect(el.textContent).toContain('[[y]]');
  });
});
