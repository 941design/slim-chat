import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  ChakraProvider,
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
  Textarea,
  Menu,
  Portal,
  Separator,
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
import { startConversationPoller } from './utils/conversation-poller';
import { shouldSubmitOnKeyDown } from './utils/keyboard-submit';
import { useNostlingState } from './nostling/state';
import { RelayTable } from './components/RelayTable';
import { RelayConflictModal } from './components/RelayConflictModal';
import { ThemeSelectionPanel, ThemeVariableSliders, ThemeInfo } from './components/ThemeSelectionPanel';
import { SubPanel } from './components/SubPanel';
import { createThemeSystem, getThemeIdForIdentity, getSemanticColors } from './themes/useTheme';
import { ThemeGenerator, type ThemeGeneratorInput } from './themes/generator';
import type { ThemeSemanticColors } from './themes/useTheme';
import { ThemeProvider, ColorProvider, useThemeColors } from './themes/ThemeContext';
import type { ThemeId, ThemeMetadata } from './themes/definitions';
import { getAllThemes } from './themes/definitions';
import { QrCodeScannerModal } from './components/QrCodeScannerModal';
import { QrCodeDisplayModal } from './components/QrCodeDisplayModal';
import { CameraIcon, QrCodeIcon } from './components/qr-icons';
import { AvatarWithBadge } from './components/AvatarWithBadge';
import { getPreferredDisplayName } from './utils/sidebar';

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

// Copy icon for clipboard
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

const PencilIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20.3 7.7l-1.4-1.4z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.71 4.29 12 10.59l6.29-6.3z" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

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
  const colors = useThemeColors();
  const { entries, loading } = useStateEntries();
  const rows = Object.entries(entries);

  if (loading) {
    return <Text color={colors.textSubtle}>Loading...</Text>;
  }

  if (rows.length === 0) {
    return (
      <Text className="state-table-empty" color={colors.textSubtle}>
        No state entries found
      </Text>
    );
  }

  return (
    <Box className="state-table-container" data-testid="state-table">
      <Heading size="sm" color={colors.textMuted} mb="3">
        Database State Entries
      </Heading>
      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader color={colors.textMuted}>Key</Table.ColumnHeader>
            <Table.ColumnHeader color={colors.textMuted}>Value</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map(([key, value]) => (
            <Table.Row key={key} className="state-table-row">
              <Table.Cell color={colors.textMuted} fontFamily="mono" fontSize="xs">
                {key}
              </Table.Cell>
              <Table.Cell color={colors.textMuted} fontFamily="mono" fontSize="xs">
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
  onShowAbout: () => void;
  onShowRelayConfig: () => void;
  currentTheme: ThemeId;
  onThemeChange: (themeId: ThemeId) => Promise<void>;
  identityId: string | null;
  onShowThemeSelection: () => void;
}

function Header({ onShowAbout, onShowRelayConfig, currentTheme, onThemeChange, identityId, onShowThemeSelection }: HeaderProps) {
  const colors = useThemeColors();
  return (
    <Box
      as="header"
      className="app-header"
      px="4"
      py="3"
      borderBottomWidth="1px"
      borderColor={colors.border}
      bg={colors.surfaceBg}
      data-testid="app-header"
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
              color={colors.textMuted}
              _hover={{ color: colors.text, bg: colors.surfaceBgSubtle }}
            >
              <HamburgerIcon />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content
                bg={colors.menuBg}
                borderColor={colors.borderSubtle}
                borderWidth="1px"
                borderRadius="md"
                py="1"
                minW="180px"
                data-testid="app-menu"
              >
                <Menu.Item
                  value="relay-config"
                  onClick={onShowRelayConfig}
                  px="3"
                  py="2"
                  cursor="pointer"
                  _hover={{ bg: colors.surfaceBgSubtle }}
                >
                  <HStack gap="2">
                    <SettingsIcon />
                    <Text color={colors.text}>Relay Configuration</Text>
                  </HStack>
                </Menu.Item>
                <Menu.Separator borderColor={colors.borderSubtle} />
                <Menu.Item
                  value="theme"
                  onClick={onShowThemeSelection}
                  disabled={!identityId}
                  data-testid="theme-panel-trigger"
                  px="3"
                  py="2"
                  cursor={identityId ? 'pointer' : 'not-allowed'}
                  _hover={identityId ? { bg: colors.surfaceBgSubtle } : undefined}
                >
                  <HStack gap="2">
                    <Text color={colors.text} fontSize="sm">Select Theme</Text>
                  </HStack>
                </Menu.Item>
                <Menu.Separator borderColor={colors.borderSubtle} />
                <Menu.Item
                  value="about"
                  data-value="about"
                  onClick={onShowAbout}
                  px="3"
                  py="2"
                  cursor="pointer"
                  _hover={{ bg: colors.surfaceBgSubtle }}
                >
                  <HStack gap="2">
                    <HelpIcon />
                    <Text color={colors.text}>About</Text>
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
  messageHoverInfo?: string | null;
}

function Footer({ version, updateState, onRefresh, onDownload, onRestart, nostlingStatus, nostlingError, relayHoverInfo, messageHoverInfo }: FooterProps) {
  const colors = useThemeColors();
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
      borderColor={colors.border}
      bg={colors.surfaceBg}
      alignItems="center"
      fontSize="sm"
      data-testid="app-footer"
    >
      <HStack gap="2">
        <Text className="footer-version" color={colors.textSubtle} fontFamily="mono" fontSize="xs">
          {version ? `v${version}` : 'Loading...'}
        </Text>
        <Text color={colors.textSubtle}>•</Text>
        <Text className="footer-status" color={colors.textMuted}>{statusText}</Text>
        {nostlingStatus && (
          <>
            <Text color={colors.textSubtle}>•</Text>
            <Text className="nostling-status" color="purple.200">
              {nostlingStatus}
            </Text>
          </>
        )}
        {nostlingError && (
          <>
            <Text color={colors.textSubtle}>•</Text>
            <Text className="nostling-error" color="red.300" title={nostlingError} maxW="400px" truncate>
              {nostlingError}
            </Text>
          </>
        )}
        {relayHoverInfo && (
          <>
            <Text color={colors.textSubtle}>•</Text>
            <Text className="relay-hover-info" color={relayHoverInfo.status === 'connected' ? 'green.300' : relayHoverInfo.status === 'connecting' ? 'yellow.300' : 'red.300'} title={`${relayHoverInfo.url}: ${relayHoverInfo.status}`} maxW="400px" truncate>
              {relayHoverInfo.url}: {relayHoverInfo.status}
            </Text>
          </>
        )}
        {messageHoverInfo && (
          <>
            <Text color={colors.textSubtle}>•</Text>
            <Text className="message-hover-info" color={colors.textMuted} maxW="400px" truncate>
              {messageHoverInfo}
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

function formatTimeOnly(timestamp?: string): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateStr = date.toDateString();
  if (dateStr === today.toDateString()) return 'Today';
  if (dateStr === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface NostlingStatusCardProps {
  statusText: string;
  queueSummary: { queued: number; sending: number; errors: number; lastActivity?: string };
  lastSync: string | null;
  lastError: string | null;
  onRetryFailed?: () => void;
}

function NostlingStatusCard({ statusText, queueSummary, lastSync, lastError, onRetryFailed }: NostlingStatusCardProps) {
  const colors = useThemeColors();
  const hasQueue = queueSummary.queued > 0 || queueSummary.sending > 0 || queueSummary.errors > 0;

  return (
    <Box
      borderWidth="1px"
      borderColor={colors.border}
      borderRadius="md"
      bg={colors.surfaceBgSubtle}
      p="4"
      mb="4"
      className="nostling-status-card"
      data-testid="nostling-status-card"
    >
      <Heading size="sm" color={colors.textMuted} mb="3">
        Nostling State
      </Heading>
      <VStack align="start" gap="2">
        <HStack>
          <Text color={colors.textMuted}>Status:</Text>
          <Badge colorPalette={queueSummary.errors > 0 ? 'red' : hasQueue ? 'orange' : 'green'}>{statusText}</Badge>
        </HStack>
        <HStack>
          <Text color={colors.textMuted}>Queue:</Text>
          <Text color={colors.text}>
            {queueSummary.queued} queued • {queueSummary.sending} sending • {queueSummary.errors} errors
          </Text>
          {queueSummary.errors > 0 && onRetryFailed && (
            <Button size="xs" colorPalette="orange" variant="outline" onClick={onRetryFailed}>
              Retry Failed
            </Button>
          )}
        </HStack>
        <Text color={colors.textMuted}>Last activity: {formatTimestamp(queueSummary.lastActivity)}</Text>
        <Text color={colors.textMuted}>Last sync: {formatTimestamp(lastSync || undefined)}</Text>
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

function IdentityList({
  identities,
  selectedId,
  onSelect,
  onOpenCreate,
  onShowQr,
  onRename,
  unreadCounts,
  newlyArrived,
}: {
  identities: NostlingIdentity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenCreate: () => void;
  onShowQr: (identity: NostlingIdentity) => void;
  onRename: (id: string, label: string) => Promise<void>;
  unreadCounts?: Record<string, number>;
  newlyArrived?: Set<string>;
}) {
  const colors = useThemeColors();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const startEditing = (identity: NostlingIdentity, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingId(identity.id);
    setDraftLabel(identity.label);
  };

  const cancelEditing = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setEditingId(null);
    setDraftLabel('');
  };

  const saveEditing = async (identityId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const trimmed = draftLabel.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }
    await onRename(identityId, trimmed);
    setEditingId(null);
  };

  return (
    <Box data-testid="identity-list">
      <HStack justify="space-between" mb="2" className="group">
        <Heading size="sm" color={colors.textMuted}>
          Identities
        </Heading>
        <IconButton
          size="sm"
          aria-label="Create identity"
          title="Create or import identity"
          onClick={onOpenCreate}
          colorPalette="blue"
          variant="ghost"
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.15s"
        >
          <PlusIcon />
        </IconButton>
      </HStack>
      <VStack align="stretch" gap="2">
        {identities.length === 0 && (
          <Text fontSize="sm" color={colors.textSubtle}>
            No identities yet. Create or import one to get started.
          </Text>
        )}
        {identities.map((identity) => {
          const displayName = getPreferredDisplayName({
            profileName: identity.profileName,
            alias: identity.alias ?? identity.label,
            npub: identity.npub,
          });
          const unreadCount = unreadCounts?.[identity.id] || 0;
          const isNewlyArrived = newlyArrived?.has(identity.id) || false;
          const hasUnread = unreadCount > 0;

          // Determine CSS classes for animation
          const animationClass = isNewlyArrived
            ? 'identity-unread-flash'
            : hasUnread
              ? 'identity-unread-pulse'
              : '';

          return (
            <Box
              key={identity.id}
              borderWidth="1px"
              borderColor={
                hasUnread
                  ? 'brand.400'
                  : selectedId === identity.id
                    ? 'brand.400'
                    : colors.border
              }
              borderRadius="md"
              p="2"
              bg={selectedId === identity.id ? colors.surfaceBgSelected : 'transparent'}
              _hover={{ borderColor: 'brand.400', cursor: 'pointer' }}
              onClick={() => onSelect(identity.id)}
              data-testid={`identity-item-${identity.id}`}
              data-npub={identity.npub}
              className={`group ${animationClass}`}
              position="relative"
            >
              <HStack justify="space-between" align="center" gap="2">
                {editingId === identity.id ? (
                  <HStack align="center" gap="0" flex="1">
                    <Input
                      ref={inputRef}
                      size="sm"
                      value={draftLabel}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(event) => setDraftLabel(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void saveEditing(identity.id);
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelEditing();
                        }
                      }}
                    />
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Save identity name"
                      onClick={(event) => void saveEditing(identity.id, event)}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                    >
                      <CheckIcon />
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Cancel editing"
                      onClick={(event) => cancelEditing(event)}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                    >
                      <CloseIcon />
                    </IconButton>
                  </HStack>
                ) : (
                  <HStack flex="1" gap="2">
                    <AvatarWithBadge
                      displayName={displayName}
                      pictureUrl={identity.picture}
                      profileSource={identity.profileSource}
                      size={32}
                      badgeBackgroundColor={colors.surfaceBg}
                      badgeIconColor={colors.text}
                    />
                    <Text color={colors.text} fontWeight="semibold" lineClamp={1} flex="1" fontFamily="body">
                      {displayName}
                    </Text>
                    {hasUnread && (
                      <Badge
                        colorPalette="blue"
                        variant="solid"
                        borderRadius="full"
                        fontSize="xs"
                        px="2"
                        minW="6"
                        textAlign="center"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </HStack>
                )}
                {editingId !== identity.id && (
                  <HStack
                    gap="0"
                    opacity={0}
                    _groupHover={{ opacity: selectedId === identity.id ? 1 : 0 }}
                    pointerEvents={selectedId === identity.id ? 'auto' : 'none'}
                    transition="opacity 0.15s"
                  >
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Edit identity name"
                      title="Rename identity"
                      onClick={(event) => startEditing(identity, event)}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Show QR code"
                      title="Show QR code for this identity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowQr(identity);
                      }}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                    >
                      <QrCodeIcon />
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Copy npub"
                      title="Copy npub to clipboard"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(identity.npub);
                      }}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                    >
                      <CopyIcon />
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Delete identity"
                      title="Identities cannot be deleted"
                      disabled
                      color={colors.textSubtle}
                    >
                      <TrashIcon />
                    </IconButton>
                  </HStack>
                )}
              </HStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

function ContactList({
  contacts,
  selectedId,
  onSelect,
  onOpenAdd,
  disabled,
  onRequestDelete,
  onRename,
  onShowQr,
  unreadCounts,
  newlyArrived,
}: {
  contacts: NostlingContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenAdd: () => void;
  disabled: boolean;
  onRequestDelete: (contact: NostlingContact) => void;
  onRename: (contactId: string, alias: string) => Promise<void>;
  onShowQr: (contact: NostlingContact) => void;
  unreadCounts?: Record<string, number>;
  newlyArrived?: Set<string>;
}) {
  const colors = useThemeColors();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAlias, setDraftAlias] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const startEditing = (contact: NostlingContact, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingId(contact.id);
    setDraftAlias(contact.alias);
  };

  const cancelEditing = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setEditingId(null);
    setDraftAlias('');
  };

  const saveEditing = async (contactId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const trimmed = draftAlias.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }
    await onRename(contactId, trimmed);
    setEditingId(null);
  };

  return (
    <Box mt="6" data-testid="contact-list">
      <HStack justify="space-between" mb="2" className="group">
        <Heading size="sm" color={colors.textMuted}>
          Contacts
        </Heading>
        <IconButton
          size="sm"
          aria-label="Add contact"
          title={disabled ? 'Create an identity first' : 'Add contact'}
          onClick={onOpenAdd}
          colorPalette="blue"
          variant="ghost"
          disabled={disabled}
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.15s"
        >
          <PlusIcon />
        </IconButton>
      </HStack>
      <VStack align="stretch" gap="2">
        {(contacts?.length || 0) === 0 && (
          <Text fontSize="sm" color={colors.textSubtle}>
            {disabled ? 'Add an identity to manage contacts.' : 'No contacts yet.'}
          </Text>
        )}
        {(contacts || []).map((contact) => {
          const displayName = getPreferredDisplayName({
            profileName: contact.profileName,
            alias: contact.alias,
            npub: contact.npub,
          });
          const unreadCount = unreadCounts?.[contact.id] || 0;
          const isNewlyArrived = newlyArrived?.has(contact.id) || false;
          const hasUnread = unreadCount > 0;

          // Determine CSS classes for animation
          const animationClass = isNewlyArrived
            ? 'contact-unread-flash'
            : hasUnread
              ? 'contact-unread-pulse'
              : '';

          return (
            <Box
              key={contact.id}
              borderWidth="1px"
              borderColor={
                hasUnread
                  ? 'brand.400'
                  : selectedId === contact.id
                    ? 'brand.400'
                    : colors.border
              }
              borderRadius="md"
              p="2"
              bg={selectedId === contact.id ? colors.surfaceBgSelected : 'transparent'}
              _hover={{ borderColor: 'brand.400', cursor: 'pointer' }}
              onClick={() => onSelect(contact.id)}
              data-testid={`contact-item-${contact.id}`}
              className={`group ${animationClass}`}
              position="relative"
            >
              <HStack justify="space-between" align="center" gap="2">
                {editingId === contact.id ? (
                  <HStack align="center" gap="0" flex="1">
                    <Input
                      ref={inputRef}
                      size="sm"
                      value={draftAlias}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(event) => setDraftAlias(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void saveEditing(contact.id);
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelEditing();
                        }
                      }}
                    />
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Save contact alias"
                      onClick={(event) => void saveEditing(contact.id, event)}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                    >
                      <CheckIcon />
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Cancel editing"
                      onClick={(event) => cancelEditing(event)}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                    >
                      <CloseIcon />
                    </IconButton>
                  </HStack>
                ) : (
                  <HStack flex="1" gap="2">
                    <AvatarWithBadge
                      displayName={displayName}
                      pictureUrl={contact.picture}
                      profileSource={contact.profileSource}
                      size={32}
                      badgeBackgroundColor={colors.surfaceBg}
                      badgeIconColor={colors.text}
                    />
                    <Text color={colors.text} fontWeight="semibold" lineClamp={1} flex="1" fontFamily="body">
                      {displayName}
                    </Text>
                    {hasUnread && (
                      <Badge
                        colorPalette="blue"
                        variant="solid"
                        borderRadius="full"
                        fontSize="xs"
                        px="2"
                        minW="6"
                        textAlign="center"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </HStack>
                )}
                <HStack
                  gap="0"
                  opacity={0}
                  _groupHover={{ opacity: selectedId === contact.id ? 1 : 0 }}
                  pointerEvents={selectedId === contact.id ? 'auto' : 'none'}
                  transition="opacity 0.15s"
                >
                  {editingId !== contact.id && (
                    <>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        aria-label="Edit contact alias"
                        title="Rename contact"
                        onClick={(event) => startEditing(contact, event)}
                        color={colors.textSubtle}
                        _hover={{ color: colors.textMuted }}
                      >
                        <PencilIcon />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        aria-label="Show QR code"
                        title="Show QR code for this contact"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowQr(contact);
                        }}
                        color={colors.textSubtle}
                        _hover={{ color: colors.textMuted }}
                      >
                        <QrCodeIcon />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        aria-label="Copy npub"
                        title="Copy npub to clipboard"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(contact.npub);
                        }}
                        color={colors.textSubtle}
                        _hover={{ color: colors.textMuted }}
                      >
                        <CopyIcon />
                      </IconButton>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        aria-label="Delete contact"
                        title="Remove contact"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestDelete(contact);
                        }}
                        color={colors.textSubtle}
                        _hover={{ color: colors.textMuted }}
                        data-testid={`delete-contact-${contact.id}`}
                      >
                        <TrashIcon />
                      </IconButton>
                    </>
                  )}
                </HStack>
              </HStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

function DateSeparator({ date }: { date: string }) {
  const colors = useThemeColors();
  return (
    <HStack my="3" gap="3">
      <Separator flex="1" borderColor={colors.border} />
      <Text fontSize="xs" color={colors.textSubtle} whiteSpace="nowrap">
        {date}
      </Text>
      <Separator flex="1" borderColor={colors.border} />
    </HStack>
  );
}

function MessageBubble({
  message,
  isOwn,
  onMouseEnter,
  onMouseLeave,
}: {
  message: {
    id: string;
    content: string;
    timestamp: string;
    status: 'queued' | 'sending' | 'sent' | 'error';
  };
  isOwn: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const colors = useThemeColors();
  const isInflight = message.status === 'queued' || message.status === 'sending';

  return (
    <HStack justify={isOwn ? 'flex-end' : 'flex-start'} align="flex-end" mb="2" gap="2" data-testid="message-bubble">
      <Box
        maxW="70%"
        bg={isOwn ? colors.ownBubbleBg : colors.surfaceBgSubtle}
        borderWidth="1px"
        borderColor={isOwn ? colors.ownBubbleBorder : colors.border}
        borderRadius="md"
        p="3"
        className={isInflight ? 'message-bubble message-inflight' : 'message-bubble'}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Text color={isOwn ? colors.ownBubbleText : colors.text} whiteSpace="pre-wrap" fontFamily="body">
          {message.content}
        </Text>
      </Box>
    </HStack>
  );
}

interface ConversationPaneProps {
  identity: NostlingIdentity | null;
  contact: NostlingContact | null;
  messages: NostlingMessage[];
  onSend: (plaintext: string) => Promise<boolean>;
  onMessageHover: (info: string | null) => void;
}

function ConversationPane({
  identity,
  contact,
  messages,
  onSend,
  onMessageHover,
}: ConversationPaneProps) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = Boolean(identity && contact && draft.trim().length > 0 && !isSending);

  const handleMessageHover = (message: NostlingMessage | null) => {
    if (message) {
      const sender = message.direction === 'outgoing' ? 'you' : contact?.alias || contact?.profileName || 'contact';
      onMessageHover(`sent by ${sender} on ${formatTimestamp(message.timestamp)}`);
    } else {
      onMessageHover(null);
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmitOnKeyDown(event)) {
      event.preventDefault();
      handleSend();
    }
  };

  if (!identity) {
    return (
      <Box p="6" className="conversation-pane" data-testid="conversation-pane">
        <Heading size="sm" color={colors.textMuted} mb="2">
          Start by creating an identity
        </Heading>
        <Text color={colors.textSubtle}>Create or import an identity to begin messaging.</Text>
      </Box>
    );
  }

  if (!contact) {
    return (
      <Box p="6" className="conversation-pane" data-testid="conversation-pane">
        <Heading size="sm" color={colors.textMuted} mb="2">
          Select a contact
        </Heading>
        <Text color={colors.textSubtle}>Choose a contact to view and send messages.</Text>
      </Box>
    );
  }

  return (
    <Flex direction="column" h="100%" className="conversation-pane" data-testid="conversation-pane">
      <Box ref={listRef} px="4" pt="4" pb="2" flex="1" overflowY="auto" className="conversation-messages">
        {messages.length === 0 && (
          <Text color={colors.textSubtle} fontSize="sm">
            No messages yet. Send a welcome message to start the handshake.
          </Text>
        )}
        {(() => {
          let prevDate: string | null = null;
          return messages.map((message) => {
            const msgDate = new Date(message.timestamp).toDateString();
            const showSeparator = msgDate !== prevDate;
            prevDate = msgDate;
            return (
              <Fragment key={message.id}>
                {showSeparator && <DateSeparator date={formatRelativeDate(message.timestamp)} />}
                <MessageBubble
                  message={{
                    id: message.id,
                    content: message.content,
                    timestamp: message.timestamp,
                    status: message.status,
                  }}
                  isOwn={message.direction === 'outgoing'}
                  onMouseEnter={() => handleMessageHover(message)}
                  onMouseLeave={() => handleMessageHover(null)}
                />
              </Fragment>
            );
          });
        })()}
      </Box>

      <Separator borderColor={colors.border} />
      <Box p="4" bg={colors.surfaceBg}>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          resize="vertical"
          minH="100px"
          color={colors.text}
          borderColor={colors.borderSubtle}
          _placeholder={{ color: colors.textSubtle }}
        />
        {sendError && (
          <Text color="red.300" fontSize="sm" mt="2">
            {sendError}
          </Text>
        )}
      </Box>
    </Flex>
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
  const [scannerOpen, setScannerOpen] = useState(false);
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
              <HStack gap="2" align="end">
                <Field.Root invalid={npubMissing} required flex="1">
                  <Field.Label>Contact npub</Field.Label>
                  <Input
                    placeholder="npub..."
                    value={form.npub}
                    onChange={(event) => setForm((prev) => ({ ...prev, npub: event.target.value }))}
                  />
                  {npubMissing && <Field.ErrorText>npub is required.</Field.ErrorText>}
                </Field.Root>
                <IconButton
                  size="md"
                  variant="outline"
                  aria-label="Scan QR code"
                  title="Scan QR code from camera"
                  onClick={() => setScannerOpen(true)}
                  disabled={identityMissing || submitting}
                >
                  <CameraIcon />
                </IconButton>
              </HStack>
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
      <QrCodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        identityId={form.identityId}
        onNpubScanned={(npub) => {
          setForm((prev) => ({ ...prev, npub }));
          setScannerOpen(false);
        }}
      />
    </Dialog.Root>
  );
}

function DeleteContactDialog({
  contact,
  isOpen,
  onClose,
  onConfirm,
  loading,
}: {
  contact: NostlingContact | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading: boolean;
}) {
  const colors = useThemeColors();
  const displayName = contact ? getPreferredDisplayName({ profileName: contact.profileName, alias: contact.alias, npub: contact.npub }) : '';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()} closeOnInteractOutside={!loading}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content data-testid="delete-contact-dialog">
          <Dialog.Header>
            <Dialog.Title>Remove contact</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger disabled={loading} />
          <Dialog.Body>
            <Text color={colors.text}>
              Are you sure you want to remove {displayName || 'this contact'}?
            </Text>
          </Dialog.Body>
          <Dialog.Footer>
            <HStack gap="2">
              <Button variant="ghost" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button colorPalette="red" onClick={onConfirm} loading={loading} data-testid="confirm-delete-contact-button">
                Delete
              </Button>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

function AboutView({
  onReturn,
  nostlingStatusText,
  queueSummary,
  lastSync,
  lastError,
  onRetryFailed,
}: {
  onReturn: () => void;
  nostlingStatusText: string;
  queueSummary: { queued: number; sending: number; errors: number; lastActivity?: string };
  lastSync: string | null;
  lastError: string | null;
  onRetryFailed?: () => void;
}) {
  const colors = useThemeColors();

  const actions = [
    {
      label: 'Return',
      onClick: onReturn,
      variant: 'outline' as const,
      colorPalette: 'blue' as const,
      testId: 'about-return-button',
    },
  ];

  return (
    <SubPanel
      title="About Nostling"
      actions={actions}
      testId="about-view"
    >
      <Stack gap="4">
        <Box borderWidth="1px" borderColor={colors.border} borderRadius="md" bg={colors.surfaceBg} p="4">
          <Heading size="sm" color={colors.text} mb="2">
            Nostling Overview
          </Heading>
          <Text color={colors.textMuted} fontSize="sm">
            Nostling is a desktop messaging application built on the Nostr protocol. It provides secure,
            decentralized communication through end-to-end encrypted messages.
          </Text>
        </Box>

        <Box borderWidth="1px" borderColor={colors.border} borderRadius="md" bg={colors.surfaceBg} p="4">
          <Heading size="sm" color={colors.text} mb="2">
            Getting Started
          </Heading>
          <VStack align="start" gap="2">
            <Text color={colors.textMuted} fontSize="sm">
              1. Create or import an identity using the + button in the Identities section.
            </Text>
            <Text color={colors.textMuted} fontSize="sm">
              2. Configure your relay servers in the menu → Relay Configuration.
            </Text>
            <Text color={colors.textMuted} fontSize="sm">
              3. Add contacts using their npub (public key).
            </Text>
            <Text color={colors.textMuted} fontSize="sm">
              4. Start messaging!
            </Text>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderColor={colors.border} borderRadius="md" bg={colors.surfaceBg} p="4">
          <Heading size="sm" color={colors.text} mb="2">
            Keyboard Shortcuts
          </Heading>
          <VStack align="start" gap="2">
            <HStack>
              <Badge colorPalette="gray" fontFamily="mono" fontSize="xs" bg={colors.surfaceBgSubtle}>
                Enter
              </Badge>
              <Text color={colors.textMuted} fontSize="sm">
                Send message
              </Text>
            </HStack>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderColor={colors.border} borderRadius="md" bg={colors.surfaceBg} p="4">
          <Heading size="sm" color={colors.text} mb="3">
            Nostling State
          </Heading>
          <NostlingStatusCard
            statusText={nostlingStatusText}
            queueSummary={queueSummary}
            lastSync={lastSync}
            lastError={lastError}
            onRetryFailed={onRetryFailed}
          />
          <Box mt="3" borderWidth="1px" borderColor={colors.borderSubtle} borderRadius="md" bg={colors.surfaceBgSubtle} p="3">
            <StateTable />
          </Box>
        </Box>

        <Box borderWidth="1px" borderColor={colors.border} borderRadius="md" bg={colors.surfaceBg} p="4">
          <Heading size="sm" color={colors.text} mb="2">
            Need More Help?
          </Heading>
          <Text color={colors.textMuted} fontSize="sm">
            Visit the project repository for documentation, bug reports, and feature requests.
          </Text>
        </Box>
      </Stack>
    </SubPanel>
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
  onRequestDeleteContact,
  onRenameIdentity,
  onRenameContact,
  unreadCounts,
  newlyArrived,
  identityUnreadCounts,
  newlyArrivedIdentities,
  themeSliders,
  themeInfo,
}: {
  identities: NostlingIdentity[];
  contacts: Record<string, NostlingContact[]>;
  selectedIdentityId: string | null;
  selectedContactId: string | null;
  onSelectIdentity: (id: string) => void;
  onSelectContact: (id: string) => void;
  onOpenIdentityModal: () => void;
  onOpenContactModal: () => void;
  onRequestDeleteContact: (contact: NostlingContact) => void;
  onRenameIdentity: (identityId: string, label: string) => Promise<void>;
  onRenameContact: (contactId: string, alias: string) => Promise<void>;
  unreadCounts?: Record<string, number>;
  newlyArrived?: Set<string>;
  identityUnreadCounts?: Record<string, number>;
  newlyArrivedIdentities?: Set<string>;
  themeSliders?: React.ReactNode;
  themeInfo?: { theme: ThemeMetadata; isCurrentTheme: boolean } | null;
}) {
  const colors = useThemeColors();
  const currentContacts = selectedIdentityId ? contacts[selectedIdentityId] || [] : [];
  const [qrDisplayIdentity, setQrDisplayIdentity] = useState<NostlingIdentity | null>(null);
  const [qrDisplayContact, setQrDisplayContact] = useState<NostlingContact | null>(null);

  // When themeSliders is provided, only show theme configuration (hide identity/contacts)
  const isThemeMode = Boolean(themeSliders);

  return (
    <Box
      as="aside"
      className="sidebar"
      w="280px"
      borderRightWidth="1px"
      borderColor={colors.border}
      bg={colors.surfaceBg}
      p="4"
      data-testid="app-sidebar"
      overflowY="auto"
    >
      <VStack align="stretch" gap="4">
        {isThemeMode ? (
          // Theme mode: show theme info and sliders
          <>
            {themeInfo && (
              <ThemeInfo
                theme={themeInfo.theme}
                isCurrentTheme={themeInfo.isCurrentTheme}
              />
            )}
            {themeSliders}
          </>
        ) : (
          // Normal mode: show identity and contact lists
          <>
            <IdentityList
              identities={identities}
              selectedId={selectedIdentityId}
              onSelect={onSelectIdentity}
              onOpenCreate={onOpenIdentityModal}
              onShowQr={setQrDisplayIdentity}
              onRename={onRenameIdentity}
              unreadCounts={identityUnreadCounts}
              newlyArrived={newlyArrivedIdentities}
            />
            <Separator borderColor={colors.borderSubtle} />
            <ContactList
              contacts={currentContacts}
              selectedId={selectedContactId}
              onSelect={onSelectContact}
              onOpenAdd={onOpenContactModal}
              disabled={identities.length === 0}
              onRequestDelete={onRequestDeleteContact}
              onRename={onRenameContact}
              onShowQr={setQrDisplayContact}
              unreadCounts={unreadCounts}
              newlyArrived={newlyArrived}
            />
          </>
        )}
      </VStack>
      {!isThemeMode && (
        <>
          <QrCodeDisplayModal
            isOpen={qrDisplayIdentity !== null}
            onClose={() => setQrDisplayIdentity(null)}
            npub={qrDisplayIdentity?.npub || ''}
            label={qrDisplayIdentity?.label}
          />
          <QrCodeDisplayModal
            isOpen={qrDisplayContact !== null}
            onClose={() => setQrDisplayContact(null)}
            npub={qrDisplayContact?.npub || ''}
            label={qrDisplayContact?.alias}
          />
        </>
      )}
    </Box>
  );
}

type AppView = 'chat' | 'relay-config' | 'about' | 'themeSelection';

interface AppProps {
  onThemeChange: (themeId: ThemeId, customColors?: ThemeSemanticColors | null) => void;
}

function App({ onThemeChange }: AppProps) {
  const colors = useThemeColors();
  const { status, updateState, refresh, restart, download } = useStatus();
  const nostling = useNostlingState();
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<NostlingContact | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('chat');
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>('obsidian');

  // Theme slider state (managed here so sliders in sidebar can communicate with main panel)
  const [themeCustomColors, setThemeCustomColors] = useState<ThemeSemanticColors | null>(null);

  // Preview typography state (only applied to ThemePreview, not the whole app)
  const [previewTypography, setPreviewTypography] = useState<{
    fonts?: { body: string; heading: string; mono: string };
    fontSizes?: Record<string, string>;
  } | null>(null);

  // Staged theme for sidebar display (tracks the theme being previewed in carousel)
  const [stagedThemeId, setStagedThemeId] = useState<ThemeId | null>(null);

  // Track last selected contact per identity to restore when switching back
  const lastContactPerIdentityRef = useRef<Record<string, string>>({});

  // Relay state management (per-identity)
  const [currentRelays, setCurrentRelays] = useState<NostlingRelayEndpoint[]>([]);
  const [relayStatus, setRelayStatus] = useState<Record<string, string>>({});
  const [relayHoverInfo, setRelayHoverInfo] = useState<{ url: string; status: string } | null>(null);
  const [messageHoverInfo, setMessageHoverInfo] = useState<string | null>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  const selectedIdentity = useMemo(
    () => nostling.identities.find((identity) => identity.id === selectedIdentityId) ?? null,
    [nostling.identities, selectedIdentityId]
  );

  // Track previous identity ID to detect actual identity switches (not just object reference changes)
  const previousIdentityIdRef = useRef<string | null>(null);

  // Update theme when selected identity changes (by ID, not object reference)
  // This prevents clearing custom colors when identity is refreshed from DB
  useEffect(() => {
    // Only update theme if identity ID actually changed (user switched identities)
    if (selectedIdentityId === previousIdentityIdRef.current) {
      return;
    }
    previousIdentityIdRef.current = selectedIdentityId;

    const themeId = getThemeIdForIdentity(selectedIdentity);
    setCurrentThemeId(themeId);
    onThemeChange(themeId, null); // Propagate to Root for ChakraProvider, no custom colors
  }, [selectedIdentity, selectedIdentityId, onThemeChange]);

  // Theme change handler - persists to database
  const handleThemeChange = async (themeId: ThemeId) => {
    if (!selectedIdentityId) {
      console.warn('Cannot change theme: no identity selected');
      return;
    }

    try {
      // If custom colors exist, treat this as a custom theme application
      const effectiveThemeId = themeCustomColors ? 'custom' as ThemeId : themeId;
      await window.api.nostling?.identities.updateTheme(selectedIdentityId, effectiveThemeId);
      // Update local state immediately for responsive UI
      setCurrentThemeId(effectiveThemeId);
      // Pass custom colors to Root when applying a custom theme
      onThemeChange(effectiveThemeId, themeCustomColors);
      // Force refresh of identity list to get updated theme from DB
      await nostling.refreshIdentities();
    } catch (error) {
      console.error('Failed to update theme:', error);
      throw error; // Let ThemeSelectionPanel handle the error display
    }
  };

  const handleRequestDeleteContact = (contact: NostlingContact) => {
    setContactToDelete(contact);
  };

  const handleCloseDeleteContact = () => {
    if (!deletingContact) {
      setContactToDelete(null);
    }
  };

  const handleConfirmDeleteContact = async () => {
    if (!contactToDelete) return;
    setDeletingContact(true);
    try {
      const success = await nostling.removeContact(contactToDelete.id, contactToDelete.identityId);
      if (success && selectedContactId === contactToDelete.id) {
        setSelectedContactId(null);
      }
      if (success) {
        setContactToDelete(null);
      }
    } finally {
      setDeletingContact(false);
    }
  };

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

  // Track contact selection for each identity
  useEffect(() => {
    if (selectedIdentityId && selectedContactId) {
      lastContactPerIdentityRef.current[selectedIdentityId] = selectedContactId;
    }
  }, [selectedIdentityId, selectedContactId]);

  // Handle identity selection with immediate contact restoration (no flicker)
  const handleSelectIdentity = (newIdentityId: string) => {
    if (newIdentityId === selectedIdentityId) return;

    // Get contacts for the target identity
    const targetContacts = nostling.contacts[newIdentityId] || [];

    // Determine which contact to select: remembered or first
    const rememberedContactId = lastContactPerIdentityRef.current[newIdentityId];
    const validRememberedContact = rememberedContactId && targetContacts.some((c) => c.id === rememberedContactId);
    const contactToSelect = validRememberedContact
      ? rememberedContactId
      : targetContacts[0]?.id ?? null;

    // Set both identity and contact atomically
    setSelectedIdentityId(newIdentityId);
    setSelectedContactId(contactToSelect);
  };

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

  const handleRenameIdentity = async (identityId: string, label: string) => {
    await nostling.updateIdentityLabel(identityId, label);
  };

  const handleRenameContact = async (contactId: string, alias: string) => {
    const updated = await nostling.updateContactAlias(contactId, alias);
    if (updated && updated.identityId === selectedIdentityId) {
      setSelectedContactId(updated.id);
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

  useEffect(() => {
    const stopPolling = startConversationPoller({
      identityId: selectedIdentityId,
      contactId: selectedContactId,
      refreshMessages: nostling.refreshMessages,
      intervalMs: 2000,
    });

    return () => stopPolling();
  }, [nostling.refreshMessages, selectedContactId, selectedIdentityId]);

  // Refresh unread counts periodically for ALL identities (to show badge on non-selected identities)
  useEffect(() => {
    if (nostling.identities.length === 0) return;

    // Refresh unread counts for all identities immediately and every 3 seconds
    const refreshAll = () => {
      for (const identity of nostling.identities) {
        nostling.refreshUnreadCounts(identity.id);
      }
    };

    refreshAll();
    const interval = setInterval(refreshAll, 3000);

    return () => clearInterval(interval);
  }, [nostling.identities, nostling.refreshUnreadCounts]);

  // Compute unread conversation counts per identity (number of distinct contacts with unread > 0)
  // Only show counts for non-selected identities
  const unreadConversationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [identityId, contactCounts] of Object.entries(nostling.unreadCounts)) {
      // Skip the selected identity - we don't highlight it
      if (identityId === selectedIdentityId) continue;
      const distinctConversations = Object.values(contactCounts).filter((count) => count > 0).length;
      if (distinctConversations > 0) {
        counts[identityId] = distinctConversations;
      }
    }
    return counts;
  }, [nostling.unreadCounts, selectedIdentityId]);

  // Compute which identities have newly arrived messages (for flash animation)
  // Only for non-selected identities
  const newlyArrivedIdentities = useMemo(() => {
    const identities = new Set<string>();
    for (const [identityId, contactIds] of Object.entries(nostling.newlyArrived)) {
      // Skip the selected identity
      if (identityId === selectedIdentityId) continue;
      if (contactIds.size > 0) {
        identities.add(identityId);
      }
    }
    return identities;
  }, [nostling.newlyArrived, selectedIdentityId]);

  const handleShowRelayConfig = () => {
    setCurrentView('relay-config');
  };

  const handleShowAbout = () => {
    setCurrentView('about');
  };

  const handleShowThemeSelection = () => {
    setCurrentView('themeSelection');
  };

  const handleReturnToChat = () => {
    setCurrentView('chat');
    setThemeCustomColors(null); // Clear custom colors when leaving theme selection
    setPreviewTypography(null); // Clear preview typography when leaving theme selection
  };

  // Handle theme slider changes - generate custom theme colors
  // Typography changes are stored in previewTypography state (preview only, not applied globally)
  const handleThemeSliderChange = useCallback((input: ThemeGeneratorInput) => {
    try {
      const generated = ThemeGenerator.generate(input, false);
      // Convert to resolved theme to get typography
      const resolved = ThemeGenerator.toResolvedTheme(generated);

      // Convert AllSemanticTokens to ThemeSemanticColors
      const semanticColors = generated.semantic as ThemeSemanticColors;
      setThemeCustomColors(semanticColors);

      // Store typography for preview only (NOT applied globally until Apply is clicked)
      if (resolved.typography) {
        setPreviewTypography({
          fonts: resolved.typography.fonts,
          fontSizes: resolved.typography.fontSizes,
        });
      }

      console.log('Generated theme:', generated);
    } catch (err) {
      console.error('Theme generation failed:', err);
    }
  }, []);

  // Handle staged theme change from carousel - clear custom colors/typography and update staged theme
  const handleStagedThemeChange = useCallback((themeId: ThemeId) => {
    setThemeCustomColors(null);
    setPreviewTypography(null);
    setStagedThemeId(themeId);
  }, []);

  useEffect(() => {
    if (currentView !== 'about' && currentView !== 'themeSelection') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCurrentView('chat');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView]);

  // Initialize staged theme when entering theme selection mode
  useEffect(() => {
    if (currentView === 'themeSelection') {
      setStagedThemeId(currentThemeId);
    } else {
      setStagedThemeId(null);
    }
  }, [currentView, currentThemeId]);

  // Get theme metadata for sidebar display
  // Always show theme info when in theme selection mode (fall back to currentThemeId if stagedThemeId not yet set)
  const stagedThemeMetadata = useMemo((): ThemeMetadata | null => {
    if (themeCustomColors) {
      return {
        id: 'custom' as ThemeId,
        name: 'Custom Theme',
        description: 'A custom theme created with sliders',
        previewColors: { primary: '#000', background: '#fff', text: '#000' },
      };
    }
    // Use stagedThemeId, or fall back to currentThemeId when entering theme selection mode
    const effectiveThemeId = stagedThemeId ?? (currentView === 'themeSelection' ? currentThemeId : null);
    if (!effectiveThemeId) return null;
    return getAllThemes().find((t) => t.id === effectiveThemeId) || null;
  }, [themeCustomColors, stagedThemeId, currentView, currentThemeId]);

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
    <Flex className="app-shell" direction="column" h="100vh" bg={colors.appBg} data-testid="app-shell">
      <Header
        onShowAbout={handleShowAbout}
        onShowRelayConfig={handleShowRelayConfig}
        currentTheme={currentThemeId}
        onThemeChange={handleThemeChange}
        identityId={selectedIdentityId}
        onShowThemeSelection={handleShowThemeSelection}
      />
      <Flex flex="1" overflow="hidden">
        <Sidebar
          identities={nostling.identities}
          contacts={nostling.contacts}
          selectedIdentityId={selectedIdentityId}
          selectedContactId={selectedContactId}
          onSelectIdentity={handleSelectIdentity}
          onSelectContact={(contactId) => {
            setSelectedContactId(contactId);
            // Mark messages as read when selecting a contact
            if (selectedIdentityId && contactId) {
              void nostling.markMessagesRead(selectedIdentityId, contactId);
            }
          }}
          onOpenIdentityModal={() => setIdentityModalOpen(true)}
          onOpenContactModal={() => setContactModalOpen(true)}
          onRequestDeleteContact={handleRequestDeleteContact}
          onRenameIdentity={handleRenameIdentity}
          onRenameContact={handleRenameContact}
          unreadCounts={selectedIdentityId ? nostling.unreadCounts[selectedIdentityId] : undefined}
          newlyArrived={selectedIdentityId ? nostling.newlyArrived[selectedIdentityId] : undefined}
          identityUnreadCounts={unreadConversationCounts}
          newlyArrivedIdentities={newlyArrivedIdentities}
          themeSliders={
            currentView === 'themeSelection' ? (
              <ThemeVariableSliders
                onChange={handleThemeSliderChange}
                disabled={false}
              />
            ) : undefined
          }
          themeInfo={
            currentView === 'themeSelection' && stagedThemeMetadata
              ? {
                  theme: stagedThemeMetadata,
                  isCurrentTheme: (stagedThemeId ?? currentThemeId) === currentThemeId && !themeCustomColors,
                }
              : null
          }
        />
        <Flex as="main" direction="column" flex="1" overflow="hidden" borderWidth="1px" borderColor={colors.border} borderRadius="md" bg={colors.surfaceBgSubtle}>
          {currentView === 'chat' ? (
            <ConversationPane
              identity={selectedIdentity}
              contact={selectedContact}
              messages={conversationMessages}
              onSend={handleSendMessage}
              onMessageHover={setMessageHoverInfo}
            />
          ) : currentView === 'relay-config' ? (
            <SubPanel
              title="Relay Configuration"
              actions={[
                {
                  label: 'Done',
                  onClick: handleReturnToChat,
                  variant: 'outline',
                  colorPalette: 'blue',
                  testId: 'relay-config-done-button',
                },
              ]}
              testId="relay-config-view"
            >
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
                <Text color={colors.textSubtle}>Select an identity to configure relays.</Text>
              )}
            </SubPanel>
          ) : currentView === 'themeSelection' ? (
            <ThemeSelectionPanel
              currentTheme={currentThemeId}
              identityId={selectedIdentityId}
              onThemeApply={handleThemeChange}
              onCancel={handleReturnToChat}
              customColors={themeCustomColors}
              previewTypography={previewTypography}
              onStagedThemeChange={handleStagedThemeChange}
            />
          ) : (
            <AboutView
              onReturn={handleReturnToChat}
              nostlingStatusText={nostling.nostlingStatusText}
              queueSummary={nostling.queueSummary}
              lastSync={nostling.lastSync}
              lastError={nostling.lastError}
              onRetryFailed={nostling.retryFailedMessages}
            />
          )}
        </Flex>
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
      <DeleteContactDialog
        contact={contactToDelete}
        isOpen={contactToDelete !== null}
        onClose={handleCloseDeleteContact}
        onConfirm={handleConfirmDeleteContact}
        loading={deletingContact}
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
        messageHoverInfo={messageHoverInfo}
      />
    </Flex>
  );
}

function Root() {
  // Create theme system based on current state
  // Start with obsidian theme as default, App will update based on identity
  const [themeId, setThemeId] = useState<ThemeId>('obsidian');
  const [customColors, setCustomColors] = useState<ThemeSemanticColors | null>(null);
  // For custom themes, use 'obsidian' as base for Chakra system (semantic colors come from ColorProvider)
  const chakraThemeId = customColors ? 'obsidian' : themeId;
  const system = useMemo(() => createThemeSystem(chakraThemeId), [chakraThemeId]);

  // Handle theme changes with optional custom colors
  const handleThemeChange = useCallback((newThemeId: ThemeId, newCustomColors?: ThemeSemanticColors | null) => {
    setThemeId(newThemeId);
    setCustomColors(newCustomColors ?? null);
  }, []);

  // Compute effective colors: custom colors if set, otherwise derive from theme
  // Using ColorProvider always prevents App remount when switching between custom/preset themes
  const effectiveColors = useMemo(
    () => customColors ?? getSemanticColors(themeId),
    [customColors, themeId]
  );

  return (
    <ChakraProvider value={system}>
      <ColorProvider colors={effectiveColors}>
        <App onThemeChange={handleThemeChange} />
      </ColorProvider>
    </ChakraProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
