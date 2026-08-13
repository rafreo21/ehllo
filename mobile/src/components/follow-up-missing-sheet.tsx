import { BottomSheet } from '@/components/bottom-sheet';
import { Button, Body } from '@/components/ui';
import { methodDisplayName } from '@/features/follow-ups/channel-methods';
import type { FollowUpExecution } from '@/features/follow-ups/follow-up-executor';

type FollowUpMissingSheetProps = {
  visible: boolean;
  execution: FollowUpExecution | null;
  loading?: boolean;
  onClose: () => void;
  onRequest?: () => void;
  onDraftEmail?: () => void;
};

function missingMethodLabel(execution: Extract<FollowUpExecution, { type: 'request' }>) {
  if (execution.methodType === 'preferred_contact') return 'a contact method';
  return methodDisplayName(execution.methodType);
}

function buildSummary(execution: FollowUpExecution) {
  if (execution.type === 'manual') {
    return execution.message;
  }

  if (execution.type !== 'request') return '';

  const hasEmail = execution.recipientEmail.includes('@');
  const methodLabel = missingMethodLabel(execution);

  if (hasEmail) {
    return `${execution.message} We can notify them in ehllo, or open your mail app with a draft asking for ${methodLabel}.`;
  }

  return `${execution.message} We can notify them in ehllo so they can add ${methodLabel} to their card.`;
}

export function FollowUpMissingSheet({
  visible,
  execution,
  loading,
  onClose,
  onRequest,
  onDraftEmail,
}: FollowUpMissingSheetProps) {
  if (!execution || execution.type === 'open') return null;

  const hasEmail = execution.type === 'request' && execution.recipientEmail.includes('@');
  const summary = buildSummary(execution);

  return (
    <BottomSheet visible={visible} title="Contact info needed" onClose={onClose}>
      <Body>{summary}</Body>

      {execution.type === 'request' ? (
        <Button loading={loading} onPress={onRequest}>
          Request via ehllo
        </Button>
      ) : null}

      {hasEmail ? (
        <Button
          variant="secondary"
          loading={loading}
          onPress={onDraftEmail}>
          Use default mail app instead
        </Button>
      ) : null}

      <Button variant="ghost" onPress={onClose}>Not now</Button>
    </BottomSheet>
  );
}
