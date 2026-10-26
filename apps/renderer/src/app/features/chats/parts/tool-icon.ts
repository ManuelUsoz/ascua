import type { ToolKind } from '@ascua/chat';
import type { IconName } from '../../../shared/icon/icon';

const TOOL_ICONS: Record<ToolKind, IconName> = {
  read: 'file',
  edit: 'edit',
  execute: 'terminal',
  search: 'search',
  fetch: 'external',
  other: 'settings',
};

export function toolIcon(kind: ToolKind): IconName {
  return TOOL_ICONS[kind];
}
