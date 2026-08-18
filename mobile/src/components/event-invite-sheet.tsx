import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/bottom-sheet';
import { Button } from '@/components/ui';
import type { EventInvitation, EventItem } from '@/features/events/events-api';
import { colors, radius, spacing, fonts } from '@/theme/tokens';

export type InvitablePerson = { id: string; name: string; email: string };

export function EventInviteSheet({
  event,
  loading,
  invitationsLoading,
  invitations,
  connections,
  revokingInvitationId,
  error,
  onClose,
  onInvite,
  onRevoke,
}: {
  event: EventItem | null;
  loading: boolean;
  invitationsLoading: boolean;
  invitations: EventInvitation[];
  /**
   * People you have already met. Deliberately a minimal shape rather than a whole
   * connection record: this sheet needs a name and an address, and taking more
   * would tie it to whichever screen happens to own the fuller type.
   */
  connections: InvitablePerson[];
  revokingInvitationId: string;
  error: string;
  onClose: () => void;
  onInvite: (email: string) => void;
  onRevoke: (invitation: EventInvitation) => void;
}) {
  const [email, setEmail] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [showAllInvited, setShowAllInvited] = useState(false);
  const [invitedQuery, setInvitedQuery] = useState('');

  // Anyone already invited is not offered again - re-inviting the same address
  // upserts the same row and reads as though nothing happened.
  const invitedEmails = new Set(
    invitations
      .filter((invitation) => invitation.status !== 'revoked')
      .map((invitation) => invitation.email.trim().toLowerCase()),
  );
  const invitable = connections.filter((person) => {
    const address = (person.email || '').trim().toLowerCase();
    if (!address || invitedEmails.has(address)) return false;
    if (!peopleQuery.trim()) return true;
    const needle = peopleQuery.trim().toLowerCase();
    return person.name.toLowerCase().includes(needle) || address.includes(needle);
  });

  const visibleInvitations = showAllInvited
    ? invitations.filter((invitation) => !invitedQuery.trim()
      || invitation.email.toLowerCase().includes(invitedQuery.trim().toLowerCase()))
    : invitations.slice(0, 2);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <BottomSheet visible={Boolean(event)} title="Invite someone" onClose={onClose}>
      <View style={styles.copy}>
        <Text style={styles.eventTitle}>{event?.title}</Text>
        <Text style={styles.hint}>They can view the event and RSVP without creating an account. If they sign up later, this same event and response move with them.</Text>
      </View>
      <TextInput
        accessibilityLabel="Guest email address"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="guest@example.com"
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button disabled={!valid || loading} loading={loading} onPress={() => onInvite(email.trim().toLowerCase())}>
        Send invitation
      </Button>
      <Text style={styles.privacy}>Their RSVP is private. Your captures, recordings and notes stay private too.</Text>

      {/* Invite by picking someone you have met, rather than retyping an address
          you already hold. Typing one stays above for anyone not in the list. */}
      {invitable.length ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.listTitle}>Invite someone you have met</Text>
          {connections.length > 4 ? (
            <TextInput
              value={peopleQuery}
              onChangeText={setPeopleQuery}
              placeholder="Search your people"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          ) : null}
          {invitable.slice(0, 4).map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={`Invite ${person.name}`}
              disabled={loading}
              onPress={() => onInvite((person.email || '').trim().toLowerCase())}
              style={({ pressed }) => [styles.personRow, pressed && styles.personRowPressed]}>
              <View style={styles.personCopy}>
                <Text style={styles.email} numberOfLines={1}>{person.name}</Text>
                <Text style={styles.status} numberOfLines={1}>{person.email}</Text>
              </View>
              <Text style={styles.inviteAction}>Invite</Text>
            </Pressable>
          ))}
          {invitable.length > 4 ? (
            <Text style={styles.empty}>
              {invitable.length - 4} more. Search to narrow the list.
            </Text>
          ) : null}
        </>
      ) : null}

      <View style={styles.divider} />
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Invited guests</Text>
        {invitationsLoading ? <ActivityIndicator size="small" color={colors.ink} /> : null}
      </View>
      {!invitationsLoading && invitations.length === 0 ? (
        <Text style={styles.empty}>No invitations sent yet.</Text>
      ) : null}
      {/* Two at most until asked. A long guest list buries the invite field that
          most people came here to use. */}
      {invitations.length > 2 ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAllInvited((value) => !value)}>
          <Text style={styles.inviteAction}>
            {showAllInvited ? 'Show fewer' : `View all ${invitations.length}`}
          </Text>
        </Pressable>
      ) : null}
      {showAllInvited && invitations.length > 2 ? (
        <TextInput
          value={invitedQuery}
          onChangeText={setInvitedQuery}
          placeholder="Search invited guests"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      ) : null}
      {visibleInvitations.map((invitation) => {
        const canRevoke = invitation.status !== 'revoked' && !invitation.claimedAt;
        const rsvpStatus = invitation.claimedAt
          ? 'Joined ehllo'
          : invitation.status === 'not_going'
            ? 'Not going'
            : invitation.status === 'going'
              ? 'Going'
              : invitation.status === 'revoked'
                ? 'Revoked'
                : 'Awaiting response';
        const deliveryStatus = invitation.deliveryStatus === 'failed'
          ? 'Email failed. Retry scheduled'
          : invitation.deliveryStatus === 'pending' || invitation.deliveryStatus === 'processing'
            ? 'Email queued'
            : invitation.deliveryStatus === 'sent'
              ? 'Email delivered to provider'
              : '';
        return (
          <View key={invitation.id} style={styles.invitationRow}>
            <View style={styles.invitationCopy}>
              <Text style={styles.email} numberOfLines={1}>{invitation.email}</Text>
              <Text style={styles.status}>{rsvpStatus}{deliveryStatus ? ` · ${deliveryStatus}` : ''}</Text>
            </View>
            {canRevoke ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Revoke invitation for ${invitation.email}`}
                disabled={Boolean(revokingInvitationId)}
                onPress={() => onRevoke(invitation)}
                style={styles.revokeButton}>
                {revokingInvitationId === invitation.id
                  ? <ActivityIndicator size="small" color={colors.danger} />
                  : <Text style={styles.revokeText}>Revoke</Text>}
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  personRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    paddingVertical: spacing.x2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line },
  personRowPressed: { opacity: 0.7 },
  personCopy: { flex: 1, gap: 2 },
  inviteAction: { color: colors.link, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
  copy: { gap: spacing.x2 },
  eventTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.bold, fontWeight: '800' },
  hint: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  // fontSize is required, not optional. A TextInput carrying a custom
  // fontFamily with no explicit size renders Cereal with broken metrics on
  // iOS - every glyph spaced out, as if letterSpacing had been set. Text
  // components with the same family are fine; only TextInput is affected,
  // which is why it only showed up on fields.
  input: { fontFamily: fonts.regular, fontSize: 15, minHeight: 52, paddingHorizontal: spacing.x4, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, color: colors.ink, backgroundColor: colors.canvas },
  error: { color: colors.danger, fontSize: 13, fontFamily: fonts.medium, fontWeight: '700' },
  privacy: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.line },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.bold, fontWeight: '800' },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14 },
  invitationRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.x3, paddingVertical: spacing.x2, borderBottomWidth: 1, borderBottomColor: colors.line },
  invitationCopy: { flex: 1, gap: 2 },
  email: { color: colors.ink, fontSize: 14, fontFamily: fonts.medium, fontWeight: '700' },
  status: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold, fontWeight: '600' },
  revokeButton: { minHeight: 44, minWidth: 68, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.x3 },
  revokeText: { color: colors.danger, fontSize: 13, fontFamily: fonts.bold, fontWeight: '800' },
});
