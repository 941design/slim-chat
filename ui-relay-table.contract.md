# RelayTable Component Contract

## Target File
`src/renderer/components/RelayTable.tsx`

## Objective
High-density table component for relay management with drag-and-drop reordering, read/write checkboxes, live status indicators, and inline editing.

## Dependencies

Install via npm:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Imports:
```typescript
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Table, Thead, Tbody, Tr, Th, Td, Checkbox, IconButton, Input, Tooltip } from '@chakra-ui/react';
```

## Component: RelayTable

CONTRACT:
  Inputs (Props):
    - identityId: string, current identity whose relays to manage
    - relays: array of NostlingRelayEndpoint, current relay configuration
    - status: Record<string, 'connected' | 'connecting' | 'disconnected' | 'error'>, connection status map
    - onChange: (relays: NostlingRelayEndpoint[]) => void, callback when relays change
    - onConflict: (message: string) => void, callback when save conflict detected

  Outputs:
    - React component rendering relay table

  Invariants:
    - Table height: rows ≤ 36px to fit 12-15 visible on 13" screen
    - Column order: Drag handle | ☑ Enabled | Status dot | URL | ☑ Read | ☑ Write | Remove
    - Visible row numbers (order field) displayed
    - "Add relay" inline input at bottom
    - Auto-save: onChange called immediately on any modification
    - No "Save" button (changes apply instantly)

  Properties:
    - Compact display: 36px row height maintained
    - Live status: status dots update within 2s of connection change
    - Drag feedback: visual placeholder during drag operation
    - Inline editing: URL field editable in-place (no modal)

  Algorithm (Render):
    1. Set up DndContext with pointer sensor
    2. Create SortableContext with relay URLs as IDs
    3. Render Table with Thead:
       - Columns: [icon] | Enabled | Status | URL | Read | Write | [icon]
    4. Render Tbody with SortableRelayRow for each relay
    5. Render "add relay" row at bottom with inline Input
    6. Wire onChange to fire on:
       - Drag end (reorder)
       - Checkbox toggle (enabled/read/write)
       - URL blur (edit complete)
       - Remove click
       - Add relay submit

  Algorithm (Drag Handling):
    1. On drag end event:
       a. Extract oldIndex and newIndex from event
       b. Reorder relays array (move item from oldIndex to newIndex)
       c. Update order field for all relays (0, 1, 2, ...)
       d. Call onChange(reordered_relays)

  Algorithm (Add Relay):
    1. User types URL in "add relay" input
    2. On Enter or blur:
       a. Validate URL (non-empty, starts with wss://)
       b. Create new relay: { url, read: true, write: true, order: max(order)+1 }
       c. Append to relays array
       d. Call onChange(updated_relays)
       e. Clear input field

## Sub-Component: SortableRelayRow

CONTRACT:
  Inputs (Props):
    - relay: NostlingRelayEndpoint, relay to render
    - status: 'connected' | 'connecting' | 'disconnected' | 'error', current connection status
    - onUpdate: (updated: NostlingRelayEndpoint) => void, callback when relay modified
    - onRemove: () => void, callback when remove clicked

  Outputs:
    - React Tr element with sortable behavior and inline controls

  Invariants:
    - Row height ≤ 36px
    - Drag handle visible on left (icon or dotted grip)
    - Status dot shows color: green=connected, yellow=connecting, red=error/disconnected
    - URL is inline editable (Input component, not plain text)
    - Checkboxes for Enabled, Read, Write are clickable
    - Remove button shows "−" icon
    - Tooltip on status dot shows connection state text

  Properties:
    - Drag behavior: useSortable hook provides transform and transition
    - Visual feedback: row transforms during drag
    - Accessibility: checkboxes and inputs properly labeled

  Algorithm (Render):
    1. Get sortable props from useSortable(relay.url)
    2. Apply transform and transition styles
    3. Render Tr with columns:
       - Drag handle (icon with ref from sortable)
       - Enabled checkbox (checked based on relay config, onChange → onUpdate)
       - Status dot (Circle with color, Tooltip with status text)
       - URL Input (value=relay.url, onBlur → onUpdate)
       - Read checkbox (onChange → onUpdate)
       - Write checkbox (onChange → onUpdate)
       - Remove IconButton (onClick → onRemove)

## Sub-Component: StatusDot

CONTRACT:
  Inputs (Props):
    - status: 'connected' | 'connecting' | 'disconnected' | 'error'
    - url: string (for tooltip)

  Outputs:
    - React Box (circle) with color and tooltip

  Invariants:
    - Size: 8px diameter circle
    - Colors: green (#48BB78) connected, yellow (#ECC94B) connecting, red (#F56565) disconnected/error
    - Tooltip shows: "Connected" | "Connecting..." | "Disconnected" | "Error: {detail}"

  Algorithm:
    1. Map status to color: connected→green, connecting→yellow, error→red, disconnected→red
    2. Render Box with borderRadius="full", bg=color, width/height="8px"
    3. Wrap in Tooltip with status text

## Footer Summary

CONTRACT:
  Inputs:
    - relays: array of NostlingRelayEndpoint
    - status: status map

  Outputs:
    - Text display: "X relays · Y connected · Z failed"

  Invariants:
    - X = total relay count
    - Y = count of relays with status='connected'
    - Z = count of relays with status='error' or 'disconnected'

  Algorithm:
    1. Count total relays (relays.length)
    2. Count connected (filter status map for 'connected')
    3. Count failed (filter status map for 'error' or 'disconnected')
    4. Render Text with computed values

## Auto-Save Behavior

CONTRACT:
  Inputs:
    - any modification event (reorder, checkbox toggle, URL edit, add, remove)

  Outputs:
    - IPC call to window.api.nostling.relays.set(identityId, updated_relays)

  Invariants:
    - onChange prop called immediately on modification
    - Parent component (MainUI) handles IPC call and conflict detection
    - If conflict returned: parent calls onConflict prop
    - If success: relays prop updated via state, no UI action needed

  Properties:
    - No explicit save button: changes apply on blur/toggle/drop
    - Conflict detection at parent level (not in this component)

## Testing Requirements

- Property-based tests:
  - Property: drag from position i to j results in relays[j] === original_relays[i]
  - Property: toggling checkbox updates correct field (enabled/read/write)
  - Property: adding relay appends to end with order = max(order)+1
  - Property: removing relay at index i results in relays.length - 1
  - Property: status dot color matches status value
  - Property: row height ≤ 36px for all rows

## Styling Guidelines

- Use Chakra UI sizing: size="sm" for inputs, checkboxes, buttons
- Font size: "sm" (14px) for table text
- Padding: py="1" (4px) for table cells to achieve ≤36px row height
- Colors: Use Chakra color tokens (gray.500, green.500, etc.)
- Drag handle: Use ":::" or grip-vertical icon from Chakra icons

## Integration Points

- Parent component passes identityId and manages save/conflict flow
- Parent subscribes to status updates via window.api.nostling.relays.onStatusChange
- ConflictModal triggered by parent when onConflict called
