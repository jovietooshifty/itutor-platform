// The only place that knows which providers exist: Didit, and nothing else.

import { diditProvider } from './providers/didit';
import { availableRoute, routeFor } from './routing';
import type { IdentityProvider, ProviderName } from './types';

const PROVIDERS: Record<ProviderName, IdentityProvider> = {
  didit: diditProvider,
};

export function getProvider(name: ProviderName): IdentityProvider {
  return PROVIDERS[name];
}

export function isProviderConfigured(name: ProviderName): boolean {
  return PROVIDERS[name].isConfigured();
}

/** The route for a document country, with an unconfigured provider skipped (so, possibly empty). */
export function routeForCountry(country: string | null | undefined): ProviderName[] {
  return availableRoute(routeFor(country), isProviderConfigured);
}
