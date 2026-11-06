export const winterCamp = {
  title: 'Winter Camp',
  href: '/camps/winter-camp/',
  image: '/images/winter-camp.jpg',
  email: 'sparkpreneurs.ca@gmail.com',
  ageLabel: 'Ages 4–12',
  hours: '8:00 AM–3:00 PM',
  extraCareHours: 'See camp details',
  address: '3445 Yonge St., Toronto',
  sessions: [
    { id: 'christmas', code: 'WINTER_CHRISTMAS_2026', title: 'Christmas Camp', dates: 'December 21–24, 2026', startDate: '2026-12-21', endDate: '2026-12-24', dayNumbers: ['21', '22', '23', '24'], priceCents: 32000 as number | null, dailyPriceCents: 8500 as number | null, carePriceCents: 2000 as number | null, careDays: ['21', '22', '23'], careHours: '3–5 PM', pickupNote: 'December 24 pickup is at 3 PM.', foodNote: 'Bring lunch and snacks from home.' },
    { id: 'winter-break', code: 'WINTER_BREAK_2026', title: 'Winter Break Camp', dates: 'December 28–31, 2026', startDate: '2026-12-28', endDate: '2026-12-31', dayNumbers: ['28', '29', '30', '31'], priceCents: 32000 as number | null, dailyPriceCents: 8500 as number | null, carePriceCents: 2000 as number | null, careDays: ['28', '29', '30'], careHours: '3–5 PM', pickupNote: 'December 31 pickup is at 3 PM.', foodNote: 'Bring lunch and snacks from home.' },
  ],
  activities: [
    { title: 'Creative crafts', description: 'A little imagination, a hands-on project, and the joy of making something your own.' },
    { title: 'Clay', description: 'Time to get hands-on with clay and explore making in three dimensions.' },
    { title: '3D printing', description: 'Discover another way to create, where ideas take shape through creative technology.' },
  ],
};

// Set confirmed prices and tax here; connect only a verified Winter Camp endpoint.
// Display values are checked again against trusted backend prices before payment.
export const winterCampCheckout = {
  programCode: 'winter_2026_camp',
  endpoint: '',
  stripeMode: 'live',
  taxRatePercent: null as number | null,
  taxIncluded: false,
};

export function winterCampEmail(session?: string) {
  const subject = `Winter Camp Registration${session ? ` — ${session}` : ' — December 2026'}`;
  const body = `Hello SparkPreneurs,\n\nI'd like to ask about registering for ${session || 'Winter Camp'}. Please share pricing and availability.\n\nChild's name:\nChild's age:\nPreferred camp:\nExtra care needed:\n\nThank you!`;
  return `mailto:${winterCamp.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
