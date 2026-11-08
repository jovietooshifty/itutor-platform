// How long verification files and the identity provider's ID data are kept. CONFIG, not code.
// The numbers are PLACEHOLDERS: the retention period is an open policy decision.

export interface RetentionPolicy {
  /**
   * TODO(policy, undecided): days to keep proof files after a REJECTION and after
   * a REVOCATION before they are deleted. 0 = delete as soon as the decision is
   * made. The delete itself is lib/verificationV2/fileDeletion.ts; the sweep that
   * applies this period is lib/verificationV2/cleanup.ts (not scheduled).
   */
  rejectedDays: number;
  /** Infinity = never: a revoked teacher's data is kept, so an admin can re-approve. */
  revokedDays: number;
  /**
   * Redact the identity session at the provider once a decision is made, so it stops
   * holding the ID images. Matches the consent text ("until we redact it after a
   * decision"). Set false to disable without removing code.
   */
  redactIdentitySessionAfterDecision: boolean;
  /**
   * Account deletion always deletes verification files and redacts the identity
   * session immediately. There is deliberately no retention period for that.
   */
}

export const retentionPolicy: RetentionPolicy = {
  rejectedDays: 30,
  revokedDays: Infinity,
  redactIdentitySessionAfterDecision: true,
};
