// Which Didit settings are missing, for the admin screen. NAMES ONLY: this never returns, logs or
// echoes a value. A missing setting makes the identity check "not available": the teacher sees
// "Verification setup is not finished yet." and this tells an admin which variable to set.

type Env = Record<string, string | undefined>;

/** The only three settings Didit needs. */
export const DIDIT_VARIABLES = ['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET'] as const;

export interface IdentitySetupProblem {
  provider: 'didit';
  primary: true;
  /** Variable names, never values. */
  missing: string[];
  message: string;
}

export function identitySetupProblems(env: Env = process.env): IdentitySetupProblem[] {
  const missing = DIDIT_VARIABLES.filter((name) => (env[name] ?? '').trim().length === 0);
  if (missing.length === 0) return [];
  return [
    {
      provider: 'didit',
      primary: true,
      missing: [...missing],
      message: `Teachers cannot start an identity check: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
    },
  ];
}
