import type { Language } from '@ascua/ipc';

/** Text main shows in native dialogs; the renderer has its own catalogs. */
export interface MainMessages {
  quitMessage: (running: number) => string;
  quitConfirm: string;
  quitCancel: string;
}

export const MAIN_MESSAGES = {
  es: {
    quitMessage: (running) =>
      `Tenés ${running} ${running === 1 ? 'terminal corriendo' : 'terminales corriendo'}, ¿cerrar igual?`,
    quitConfirm: 'Cerrar igual',
    quitCancel: 'Cancelar',
  },
  en: {
    quitMessage: (running) =>
      `You have ${running} ${running === 1 ? 'terminal' : 'terminals'} running, quit anyway?`,
    quitConfirm: 'Quit anyway',
    quitCancel: 'Cancel',
  },
} satisfies Record<Language, MainMessages>;

export class MainText {
  private messages: MainMessages;

  constructor(language: Language = 'es') {
    this.messages = MAIN_MESSAGES[language];
  }

  set(language: Language): void {
    this.messages = MAIN_MESSAGES[language];
  }

  quit(running: number): { message: string; buttons: [string, string] } {
    return {
      message: this.messages.quitMessage(running),
      buttons: [this.messages.quitConfirm, this.messages.quitCancel],
    };
  }
}
