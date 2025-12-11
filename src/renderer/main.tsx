import React, { useEffect, useMemo, useState } from 'react';
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
  FormControl,
  FormLabel,
  FormErrorMessage,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Select,
  Divider,
  Icon,
} from '@chakra-ui/react';
import { AppStatus, NostlingContact, NostlingIdentity, UpdateState } from '../shared/types';
import './types.d.ts';
import { getStatusText, isRefreshEnabled } from './utils';
import { useNostlingState } from './nostling/state';

// Simple refresh icon component
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
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

function Header() {
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
      <Text className="brand" fontSize="lg" fontWeight="semibold" color="brand.400">
        SlimChat Bootstrap
      </Text>
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
}

function Footer({ version, updateState, onRefresh, onDownload, onRestart, nostlingStatus, nostlingError }: FooterProps) {
  const statusText = useMemo(() => getStatusText(updateState), [updateState]);
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
            <Text className="nostling-error" color="red.300">
              {nostlingError}
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
}

function NostlingStatusCard({ statusText, queueSummary, lastSync, lastError }: NostlingStatusCardProps) {
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
            <Text color="gray.500" fontSize="xs" noOfLines={1}>
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
                <Text color="gray.500" fontSize="xs" noOfLines={1}>
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
    <Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick={!submitting}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create or Import Identity</ModalHeader>
        <ModalCloseButton disabled={submitting} />
        <ModalBody>
          <VStack gap="3">
            <FormControl isInvalid={labelError} isRequired>
              <FormLabel>Label</FormLabel>
              <Input
                placeholder="Personal account"
                value={form.label}
                onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              />
              {labelError && <FormErrorMessage>Label is required.</FormErrorMessage>}
            </FormControl>
            <FormControl>
              <FormLabel>nsec (optional, for import)</FormLabel>
              <Input
                placeholder="nsec..."
                value={form.nsec}
                onChange={(event) => setForm((prev) => ({ ...prev, nsec: event.target.value }))}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack gap="2">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button colorPalette="blue" onClick={handleSubmit} loading={submitting}>
              Save
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
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
    <Modal isOpen={isOpen} onClose={onClose} closeOnOverlayClick={!submitting}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add Contact</ModalHeader>
        <ModalCloseButton disabled={submitting} />
        <ModalBody>
          <VStack gap="3">
            <FormControl isInvalid={identityMissing} isRequired>
              <FormLabel>Identity</FormLabel>
              <Select
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
              </Select>
              {identityMissing && <FormErrorMessage>Select an identity.</FormErrorMessage>}
            </FormControl>
            <FormControl isInvalid={npubMissing} isRequired>
              <FormLabel>Contact npub</FormLabel>
              <Input
                placeholder="npub..."
                value={form.npub}
                onChange={(event) => setForm((prev) => ({ ...prev, npub: event.target.value }))}
              />
              {npubMissing && <FormErrorMessage>npub is required.</FormErrorMessage>}
            </FormControl>
            <FormControl>
              <FormLabel>Alias (optional)</FormLabel>
              <Input
                placeholder="Friend"
                value={form.alias}
                onChange={(event) => setForm((prev) => ({ ...prev, alias: event.target.value }))}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack gap="2">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button colorPalette="blue" onClick={handleSubmit} loading={submitting}>
              Save
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
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
        <Divider borderColor="whiteAlpha.200" />
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

function App() {
  const { status, updateState, refresh, restart, download } = useStatus();
  const nostling = useNostlingState();
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [identityModalOpen, setIdentityModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);

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

  return (
    <Flex className="app-shell" direction="column" h="100vh" bg="#0f172a">
      <Header />
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
          <NostlingStatusCard
            statusText={nostling.nostlingStatusText}
            queueSummary={nostling.queueSummary}
            lastSync={nostling.lastSync}
            lastError={nostling.lastError}
          />
          <StateTable />
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
      <Footer
        version={status?.version}
        updateState={updateState}
        onRefresh={refresh}
        onDownload={download}
        onRestart={restart}
        nostlingStatus={nostling.nostlingStatusText}
        nostlingError={nostling.lastError}
      />
    </Flex>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ChakraProvider value={system}>
    <App />
  </ChakraProvider>
);
