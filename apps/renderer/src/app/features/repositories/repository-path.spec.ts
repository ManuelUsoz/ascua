import { repositoryUrl } from './repository-path';

describe('repositoryUrl', () => {
  it('keeps the repo id as one segment', () => {
    expect(repositoryUrl('octo/hello')).toEqual([
      '/repositorios',
      'octo/hello',
    ]);
  });

  it('adds the PR and the commit', () => {
    expect(repositoryUrl('octo/hello', 7)).toEqual([
      '/repositorios',
      'octo/hello',
      'prs',
      7,
    ]);
    expect(repositoryUrl('octo/hello', undefined, 'abc')).toEqual([
      '/repositorios',
      'octo/hello',
      'commits',
      'abc',
    ]);
    expect(repositoryUrl('octo/hello', 7, 'abc')).toEqual([
      '/repositorios',
      'octo/hello',
      'prs',
      7,
      'commits',
      'abc',
    ]);
  });
});
