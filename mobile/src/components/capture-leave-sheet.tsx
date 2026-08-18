import { BottomSheet } from '@/components/bottom-sheet';
import { Body, Button } from '@/components/ui';

type CaptureLeaveSheetProps = {
  visible: boolean;
  onStay: () => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
};

export function CaptureLeaveSheet({ visible, onStay, onSaveDraft, onDiscard }: CaptureLeaveSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      title="Leave capture?"
      onClose={onStay}
      footer={
        <>
          <Button onPress={onSaveDraft}>Save to drafts</Button>
          <Button variant="secondary" onPress={onStay}>Keep capturing</Button>
          <Button variant="secondary" onPress={onDiscard}>Leave and discard</Button>
        </>
      }>
      <Body>
        Save to drafts to pick this up later from Capture. Discard clears this session: recording, transcript, people, and notes.
      </Body>
    </BottomSheet>
  );
}
