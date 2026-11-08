// Didit's workflow id. Read from DIDIT_WORKFLOW_ID and nothing else: there is no default and no
// sandbox fallback, in any environment. Unset means Didit is not configured.

export function diditWorkflowId(env: Record<string, string | undefined> = process.env): string {
  return (env.DIDIT_WORKFLOW_ID ?? '').trim();
}
