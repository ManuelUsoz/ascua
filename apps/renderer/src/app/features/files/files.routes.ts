import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { FilesPage } from './files-page';

export default [
  {
    path: '',
    component: FilesPage,
    providers: [provideTranslocoScope('files')],
    resolve: { files: scopeResolver('files') },
    canDeactivate: [() => inject(UnsavedChanges).confirmDiscard()],
  },
] satisfies Routes;
