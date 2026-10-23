import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { FilesPage } from './files-page';

export default [
  {
    path: '',
    component: FilesPage,
    canDeactivate: [() => inject(UnsavedChanges).confirmDiscard()],
  },
] satisfies Routes;
