// How a teacher's identity check runs. CONFIG: change here, never in the flow.
//
// Didit is the ONLY provider. The route for every country is [didit]. A teacher gets
// `maxTotalAttempts` identity sessions in total; when they are used up (or Didit says it cannot
// check them, or they decline consent) they are told to contact support. There is NO manual
// identity review and no second provider.
//
// Didit's settings are three environment variables and nothing else:
//   DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_WEBHOOK_SECRET
// If one is missing the check is "not available": the teacher sees "Verification setup is not
// finished yet." and the admin page names the missing variable.

import type { ProviderName } from '@/lib/identity/types';

export interface DocumentCountry {
  /** ISO 3166-1 alpha-2, or 'OTHER'. */
  code: string;
  label: string;
}

export interface IdentityRoutingConfig {
  defaultProvider: ProviderName;
  fallbackChain: ProviderName[];
  /** Per-country override: the full ordered route for that document country. */
  countryRoutes: Partial<Record<string, ProviderName[]>>;
  /** Identity sessions one teacher may start in TOTAL. When used up: "contact support". */
  maxTotalAttempts: number;
  /**
   * The age below which a document is "minor" and the automatic route reports not_supported/minor.
   * 18 matches the Terms ("must be at least 18").
   */
  minimumAge: number;
  /** What the teacher can pick as their document country at the identity step. */
  countries: DocumentCountry[];
}

export const identityRouting: IdentityRoutingConfig = {
  defaultProvider: 'didit',
  fallbackChain: ['didit'],
  countryRoutes: {},
  maxTotalAttempts: 3,
  minimumAge: 18,
  countries: [
    { code: 'TT', label: 'Trinidad and Tobago' },
    { code: 'GY', label: 'Guyana' },
    { code: 'BB', label: 'Barbados' },
    { code: 'JM', label: 'Jamaica' },
    { code: 'OTHER', label: 'Another country' },
  ],
};
