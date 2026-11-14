// Saved cards for the signed-in parent — Settings › Payment methods.
// Server-only.
//
// THE CUSTOMER ID IS NEVER TAKEN FROM THE CLIENT. Every caller passes the
// parent's own profile id, and the Customer is read from that row with the
// service client. A route that accepted a customer id would let anyone list
// or detach anyone's cards.
//
// The Customer is the PAYER's (ensureStripeCustomer(admin, payerId) in the
// checkout paths), so a parent who has paid for a child's class has their
// cards here. A parent who has never paid has no Customer yet, and that is
// an empty list, not an error.

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeClient } from './stripeClient';

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

export type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  expired: boolean;
  /** Default card of a live subscription, or the customer's default. */
  inUse: boolean;
};

/** Subscription statuses that will still try to charge a card. */
const LIVE: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'];

const idOf = (v: unknown): string | null =>
  typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: string }).id) : null;

/** The parent's Stripe Customer id, or null when there is none (or it is stale). */
export async function parentCustomerId(admin: AdminClient, parentId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('stripe_customer_id').eq('id', parentId).maybeSingle();
  const id = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  if (!id) return null;
  try {
    const c = await getStripeClient().customers.retrieve(id);
    return (c as Stripe.DeletedCustomer).deleted ? null : id;
  } catch {
    // Saved under another Stripe mode/account. ensureStripeCustomer replaces
    // it on the next checkout; until then there is nothing to show.
    return null;
  }
}

/** Card ids that something will charge: subscription defaults and the customer default. */
async function cardsInUse(stripe: Stripe, customerId: string): Promise<Set<string>> {
  const used = new Set<string>();
  const customer = await stripe.customers.retrieve(customerId);
  if (!(customer as Stripe.DeletedCustomer).deleted) {
    const def = idOf((customer as Stripe.Customer).invoice_settings?.default_payment_method);
    if (def) used.add(def);
  }
  for await (const sub of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
    if (!LIVE.includes(sub.status)) continue;
    const pm = idOf(sub.default_payment_method);
    if (pm) used.add(pm);
  }
  return used;
}

export async function listParentCards(admin: AdminClient, parentId: string): Promise<SavedCard[]> {
  const customerId = await parentCustomerId(admin, parentId);
  if (!customerId) return [];
  const stripe = getStripeClient();
  const used = await cardsInUse(stripe, customerId);
  const now = new Date();
  const out: SavedCard[] = [];
  for await (const pm of stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 100 })) {
    if (!pm.card) continue;
    const { brand, last4, exp_month, exp_year } = pm.card;
    // A card is valid through the last day of its expiry month.
    const expired = exp_year < now.getFullYear() || (exp_year === now.getFullYear() && exp_month < now.getMonth() + 1);
    out.push({ id: pm.id, brand, last4, expMonth: exp_month, expYear: exp_year, expired, inUse: used.has(pm.id) });
  }
  return out;
}

export type DetachOutcome = 'ok' | 'not_found' | 'in_use';

/**
 * Detaches one of the payer's cards (parent or self-paying student: the
 * functions only take a profile id).
 *
 * A card that a live subscription or the customer default would charge is
 * removed only when ANOTHER usable card is on file (owner, 14 Nov): the
 * subscriptions and the customer default move to that card first, then this
 * one is detached. With no other card it is refused, because the next renewal
 * would fail with no card at all.
 */
export async function detachParentCard(
  admin: AdminClient,
  parentId: string,
  paymentMethodId: string
): Promise<DetachOutcome> {
  const customerId = await parentCustomerId(admin, parentId);
  if (!customerId) return 'not_found';
  const stripe = getStripeClient();
  let pm: Stripe.PaymentMethod;
  try {
    pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  } catch {
    return 'not_found';
  }
  // Ownership: the card must be on THIS parent's Customer.
  if (idOf(pm.customer) !== customerId) return 'not_found';
  const used = await cardsInUse(stripe, customerId);
  if (used.has(pm.id)) {
    const replacement = await otherUsableCard(stripe, customerId, pm.id, used);
    if (!replacement) return 'in_use';
    await moveChargesTo(stripe, customerId, pm.id, replacement);
  }
  await stripe.paymentMethods.detach(pm.id);
  return 'ok';
}

/** A card on the customer, other than `exceptId`, that has not expired. Prefers one already in use. */
async function otherUsableCard(stripe: Stripe, customerId: string, exceptId: string, used: Set<string>): Promise<string | null> {
  const now = new Date();
  const usable: string[] = [];
  for await (const pm of stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 100 })) {
    if (pm.id === exceptId || !pm.card) continue;
    const { exp_month, exp_year } = pm.card;
    const expired = exp_year < now.getFullYear() || (exp_year === now.getFullYear() && exp_month < now.getMonth() + 1);
    if (!expired) usable.push(pm.id);
  }
  return usable.find((id) => used.has(id)) ?? usable[0] ?? null;
}

/** Points every live subscription and the customer default that charge `fromId` at `toId`. */
async function moveChargesTo(stripe: Stripe, customerId: string, fromId: string, toId: string): Promise<void> {
  for await (const sub of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
    if (!LIVE.includes(sub.status)) continue;
    if (idOf(sub.default_payment_method) === fromId) {
      await stripe.subscriptions.update(sub.id, { default_payment_method: toId });
    }
  }
  const customer = await stripe.customers.retrieve(customerId);
  if (!(customer as Stripe.DeletedCustomer).deleted) {
    const def = idOf((customer as Stripe.Customer).invoice_settings?.default_payment_method);
    if (def === fromId || !def) {
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: toId } });
    }
  }
}

// Role-neutral names for the student routes; same functions.
export const payerCustomerId = parentCustomerId;
export const listSavedCards = listParentCards;
export const detachSavedCard = detachParentCard;
