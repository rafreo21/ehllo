export type AddressSuggestion = {
  placeId: string;
  description: string;
};

/**
 * Google Places Autocomplete (legacy REST endpoint — simplest to call
 * directly from the client with a restricted API key, no SDK needed).
 * Deliberately unrestricted by `types` so both named venues ("ExCeL
 * London") and plain addresses/postcodes surface, matching how a user
 * would actually search for an event location.
 */
export async function fetchAddressSuggestions(apiKey: string, input: string): Promise<AddressSuggestion[]> {
  const trimmed = input.trim();
  if (!apiKey || trimmed.length < 3) return [];

  const params = new URLSearchParams({ input: trimmed, key: apiKey });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
  if (!response.ok) return [];

  const payload = await response.json() as {
    status?: string;
    predictions?: Array<{ place_id?: string; description?: string }>;
  };
  if (payload.status !== 'OK') return [];

  return (payload.predictions ?? []).flatMap((item) => (
    item.place_id && item.description ? [{ placeId: item.place_id, description: item.description }] : []
  ));
}
