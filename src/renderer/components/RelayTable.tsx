import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Table,
  Checkbox,
  IconButton,
  Input,
  Text,
  HStack,
  VStack,
  Icon,
} from '@chakra-ui/react';
import { Field } from '@chakra-ui/react';
import type { CheckboxCheckedChangeDetails } from '@chakra-ui/react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NostlingRelayEndpoint } from '../../shared/types';
import { useThemeColors } from '../themes/ThemeContext';
import { useHoverInfo } from './HoverInfo';

interface RelayTableProps {
  identityId: string;
  relays: NostlingRelayEndpoint[];
  status: Record<string, 'connected' | 'connecting' | 'disconnected' | 'error'>;
  onChange: (relays: NostlingRelayEndpoint[]) => void;
  onConflict: (message: string) => void;
}

/**
 * Normalize relay URL to match status map keys.
 * The relay pool adds a trailing slash to URLs for consistency with SimplePool.
 */
function normalizeRelayUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/';
}

interface SortableRelayRowProps {
  relay: NostlingRelayEndpoint;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  onUpdate: (updated: NostlingRelayEndpoint) => void;
  onRemove: () => void;
}

interface StatusDotProps {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  url: string;
}

// StatusDot sub-component: renders a colored circle that shows status in footer on hover
function StatusDot({ status, url }: StatusDotProps) {
  const colors = useThemeColors();
  const { showInfo, hideInfo } = useHoverInfo();

  const getStatusColor = (): string => {
    switch (status) {
      case 'connected':
        return colors.statusSuccess;
      case 'connecting':
        return colors.statusWarning;
      case 'error':
      case 'disconnected':
        return colors.statusError;
      default:
        return colors.textSubtle;
    }
  };

  return (
    <Box
      width="8px"
      height="8px"
      borderRadius="full"
      bg={getStatusColor()}
      display="inline-block"
      cursor="pointer"
      onMouseEnter={() => showInfo(`${url}: ${status}`)}
      onMouseLeave={hideInfo}
    />
  );
}

// SortableRelayRow sub-component: individual row with sortable behavior
const SortableRelayRow = React.memo(function SortableRelayRow({
  relay,
  status,
  onUpdate,
  onRemove,
}: SortableRelayRowProps) {
  const [editUrl, setEditUrl] = useState(relay.url);
  const colors = useThemeColors();

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: relay.url });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleUrlBlur = useCallback(() => {
    if (editUrl !== relay.url && editUrl.trim()) {
      onUpdate({ ...relay, url: editUrl });
    } else {
      setEditUrl(relay.url);
    }
  }, [editUrl, relay, onUpdate]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditUrl(e.target.value);
  };

  const handleEnabledChange = useCallback(
    (details: CheckboxCheckedChangeDetails) => {
      const isEnabled = details.checked === true;
      // BUG FIX: Relay re-activation not working
      // Root cause: When re-enabling after disabling, both read and write are false,
      // so they stayed false (relay.read ? relay.read : false evaluates to false).
      // Fix: When enabling, if both are currently false (disabled state),
      // default to both true. Otherwise preserve existing values.
      // Bug report: bug-reports/relay-reactivation-not-working-report.md
      // Fixed: 2025-12-12
      const bothDisabled = !relay.read && !relay.write;
      onUpdate({
        ...relay,
        read: isEnabled ? (bothDisabled ? true : relay.read) : false,
        write: isEnabled ? (bothDisabled ? true : relay.write) : false,
      });
    },
    [relay, onUpdate]
  );

  const handleReadChange = useCallback(
    (details: CheckboxCheckedChangeDetails) => {
      onUpdate({ ...relay, read: details.checked === true });
    },
    [relay, onUpdate]
  );

  const handleWriteChange = useCallback(
    (details: CheckboxCheckedChangeDetails) => {
      onUpdate({ ...relay, write: details.checked === true });
    },
    [relay, onUpdate]
  );

  const isEnabled = relay.read || relay.write;

  return (
    <Table.Row
      ref={setNodeRef}
      style={style}
      height="36px"
      _hover={{ bg: colors.surfaceBgSubtle }}
    >
      {/* Drag handle */}
      <Table.Cell
        width="40px"
        padding="1"
        cursor="grab"
        _active={{ cursor: 'grabbing' }}
        {...attributes}
        {...listeners}
      >
        <Text fontSize="sm" color={colors.textSubtle}>
          :::
        </Text>
      </Table.Cell>

      {/* Enabled checkbox */}
      <Table.Cell width="50px" padding="1">
        <Checkbox.Root
          size="sm"
          checked={isEnabled}
          onCheckedChange={handleEnabledChange}
          aria-label="Enabled"
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Root>
      </Table.Cell>

      {/* Status dot */}
      <Table.Cell width="40px" padding="1">
        <StatusDot status={status} url={relay.url} />
      </Table.Cell>

      {/* URL field */}
      <Table.Cell padding="1" flex="1">
        <Input
          size="sm"
          value={editUrl}
          onChange={handleUrlChange}
          onBlur={handleUrlBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleUrlBlur();
            }
          }}
          placeholder="wss://relay.example.com"
        />
      </Table.Cell>

      {/* Read checkbox */}
      <Table.Cell width="50px" padding="1">
        <Checkbox.Root
          size="sm"
          checked={relay.read}
          onCheckedChange={handleReadChange}
          disabled={!isEnabled}
          aria-label="Read"
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Root>
      </Table.Cell>

      {/* Write checkbox */}
      <Table.Cell width="50px" padding="1">
        <Checkbox.Root
          size="sm"
          checked={relay.write}
          onCheckedChange={handleWriteChange}
          disabled={!isEnabled}
          aria-label="Write"
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Root>
      </Table.Cell>

      {/* Remove button */}
      <Table.Cell width="40px" padding="1">
        <IconButton
          size="sm"
          aria-label="Remove relay"
          onClick={onRemove}
          variant="ghost"
          fontSize="lg"
        >
          −
        </IconButton>
      </Table.Cell>
    </Table.Row>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if relay data or status actually changed
  return (
    prevProps.relay.url === nextProps.relay.url &&
    prevProps.relay.read === nextProps.relay.read &&
    prevProps.relay.write === nextProps.relay.write &&
    prevProps.relay.order === nextProps.relay.order &&
    prevProps.status === nextProps.status &&
    prevProps.onUpdate === nextProps.onUpdate &&
    prevProps.onRemove === nextProps.onRemove
  );
});

// Main RelayTable component
export function RelayTable({
  identityId,
  relays,
  status,
  onChange,
  onConflict,
}: RelayTableProps) {
  const [newRelayUrl, setNewRelayUrl] = useState('');
  const colors = useThemeColors();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const relayIds = useMemo(() => relays.map((r) => r.url), [relays]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = relays.findIndex((r) => r.url === active.id);
      const newIndex = relays.findIndex((r) => r.url === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reordered = Array.from(relays);
      const [movedRelay] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, movedRelay);

      // Update order field for all relays
      const updated = reordered.map((relay, index) => ({
        ...relay,
        order: index,
      }));

      onChange(updated);
    },
    [relays, onChange]
  );

  const handleRelayUpdate = useCallback(
    (updated: NostlingRelayEndpoint) => {
      const updated_relays = relays.map((r) =>
        r.url === updated.url ? updated : r
      );
      onChange(updated_relays);
    },
    [relays, onChange]
  );

  const handleRemoveRelay = useCallback(
    (url: string) => {
      const updated_relays = relays.filter((r) => r.url !== url);
      onChange(updated_relays);
    },
    [relays, onChange]
  );

  const handleAddRelay = useCallback(() => {
    const trimmedUrl = newRelayUrl.trim();

    if (!trimmedUrl) {
      return;
    }

    if (!trimmedUrl.startsWith('wss://')) {
      onConflict('Relay URL must start with wss://');
      return;
    }

    // Check for duplicates
    if (relays.some((r) => r.url === trimmedUrl)) {
      onConflict('Relay URL already exists');
      return;
    }

    const newRelay: NostlingRelayEndpoint = {
      url: trimmedUrl,
      read: true,
      write: true,
      order: relays.length,
    };

    onChange([...relays, newRelay]);
    setNewRelayUrl('');
  }, [newRelayUrl, relays, onChange, onConflict]);

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddRelay();
    }
  };

  const connectedCount = relays.filter(
    (r) => status[normalizeRelayUrl(r.url)] === 'connected'
  ).length;
  const failedCount = relays.filter(
    (r) =>
      status[normalizeRelayUrl(r.url)] === 'error' || status[normalizeRelayUrl(r.url)] === 'disconnected'
  ).length;

  return (
    <VStack width="full" gap="4" align="stretch">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Box overflowX="auto" borderRadius="md" border="1px" borderColor={colors.border}>
          <Table.Root size="sm">
            <Table.Header bg={colors.surfaceBgSubtle}>
              <Table.Row height="36px">
                <Table.ColumnHeader width="40px" padding="1" fontSize="xs">
                  ⋮⋮
                </Table.ColumnHeader>
                <Table.ColumnHeader width="50px" padding="1" fontSize="xs">
                  Enabled
                </Table.ColumnHeader>
                <Table.ColumnHeader width="40px" padding="1" fontSize="xs">
                  Status
                </Table.ColumnHeader>
                <Table.ColumnHeader padding="1" fontSize="xs">
                  URL
                </Table.ColumnHeader>
                <Table.ColumnHeader width="50px" padding="1" fontSize="xs">
                  Read
                </Table.ColumnHeader>
                <Table.ColumnHeader width="50px" padding="1" fontSize="xs">
                  Write
                </Table.ColumnHeader>
                <Table.ColumnHeader width="40px" padding="1" fontSize="xs">
                  Remove
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              <SortableContext
                items={relayIds}
                strategy={verticalListSortingStrategy}
              >
                {relays.map((relay) => (
                  <SortableRelayRow
                    key={relay.url}
                    relay={relay}
                    status={status[normalizeRelayUrl(relay.url)] || 'disconnected'}
                    onUpdate={handleRelayUpdate}
                    onRemove={() => handleRemoveRelay(relay.url)}
                  />
                ))}
              </SortableContext>

              {/* Add relay row */}
              <Table.Row height="36px" _hover={{ bg: colors.surfaceBgSubtle }}>
                <Table.Cell colSpan={7} padding="1">
                  <HStack gap="2">
                    <Text fontSize="xs" color={colors.textSubtle} width="40px">
                      +
                    </Text>
                    <Input
                      size="sm"
                      placeholder="wss://relay.example.com"
                      value={newRelayUrl}
                      onChange={(e) => setNewRelayUrl(e.target.value)}
                      onKeyDown={handleAddKeyDown}
                      onBlur={handleAddRelay}
                    />
                  </HStack>
                </Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table.Root>
        </Box>
      </DndContext>

      {/* Footer summary */}
      <Text fontSize="xs" color={colors.textMuted}>
        {relays.length} relays · {connectedCount} connected · {failedCount} failed
      </Text>
    </VStack>
  );
}
