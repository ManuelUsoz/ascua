export interface ConfirmationRequest {
  tool: string;
  input: unknown;
  params: Record<string, string>;
  detail?: string;
}

/** The write seam: resolves true when the user approves the action. */
export interface Confirmer {
  confirm(request: ConfirmationRequest, signal: AbortSignal): Promise<boolean>;
}
