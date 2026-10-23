import { expect, test } from '@playwright/test';
import { useAscua } from './ascua';
import { drive } from './helpers';

const ascua = useAscua();
const d = drive(ascua);

test('create a project from the form', async () => {
  await d.open();
  await d.shot('projects-01-empty');
  await d.queuePick(ascua.projectDir);
  await d.clickText('Nuevo proyecto');
  await d.page.waitForSelector('#pf-name');
  await d.page.fill('#pf-name', 'Proyecto demo');
  await d.clickText('Elegir carpeta');
  await d.sleep(400);
  await d.clickText('Guardar');
  await d.page.waitForSelector('.as-page-head h1:has-text("Proyecto demo")');
  expect(await d.page.evaluate(() => location.hash)).toContain('terminales');
  await d.shot('projects-02-saved');
});
