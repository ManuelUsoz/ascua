import { TestBed } from '@angular/core/testing';
import type { AscuaApi, PermissionRequest } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { Companion } from '../companion/companion';
import { RoomState } from '../room/room-state';
import { PermissionQueue } from './permission-queue';

const edit: PermissionRequest = {
  id: 1,
  tool: 'Edit',
  summary: 'src/app.ts',
  input: {},
};
const wipe: PermissionRequest = {
  id: 2,
  tool: 'Bash',
  summary: 'rm -rf dist',
  input: {},
};

describe('PermissionQueue', () => {
  let push: (request: PermissionRequest) => void;
  let hangUp: (id: number) => void;
  let api: Pick<
    AscuaApi,
    'onPermissionRequest' | 'onPermissionDismissed' | 'resolvePermission'
  >;
  let companion: {
    need: ReturnType<typeof vi.fn>;
    celebrate: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let room: { collapse: ReturnType<typeof vi.fn> };
  let queue: PermissionQueue;

  beforeEach(() => {
    api = {
      onPermissionRequest: (callback) => {
        push = callback;
        return () => undefined;
      },
      onPermissionDismissed: (callback) => {
        hangUp = callback;
        return () => undefined;
      },
      resolvePermission: vi.fn(async () => undefined),
    };
    companion = { need: vi.fn(), celebrate: vi.fn(), release: vi.fn() };
    room = { collapse: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ASCUA_API, useValue: api },
        { provide: Companion, useValue: companion },
        { provide: RoomState, useValue: room },
      ],
    });
    queue = TestBed.inject(PermissionQueue);
  });

  it('shows the oldest request and counts the rest', () => {
    push(edit);
    push(wipe);
    expect(queue.current()).toBe(edit);
    expect(queue.currentAct()).toBe('alert');
    expect(queue.queuedText()).toBe('+1 waiting');
    expect(companion.need).toHaveBeenCalledTimes(1);
    expect(companion.need).toHaveBeenCalledWith('alert');
    expect(room.collapse).toHaveBeenCalledTimes(2);
  });

  it('answers the hook and moves on to the next request', () => {
    push(edit);
    push(wipe);
    queue.decide('allow');
    expect(api.resolvePermission).toHaveBeenCalledWith(edit.id, 'allow');
    expect(queue.current()).toBe(wipe);
    expect(companion.need).toHaveBeenLastCalledWith('warn');
    expect(companion.celebrate).not.toHaveBeenCalled();
  });

  it('celebrates an approval that empties the queue', () => {
    push(edit);
    queue.decide('allow');
    expect(queue.current()).toBeUndefined();
    expect(companion.celebrate).toHaveBeenCalled();
  });

  it('drops a request whose hook disconnected', () => {
    push(edit);
    hangUp(edit.id);
    expect(queue.current()).toBeUndefined();
    expect(companion.release).toHaveBeenCalled();
  });
});
