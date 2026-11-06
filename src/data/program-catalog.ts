import type { Activity, Audience, Program, ProgramFormat } from './content-models';
import { offerings, getOfferingsForProgram } from './offerings';
import { programs } from './programs';

export type ListingAvailability = 'registration' | 'interest-list' | 'seasonal' | 'check-schedule' | 'ended';
export type ListingStatusTone = 'open' | 'interest' | 'seasonal' | 'check' | 'ended';

export interface ProgramCardRecord {
  id: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  audience: Audience;
  audienceLabel: string;
  activity: Activity;
  activityLabel: string;
  format: ProgramFormat;
  formatLabel: string;
  availability: ListingAvailability;
  status: string;
  statusTone: ListingStatusTone;
  href: string;
  action: string;
  external?: boolean;
}

const audienceLabels: Record<Audience, string> = {
  'kids-youth': 'Kids & Youth', adults: 'Adults', 'all-ages': 'All ages', unspecified: 'Audience to be confirmed',
};
const activityLabels: Record<Activity, string> = {
  'art-mixed-media': 'Creative Mix', pottery: 'Pottery', 'creative-technology': 'Creative Technology', 'wellness-movement': 'Wellness',
};
const formatLabels: Record<ProgramFormat, string> = {
  class: 'Class', workshop: 'Short workshop', camp: 'Camp', 'after-school': 'After School', 'seasonal-pass': 'Session or seasonal pass',
};

const assertCatalogIntegrity = () => {
  const programIds = new Set<string>();
  const offeringIds = new Set<string>();

  for (const program of programs) {
    if (programIds.has(program.id)) throw new Error(`Duplicate program id: ${program.id}`);
    if (!program.canonicalPath.startsWith('/') || !program.canonicalPath.endsWith('/')) {
      throw new Error(`Program ${program.id} must use a root-relative canonical path with a trailing slash.`);
    }
    programIds.add(program.id);
  }

  for (const program of programs) {
    for (const relatedId of program.relatedPrograms ?? []) {
      if (!programIds.has(relatedId)) throw new Error(`Program ${program.id} references unknown related program ${relatedId}.`);
    }
  }

  for (const offering of offerings) {
    if (offeringIds.has(offering.id)) throw new Error(`Duplicate offering id: ${offering.id}`);
    if (!programIds.has(offering.programId)) throw new Error(`Offering ${offering.id} references unknown program ${offering.programId}.`);
    if (offering.price !== null && offering.price < 0) throw new Error(`Offering ${offering.id} has a negative display price.`);
    offeringIds.add(offering.id);
  }
};

assertCatalogIntegrity();

const listingState = (program: Program): Pick<ProgramCardRecord, 'availability' | 'status' | 'statusTone' | 'action'> => {
  const instances = getOfferingsForProgram(program.id);
  const open = instances.find((offering) => offering.status === 'open');
  if (open?.registrationMode === 'checkout' || open?.registrationMode === 'external') {
    return { availability: 'registration', status: 'Registration available', statusTone: 'open', action: 'View current registration' };
  }
  if (open?.registrationMode === 'interest' || program.availabilityMode === 'interest') {
    return { availability: 'interest-list', status: 'Join the interest list', statusTone: 'interest', action: 'Explore workshops' };
  }
  if (instances.some((offering) => offering.status === 'upcoming')) {
    return { availability: 'seasonal', status: 'Upcoming', statusTone: 'seasonal', action: 'View upcoming details' };
  }
  if (instances.length > 0 && instances.every((offering) => offering.status === 'ended' || offering.status === 'cancelled')) {
    return { availability: 'ended', status: 'Current offering ended', statusTone: 'ended', action: 'View program status' };
  }
  if (program.availabilityMode === 'paused') {
    return { availability: 'ended', status: 'Not currently open', statusTone: 'ended', action: 'View program status' };
  }
  return { availability: 'check-schedule', status: 'Check current schedule', statusTone: 'check', action: 'Check current schedule' };
};

const cardHref = (program: Program) =>
  program.publicationStatus === 'published' ? program.canonicalPath : (program.legacyUrl ?? program.canonicalPath);

export const toProgramCard = (program: Program): ProgramCardRecord => {
  const href = cardHref(program);
  return {
    id: program.id, title: program.title, description: program.shortDescription,
    image: program.primaryImage.src, alt: program.primaryImage.alt,
    audience: program.primaryAudience, audienceLabel: audienceLabels[program.primaryAudience],
    activity: program.primaryActivity, activityLabel: activityLabels[program.primaryActivity],
    format: program.format, formatLabel: formatLabels[program.format],
    ...listingState(program), href, external: /^https?:\/\//.test(href),
  };
};

// Keep Summer Camp's page and data for its next season, but hide it from listings for now.
const visiblePrograms = programs.filter(program => program.id !== 'summer-camp');
export const programCards = visiblePrograms.map(toProgramCard);
export const kidsYouthProgramCards = programCards.filter((program) => program.audience === 'kids-youth');
export const adultProgramCards = programCards.filter((program) => program.audience === 'adults');

export const programCatalog = visiblePrograms.map((program) => ({
  program,
  offerings: offerings.filter((offering) => offering.programId === program.id),
}));
