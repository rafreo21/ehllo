export type GatherPerson = {
  id: string;
  name: string;
  email: string;
  phone: string;
  linkedIn: string;
  exchangeId?: string;
};

export const MAX_GATHER_PEOPLE = 10;

function createId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createGatherPerson(partial?: Partial<GatherPerson>): GatherPerson {
  return {
    id: partial?.id || createId(),
    name: partial?.name?.trim() ?? '',
    email: partial?.email?.trim() ?? '',
    phone: partial?.phone?.trim() ?? '',
    linkedIn: partial?.linkedIn?.trim() ?? '',
    exchangeId: partial?.exchangeId,
  };
}

/** Live form edits - preserves spaces while typing. Trim on save via createGatherPerson. */
export function updateGatherPerson(current: GatherPerson, changes: Partial<GatherPerson>): GatherPerson {
  return {
    ...current,
    ...changes,
    id: changes.id ?? current.id,
    exchangeId: changes.exchangeId !== undefined ? changes.exchangeId : current.exchangeId,
  };
}

export function normalizeGatherPerson(value: Partial<GatherPerson>): GatherPerson {
  return createGatherPerson(value);
}

export function migrateGatherPeople(input: {
  people?: GatherPerson[];
  personName?: string;
  personEmail?: string;
  personPhone?: string;
  personLinkedIn?: string;
  exchangeId?: string;
}): GatherPerson[] {
  if (Array.isArray(input.people) && input.people.length > 0) {
    return input.people.map((person) => normalizeGatherPerson(person)).slice(0, MAX_GATHER_PEOPLE);
  }

  if (input.personName?.trim() || input.exchangeId) {
    return [
      createGatherPerson({
        name: input.personName ?? '',
        email: input.personEmail ?? '',
        phone: input.personPhone ?? '',
        linkedIn: input.personLinkedIn ?? '',
        exchangeId: input.exchangeId || undefined,
      }),
    ];
  }

  return [];
}

export function formatPeopleNames(people: GatherPerson[]) {
  return people.map((person) => person.name.trim()).filter(Boolean).join(', ');
}

export function formatPrimaryContactLine(person: GatherPerson) {
  if (person.email.trim()) return person.email.trim();
  if (person.phone.trim()) return person.phone.trim();
  if (person.linkedIn.trim()) return person.linkedIn.trim();
  return '';
}

export function primaryPersonEmail(people: GatherPerson[]) {
  return people.find((person) => person.email.includes('@'))?.email.trim() ?? '';
}

export function hasValidGatherPeople(people: GatherPerson[]) {
  return people.some((person) => person.name.trim().length >= 2);
}

export function syncLegacyPersonFields(people: GatherPerson[]) {
  const primary = people[0];
  return {
    people,
    personName: formatPeopleNames(people),
    personEmail: primaryPersonEmail(people),
    personPhone: primary?.phone ?? '',
    personLinkedIn: primary?.linkedIn ?? '',
    exchangeId: people.find((person) => person.exchangeId)?.exchangeId ?? '',
    personAcknowledged: hasValidGatherPeople(people),
  };
}

export function personFromConnection(connection: {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}): GatherPerson {
  return createGatherPerson({
    name: connection.name || 'Unknown contact',
    email: connection.email ?? '',
    phone: connection.phone ?? '',
  });
}

export function personFromExchange(exchange: {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone?: string;
}): GatherPerson {
  return createGatherPerson({
    name: exchange.visitor_name || 'Unknown visitor',
    email: exchange.visitor_email ?? '',
    phone: exchange.visitor_phone ?? '',
    exchangeId: exchange.id,
  });
}
