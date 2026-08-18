import { Fields, getContactsAsync, requestPermissionsAsync } from 'expo-contacts/legacy';

export type DeviceContactMatch = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

// Fetches once, lets the caller filter per keystroke - a permission prompt
// and a full address-book read on every character typed would be too slow
// and too intrusive.
export async function fetchDeviceContacts(): Promise<DeviceContactMatch[]> {
  const permission = await requestPermissionsAsync();
  if (permission.status !== 'granted') return [];

  const { data } = await getContactsAsync({
    fields: [Fields.Name, Fields.Emails, Fields.PhoneNumbers],
  });

  return data.flatMap((contact) => {
    const name = contact.name?.trim();
    const email = contact.emails?.[0]?.email?.trim() || '';
    const phone = contact.phoneNumbers?.[0]?.number?.trim() || '';
    if (!name || (!email && !phone)) return [];
    return [{ id: contact.id || `${name}-${email}`, name, email, phone }];
  });
}

export function filterDeviceContacts(contacts: DeviceContactMatch[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return contacts
    .filter((contact) => (
      contact.name.toLowerCase().includes(needle)
      || contact.email.toLowerCase().includes(needle)
      || contact.phone.toLowerCase().includes(needle)
    ))
    .slice(0, 20);
}
