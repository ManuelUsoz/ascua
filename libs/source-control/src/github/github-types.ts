// Minimal raw GitHub REST shapes: only the fields the mappers read.

export interface GhUser {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string | null;
  html_url: string;
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description?: string | null;
  private: boolean;
  visibility?: string;
  default_branch: string;
  html_url: string;
  updated_at?: string | null;
  pushed_at?: string | null;
}

export interface GhPull {
  id: number;
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  merged_at?: string | null;
  user?: { login: string; avatar_url?: string | null } | null;
  head: { ref: string };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GhCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string } | null;
  };
  author?: { login: string; avatar_url?: string | null } | null;
}

export interface GhWorkflowRun {
  id: number;
  name?: string | null;
  display_title?: string;
  status?: string | null;
  conclusion?: string | null;
  head_branch?: string | null;
  head_sha: string;
  event?: string;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GhWorkflowRunList {
  workflow_runs: GhWorkflowRun[];
}

export interface GhDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval?: number;
}

export interface GhAccessTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}
