import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AddContactRequest,
  CreateIdentityRequest,
  NostlingContact,
  NostlingIdentity,
  NostlingMessage,
  NostlingRelayConfig,
  SendNostrMessageRequest,
} from '../../shared/types';

type ContactMap = Record<string, NostlingContact[]>;
type MessageMap = Record<string, NostlingMessage[]>;

type LoadingState = {
  identities: boolean;
  relays: boolean;
  contacts: Record<string, boolean>;
  messages: Record<string, boolean>;
};

type QueueSummary = {
  queued: number;
  sending: number;
  errors: number;
  lastActivity?: string;
};

const initialLoadingState: LoadingState = {
  identities: false,
  relays: false,
  contacts: {},
  messages: {},
};

function getMessageMapKey(identityId: string, contactId: string): string {
  return `${identityId}:${contactId}`;
}

function deriveQueueSummary(messages: MessageMap): QueueSummary {
  const all = Object.values(messages).flat();

  if (all.length === 0) {
    return { queued: 0, sending: 0, errors: 0 };
  }

  const queued = all.filter((message) => message.status === 'queued').length;
  const sending = all.filter((message) => message.status === 'sending').length;
  const errors = all.filter((message) => message.status === 'error').length;

  const lastActivity = all
    .map((message) => message.timestamp)
    .sort()
    .at(-1);

  return { queued, sending, errors, lastActivity };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function useNostlingState() {
  const hasBridge = Boolean(window.api?.nostling);
  const [identities, setIdentities] = useState<NostlingIdentity[]>([]);
  const [contacts, setContacts] = useState<ContactMap>({});
  const [messages, setMessages] = useState<MessageMap>({});
  const [relayConfig, setRelayConfig] = useState<NostlingRelayConfig | null>(null);
  const [loading, setLoading] = useState<LoadingState>(initialLoadingState);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const setScopedLoading = useCallback((scope: keyof LoadingState, key: string | null, value: boolean) => {
    setLoading((current) => {
      if (scope === 'contacts' || scope === 'messages') {
        return {
          ...current,
          [scope]: { ...current[scope], [key!]: value },
        };
      }

      return { ...current, [scope]: value } as LoadingState;
    });
  }, []);

  const recordError = useCallback((context: string, error: unknown) => {
    const message = `${context}: ${toErrorMessage(error)}`;
    console.error(message);
    setLastError(message);
  }, []);

  const refreshIdentities = useCallback(async () => {
    if (!hasBridge) return;

    setScopedLoading('identities', null, true);
    try {
      const result = await window.api.nostling!.identities.list();
      setIdentities(result);
      setLastSync(new Date().toISOString());
      setLastError(null);
    } catch (error) {
      recordError('Load identities failed', error);
    } finally {
      setScopedLoading('identities', null, false);
    }
  }, [hasBridge, recordError, setScopedLoading]);

  const refreshRelayConfig = useCallback(async () => {
    if (!hasBridge) return;

    setScopedLoading('relays', null, true);
    try {
      const config = await window.api.nostling!.relays.get();
      setRelayConfig(config);
    } catch (error) {
      recordError('Load relay config failed', error);
    } finally {
      setScopedLoading('relays', null, false);
    }
  }, [hasBridge, recordError, setScopedLoading]);

  const refreshContacts = useCallback(
    async (identityId: string) => {
      if (!hasBridge) return;

      setScopedLoading('contacts', identityId, true);
      try {
        const result = await window.api.nostling!.contacts.list(identityId);
        setContacts((current) => ({ ...current, [identityId]: result }));
      } catch (error) {
        recordError('Load contacts failed', error);
      } finally {
        setScopedLoading('contacts', identityId, false);
      }
    },
    [hasBridge, recordError, setScopedLoading]
  );

  const refreshMessages = useCallback(
    async (identityId: string, contactId: string) => {
      if (!hasBridge) return;

      const mapKey = getMessageMapKey(identityId, contactId);
      setScopedLoading('messages', mapKey, true);
      try {
        const result = await window.api.nostling!.messages.list(identityId, contactId);
        setMessages((current) => ({ ...current, [mapKey]: result }));
      } catch (error) {
        recordError('Load messages failed', error);
      } finally {
        setScopedLoading('messages', mapKey, false);
      }
    },
    [hasBridge, recordError, setScopedLoading]
  );

  const createIdentity = useCallback(
    async (request: CreateIdentityRequest) => {
      if (!hasBridge) return null;

      try {
        const identity = await window.api.nostling!.identities.create(request);
        setIdentities((current) => [...current, identity]);
        setLastSync(new Date().toISOString());
        return identity;
      } catch (error) {
        recordError('Create identity failed', error);
        return null;
      }
    },
    [hasBridge, recordError]
  );

  const removeIdentity = useCallback(
    async (identityId: string) => {
      if (!hasBridge) return false;

      try {
        await window.api.nostling!.identities.remove(identityId);
        setIdentities((current) => current.filter((identity) => identity.id !== identityId));
        setContacts((current) => {
          const next = { ...current };
          delete next[identityId];
          return next;
        });
        setMessages((current) => {
          const next = { ...current };
          Object.keys(next)
            .filter((key) => key.startsWith(`${identityId}:`))
            .forEach((key) => delete next[key]);
          return next;
        });
        return true;
      } catch (error) {
        recordError('Remove identity failed', error);
        return false;
      }
    },
    [hasBridge, recordError]
  );

  const addContact = useCallback(
    async (request: AddContactRequest) => {
      if (!hasBridge) return null;

      try {
        const contact = await window.api.nostling!.contacts.add(request);
        setContacts((current) => {
          const existing = current[request.identityId] || [];
          return { ...current, [request.identityId]: [...existing, contact] };
        });
        return contact;
      } catch (error) {
        recordError('Add contact failed', error);
        return null;
      }
    },
    [hasBridge, recordError]
  );

  const removeContact = useCallback(
    async (contactId: string, identityId: string) => {
      if (!hasBridge) return false;

      try {
        await window.api.nostling!.contacts.remove(contactId);
        setContacts((current) => {
          const existing = current[identityId] || [];
          return { ...current, [identityId]: existing.filter((contact) => contact.id !== contactId) };
        });
        setMessages((current) => {
          const next = { ...current };
          const prefix = `${identityId}:${contactId}`;
          Object.keys(next)
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => delete next[key]);
          return next;
        });
        return true;
      } catch (error) {
        recordError('Remove contact failed', error);
        return false;
      }
    },
    [hasBridge, recordError]
  );

  const markContactConnected = useCallback(
    async (contactId: string, identityId: string) => {
      if (!hasBridge) return null;

      try {
        const contact = await window.api.nostling!.contacts.markConnected(contactId);
        setContacts((current) => {
          const existing = current[identityId] || [];
          return {
            ...current,
            [identityId]: existing.map((entry) => (entry.id === contact.id ? contact : entry)),
          };
        });
        return contact;
      } catch (error) {
        recordError('Mark contact connected failed', error);
        return null;
      }
    },
    [hasBridge, recordError]
  );

  const sendMessage = useCallback(
    async (request: SendNostrMessageRequest) => {
      if (!hasBridge) return null;

      try {
        const message = await window.api.nostling!.messages.send(request);
        const mapKey = getMessageMapKey(request.identityId, request.contactId);
        setMessages((current) => {
          const existing = current[mapKey] || [];
          return { ...current, [mapKey]: [...existing, message] };
        });
        return message;
      } catch (error) {
        recordError('Send message failed', error);
        return null;
      }
    },
    [hasBridge, recordError]
  );

  const discardUnknown = useCallback(
    async (eventId: string) => {
      if (!hasBridge) return false;

      try {
        await window.api.nostling!.messages.discardUnknown(eventId);
        return true;
      } catch (error) {
        recordError('Discard unknown event failed', error);
        return false;
      }
    },
    [hasBridge, recordError]
  );

  const updateRelayConfig = useCallback(
    async (config: NostlingRelayConfig) => {
      if (!hasBridge) return null;

      try {
        const next = await window.api.nostling!.relays.set(config);
        setRelayConfig(next);
        return next;
      } catch (error) {
        recordError('Update relay config failed', error);
        return null;
      }
    },
    [hasBridge, recordError]
  );

  const hydrateAll = useCallback(async () => {
    if (!hasBridge) return;

    await refreshIdentities();
    await refreshRelayConfig();

    const identitiesSnapshot = await window.api.nostling!.identities.list();
    for (const identity of identitiesSnapshot) {
      await refreshContacts(identity.id);
      const contactList = await window.api.nostling!.contacts.list(identity.id);
      for (const contact of contactList) {
        await refreshMessages(identity.id, contact.id);
      }
    }
  }, [hasBridge, refreshContacts, refreshIdentities, refreshMessages, refreshRelayConfig]);

  useEffect(() => {
    hydrateAll();
  }, [hydrateAll]);

  const queueSummary = useMemo(() => deriveQueueSummary(messages), [messages]);

  const nostlingStatusText = useMemo(() => {
    if (!hasBridge) return 'Nostling bridge unavailable';
    if (queueSummary.errors > 0) return `${queueSummary.errors} message error(s)`;
    if (queueSummary.sending > 0) return `${queueSummary.sending} sending`;
    if (queueSummary.queued > 0) return `${queueSummary.queued} queued (offline)`;
    if (queueSummary.lastActivity) return 'Nostling synced';
    return 'Nostling idle';
  }, [hasBridge, queueSummary]);

  return {
    hasBridge,
    identities,
    contacts,
    messages,
    relayConfig,
    loading,
    lastError,
    lastSync,
    queueSummary,
    nostlingStatusText,
    refreshIdentities,
    refreshContacts,
    refreshMessages,
    createIdentity,
    removeIdentity,
    addContact,
    removeContact,
    markContactConnected,
    sendMessage,
    discardUnknown,
    refreshRelayConfig,
    updateRelayConfig,
  };
}
