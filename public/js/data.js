// Genus Coffee — catalog + copy defaults.
// These 5 lots double as (a) the demo catalog when Firestore is empty/unconfigured,
// and (b) the seed data pushed by scripts/seed-products.js.
// Prices are whole RON (lei), the currency of the Bucureşti roaster.

export const CURRENCY = 'ron';        // Stripe currency code
export const CURRENCY_LABEL = 'lei';

export function formatMoney(amount) {
  return new Intl.NumberFormat('ro-RO').format(amount) + ' ' + CURRENCY_LABEL;
}

// `stripeLink`: paste each bag's Stripe Payment Link URL (SETUP.md → Payments).
// Empty = "Buy" shows a "not connected yet" notice instead of opening Stripe.
export const PRODUCTS = [
  {
    id: 'el-triunfo', origin: 'colombia', originLabel: 'Colombia · Huila', name: 'El Triunfo',
    region: '1750m · Washed', notes: 'Black tea, blackberry, chocolate', price: 79,
    image: 'assets/reference/packaging-colombia.jpg', weight: '250g', roast: 'Omniroast', stripeLink: '',
  },
  {
    id: 'el-cerro', origin: 'costarica', originLabel: 'Costa Rica · West Valley', name: 'El Cerro',
    region: '1200–1900m · Yellow honey', notes: 'Caramel, panela, baked apple', price: 85,
    image: 'assets/reference/packaging-costarica.jpg', weight: '250g', roast: 'Omniroast', stripeLink: '',
  },
  {
    id: 'guji-uraga', origin: 'ethiopia', originLabel: 'Ethiopia · Guji', name: 'Guji Uraga',
    region: '1900–2300m · Anaerobic natural', notes: 'Tropical fruit, citrus, intense sweetness', price: 89,
    image: 'assets/reference/packaging-ethiopia.jpg', weight: '250g', roast: 'Omniroast', stripeLink: '',
  },
  {
    id: 'masai-aa-top', origin: 'kenya', originLabel: 'Kenya · Mount Kenya', name: 'Masai AA Top',
    region: '1500–2100m · Washed', notes: 'Blackcurrant, tropical fruit, clementine', price: 95,
    image: 'assets/reference/packaging-kenya.jpg', weight: '250g', roast: 'Omniroast', stripeLink: '',
  },
  {
    id: 'simbi-kinazi', origin: 'rwanda', originLabel: 'Rwanda · Huye', name: 'Simbi Kinazi',
    region: '1700–2000m · Honey', notes: 'Red fruit, cinnamon, white chocolate', price: 85,
    image: 'assets/reference/packaging-blank-rwanda.jpg', weight: '250g', roast: 'Omniroast', stripeLink: '',
  },
];

// Featured on the home page (single origin, right now)
export const FEATURED_IDS = ['guji-uraga', 'el-cerro', 'masai-aa-top'];

export const ORIGIN_FILTERS = ['All', 'Colombia', 'Costa Rica', 'Ethiopia', 'Kenya', 'Rwanda'];

// Event booking packages (coffee cart hire)
export const PACKAGES = [
  {
    key: 'wedding', icon: 'heart', title: 'Wedding',
    description: 'Full cart service for up to 150 guests.',
    details: ['3hr service', 'Barista + assistant', 'Custom menu card'], price: 'from 3.200 lei',
  },
  {
    key: 'corporate', icon: 'briefcase', title: 'Corporate',
    description: 'Half-day office or offsite pop-up.',
    details: ['2hr service', 'Up to 80 guests'], price: 'from 1.900 lei',
  },
  {
    key: 'popup', icon: 'store', title: 'Pop-up',
    description: 'A one-off appearance for markets or brand activations.',
    details: ['Flexible hours', 'Branded cart wrap available'], price: 'from 2.100 lei',
  },
];

export const FAQ = [
  { q: 'How far do you travel?', a: 'Up to 40km from Bucureşti at no extra cost — further by arrangement.' },
  { q: 'How many guests can the cart serve?', a: 'Comfortably up to 150 guests across a 3-hour service window.' },
  { q: 'Do you offer decaf or non-dairy milk?', a: 'Yes, on every package at no extra charge.' },
];
