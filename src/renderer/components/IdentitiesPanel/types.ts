/**
 * Identity Profile Editor Panel Types
 *
 * Type definitions for the identity profile editing feature.
 */

import type { ProfileContent } from '../../../shared/profile-types';
import type { NostlingIdentity } from '../../../shared/types';

/**
 * Extended profile data including label field
 *
 * Combines ProfileContent (shared with contacts) with identity-specific label.
 */
export interface IdentityProfileData {
  /**
   * Internal label for identity (stored in nostr_identities table)
   * This is user-facing identifier in app UI ("Work", "Personal", etc.)
   */
  label: string;

  /**
   * Public profile content (shared with contacts via NIP-59)
   * All fields optional per kind:0 specification
   */
  content: ProfileContent;
}

/**
 * Profile editor component props
 */
export interface ProfileEditorProps {
  /**
   * Current profile data to edit
   */
  profile: IdentityProfileData;

  /**
   * Whether the form is disabled (during save operation)
   */
  disabled?: boolean;

  /**
   * Callback when profile data changes (live preview)
   */
  onChange: (profile: IdentityProfileData) => void;

  /**
   * Callback when dirty state changes
   */
  onDirtyChange?: (isDirty: boolean) => void;
}

/**
 * Identities panel component props
 */
export interface IdentitiesPanelProps {
  /**
   * Currently selected identity ID for editing
   */
  selectedIdentityId: string | null;

  /**
   * List of identities (passed from parent to share state)
   */
  identities: NostlingIdentity[];

  /**
   * Callback when user selects different identity
   */
  onSelectIdentity: (identityId: string) => void;

  /**
   * Callback when user cancels editing (returns to chat view)
   */
  onCancel: () => void;

  /**
   * Callback when dirty state changes (has unsaved changes)
   */
  onDirtyChange?: (isDirty: boolean) => void;

  /**
   * Callback when profile is successfully saved.
   * Parent should use this to refresh the identities list.
   */
  onSaved?: () => void;

  /**
   * Callback when user clicks QR code button to show identity's npub as QR code.
   * Receives npub string and optional label for display.
   */
  onShowQr?: (npub: string, label?: string) => void;

  /**
   * Callback when user clicks Remove button to delete the identity.
   * Receives identity ID. If not provided, Remove button is not shown.
   */
  onRemove?: (identityId: string) => void;
}
