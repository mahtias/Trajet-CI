export type PaymentMethodId = 'wave' | 'orange_money' | 'mtn_money' | 'moov_money' | 'card';

export interface PaymentMethodConfig {
  id: PaymentMethodId;
  name: string;
  /** Two-letter label shown in the round badge */
  shortLabel: string;
  /** Mobile money is confirmed on the phone; card goes through a card payment page */
  kind: 'mobile_money' | 'card';
  /** Solid badge (e.g. selected state, ticket display) */
  badgeClass: string;
  /** Soft background used for the selected card / confirmation panel */
  panelClass: string;
}

/** Priority order: Wave (most used in CI today), Orange Money, MTN Money, Moov Money, then card. */
export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: 'wave',
    name: 'Wave',
    shortLabel: 'WA',
    kind: 'mobile_money',
    badgeClass: 'bg-[#1DC8CD] text-white',
    panelClass: 'bg-[#1DC8CD]/10 border-[#1DC8CD]/30 text-[#0e7478]',
  },
  {
    id: 'orange_money',
    name: 'Orange Money',
    shortLabel: 'OM',
    kind: 'mobile_money',
    badgeClass: 'bg-[#FF7900] text-white',
    panelClass: 'bg-orange-50 border-orange-200 text-orange-900',
  },
  {
    id: 'mtn_money',
    name: 'MTN Money',
    shortLabel: 'MT',
    kind: 'mobile_money',
    badgeClass: 'bg-[#FFCC00] text-black',
    panelClass: 'bg-yellow-50 border-yellow-300 text-yellow-900',
  },
  {
    id: 'moov_money',
    name: 'Moov Money',
    shortLabel: 'MV',
    kind: 'mobile_money',
    badgeClass: 'bg-[#0055A5] text-white',
    panelClass: 'bg-blue-50 border-blue-200 text-blue-900',
  },
  {
    id: 'card',
    name: 'Carte bancaire',
    shortLabel: 'CB',
    kind: 'card',
    badgeClass: 'bg-slate-700 text-white',
    panelClass: 'bg-slate-50 border-slate-200 text-slate-900',
  },
];

export function getPaymentMethod(id: string): PaymentMethodConfig {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? PAYMENT_METHODS[0];
}
