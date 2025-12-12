# RelayConflictModal Component Contract

## Target File
`src/renderer/components/RelayConflictModal.tsx`

## Objective
Modal dialog for handling relay config file conflicts when external modifications detected.

## Dependencies

```typescript
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Text,
} from '@chakra-ui/react';
```

## Component: RelayConflictModal

CONTRACT:
  Inputs (Props):
    - isOpen: boolean, whether modal is visible
    - conflictMessage: string, description of the conflict
      Example: "The relay configuration file was modified externally. Choose an action:"
    - onReload: () => void, callback for "Reload" action
    - onOverwrite: () => void, callback for "Overwrite" action
    - onCancel: () => void, callback for "Cancel" action

  Outputs:
    - React Modal component with three action buttons

  Invariants:
    - Modal is controlled (open/close via isOpen prop)
    - Exactly three buttons: Reload | Overwrite | Cancel
    - Button order left-to-right: Reload, Overwrite, Cancel
    - Modal blocks interaction with underlying UI (modal overlay)
    - Pressing Escape or clicking overlay triggers onCancel

  Properties:
    - Non-destructive default: Cancel button is default focus
    - Clear labeling: buttons clearly describe their action
    - Accessibility: modal properly labeled, keyboard navigable

  Algorithm (Render):
    1. Render Modal with isOpen={isOpen}, onClose={onCancel}
    2. ModalOverlay for backdrop
    3. ModalContent with:
       a. ModalHeader: "Configuration Conflict"
       b. ModalBody:
          - Text explaining conflict (conflictMessage prop)
          - Text explaining each option:
            * Reload: Discard your changes and reload from disk
            * Overwrite: Save your changes, replacing external modifications
            * Cancel: Abort this operation
       c. ModalFooter with three buttons:
          - Button "Reload" (colorScheme="blue", onClick=onReload)
          - Button "Overwrite" (colorScheme="red", onClick=onOverwrite)
          - Button "Cancel" (variant="ghost", onClick=onCancel)

  Algorithm (User Actions):
    - Click "Reload":
      1. Call onReload prop
      2. Parent component reloads config from disk (discards in-memory changes)
      3. Parent closes modal

    - Click "Overwrite":
      1. Call onOverwrite prop
      2. Parent component retries save, forcing overwrite
      3. Parent closes modal

    - Click "Cancel" or press Escape:
      1. Call onCancel prop
      2. Parent component aborts current operation
      3. Parent closes modal

## Button Semantics

**Reload** (Blue, non-destructive):
- Action: Discard in-memory relay changes, reload fresh config from filesystem
- Effect: User's pending changes are lost, but external changes are preserved
- Use case: User wants to see and accept external modifications

**Overwrite** (Red, destructive):
- Action: Force save current in-memory relay config, replacing file content
- Effect: External changes are lost, user's pending changes are saved
- Use case: User is confident their changes should take precedence

**Cancel** (Ghost, abort):
- Action: Abort the current save operation, keep UI as-is
- Effect: No changes to file, user can review and decide later
- Use case: User wants to investigate conflict or save elsewhere

## Modal Styling

- Size: "md" (medium modal, not full-screen)
- Close button: No "X" button (force explicit choice)
- Backdrop: Semi-transparent, blocks clicks (closeOnOverlayClick=false)
- Focus: Cancel button receives initial focus (safest default)

## Testing Requirements

- Property-based tests:
  - Property: onReload called when "Reload" clicked
  - Property: onOverwrite called when "Overwrite" clicked
  - Property: onCancel called when "Cancel" clicked or Escape pressed
  - Property: modal renders when isOpen=true, hidden when isOpen=false
  - Property: all three buttons are present and clickable

- Integration test:
  - Simulate conflict: modify file externally, attempt save in UI
  - Verify modal appears with conflictMessage
  - Click each button, verify correct callback invoked

## Integration Points

- Parent component (MainUI or relay config manager) controls isOpen state
- Parent detects conflict from RelayConfigResult returned by IPC set() call
- Parent provides callbacks that:
  - onReload: call window.api.nostling.relays.reload(identityId), update state
  - onOverwrite: retry window.api.nostling.relays.set() with force flag (if implemented)
  - onCancel: close modal, leave state unchanged

## Error Handling

- If onReload fails: parent shows error toast, keeps modal open
- If onOverwrite fails: parent shows error toast, keeps modal open
- Modal itself has no internal error state (stateless)

## Accessibility

- Modal properly labeled with aria-labelledby pointing to header
- Buttons have clear text labels (no icons-only)
- Keyboard navigation: Tab cycles through buttons, Enter activates focused button
- Screen reader announces modal opening and conflict message
