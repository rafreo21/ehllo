import type { FollowUpItem } from '@/features/follow-ups/follow-up-api';
import { groupFollowUpItems, type FollowUpGroup } from '@/features/follow-ups/follow-up-groups';
import { sortFollowUps } from '@/lib/due-date';

export type FollowUpScope = 'current' | 'past';
export type FollowUpSort = 'urgency' | 'recent' | 'az';

export function isOpenFollowUp(item: FollowUpItem) {
  return !['completed', 'dismissed', 'cancelled'].includes(item.status);
}

export function isPastFollowUp(item: FollowUpItem) {
  return ['completed', 'dismissed', 'cancelled'].includes(item.status);
}

export function filterFollowUpsByScope(items: FollowUpItem[], scope: FollowUpScope) {
  return items.filter((item) => (scope === 'past' ? isPastFollowUp(item) : isOpenFollowUp(item)));
}

export function filterFollowUpGroups(groups: FollowUpGroup[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;

  return groups.filter((group) => (
    group.personName.toLowerCase().includes(needle)
    || group.personEmail.toLowerCase().includes(needle)
    || group.encounterTitle.toLowerCase().includes(needle)
    || group.items.some((item) => (
      item.title.toLowerCase().includes(needle)
      || item.channel.toLowerCase().includes(needle)
    ))
  ));
}

export function sortFollowUpGroups(groups: FollowUpGroup[], sort: FollowUpSort) {
  const next = [...groups];
  if (sort === 'az') {
    next.sort((left, right) => left.personName.localeCompare(right.personName, undefined, { sensitivity: 'base' }));
    return next;
  }
  if (sort === 'recent') {
    next.sort((left, right) => (
      (right.completedAt || right.mostRecentAt).localeCompare(left.completedAt || left.mostRecentAt)
    ));
    return next;
  }
  const flattened = sortFollowUps(next.flatMap((group) => group.items));
  const order = new Map(flattened.map((item, index) => [`${item.encounterId}:${item.actionId}`, index]));
  next.sort((left, right) => {
    const leftKey = `${left.items[0]?.encounterId}:${left.items[0]?.actionId}`;
    const rightKey = `${right.items[0]?.encounterId}:${right.items[0]?.actionId}`;
    return (order.get(leftKey) ?? 9999) - (order.get(rightKey) ?? 9999);
  });
  return next;
}

export function buildFollowUpGroups(items: FollowUpItem[], scope: FollowUpScope) {
  return groupFollowUpItems(filterFollowUpsByScope(items, scope));
}
