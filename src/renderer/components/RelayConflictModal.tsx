import React from 'react';
import {
  Dialog,
  Button,
  Text,
  Stack,
} from '@chakra-ui/react';

export interface RelayConflictModalProps {
  isOpen: boolean;
  conflictMessage: string;
  onReload: () => void;
  onOverwrite: () => void;
  onCancel: () => void;
}

export const RelayConflictModal: React.FC<RelayConflictModalProps> = ({
  isOpen,
  conflictMessage,
  onReload,
  onOverwrite,
  onCancel,
}) => {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onCancel()} closeOnInteractOutside={false}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>Configuration Conflict</Dialog.Header>
          <Dialog.Body>
            <Stack gap={4}>
              <Text>{conflictMessage}</Text>
              <Stack gap={2} fontSize="sm" color="gray.600">
                <Text>
                  <strong>Reload:</strong> Discard your changes and reload from disk
                </Text>
                <Text>
                  <strong>Overwrite:</strong> Save your changes, replacing external modifications
                </Text>
                <Text>
                  <strong>Cancel:</strong> Abort this operation
                </Text>
              </Stack>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer gap={3}>
            <Button colorScheme="blue" onClick={onReload}>
              Reload
            </Button>
            <Button colorScheme="red" onClick={onOverwrite}>
              Overwrite
            </Button>
            <Button variant="ghost" onClick={onCancel} autoFocus>
              Cancel
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
};
