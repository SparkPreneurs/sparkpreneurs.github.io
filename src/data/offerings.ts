import type { Offering } from './content-models';
import { winterCamp, winterCampEmail } from './winter-camp';
import { paDayCamp, paDayLabel, paDayEmail } from './pa-day-camp';

const location = 'yonge-studio' as const;
const reviewed = '2026-08-23';

const potteryWheelSources = [
  ['mon-evening', 'POTTERY_WHEEL_MON_EVENING', 'Monday Evenings', 'Monday', '17:30', '19:30', ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']],
  ['fri-daytime', 'POTTERY_WHEEL_TUE_DAYTIME', 'Friday Mornings', 'Friday', '11:00', '13:00', ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04']],
  ['wed-evening', 'POTTERY_WHEEL_WED_EVENING', 'Wednesday Evenings', 'Wednesday', '17:30', '19:30', ['2026-08-12', '2026-08-19', '2026-08-26', '2026-09-02']],
  ['sat-afternoon', 'POTTERY_WHEEL_SAT_AFTERNOON', 'Saturday Afternoons', 'Saturday', '13:00', '15:00', ['2026-08-15', '2026-08-22', '2026-08-29', '2026-09-05']],
] as const;

const handBuildingSources = [
  ['HB4SUN', 'Sunday Mornings', 'Sunday', '10:30', '12:30'],
  ['HB4MON', 'Monday Evenings', 'Monday', '17:30', '19:30'],
  ['HB4WED', 'Wednesday Evenings', 'Wednesday', '17:30', '19:30'],
] as const;

const afterSchoolSources = [
  ['AFTER3', '3 days per week', 7200, 8400],
  ['AFTER4', '4 days per week', 8800, 10400],
  ['AFTER5', '5 days per week', 10000, 12000],
] as const;

export const offerings: Offering[] = [
  ...paDayCamp.dates.map((date): Offering => ({
    id: `pa-day-camp-${date}`, programId: 'pa-day-camp', programCode: null, itemCode: null,
    label: paDayLabel(date), status: 'upcoming', startDate: date, endDate: date, sessionDates: [date],
    dayOfWeek: new Intl.DateTimeFormat('en-CA', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)),
    startTime: '08:00', endTime: '15:00', numberOfSessions: 1, duration: 'One PA day',
    minimumAge: null, maximumAge: null, price: 8500, currency: 'CAD', taxDisplay: 'Confirm applicable tax with the studio',
    displayDataLastSynced: '2026-11-06', includedItems: ['Clay', 'Creative crafts', 'Music'],
    registrationMode: 'inquiry', registrationUrl: paDayEmail, location,
    businessNotes: 'TDSB 2026–27 elementary PA day. Studio confirms camp availability and age suitability. $85 for 8 AM–3 PM or $105 for 8 AM–5 PM, per child per day. Registration by email.',
  })),
  ...winterCamp.sessions.map((session): Offering => ({
    id: `winter-camp-2026-${session.id}`, programId: 'winter-camp', programCode: null, itemCode: null,
    label: session.title, status: 'upcoming', startDate: session.startDate, endDate: session.endDate,
    sessionDates: session.dayNumbers.map(day => `2026-12-${day}`), dayOfWeek: 'Monday–Thursday',
    startTime: '08:00', endTime: '15:00', numberOfSessions: 4, duration: 'Four camp days',
    minimumAge: 4, maximumAge: 12, price: session.priceCents, currency: 'CAD', taxDisplay: 'Before applicable taxes',
    displayDataLastSynced: '2026-11-06', includedItems: ['Creative crafts', 'Clay', '3D printing'],
    registrationMode: 'inquiry', registrationUrl: winterCampEmail(`${session.title}, ${session.dates}`), location,
    businessNotes: `${session.title}: $85/day, $320 per four-day week, extended care ${session.careHours} on December ${session.careDays.join(', ')} at $20/day; one week with all available care $380. ${session.foodNote} ${session.pickupNote} Prices per child, before applicable taxes.`,
  })),
  {
    id: '3d-printing-six-sessions', programId: '3d-printing', programCode: 'august_2026_3d_printing',
    itemCode: 'KIDS_3D_PRINTING_6_SESSION', label: 'Kids 3D Printing - 6 Sessions', status: 'open',
    startDate: null, endDate: null, sessionDates: [], dayOfWeek: 'Monday or Sunday', startTime: null, endTime: null,
    numberOfSessions: 6, duration: '1 hour per session', price: 27000, currency: 'CAD', taxDisplay: 'Tax included',
    displayDataLastSynced: '2026-09-05', registrationMode: 'checkout', location,
    businessNotes: 'Monday time is confirmed by email; dates, exact age group, and capacity are confirmed by SparkPreneurs.',
  },
  ...potteryWheelSources.map(([key, itemCode, label, dayOfWeek, startTime, endTime, dates]): Offering => ({
    id: `pottery-wheel-2026-${key}`, programId: 'pottery-wheel',
    programCode: 'august_september_2026_pottery_wheel', itemCode, label, status: 'ended',
    startDate: dates[0], endDate: dates[dates.length - 1], sessionDates: [...dates], dayOfWeek, startTime, endTime,
    numberOfSessions: 4, duration: '2 hours per session', price: 25000, currency: 'CAD', taxDisplay: null,
    displayDataLastSynced: '2026-10-03', registrationMode: 'checkout', location,
  })),
  ...handBuildingSources.map(([itemCode, label, dayOfWeek, startTime, endTime]): Offering => ({
    id: `hand-building-${itemCode.toLowerCase()}`, programId: 'hand-building-pottery',
    programCode: 'adult_hand_building_pottery', itemCode, label, status: 'open',
    startDate: null, endDate: null, sessionDates: [], dayOfWeek, startTime, endTime,
    numberOfSessions: 4, duration: '2 hours per session', price: 19500, currency: 'CAD', taxDisplay: '+ HST',
    displayDataLastSynced: reviewed, discountLabel: 'Limited-time offer; deadline requires confirmation',
    originalPrice: 24000, registrationMode: 'checkout', location,
    businessNotes: 'Exact session dates and promotion deadline require business confirmation.',
  })),
  {
    id: 'summer-camp-2026', programId: 'summer-camp', programCode: null, itemCode: null,
    label: 'Summer Camp 2026', status: 'ended', startDate: '2026-07-06', endDate: '2026-08-28', sessionDates: [],
    dayOfWeek: 'Monday-Friday', startTime: '10:00', endTime: '15:00', numberOfSessions: null,
    duration: 'Eight themed weeks with morning, afternoon, and full-day options', minimumAge: 4, maximumAge: 10,
    price: null, currency: 'CAD', taxDisplay: '+ HST', displayDataLastSynced: reviewed,
    registrationMode: 'interest', location,
    businessNotes: 'Historical promotional prices must not be reused for a future season.',
  },
  ...afterSchoolSources.map(([itemCode, label, price, originalPrice]): Offering => ({
    id: `after-school-${itemCode.toLowerCase()}`, programId: 'after-school', programCode: 'after_school_program',
    itemCode, label, status: 'open', startDate: null, endDate: null, sessionDates: [], dayOfWeek: 'Weekdays',
    startTime: '15:00', endTime: '17:00', numberOfSessions: null, duration: 'Four-week minimum',
    price, currency: 'CAD', taxDisplay: 'Per week + HST', displayDataLastSynced: reviewed,
    discountLabel: 'Early-bird deadline requires confirmation', originalPrice, registrationMode: 'checkout', location,
    businessNotes: 'Enrollment dates, eligible ages/grades, schools, and early-bird deadline require confirmation.',
  })),
  ...[
    ['ZUMBA_SINGLE', 'Single Session', 1, 3500, undefined],
    ['ZUMBA_4', '4-Session Pass', 4, 12000, 14000],
    ['ZUMBA_8', '8-Session Pass', 8, 19000, 28000],
  ].map(([itemCode, label, numberOfSessions, price, originalPrice]): Offering => ({
    id: `zumba-${String(itemCode).toLowerCase()}`, programId: 'zumba',
    programCode: 'august_september_2026_zumba', itemCode: String(itemCode), label: String(label), status: 'open',
    startDate: '2026-08-19', endDate: '2026-09-19', sessionDates: [], dayOfWeek: 'Tuesday-Saturday',
    startTime: null, endTime: null, numberOfSessions: Number(numberOfSessions), duration: '1 hour per session',
    price: Number(price), currency: 'CAD', taxDisplay: '+ HST', displayDataLastSynced: '2026-09-05',
    discountLabel: originalPrice ? 'Summer promotion' : undefined,
    originalPrice: originalPrice ? Number(originalPrice) : undefined, registrationMode: 'checkout', location,
  })),
  {
    id: 'kids-workshops-interest', programId: 'kids-workshops', programCode: null, itemCode: null,
    label: 'Future workshop interest', status: 'open', startDate: null, endDate: null, sessionDates: [],
    dayOfWeek: null, startTime: null, endTime: null, numberOfSessions: null, duration: 'Short workshop',
    price: null, currency: 'CAD', taxDisplay: null, displayDataLastSynced: reviewed,
    registrationMode: 'interest', registrationUrl: 'mailto:sparkpreneurs.ca@gmail.com?subject=Workshop%20Interest', location,
  },
];

export const getOfferingsForProgram = (programId: string) =>
  offerings.filter((offering) => offering.programId === programId);

export const getOfferingById = (id: string) => offerings.find((offering) => offering.id === id);
