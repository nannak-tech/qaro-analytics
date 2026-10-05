// The closed event taxonomy. ingest-api rejects any event_name not listed here,
// so the public endpoint can never become an arbitrary writer. Add new events
// here (and keep PROVENANCE exhaustive — TypeScript fails the build otherwise).

export const EVENT_NAMES = [
  // lifecycle
  'app_open', 'app_background', 'session_start',
  // navigation
  'screen_view',
  // discovery
  'search', 'category_view', 'service_view', 'provider_view',
  // ads (billable — carry the `ad` block)
  'ad_impression', 'ad_click',
  // contact
  'whatsapp_click', 'call_click', 'directions_click', 'email_click',
  // commerce
  'add_to_cart', 'booking_started', 'booking_step', 'slot_selected',
  'vehicle_selected', 'address_selected', 'payment_started',
  // orders
  'order_placed', 'order_paid', 'order_cancelled',
  // account
  'login', 'logout', 'signup', 'otp_requested', 'otp_verified',
  // engagement
  'favorite_add', 'share', 'review_submitted',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

const NAME_SET = new Set<string>(EVENT_NAMES);
export const isEventName = (v: unknown): v is EventName =>
  typeof v === 'string' && NAME_SET.has(v);

// user = customer action · system = emitted automatically by the app.
// Exhaustive: every EventName must have an entry.
export const PROVENANCE: Record<EventName, 'user' | 'system'> = {
  app_open: 'system', app_background: 'system', session_start: 'system',
  screen_view: 'system',
  search: 'user', category_view: 'user', service_view: 'user', provider_view: 'user',
  ad_impression: 'system', ad_click: 'user',
  whatsapp_click: 'user', call_click: 'user', directions_click: 'user', email_click: 'user',
  add_to_cart: 'user', booking_started: 'user', booking_step: 'user', slot_selected: 'user',
  vehicle_selected: 'user', address_selected: 'user', payment_started: 'user',
  order_placed: 'user', order_paid: 'system', order_cancelled: 'user',
  login: 'user', logout: 'user', signup: 'user', otp_requested: 'user', otp_verified: 'user',
  favorite_add: 'user', share: 'user', review_submitted: 'user',
};

export const AD_EVENTS = new Set<EventName>(['ad_impression', 'ad_click']);
