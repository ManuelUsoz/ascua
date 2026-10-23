import { describe, expect, it } from 'vitest';
import type { Project } from '@ascua/ipc';
import { fromProject, toProjectInput } from './project-form-model';

const project: Project = {
  id: 'p1',
  name: 'API',
  path: 'C:\\code\\api',
  color: '#ff0000',
  terminals: [
    {
      id: 't1',
      name: 'server',
      command: './mvnw spring-boot:run',
      cwd: 'back',
      port: 8080,
    },
    { id: 't2', name: 'worker', command: 'npm start' },
  ],
};

describe('project form model', () => {
  it('maps a project to form values', () => {
    expect(fromProject(project)).toEqual({
      name: 'API',
      path: 'C:\\code\\api',
      color: '#ff0000',
    });
  });

  it('keeps the stored pistas and id when editing', () => {
    expect(toProjectInput(fromProject(project), project)).toEqual(project);
  });

  it('trims text, drops an empty color and starts without pistas', () => {
    expect(
      toProjectInput({ name: '  Web ', path: ' C:\\web ', color: null }),
    ).toEqual({ name: 'Web', path: 'C:\\web', terminals: [] });
  });
});
