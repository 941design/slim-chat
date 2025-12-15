import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AddContactRequest,
  CreateIdentityRequest,
  NostlingContact,
  NostlingIdentity,
  NostlingMessage,
  SendNostrMessageRequest,
} from '../../shared/types';
import { getNostlingStatusTextThemed } from './state.themed';

type ContactMap = Record<string, NostlingContact[]>;
type MessageMap = Record<string, NostlingMessage[]>;

type LoadingState = {
  identities: boolean;
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

// Type for tracking unread counts per identity (identityId -> contactId -> count)
type UnreadCountsMap = Record<string, Record<string, number>>;

// Type for tracking contacts with newly arrived messages (for flash animation)
type NewlyArrivedMap = Record<string, Set<string>>; // identityId -> Set<contactId>

export function useNostlingState() {
  const hasBridge = Boolean(window.api?.nostling);
  const [identities, setIdentities] = useState<NostlingIdentity[]>([]);
  const [contacts, setContacts] = useState<ContactMap>({});
  const [messages, setMessages] = useState<MessageMap>({});
  const [loading, setLoading] = useState<LoadingState>(initialLoadingState);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCountsMap>({});
  const [newlyArrived, setNewlyArrived] = useState<NewlyArrivedMap>({});

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

  // REMOVED: refreshRelayConfig - relay management is now per-identity via relays.get(identityId)
  // The global relay config concept has been replaced with per-identity relay management

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

  const updateIdentityLabel = useCallback(
    async (identityId: string, label: string) => {
      if (!hasBridge) return null;

      try {
        const updated = await window.api.nostling!.identities.updateLabel(identityId, label);
        setIdentities((current) => current.map((identity) => (identity.id === identityId ? updated : identity)));
        setLastSync(new Date().toISOString());
        return updated;
      } catch (error) {
        recordError('Update identity label failed', error);
        return null;
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

  const updateContactAlias = useCallback(
    async (contactId: string, alias: string) => {
      if (!hasBridge) return null;

      try {
        const contact = await window.api.nostling!.contacts.updateAlias(contactId, alias);
        setContacts((current) => {
          const existing = current[contact.identityId] || [];
          return {
            ...current,
            [contact.identityId]: existing.map((entry) => (entry.id === contact.id ? contact : entry)),
          };
        });
        return contact;
      } catch (error) {
        recordError('Update contact alias failed', error);
        return null;
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

  const retryFailedMessages = useCallback(
    async (identityId?: string) => {
      if (!hasBridge) return [];

      try {
        const retriedMessages = await window.api.nostling!.messages.retry(identityId);
        // Update local state with retried messages (status now 'queued' or 'sent')
        setMessages((current) => {
          const next = { ...current };
          for (const msg of retriedMessages) {
            const mapKey = getMessageMapKey(msg.identityId, msg.contactId);
            const existing = next[mapKey] || [];
            next[mapKey] = existing.map((m) => (m.id === msg.id ? msg : m));
          }
          return next;
        });
        setLastError(null);
        return retriedMessages;
      } catch (error) {
        recordError('Retry failed messages failed', error);
        return [];
      }
    },
    [hasBridge, recordError]
  );

  // REMOVED: updateRelayConfig - relay management is now per-identity via relays.set(identityId, relays)
  // The global relay config concept has been replaced with per-identity relay management

  /**
   * Refresh unread counts for an identity.
   * Compares with previous counts to detect newly arrived messages.
   */
  const refreshUnreadCounts = useCallback(
    async (identityId: string) => {
      if (!hasBridge) return;

      try {
        const counts = await window.api.nostling!.messages.getUnreadCounts(identityId);

        setUnreadCounts((current) => {
          const previousCounts = current[identityId] || {};

          // Detect contacts with newly arrived messages (count increased)
          const newlyArrivedContacts = new Set<string>();
          for (const [contactId, count] of Object.entries(counts)) {
            const previousCount = previousCounts[contactId] || 0;
            if (count > previousCount) {
              newlyArrivedContacts.add(contactId);
            }
          }

          // Update newly arrived tracking
          if (newlyArrivedContacts.size > 0) {
            setNewlyArrived((prev) => ({
              ...prev,
              [identityId]: new Set([...(prev[identityId] || []), ...newlyArrivedContacts]),
            }));

            // Clear newly arrived status after animation duration (2 seconds)
            setTimeout(() => {
              setNewlyArrived((prev) => {
                const updated = { ...prev };
                if (updated[identityId]) {
                  const remaining = new Set(updated[identityId]);
                  newlyArrivedContacts.forEach((id) => remaining.delete(id));
                  if (remaining.size === 0) {
                    delete updated[identityId];
                  } else {
                    updated[identityId] = remaining;
                  }
                }
                return updated;
              });
            }, 2000);
          }

          return { ...current, [identityId]: counts };
        });
      } catch (error) {
        recordError('Load unread counts failed', error);
      }
    },
    [hasBridge, recordError]
  );

  /**
   * Mark all messages for a contact as read.
   * Updates local state and clears newly arrived status.
   */
  const markMessagesRead = useCallback(
    async (identityId: string, contactId: string) => {
      if (!hasBridge) return 0;

      try {
        const count = await window.api.nostling!.messages.markRead(identityId, contactId);

        // Update local unread counts
        setUnreadCounts((current) => {
          const identityCounts = { ...(current[identityId] || {}) };
          delete identityCounts[contactId];
          return { ...current, [identityId]: identityCounts };
        });

        // Clear newly arrived status for this contact
        setNewlyArrived((current) => {
          const identitySet = current[identityId];
          if (identitySet) {
            const updated = new Set(identitySet);
            updated.delete(contactId);
            if (updated.size === 0) {
              const next = { ...current };
              delete next[identityId];
              return next;
            }
            return { ...current, [identityId]: updated };
          }
          return current;
        });

        // Refresh messages to update isRead status in local state
        await refreshMessages(identityId, contactId);

        return count;
      } catch (error) {
        recordError('Mark messages read failed', error);
        return 0;
      }
    },
    [hasBridge, recordError, refreshMessages]
  );

  const hydrateAll = useCallback(async () => {
    if (!hasBridge) return;

    await refreshIdentities();

    const identitiesSnapshot = await window.api.nostling!.identities.list();
    for (const identity of identitiesSnapshot) {
      await refreshContacts(identity.id);
      await refreshUnreadCounts(identity.id);
      const contactList = await window.api.nostling!.contacts.list(identity.id);
      for (const contact of contactList) {
        await refreshMessages(identity.id, contact.id);
      }
    }
  }, [hasBridge, refreshContacts, refreshIdentities, refreshMessages, refreshUnreadCounts]);

  useEffect(() => {
    hydrateAll();
  }, [hydrateAll]);

  // Subscribe to profile updates from main process
  useEffect(() => {
    if (!hasBridge || !window.api.nostling?.profiles) return;

    const unsubscribe = window.api.nostling.profiles.onUpdated((identityId: string) => {
      // Refresh contacts for the identity whose profiles were updated
      refreshContacts(identityId);
      // Also refresh identities in case the identity's own profile was updated
      refreshIdentities();
    });

    return unsubscribe;
  }, [hasBridge, refreshContacts, refreshIdentities]);

  const queueSummary = useMemo(() => deriveQueueSummary(messages), [messages]);

  /**
   * Nostling status text with ostrich-themed messages.
   *
   * Now delegates to getNostlingStatusTextThemed() which provides themed
   * message alternatives while preserving message counts and state priority.
   *
   * Note: Uses value-based comparison of queueSummary fields to prevent
   * unnecessary re-selection of random themed messages.
   */
  const nostlingStatusText = useMemo(() => {
    return getNostlingStatusTextThemed(hasBridge, queueSummary);
  }, [hasBridge, queueSummary.queued, queueSummary.sending, queueSummary.errors, queueSummary.lastActivity]);

  return {
    hasBridge,
    identities,
    contacts,
    messages,
    loading,
    lastError,
    lastSync,
    queueSummary,
    nostlingStatusText,
    unreadCounts,
    newlyArrived,
    refreshIdentities,
    refreshContacts,
    refreshMessages,
    refreshUnreadCounts,
    createIdentity,
    removeIdentity,
    addContact,
    removeContact,
    markContactConnected,
    updateIdentityLabel,
    updateContactAlias,
    sendMessage,
    discardUnknown,
    retryFailedMessages,
    markMessagesRead,
    // Note: relay management is now per-identity via window.api.nostling.relays.get(identityId) / set(identityId, relays)
  };
}
