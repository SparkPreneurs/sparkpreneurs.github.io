// Dates: TDSB 2026–27 elementary calendar. Camp availability is confirmed by the studio.
// Prices and activities: Design System/pa-day.jpg. The poster does not specify ages or tax treatment.
export const paDayCamp = {
  title: 'PA Day Camp',
  href: '/camps/pa-day-camp/',
  image: '/images/pa-day-camp-hero.png',
  email: 'sparkpreneurs.ca@gmail.com',
  address: '3445 Yonge St., Toronto',
  schoolYear: '2026–27',
  calendarUrl: 'https://schoolweb.tdsb.on.ca/davidlewis/School-Calendar/5-Day-Cycle-Calendar',
  boardCalendarUrl: 'https://www.tdsb.on.ca/About-Us/School-Year-Calendar',
  dates: ['2026-11-20', '2027-01-15', '2027-02-12', '2027-06-04', '2027-06-30'],
  options: [
    { id: 'standard', label: 'Camp day', hours: '8:00 AM–3:00 PM', priceCents: 8500 },
    { id: 'extended', label: 'Camp + extended care', hours: '8:00 AM–5:00 PM', priceCents: 10500 },
  ],
  activities: [
    { title: 'Shape something.', description: 'Get hands-on with clay and turn a little imagination into something tangible.' },
    { title: 'Make it colourful.', description: 'Explore creative crafts, colours, and ideas through playful making.' },
    { title: 'Find your rhythm.', description: 'Make music and discover the joy of creating sounds together.' },
  ],
};

export const paDayLabel = (date: string) => new Intl.DateTimeFormat('en-CA', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T12:00:00Z`));

export const paDayEmail = `mailto:${paDayCamp.email}?subject=${encodeURIComponent('PA Day Camp Registration')}`;
