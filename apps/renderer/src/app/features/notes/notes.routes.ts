import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { NotePage } from './note-page';
import { NotesIndexPage } from './notes-index-page';

// The files scope is here too: CodeEditor's search phrases live in it.
export default [
  {
    path: '',
    providers: [provideTranslocoScope('notes'), provideTranslocoScope('files')],
    resolve: {
      notes: scopeResolver('notes'),
      files: scopeResolver('files'),
    },
    children: [
      { path: '', component: NotesIndexPage },
      {
        path: ':name',
        component: NotePage,
        canDeactivate: [() => inject(UnsavedChanges).confirmDiscard()],
      },
    ],
  },
] satisfies Routes;
