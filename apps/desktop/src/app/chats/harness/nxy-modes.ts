import type { HarnessMode } from '@ascua/chat';

// The systemAppend texts are model instructions, not UI copy.

export const LOCATE_MODE: HarnessMode = {
  id: 'locate',
  setup: async () => ({
    // i18n-ignore: model instructions
    systemAppend:
      'Mode: locate. Find where the requested thing lives in the project and report each place as `path:line` with a one-line note. Do not edit files or run commands that change anything.',
    deniedTools: ['edit', 'execute'],
  }),
};

export const MAKE_MODE: HarnessMode = {
  id: 'make',
  setup: async () => ({
    // i18n-ignore: model instructions
    systemAppend:
      'Mode: make. First write a plan split in small batches, each with a way to verify it. Then implement the batches one by one and verify each before moving on. Report what changed and how it was verified.',
  }),
};

export const REVIEW_MODE: HarnessMode = {
  id: 'review',
  setup: async () => ({
    // i18n-ignore: model instructions
    systemAppend:
      'Mode: review. Review the requested files, changes or pull request. Report findings ordered by severity, each with `path:line` and a concrete suggestion. Do not edit files.',
    deniedTools: ['edit'],
  }),
};
