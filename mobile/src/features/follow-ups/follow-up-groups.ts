import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';

export type FollowUpGroup = {
  id: string;
  personName: string;
  personEmail: string;
  owner: FollowUpItem['owner'];
  encounterTitle: string;
  encounterId: string;
  eventTitle?: string;
  dueAt: string;
  startedAt: string;
  mostRecentAt: string;
  completedAt?: string;
  items: FollowUpItem[];
};

function groupKey(item: FollowUpItem) {
  if (item.groupId?.trim()) {
    const person = item.participantId?.trim() || item.personName.trim().toLowerCase();
    return `${item.encounterId}:${item.groupId.trim()}:${person}:${item.owner}`;
  }
  return `${item.encounterId}:${item.actionId}`;
}

export function groupFollowUpItems(items: FollowUpItem[]): FollowUpGroup[] {
  const groups = new Map<string, FollowUpGroup>();

  for (const item of items) {
    const key = groupKey(item);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      const itemRecentAt = item.statusUpdatedAt || item.startedAt;
      if (itemRecentAt > existing.mostRecentAt) {
        existing.mostRecentAt = itemRecentAt;
      }
      if ((item.completedAt || '') > (existing.completedAt || '')) {
        existing.completedAt = item.completedAt;
      }
      continue;
    }
    groups.set(key, {
      id: key,
      personName: item.personName,
      personEmail: item.personEmail,
      owner: item.owner,
      encounterTitle: item.encounterTitle,
      encounterId: item.encounterId,
      eventTitle: item.eventTitle,
      dueAt: item.dueAt,
      startedAt: item.startedAt,
      mostRecentAt: item.statusUpdatedAt || item.startedAt,
      completedAt: item.completedAt,
      items: [item],
    });
  }

  return Array.from(groups.values());
}
