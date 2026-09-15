import type { Recording } from '../types/recording'

export const demoRecording: Recording = {
  schemaVersion: 1,
  id: 'demo-checkout-flow',
  title: 'Checkout flow exploration',
  duration: 24000,
  createdAt: '2026-09-15T04:42:00.000Z',
  events: [
    { id: 'page-opened', timestamp: 0, kind: 'click', icon: 'OPEN', label: 'Page opened', description: 'Loaded the checkout page', category: 'Navigation', target: 'https://rewind.demo/checkout', snapshot: { selectedSize: '10', promoCode: '', bagCount: 2, message: 'Ready to explore' } },
    { id: 'size-selected', timestamp: 5200, kind: 'click', icon: 'CLICK', label: 'Selected size 10', description: 'Clicked size 10', category: 'Pointer interaction', target: 'button[data-size="10"]', snapshot: { selectedSize: '10', promoCode: '', bagCount: 2, message: 'Size 10 selected' } },
    { id: 'promo-entered', timestamp: 11200, kind: 'type', icon: 'TYPE', label: 'Entered promo code', description: 'Captured 8 characters', category: 'Text input', target: 'input[name="promo-code"]', value: 'REWIND10', snapshot: { selectedSize: '10', promoCode: 'REWIND10', bagCount: 2, message: 'Promo code applied' } },
    { id: 'bag-added', timestamp: 17800, kind: 'click', icon: 'BAG', label: 'Added item to bag', description: 'Added Everyday Runner, size 10', category: 'Pointer interaction', target: 'button[data-action="add-to-bag"]', snapshot: { selectedSize: '10', promoCode: 'REWIND10', bagCount: 3, message: 'Everyday Runner added to bag' } },
  ],
}
