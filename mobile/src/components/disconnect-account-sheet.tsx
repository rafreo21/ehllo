import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';

type DisconnectAccountSheetProps = {
  visible: boolean;
  providerName: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function DisconnectAccountSheet({
  visible,
  providerName,
  onCancel,
  onConfirm,
  loading,
}: DisconnectAccountSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      title="Are you sure you want to disconnect?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onPress={onCancel} disabled={loading}>Keep connected</Button>
          <Button onPress={onConfirm} loading={loading}>Yes, disconnect</Button>
        </>
      }>
      <Body>
        ehllo will lose access to {providerName} until you reconnect. Approved drafts already sent and existing ehllo data are not affected.
      </Body>
    </BottomSheet>
  );
}
