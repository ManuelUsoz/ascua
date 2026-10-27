const enabled =
  parseInt(process.env['ELECTRON_IS_DEV'] ?? '0', 10) === 1 ||
  process.env['ASCUA_CHAT_DEBUG'] === '1';

/** Dev-only `[chats:debug]` trace of the chat pipeline (SDK -> events -> IPC). */
export function chatLog(event: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  console.info('[chats:debug]', event, data ? JSON.stringify(data) : '');
}
