/**
 * Router commands for a repositories location. The repo id contains a slash,
 * so it goes as one array element (the router encodes it).
 */
export function repositoryUrl(
  repoId: string,
  prNumber?: number,
  commitSha?: string,
): (string | number)[] {
  const url: (string | number)[] = ['/repositorios', repoId];
  if (prNumber !== undefined) url.push('prs', prNumber);
  if (commitSha) url.push('commits', commitSha);
  return url;
}
