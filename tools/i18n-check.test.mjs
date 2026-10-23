import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanSource, scanTemplate } from './i18n-check.mjs';

test('flags literal template text', () => {
  assert.equal(scanTemplate('<b>Proyectos</b>').length, 1);
});

test('flags literal aria-label', () => {
  assert.equal(scanTemplate('<button aria-label="Cerrar"></button>').length, 1);
});

test('flags a thrown literal', () => {
  assert.equal(scanSource("throw new Error('No existe')").length, 1);
});

test('passes translated templates', () => {
  assert.deepEqual(scanTemplate(`<b>{{ 'x' | transloco }}</b>`), []);
  assert.deepEqual(
    scanTemplate(`<button [attr.aria-label]="'x' | transloco"></button>`),
    [],
  );
  assert.deepEqual(scanTemplate('@if (a) {\n<i></i>\n} @else {\n}'), []);
});

test('honours the template ignore marker', () => {
  assert.deepEqual(scanTemplate('<!-- i18n-ignore -->\n<b>Hola</b>'), []);
});

test('passes console and i18n-ignore lines', () => {
  assert.deepEqual(scanSource("console.warn('no se pudo guardar')"), []);
  assert.deepEqual(
    scanSource("throw new Error('No existe') // i18n-ignore"),
    [],
  );
});
