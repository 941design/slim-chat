# QR Code Contact Management - Requirements Specification

## Problem Statement
Currently, adding contacts requires manually typing or copy-pasting npubs, which is error-prone and cumbersome. Users should be able to quickly add contacts by scanning QR codes using their device camera. Similarly, users need an easy way to share their identity's npub with others by displaying it as a QR code.

## Core Functionality
Enable users to:
1. Add contacts by scanning QR codes containing npubs
2. Display their identity's npub as a QR code for others to scan

## Functional Requirements

### FR1: QR Code Scanning for Contact Addition
- **FR1.1**: Camera button appears in contact modal (alongside manual npub input)
  - Button should have clear camera icon
  - Button should be easily discoverable without cluttering the UI

- **FR1.2**: Clicking camera button opens modal overlay with camera feed
  - Modal size should match QR display modal (not full-screen, but large enough for comfortable scanning)
  - Camera stream should be clearly visible with appropriate resolution
  - Frame/overlay should indicate scanning area

- **FR1.3**: QR code detection and validation
  - Continuously scan for QR codes in camera feed
  - Validate scanned content is a valid npub (using existing `isValidNpub()` logic)
  - Ignore invalid QR codes or non-npub content

- **FR1.4**: Automatic contact creation on successful scan
  - When valid npub is detected, immediately create contact
  - Use currently selected identity from sidebar (identity must be selected before opening contact modal)
  - Close camera modal after successful creation
  - Show success feedback to user

- **FR1.5**: Camera permission handling
  - Request camera permissions when camera button is clicked
  - If denied, show error message explaining the issue
  - Fall back to manual npub input
  - Allow user to continue using manual input method

### FR2: QR Code Display for Identity
- **FR2.1**: QR code button in identity list
  - Add QR code icon button in identity list item (sidebar)
  - Place alongside existing copy button
  - Should be visible for each identity

- **FR2.2**: QR code display modal
  - Clicking QR button opens modal dialog
  - Modal should match size of camera scanning modal for consistency
  - Display identity's npub as QR code
  - Include text representation of npub below QR code for reference
  - Include close button or click-outside-to-close behavior

### FR3: User Experience
- **FR3.1**: Visual feedback
  - Loading states while camera initializes
  - Visual indication when QR code is detected
  - Success message after contact creation
  - Error messages for permission denial or invalid QR codes

- **FR3.2**: Accessibility
  - All icon buttons should have proper aria-labels
  - Modals should be keyboard navigable (Esc to close)
  - Error messages should be screen-reader friendly

## Critical Constraints

### CC1: Cross-Platform Compatibility
- Must work on Linux and macOS
- Use standard Web APIs (getUserMedia) for camera access
- No platform-specific camera implementations

### CC2: Security and Privacy
- Camera access only when explicitly requested by user
- No automatic camera activation
- Camera stream must stop when modal closes
- No storage or transmission of camera frames (only decoded npub)

### CC3: npub Validation
- Must use existing `isValidNpub()` function from crypto module
- Same validation rules as manual input:
  - Must start with "npub1"
  - Valid bech32 encoding
  - Decodes to exactly 64 hex characters

### CC4: Integration with Existing Contact Flow
- Should not break existing manual contact creation
- Camera scanning is an alternative input method, not a replacement
- Contact creation still requires identity selection
- All existing contact validation and error handling applies

## Integration Points

### IP1: Contact Modal
- Add camera icon button to existing `ContactModal` component (src/renderer/main.tsx:965-1067)
- Camera button should open new camera scanning modal
- Maintain existing form state and submission logic

### IP2: Identity List
- Add QR icon button to existing `IdentityList` component (src/renderer/main.tsx:491-566)
- Place near existing copy button (around line 545-558)
- Follow same styling patterns as existing icon buttons

### IP3: npub Validation
- Use existing `isValidNpub()` from src/main/nostling/crypto.ts:220-237
- Ensure QR-scanned npubs go through same validation as manual input

### IP4: Contact Service
- Use existing `addContact()` from state management (src/renderer/nostling/state.ts:198-215)
- No changes to backend service required
- Contact creation flow remains unchanged

## User Preferences

### UP1: Library Selection
- Use established QR code libraries for reliability
- Prefer libraries with good TypeScript support
- Consider bundle size impact on Electron app

### UP2: UI Consistency
- Follow existing Chakra UI patterns
- Match modal sizes between QR display and scanning
- Use consistent icon style with existing UI

### UP3: Error Handling
- Graceful degradation when camera unavailable
- Clear, user-friendly error messages
- No technical jargon in user-facing messages

## Codebase Context

### Existing Patterns

**Modal Pattern** (Chakra UI Dialog):
```tsx
<Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
  <Dialog.Backdrop />
  <Dialog.Positioner>
    <Dialog.Content>
      <Dialog.Header>...</Dialog.Header>
      <Dialog.Body>...</Dialog.Body>
      <Dialog.Footer>...</Dialog.Footer>
    </Dialog.Content>
  </Dialog.Positioner>
</Dialog.Root>
```

**Icon Button Pattern**:
```tsx
<IconButton
  size="xs"
  variant="ghost"
  aria-label="Description"
  title="Tooltip text"
  onClick={handler}
>
  <IconComponent />
</IconButton>
```

**Form Field Pattern**:
```tsx
<Field.Root invalid={hasError} required>
  <Field.Label>Label Text</Field.Label>
  <Input value={value} onChange={handler} />
  {hasError && <Field.ErrorText>Error message</Field.ErrorText>}
</Field.Root>
```

### Similar Implementations

**ContactModal**: Existing modal for manual contact addition with identity selection, npub input, and form validation (src/renderer/main.tsx:965-1067)

**HelpModal**: Example of simple informational modal (src/renderer/main.tsx:1069+)

**IdentityList**: Sidebar component showing identities with copy buttons (src/renderer/main.tsx:491-566)

### Technology Stack
- React 18.3.1 + TypeScript
- Chakra UI v3 for components
- Electron 30.5.1 (desktop app)
- No existing QR or camera libraries

## Out of Scope

### OS1: Advanced Camera Features
- Camera selection (front vs back)
- Flash/torch control
- Zoom or focus controls
- Photo capture or recording

### OS2: QR Code Generation Options
- Custom QR code styling or colors
- Logo embedding in QR codes
- Different QR code formats or sizes
- Download/export QR code as image

### OS3: Batch Operations
- Scanning multiple QR codes in succession
- Bulk contact import
- QR code sharing via other means (email, messaging)

### OS4: Contact Management Enhancements
- Editing contacts via QR code
- QR codes for contact sharing (only identity npubs)
- QR codes containing additional metadata

---

**Note**: This is a requirements specification, not an architecture design.
Edge cases, error handling details, library selection, and implementation approach will be
determined by the integration-architect during Phase 2.
