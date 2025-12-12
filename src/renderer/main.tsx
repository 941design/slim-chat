import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  defineConfig,
  Box,
  Flex,
  Text,
  Button,
  IconButton,
  Heading,
  VStack,
  HStack,
  Spacer,
  Stack,
  Table,
  Badge,
  Input,
  Field,
  Dialog,
  NativeSelect,
  Separator,
  Icon,
  Textarea,
  Menu,
  Portal,
} from '@chakra-ui/react';
import {
  AppStatus,
  NostlingContact,
  NostlingIdentity,
  NostlingMessage,
  NostlingRelayEndpoint,
  UpdateState,
} from '../shared/types';
import './types.d.ts';
import { getStatusText, isRefreshEnabled } from './utils';
import { useNostlingState } from './nostling/state';
import { RelayTable } from './components/RelayTable';
import { RelayConflictModal } from './components/RelayConflictModal';

// Simple refresh icon component
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
  </svg>
);

// Hamburger menu icon
const HamburgerIcon = () => (
  <svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="currentColor">
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
  </svg>
);

// Settings/gear icon for relay config
const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
);

// Help/question mark icon
const HelpIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
  </svg>
);

// Custom dark theme for Chakra UI v3
const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: '#e0f7ff' },
          100: { value: '#b8ecfe' },
          200: { value: '#8ee0fb' },
          300: { value: '#63d4f8' },
          400: { value: '#38bdf8' },
          500: { value: '#0ea5e9' },
          600: { value: '#0284c7' },
          700: { value: '#0369a1' },
          800: { value: '#075985' },
          900: { value: '#0c4a6e' },
        },
      },
    },
  },
});

const system = createSystem(defaultConfig, config);

const initialUpdateState: UpdateState = { phase: 'idle' };

function useStatus() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState);

  useEffect(() => {
    async function load() {
      const next = await window.api.getStatus();
      setStatus(next);
      setUpdateState(next.updateState);
    }
    load();
    const unsubscribe = window.api.onUpdateState(async (state) => {
      setUpdateState(state);

      // BUG FIX: Re-fetch full status when update check completes
      // Root cause: onUpdateState only updated updateState, not full status including lastUpdateCheck
      // Bug report: bug-reports/footer-timestamp-not-updating-report.md
      // Fixed: 2025-12-07
      // This ensures lastUpdateCheck timestamp is displayed immediately when checks complete
      // Note: Only refresh for 'idle' and 'failed' states (check completion)
      // 'ready' state doesn't need timestamp update (comes from 'downloaded' -> 'verifying' -> 'ready')
      if (state.phase === 'idle' || state.phase === 'failed') {
        const refreshed = await window.api.getStatus();
        setStatus(refreshed);
      }
    });
    return unsubscribe;
  }, []);

  // CODE QUALITY: Add error handling for async IPC calls
  // Prevents unhandled promise rejections from IPC failures
  const refresh = async () => {
    try {
      await window.api.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const restart = async () => {
    try {
      await window.api.restartToUpdate();
    } catch (error) {
      console.error('Failed to restart:', error);
    }
  };

  // BUG FIX: Add download function for 'available' phase
  // Root cause: handlePrimary() was calling onCheck() for all non-ready phases
  // Bug report: bug-reports/download-update-button-not-working-report.md
  // Fixed: 2025-12-07
  const download = async () => {
    try {
      await window.api.updates.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
    }
  };

  return { status, updateState, refresh, restart, download };
}

function useStateEntries() {
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await window.api.state.getAll();
        setEntries(data);
      } catch (error) {
        console.error('Failed to load state entries:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { entries, loading };
}

function StateTable() {
  const { entries, loading } = useStateEntries();
  const rows = Object.entries(entries);

  if (loading) {
    return <Text color="gray.500">Loading...</Text>;
  }

  if (rows.length === 0) {
    return (
      <Text className="state-table-empty" color="gray.500">
        No state entries found
      </Text>
    );
  }

  return (
    <Box className="state-table-container">
      <Heading size="sm" color="gray.300" mb="3">
        Database State Entries
      </Heading>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader color="gray.400">Key</Table.ColumnHeader>
            <Table.ColumnHeader color="gray.400">Value</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map(([key, value]) => (
            <Table.Row key={key} className="state-table-row">
              <Table.Cell color="gray.300" fontFamily="mono" fontSize="xs">
                {key}
              </Table.Cell>
              <Table.Cell color="gray.400" fontFamily="mono" fontSize="xs">
                {value}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

interface HeaderProps {
  onShowHelp: () => void;
  onShowRelayConfig: () => void;
}

function Header({ onShowHelp, onShowRelayConfig }: HeaderProps) {
  return (
    <Box
      as="header"
      className="app-header"
      px="4"
      py="3"
      borderBottomWidth="1px"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.300"
    >
      <Flex align="center" justify="space-between">
        <Text className="brand" fontSize="lg" fontWeight="semibold" color="brand.400">
          Nostling
        </Text>
        <Menu.Root>
          <Menu.Trigger asChild>
            <IconButton
              aria-label="Open menu"
              variant="ghost"
              size="sm"
              color="gray.400"
              _hover={{ color: 'gray.200', bg: 'whiteAlpha.100' }}
            >
              <HamburgerIcon />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content
                bg="gray.800"
                borderColor="whiteAlpha.200"
                borderWidth="1px"
                borderRadius="md"
                py="1"
                minW="180px"
              >
                <Menu.Item
                  value="relay-config"
                  onClick={onShowRelayConfig}
                  px="3"
                  py="2"
                  cursor="pointer"
                  _hover={{ bg: 'whiteAlpha.100' }}
                >
                  <HStack gap="2">
                    <SettingsIcon />
                    <Text color="gray.200">Relay Configuration</Text>
                  </HStack>
                </Menu.Item>
                <Menu.Separator borderColor="whiteAlpha.200" />
                <Menu.Item
                  value="help"
                  onClick={onShowHelp}
                  px="3"
                  py="2"
                  cursor="pointer"
                  _hover={{ bg: 'whiteAlpha.100' }}
                >
                  <HStack gap="2">
                    <HelpIcon />
                    <Text color="gray.200">Help</Text>
                  </HStack>
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Flex>
    </Box>
  );
}

/**
 * AUTO-UPDATE FOOTER FEATURE: Enhanced Footer Component (FR1, FR3, FR4, FR5, FR6, FR8)
 *
 * Displays current version, update status, progress, and provides update controls.
 * Implements all footer requirements from specification.
 */

interface FooterProps {
  version?: string;
  updateState: UpdateState;
  onRefresh: () => void;
  onDownload: () => void;
  onRestart: () => void;
  nostlingStatus?: string;
  nostlingError?: string | null;
  relayHoverInfo?: { url: string; status: string } | null;
}

function Footer({ version, updateState, onRefresh, onDownload, onRestart, nostlingStatus, nostlingError, relayHoverInfo }: FooterProps) {
  // Memoize based on phase and display-relevant fields only to prevent
  // random message re-selection during progress updates (downloading, mounting)
  const statusText = useMemo(
    () => getStatusText(updateState),
    [updateState.phase, updateState.version, updateState.detail]
  );
  const refreshEnabled = useMemo(() => isRefreshEnabled(updateState.phase), [updateState.phase]);

  const showDownloadButton = updateState.phase === 'available';
  const showRestartButton = updateState.phase === 'ready';

  return (
    <Flex
      as="footer"
      className="app-footer"
      px="4"
      py="2"
      borderTopWidth="1px"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.300"
      alignItems="center"
      fontSize="sm"
    >
      <HStack gap="2">
        <Text className="footer-version" color="gray.500" fontFamily="mono" fontSize="xs">
          {version ? `v${version}` : 'Loading...'}
        </Text>
        <Text color="gray.600">•</Text>
        <Text className="footer-status" color="gray.400">{statusText}</Text>
        {nostlingStatus && (
          <>
            <Text color="gray.600">•</Text>
            <Text className="nostling-status" color="purple.200">
              {nostlingStatus}
            </Text>
          </>
        )}
        {nostlingError && (
          <>
            <Text color="gray.600">•</Text>
            <Text className="nostling-error" color="red.300" title={nostlingError} maxW="400px" truncate>
              {nostlingError}
            </Text>
          </>
        )}
        {relayHoverInfo && (
          <>
            <Text color="gray.600">•</Text>
            <Text className="relay-hover-info" color={relayHoverInfo.status === 'connected' ? 'green.300' : relayHoverInfo.status === 'connecting' ? 'yellow.300' : 'red.300'} title={`${relayHoverInfo.url}: ${relayHoverInfo.status}`} maxW="400px" truncate>
              {relayHoverInfo.url}: {relayHoverInfo.status}
            </Text>
          </>
        )}
      </HStack>
      <Spacer />
      <HStack gap="2">
        {showDownloadButton && (
          <Button className="footer-button" size="sm" colorPalette="blue" onClick={onDownload}>
            Download Update
          </Button>
        )}
        {showRestartButton && (
          <Button className="footer-button" size="sm" colorPalette="green" onClick={onRestart}>
            Restart to Update
          </Button>
        )}
        <IconButton
          className="footer-icon-button"
          aria-label="Check for updates"
          title="Check for updates"
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={!refreshEnabled}
        >
          <RefreshIcon />
        </IconButton>
      </HStack>
    </Flex>
  );
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

interface NostlingStatusCardProps {
  statusText: string;
  queueSummary: { queued: number; sending: number; errors: number; lastActivity?: string };
  lastSync: string | null;
  lastError: string | null;
  onRetryFailed?: () => void;
}

function NostlingStatusCard({ statusText, queueSummary, lastSync, lastError, onRetryFailed }: NostlingStatusCardProps) {
  const hasQueue = queueSummary.queued > 0 || queueSummary.sending > 0 || queueSummary.errors > 0;

  return (
    <Box
      borderWidth="1px"
      borderColor="whiteAlpha.100"
      borderRadius="md"
      bg="whiteAlpha.50"
      p="4"
      mb="4"
      className="nostling-status-card"
    >
      <Heading size="sm" color="gray.300" mb="3">
        Nostling State
      </Heading>
      <VStack align="start" gap="2">
        <HStack>
          <Text color="gray.400">Status:</Text>
          <Badge colorPalette={queueSummary.errors > 0 ? 'red' : hasQueue ? 'orange' : 'green'}>{statusText}</Badge>
        </HStack>
        <HStack>
          <Text color="gray.400">Queue:</Text>
          <Text color="gray.300">
            {queueSummary.queued} queued • {queueSummary.sending} sending • {queueSummary.errors} errors
          </Text>
          {queueSummary.errors > 0 && onRetryFailed && (
            <Button size="xs" colorPalette="orange" variant="outline" onClick={onRetryFailed}>
              Retry Failed
            </Button>
          )}
        </HStack>
        <Text color="gray.400">Last activity: {formatTimestamp(queueSummary.lastActivity)}</Text>
        <Text color="gray.400">Last sync: {formatTimestamp(lastSync || undefined)}</Text>
        {lastError && (
          <Text color="red.300" fontSize="sm">
            {lastError}
          </Text>
        )}
      </VStack>
    </Box>
  );
}


type IdentityFormState = {
  label: string;
  nsec: string;
};

type ContactFormState = {
  identityId: string;
  npub: string;
  alias: string;
};

function IdentityStatusBadge({ secretRef }: { secretRef: string }) {
  return (
    <HStack gap="1">
      <Icon viewBox="0 0 24 24" color="brand.400">
        <path d="M12 2L3 7v7c0 5 4 7 9 7s9-2 9-7V7l-9-5zM5 9l7-4 7 4v5c0 3-3 5-7 5s-7-2-7-5V9z" />
      </Icon>
      <Text color="gray.500" fontSize="xs">
        {secretRef}
      </Text>
    </HStack>
  );
}

function IdentityList({
  identities,
  selectedId,
  onSelect,
  onOpenCreate,
}: {
  identities: NostlingIdentity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenCreate: () => void;
}) {
  return (
    <Box>
      <HStack justify="space-between" mb="2">
        <Heading size="sm" color="gray.300">
          Identities
        </Heading>
        <IconButton
          size="sm"
          aria-label="Create identity"
          title="Create or import identity"
          onClick={onOpenCreate}
          colorPalette="blue"
          variant="subtle"
        >
          +
        </IconButton>
      </HStack>
      <VStack align="stretch" gap="2">
        {identities.length === 0 && (
          <Text fontSize="sm" color="gray.500">
            No identities yet. Create or import one to get started.
          </Text>
        )}
        {identities.map((identity) => (
          <Box
            key={identity.id}
            borderWidth="1px"
            borderColor={selectedId === identity.id ? 'brand.400' : 'whiteAlpha.100'}
            borderRadius="md"
            p="2"
            bg={selectedId === identity.id ? 'whiteAlpha.100' : 'transparent'}
            _hover={{ borderColor: 'brand.400', cursor: 'pointer' }}
            onClick={() => onSelect(identity.id)}
          >
            <Text color="gray.200" fontWeight="semibold">
              {identity.label || identity.npub}
            </Text>
            <Text color="gray.500" fontSize="xs" lineClamp={1}>
              {identity.npub}
            </Text>
            <IdentityStatusBadge secretRef={identity.secretRef} />
          </Box>
        ))}
      </VStack>
    </Box>
  );
}

function ContactStateBadge({ state }: { state: 'pending' | 'connected' }) {
  const color = state === 'connected' ? 'green' : 'orange';
  const label = state === 'connected' ? 'Connected' : 'Pending';

  return (
    <Badge colorPalette={color} variant="subtle" size="sm">
      {label}
    </Badge>
  );
}

function ContactList({
  contacts,
  selectedId,
  onSelect,
  onOpenAdd,
  disabled,
}: {
  contacts: NostlingContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenAdd: () => void;
  disabled: boolean;
}) {
  return (
    <Box mt="6">
      <HStack justify="space-between" mb="2">
        <Heading size="sm" color="gray.300">
          Contacts
        </Heading>
        <IconButton
          size="sm"
          aria-label="Add contact"
          title={disabled ? 'Create an identity first' : 'Add contact'}
          onClick={onOpenAdd}
          colorPalette="blue"
          variant="subtle"
          disabled={disabled}
        >
          +
        </IconButton>
      </HStack>
      <VStack align="stretch" gap="2">
        {(contacts?.length || 0) === 0 && (
          <Text fontSize="sm" color="gray.500">
            {disabled ? 'Add an identity to manage contacts.' : 'No contacts yet.'}
          </Text>
        )}
        {(contacts || []).map((contact) => (
          <Box
            key={contact.id}
            borderWidth="1px"
            borderColor={selectedId === contact.id ? 'brand.400' : 'whiteAlpha.100'}
            borderRadius="md"
            p="2"
            bg={selectedId === contact.id ? 'whiteAlpha.100' : 'transparent'}
            _hover={{ borderColor: 'brand.400', cursor: 'pointer' }}
            onClick={() => onSelect(contact.id)}
          >
            <HStack justify="space-between" align="start">
              <Stack gap="0">
                <Text color="gray.200" fontWeight="semibold">
                  {contact.alias || contact.npub}
                </Text>
                <Text color="gray.500" fontSize="xs" lineClamp={1}>
                  {contact.npub}
                </Text>
              </Stack>
              <ContactStateBadge state={contact.state} />
            </HStack>
          </Box>
        ))}
      </VStack>
    </Box>
  );
}

function MessageStatusBadge({
  status,
}: {
  status: 'queued' | 'sending' | 'sent' | 'error';
}) {
  const palette = {
    queued: 'orange',
    sending: 'blue',
    sent: 'green',
    error: 'red',
  }[status];

  const label =
    status === 'queued'
      ? 'Queued'
      : status === 'sending'
        ? 'Sending'
        : status === 'sent'
          ? 'Sent'
          : 'Error';

  return (
    <Badge colorPalette={palette} variant="subtle" size="xs">
      {label}
    </Badge>
  );
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: {
    id: string;
    ciphertext: string;
    timestamp: string;
    status: 'queued' | 'sending' | 'sent' | 'error';
  };
  isOwn: boolean;
}) {
  return (
    <HStack justify={isOwn ? 'flex-end' : 'flex-start'} align="flex-end" mb="2" gap="2">
      {!isOwn && (
        <Text fontSize="xs" color="gray.500">
          {formatTimestamp(message.timestamp)}
        </Text>
      )}
      <Box
        maxW="70%"
        bg={isOwn ? 'brand.900' : 'whiteAlpha.100'}
        borderWidth="1px"
        borderColor={isOwn ? 'brand.700' : 'whiteAlpha.100'}
        borderRadius="md"
        p="3"
        className="message-bubble"
      >
        <Text color="gray.100" whiteSpace="pre-wrap">
          {message.ciphertext}
        </Text>
        <HStack justify="space-between" mt="2" gap="2">
          <Text fontSize="xs" color="gray.500">
            {formatTimestamp(message.timestamp)}
          </Text>
          <MessageStatusBadge status={message.status} />
        </HStack>
      </Box>
      {isOwn && (
        <Text fontSize="xs" color="gray.500">
          {formatTimestamp(message.timestamp)}
        </Text>
      )}
    </HStack>
  );
}

interface ConversationPaneProps {
  identity: NostlingIdentity | null;
  contact: NostlingContact | null;
  messages: NostlingMessage[];
  onSend: (plaintext: string) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  queueSummary: { queued: number; sending: number; errors: number };
}

function ConversationPane({
  identity,
  contact,
  messages,
  onSend,
  onRefresh,
  isRefreshing,
  queueSummary,
}: ConversationPaneProps) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = Boolean(identity && contact && draft.trim().length > 0 && !isSending);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const queueText = useMemo(() => {
    if (queueSummary.errors > 0) return `${queueSummary.errors} message error(s)`;
    if (queueSummary.sending > 0) return `${queueSummary.sending} sending`;
    if (queueSummary.queued > 0) return `${queueSummary.queued} queued (offline)`;
    return 'Queue idle';
  }, [queueSummary]);

  const handleSend = async () => {
    if (!canSend) return;
    setIsSending(true);
    setSendError(null);
    const success = await onSend(draft.trim());
    if (success) {
      setDraft('');
    } else {
      setSendError('Message failed to send. Check your connection and try again.');
    }
    setIsSending(false);
  };

  if (!identity) {
    return (
      <Box p="6" borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="md" bg="whiteAlpha.50" className="conversation-pane">
        <Heading size="sm" color="gray.300" mb="2">
          Start by creating an identity
        </Heading>
        <Text color="gray.500">Create or import an identity to begin messaging.</Text>
      </Box>
    );
  }

  if (!contact) {
    return (
      <Box p="6" borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="md" bg="whiteAlpha.50" className="conversation-pane">
        <Heading size="sm" color="gray.300" mb="2">
          Select a contact
        </Heading>
        <Text color="gray.500">Choose a contact to view and send messages.</Text>
      </Box>
    );
  }

  return (
    <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="md" bg="whiteAlpha.50" className="conversation-pane">
      <Flex align="center" justify="space-between" p="4" borderBottomWidth="1px" borderColor="whiteAlpha.100">
        <Stack gap="1">
          <Heading size="sm" color="gray.200">
            {contact.alias || contact.npub}
          </Heading>
          <HStack gap="2">
            <Text color="gray.500" fontSize="sm">
              {identity.label || identity.npub} → {contact.npub}
            </Text>
            <ContactStateBadge state={contact.state} />
          </HStack>
          <Text color="gray.500" fontSize="sm">
            {queueText}
          </Text>
        </Stack>
        <IconButton
          size="sm"
          aria-label="Refresh messages"
          title="Refresh conversation"
          onClick={onRefresh}
          variant="ghost"
          disabled={isRefreshing}
        >
          <RefreshIcon />
        </IconButton>
      </Flex>

      <Box ref={listRef} px="4" pt="4" pb="2" h="50vh" overflowY="auto" className="conversation-messages">
        {messages.length === 0 && (
          <Text color="gray.500" fontSize="sm">
            No messages yet. Send a welcome message to start the handshake.
          </Text>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={{
              id: message.id,
              ciphertext: message.ciphertext,
              timestamp: message.timestamp,
              status: message.status,
            }}
            isOwn={message.direction === 'outgoing'}
          />
        ))}
      </Box>

      <Separator borderColor="whiteAlpha.100" />
      <Box p="4" bg="blackAlpha.300" borderBottomRadius="md">
        <Stack gap="2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a message..."
            resize="vertical"
            minH="100px"
            color="gray.100"
            borderColor="whiteAlpha.200"
            _placeholder={{ color: 'gray.500' }}
          />
          {sendError && (
            <Text color="red.300" fontSize="sm">
              {sendError}
            </Text>
          )}
          <HStack justify="space-between" align="center">
            <Text color="gray.500" fontSize="sm">
              {queueText}
            </Text>
            <Button size="sm" colorPalette="blue" onClick={handleSend} disabled={!canSend} loading={isSending}>
              Send Message
            </Button>
          </HStack>
        </Stack>
      </Box>
    </Box>
  );
}

function IdentityModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: IdentityFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<IdentityFormState>({ label: '', nsec: '' });
  const [submitting, setSubmitting] = useState(false);
  const labelError = form.label.trim().length === 0;

  const handleSubmit = async () => {
    if (labelError) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm({ label: '', nsec: '' });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()} closeOnInteractOutside={!submitting}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Create or Import Identity</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger disabled={submitting} />
          <Dialog.Body>
            <VStack gap="3">
              <Field.Root invalid={labelError} required>
                <Field.Label>Label</Field.Label>
                <Input
                  placeholder="Personal account"
                  value={form.label}
                  onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
                />
                {labelError && <Field.ErrorText>Label is required.</Field.ErrorText>}
              </Field.Root>
              <Field.Root>
                <Field.Label>nsec (optional, for import)</Field.Label>
                <Input
                  placeholder="nsec..."
                  value={form.nsec}
                  onChange={(event) => setForm((prev) => ({ ...prev, nsec: event.target.value }))}
                />
              </Field.Root>
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <HStack gap="2">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button colorPalette="blue" onClick={handleSubmit} loading={submitting}>
                Save
              </Button>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

function ContactModal({
  isOpen,
  onClose,
  onSubmit,
  identities,
  defaultIdentityId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: ContactFormState) => Promise<void>;
  identities: NostlingIdentity[];
  defaultIdentityId: string | null;
}) {
  const [form, setForm] = useState<ContactFormState>({
    identityId: defaultIdentityId || '',
    npub: '',
    alias: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const identityMissing = form.identityId.trim().length === 0;
  const npubMissing = form.npub.trim().length === 0;

  useEffect(() => {
    setForm((prev) => ({ ...prev, identityId: defaultIdentityId || prev.identityId }));
  }, [defaultIdentityId]);

  const handleSubmit = async () => {
    if (identityMissing || npubMissing) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm({ identityId: defaultIdentityId || '', npub: '', alias: '' });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()} closeOnInteractOutside={!submitting}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Add Contact</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger disabled={submitting} />
          <Dialog.Body>
            <VStack gap="3">
              <Field.Root invalid={identityMissing} required>
                <Field.Label>Identity</Field.Label>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={form.identityId}
                    onChange={(event) => setForm((prev) => ({ ...prev, identityId: event.target.value }))}
                  >
                    <option value="" disabled>
                      Select identity
                    </option>
                    {identities.map((identity) => (
                      <option key={identity.id} value={identity.id}>
                        {identity.label || identity.npub}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
                {identityMissing && <Field.ErrorText>Select an identity.</Field.ErrorText>}
              </Field.Root>
              <Field.Root invalid={npubMissing} required>
                <Field.Label>Contact npub</Field.Label>
                <Input
                  placeholder="npub..."
                  value={form.npub}
                  onChange={(event) => setForm((prev) => ({ ...prev, npub: event.target.value }))}
                />
                {npubMissing && <Field.ErrorText>npub is required.</Field.ErrorText>}
              </Field.Root>
              <Field.Root>
                <Field.Label>Alias (optional)</Field.Label>
                <Input
                  placeholder="Friend"
                  value={form.alias}
                  onChange={(event) => setForm((prev) => ({ ...prev, alias: event.target.value }))}
                />
              </Field.Root>
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <HStack gap="2">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button colorPalette="blue" onClick={handleSubmit} loading={submitting}>
                Save
              </Button>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

function HelpModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="500px">
          <Dialog.Header>
            <Dialog.Title>Help</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger />
          <Dialog.Body>
            <VStack align="start" gap="4">
              <Box>
                <Heading size="sm" color="gray.200" mb="2">
                  About Nostling
                </Heading>
                <Text color="gray.400" fontSize="sm">
                  Nostling is a desktop messaging application built on the Nostr protocol.
                  It provides secure, decentralized communication through end-to-end encrypted messages.
                </Text>
              </Box>

              <Box>
                <Heading size="sm" color="gray.200" mb="2">
                  Getting Started
                </Heading>
                <VStack align="start" gap="1">
                  <Text color="gray.400" fontSize="sm">
                    1. Create or import an identity using the + button in the Identities section
                  </Text>
                  <Text color="gray.400" fontSize="sm">
                    2. Configure your relay servers in the menu → Relay Configuration
                  </Text>
                  <Text color="gray.400" fontSize="sm">
                    3. Add contacts using their npub (public key)
                  </Text>
                  <Text color="gray.400" fontSize="sm">
                    4. Start messaging!
                  </Text>
                </VStack>
              </Box>

              <Box>
                <Heading size="sm" color="gray.200" mb="2">
                  Keyboard Shortcuts
                </Heading>
                <VStack align="start" gap="1">
                  <HStack>
                    <Badge colorPalette="gray" fontFamily="mono" fontSize="xs">Enter</Badge>
                    <Text color="gray.400" fontSize="sm">Send message</Text>
                  </HStack>
                </VStack>
              </Box>

              <Box>
                <Heading size="sm" color="gray.200" mb="2">
                  Need More Help?
                </Heading>
                <Text color="gray.400" fontSize="sm">
                  Visit the project repository for documentation, bug reports, and feature requests.
                </Text>
              </Box>
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

function Sidebar({
  identities,
  contacts,
  selectedIdentityId,
  selectedContactId,
  onSelectIdentity,
  onSelectContact,
  onOpenIdentityModal,
  onOpenContactModal,
}: {
  identities: NostlingIdentity[];
  contacts: Record<string, NostlingContact[]>;
  selectedIdentityId: string | null;
  selectedContactId: string | null;
  onSelectIdentity: (id: string) => void;
  onSelectContact: (id: string) => void;
  onOpenIdentityModal: () => void;
  onOpenContactModal: () => void;
}) {
  const currentContacts = selectedIdentityId ? contacts[selectedIdentityId] || [] : [];

  return (
    <Box
      as="aside"
      className="sidebar"
      w="280px"
      borderRightWidth="1px"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.200"
      p="4"
    >
      <VStack align="stretch" gap="4">
        <IdentityList
          identities={identities}
          selectedId={selectedIdentityId}
          onSelect={onSelectIdentity}
          onOpenCreate={onOpenIdentityModal}
        />
        <Separator borderColor="whiteAlpha.200" />
        <ContactList
          contacts={currentContacts}
          selectedId={selectedContactId}
          onSelect={onSelectContact}
          onOpenAdd={onOpenContactModal}
          disabled={identities.length === 0}
        />
      </VStack>
    </Box>
  );
}

type AppView = 'chat' | 'relay-config';

function App() {
  const { status, updateState, refresh, restart, download } = useStatus();
  const nostling = useNostlingState();
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('chat');

  // Relay state management (per-identity)
  const [currentRelays, setCurrentRelays] = useState<NostlingRelayEndpoint[]>([]);
  const [relayStatus, setRelayStatus] = useState<Record<string, string>>({});
  const [relayHoverInfo, setRelayHoverInfo] = useState<{ url: string; status: string } | null>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  const selectedIdentity = useMemo(
    () => nostling.identities.find((identity) => identity.id === selectedIdentityId) ?? null,
    [nostling.identities, selectedIdentityId]
  );

  const selectedContact = useMemo(() => {
    if (!selectedIdentityId) return null;
    const currentContacts = nostling.contacts[selectedIdentityId] || [];
    return currentContacts.find((contact) => contact.id === selectedContactId) ?? null;
  }, [nostling.contacts, selectedContactId, selectedIdentityId]);

  const messageKey = selectedIdentityId && selectedContactId ? `${selectedIdentityId}:${selectedContactId}` : null;

  const conversationMessages = useMemo(() => {
    if (!messageKey) return [] as NostlingMessage[];
    const entries = nostling.messages[messageKey] || [];
    return [...entries].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }, [messageKey, nostling.messages]);

  const messagesLoading = messageKey ? Boolean(nostling.loading.messages[messageKey]) : false;

  useEffect(() => {
    if (nostling.identities.length === 0) {
      setSelectedIdentityId(null);
      setSelectedContactId(null);
      return;
    }

    if (!selectedIdentityId || !nostling.identities.find((identity) => identity.id === selectedIdentityId)) {
      setSelectedIdentityId(nostling.identities[0]?.id ?? null);
    }
  }, [nostling.identities, selectedIdentityId]);

  useEffect(() => {
    if (!selectedIdentityId) {
      setSelectedContactId(null);
      return;
    }

    const currentContacts = nostling.contacts[selectedIdentityId] || [];
    if (currentContacts.length === 0) {
      setSelectedContactId(null);
      return;
    }

    if (!selectedContactId || !currentContacts.find((contact) => contact.id === selectedContactId)) {
      setSelectedContactId(currentContacts[0]?.id ?? null);
    }
  }, [nostling.contacts, selectedContactId, selectedIdentityId]);

  const handleCreateIdentity = async (values: IdentityFormState) => {
    const identity = await nostling.createIdentity({ label: values.label, nsec: values.nsec || undefined });
    if (identity) {
      setSelectedIdentityId(identity.id);
    }
  };

  const handleAddContact = async (values: ContactFormState) => {
    const contact = await nostling.addContact({
      identityId: values.identityId,
      npub: values.npub,
      alias: values.alias || undefined,
    });
    if (contact && contact.identityId === selectedIdentityId) {
      setSelectedContactId(contact.id);
    }
  };

  const handleSendMessage = async (plaintext: string) => {
    if (!selectedIdentityId || !selectedContactId) return false;

    const message = await nostling.sendMessage({
      identityId: selectedIdentityId,
      contactId: selectedContactId,
      plaintext,
    });

    return Boolean(message);
  };

  const handleRefreshMessages = async () => {
    if (!selectedIdentityId || !selectedContactId) return;
    await nostling.refreshMessages(selectedIdentityId, selectedContactId);
  };

  useEffect(() => {
    if (!selectedIdentityId || !selectedContactId) return;
    nostling.refreshMessages(selectedIdentityId, selectedContactId);
  }, [nostling.refreshMessages, selectedContactId, selectedIdentityId]);

  const handleShowRelayConfig = () => {
    setCurrentView('relay-config');
  };

  const handleReturnToChat = () => {
    setCurrentView('chat');
  };

  // Relay management methods
  const loadRelaysForIdentity = async (identityId: string) => {
    try {
      const relays = await (window.api?.nostling?.relays?.get(identityId) ?? Promise.resolve([]));
      setCurrentRelays(relays);
    } catch (error) {
      console.warn(`Failed to load relays for identity ${identityId}:`, error);
      setCurrentRelays([]);
    }
  };

  const saveRelaysForIdentity = async (identityId: string, relays: NostlingRelayEndpoint[]) => {
    try {
      const result = await (window.api?.nostling?.relays?.set(identityId, relays) ?? Promise.resolve({ config: undefined, conflict: undefined }));

      if (result?.conflict?.conflicted) {
        setConflictMessage(result.conflict.message || 'Configuration conflict detected');
        setConflictModalOpen(true);
      } else if (result?.config) {
        setCurrentRelays(result.config.perIdentity?.[identityId] || result.config.defaults || relays);
        setConflictModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to save relays:', error);
    }
  };

  const reloadRelaysForIdentity = async (identityId: string) => {
    try {
      const relays = await (window.api?.nostling?.relays?.reload(identityId) ?? Promise.resolve([]));
      setCurrentRelays(relays);
      setConflictModalOpen(false);
    } catch (error) {
      console.error('Failed to reload relays:', error);
    }
  };

  const subscribeToRelayStatus = () => {
    return window.api?.nostling?.relays?.onStatusChange((url, status) => {
      setRelayStatus((prev) => ({ ...prev, [url]: status }));
    }) ?? (() => {});
  };

  const initialLoadRelayStatus = async () => {
    try {
      const status = await (window.api?.nostling?.relays?.getStatus() ?? Promise.resolve({}));
      setRelayStatus(status);
    } catch (error) {
      console.error('Failed to load relay status:', error);
      setRelayStatus({});
    }
  };

  // Load relays when identity changes
  useEffect(() => {
    if (selectedIdentityId) {
      loadRelaysForIdentity(selectedIdentityId);
    } else {
      setCurrentRelays([]);
    }
  }, [selectedIdentityId]);

  // Subscribe to relay status updates on mount
  useEffect(() => {
    initialLoadRelayStatus();
    const unsubscribe = subscribeToRelayStatus();
    return unsubscribe;
  }, []);

  return (
    <Flex className="app-shell" direction="column" h="100vh" bg="#0f172a">
      <Header
        onShowHelp={() => setHelpModalOpen(true)}
        onShowRelayConfig={handleShowRelayConfig}
      />
      <Flex flex="1" overflow="hidden">
        <Sidebar
          identities={nostling.identities}
          contacts={nostling.contacts}
          selectedIdentityId={selectedIdentityId}
          selectedContactId={selectedContactId}
          onSelectIdentity={setSelectedIdentityId}
          onSelectContact={setSelectedContactId}
          onOpenIdentityModal={() => setIdentityModalOpen(true)}
          onOpenContactModal={() => setContactModalOpen(true)}
        />
        <Box as="main" flex="1" p="4" overflowY="auto">
          {currentView === 'chat' ? (
            <Stack gap="4">
              <NostlingStatusCard
                statusText={nostling.nostlingStatusText}
                queueSummary={nostling.queueSummary}
                lastSync={nostling.lastSync}
                lastError={nostling.lastError}
                onRetryFailed={nostling.retryFailedMessages}
              />
              <ConversationPane
                identity={selectedIdentity}
                contact={selectedContact}
                messages={conversationMessages}
                onSend={handleSendMessage}
                onRefresh={handleRefreshMessages}
                isRefreshing={messagesLoading}
                queueSummary={nostling.queueSummary}
              />
              <StateTable />
            </Stack>
          ) : (
            <Box borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="md" bg="whiteAlpha.50" p="4">
              <HStack justify="space-between" mb="4">
                <Heading size="sm" color="gray.300">
                  Relay Configuration
                </Heading>
                <Button size="sm" variant="outline" onClick={handleReturnToChat} className="relay-config-done-button">
                  Done
                </Button>
              </HStack>

              {selectedIdentity ? (
                <RelayTable
                  identityId={selectedIdentity.id}
                  relays={currentRelays}
                  status={relayStatus as Record<string, 'connected' | 'connecting' | 'disconnected' | 'error'>}
                  onChange={(updated: NostlingRelayEndpoint[]) => saveRelaysForIdentity(selectedIdentity.id, updated)}
                  onConflict={(msg: string) => {
                    setConflictMessage(msg);
                    setConflictModalOpen(true);
                  }}
                  onStatusHover={(url, status) => {
                    if (url && status) {
                      setRelayHoverInfo({ url, status });
                    } else {
                      setRelayHoverInfo(null);
                    }
                  }}
                />
              ) : (
                <Text color="gray.500">Select an identity to configure relays.</Text>
              )}
            </Box>
          )}
        </Box>
      </Flex>
      <IdentityModal
        isOpen={identityModalOpen}
        onClose={() => setIdentityModalOpen(false)}
        onSubmit={handleCreateIdentity}
      />
      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        onSubmit={handleAddContact}
        identities={nostling.identities}
        defaultIdentityId={selectedIdentityId}
      />
      <HelpModal
        isOpen={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
      />
      <RelayConflictModal
        isOpen={conflictModalOpen}
        conflictMessage={conflictMessage}
        onReload={() => selectedIdentity && reloadRelaysForIdentity(selectedIdentity.id)}
        onOverwrite={() => selectedIdentity && saveRelaysForIdentity(selectedIdentity.id, currentRelays)}
        onCancel={() => {
          setConflictModalOpen(false);
          selectedIdentity && reloadRelaysForIdentity(selectedIdentity.id);
        }}
      />
      <Footer
        version={status?.version}
        updateState={updateState}
        onRefresh={refresh}
        onDownload={download}
        onRestart={restart}
        nostlingStatus={nostling.nostlingStatusText}
        nostlingError={nostling.lastError}
        relayHoverInfo={relayHoverInfo}
      />
    </Flex>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ChakraProvider value={system}>
    <App />
  </ChakraProvider>
);
