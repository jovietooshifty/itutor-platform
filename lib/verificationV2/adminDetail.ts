// Pure helpers for the admin detail view (kept out of the route file: a route may only export handlers).

/** Didit's result in one word, for the admin summary. */
export function identityResult(status: string | null | undefined): 'pass' | 'fail' | 'in_review' | null {
  if (!status) return null;
  if (status === 'verified') return 'pass';
  if (status === 'pending' || status === 'processing') return 'in_review';
  return 'fail';
}

const ACTION_LABEL: Record<string, string> = {
  APPROVE: 'Approved',
  REAPPROVE: 'Re-approved',
  REJECT: 'Not approved',
  REVOKE: 'Verification revoked',
  REQUIRE_REVERIFICATION: 'Asked to verify again',
  REQUEST_INFO: 'Asked for more information',
  APPROVE_CREDENTIAL: 'Credential approved',
  REJECT_CREDENTIAL: 'Credential not approved',
};

/** The whole status history, oldest first: what the teacher did and what each admin decided. */
export function buildHistory(row: any, decisions: any[], nameOf: (id: string | null | undefined) => string | null) {
  const out: { at: string; label: string; by: string | null; reason?: string | null }[] = [];
  if (row.created_at) out.push({ at: row.created_at, label: 'Started verification', by: null });
  if (row.consent_at) out.push({ at: row.consent_at, label: 'Agreed to the identity check', by: null });
  if (row.identity_verified_at) out.push({ at: row.identity_verified_at, label: 'ID check passed', by: null });
  if (row.submitted_at) out.push({ at: row.submitted_at, label: 'Submitted for review', by: null });
  for (const d of decisions) {
    out.push({
      at: d.created_at,
      label: ACTION_LABEL[d.action] ?? d.action,
      by: d.actor_role === 'system' ? 'System' : nameOf(d.actor_id) ?? d.actor_role,
      reason: d.reason ?? null,
    });
  }
  return out.filter((e) => e.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
