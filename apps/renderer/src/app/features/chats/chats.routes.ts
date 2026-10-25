import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { ChatSessionPage } from './chat-session-page';
import { NewChatPage } from './new-chat/new-chat';

// `nuevo` comes before `:sessionId` so it wins.
export default [
  {
    path: '',
    providers: [provideTranslocoScope('chats')],
    resolve: { chats: scopeResolver('chats') },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'nuevo' },
      { path: 'nuevo', component: NewChatPage },
      { path: ':sessionId', component: ChatSessionPage },
    ],
  },
] satisfies Routes;
