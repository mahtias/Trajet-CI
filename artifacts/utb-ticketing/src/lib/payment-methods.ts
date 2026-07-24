export type PaymentMethodId = 'wave' | 'orange_money' | 'mtn_money';

export interface PaymentMethodConfig {
  id: PaymentMethodId;
  name: string;
  /** Solid badge (e.g. selected state, ticket display) */
  badgeClass: string;
  /** Soft background used for the selected card / confirmation panel */
  panelClass: string;
}

/** Priority order: Wave (most used in CI today), Orange Money, MTN Money. */
export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: 'wave',
    name: 'Wave',
    badgeClass: 'bg-[#1DC8CD] text-white',
    panelClass: 'bg-[#1DC8CD]/10 border-[#1DC8CD]/30 text-[#0e7478]',
  },
  {
    id: 'orange_money',
    name: 'Orange Money',
    badgeClass: 'bg-[#FF7900] text-white',
    panelClass: 'bg-orange-50 border-orange-200 text-orange-900',
  },
  {
    id: 'mtn_money',
    name: 'MTN Money',
    badgeClass: 'bg-[#FFCC00] text-black',
    panelClass: 'bg-yellow-50 border-yellow-300 text-yellow-900',
  },
];

export function getPaymentMethod(id: string): PaymentMethodConfig {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? PAYMENT_METHODS[0];
}
