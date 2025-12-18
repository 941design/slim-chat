/**
 * IdentitiesPanel Component
 *
 * Main panel for editing identity profiles. Manages identity selection,
 * profile loading/saving, and coordinates with ProfileEditor.
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - selectedIdentityId: string | null, currently selected identity for editing
 *     - onSelectIdentity: callback to notify parent of identity selection change
 *       Signature: (identityId: string) => void
 *     - onCancel: callback to return to chat view
 *       Signature: () => void
 *
 *   Outputs:
 *     - React element rendering SubPanel with ProfileEditor
 *     - Calls onSelectIdentity when user clicks identity in sidebar list
 *     - Calls onCancel when user clicks Cancel or presses Escape
 *     - Updates identity label in database on Apply
 *     - Updates profile content in database on Apply
 *     - Sends profile to all contacts on Apply
 *
 *   Invariants:
 *     - Profile loaded from IPC on identity selection
 *     - Identity switching blocked when dirty (unsaved changes exist)
 *     - Apply commits both label and profile content atomically
 *     - Cancel discards all staged changes
 *     - Sidebar shows identity list (contacts hidden)
 *
 *   Properties:
 *     - Isolation: Changes staged in component state, not committed until Apply
 *     - Atomicity: Label and profile content updated together on Apply
 *     - Idempotence: Multiple Apply clicks don't cause duplicate sends
 *     - Protection: Cannot switch identities with dirty state
 *
 *   Algorithm:
 *     1. Initialization:
 *        a. Read identities from useNostlingState hook
 *        b. Load initial profile for selectedIdentityId via IPC
 *        c. Initialize staging state with loaded profile
 *        d. Set dirty state to false
 *     2. Identity selection (user clicks identity in sidebar):
 *        a. Check if dirty state is true
 *        b. If dirty, block selection (show visual feedback, don't call onSelectIdentity)
 *        c. If not dirty, call onSelectIdentity with new identity ID
 *     3. Profile change (ProfileEditor calls onChange):
 *        a. Update staged profile state
 *        b. Update dirty state based on comparison to original
 *     4. Cancel action:
 *        a. Reset staged profile to original
 *        b. Set dirty state to false
 *        c. Call onCancel to return to chat view
 *     5. Apply action:
 *        a. Set applying state to true (disable form and buttons)
 *        b. Call IPC to update identity label: api.nostling.identities.updateLabel(identityId, stagedProfile.label)
 *        c. Call IPC to update profile: api.nostling.profiles.updatePrivate({ identityId, content: stagedProfile.content })
 *        d. On success:
 *           - Update original profile state to staged profile
 *           - Set dirty state to false
 *           - Set applying state to false
 *           - Call onCancel to return to chat view
 *        e. On error:
 *           - Set error message state
 *           - Set applying state to false
 *           - Stay on panel to show error
 *     6. Keyboard handling:
 *        a. Escape key: call handleCancel (unless applying)
 *        b. Other keys: no special handling
 *
 *   Rendering:
 *     - Use SubPanel component with title "Edit Identity Profile"
 *     - SubPanel actions: Cancel and Apply buttons
 *     - Main content: ProfileEditor with staged profile
 *     - Error display: Show error message if apply fails
 *     - Button states:
 *       * Cancel: disabled when applying
 *       * Apply: disabled when applying or not dirty
 *
 *   Data Loading:
 *     - Profile loading via IPC when selectedIdentityId changes:
 *       * Query identity from identities array for label
 *       * Call api.nostling.profiles.getPrivateAuthored(identityId) for content
 *       * Handle case where no profile exists (use empty ProfileContent)
 *     - Identity list from useNostlingState().identities
 *
 *   Error Handling:
 *     - Profile load failure: Show error in panel, disable editing
 *     - Apply failure: Show error message, keep changes staged
 *     - Network errors: Capture in error state, show to user
 *
 *   Styling:
 *     - Use useThemeColors for consistent theming
 *     - Use existing identity list patterns from main.tsx
 *     - Identity items: show label, profile name, picture
 *     - Selected identity: highlighted background
 *     - Disabled identities (when dirty): reduced opacity, no pointer events
 *
 *   Testing Considerations:
 *     - Property: Apply only enabled when dirty is true
 *     - Property: Identity switching blocked when dirty is true
 *     - Property: Cancel always discards changes
 *     - Property: Apply calls both updateLabel and updatePrivate
 *     - Property: Escape key behaves same as Cancel button
 *
 * TODO (pbt-dev): Implement using React hooks, SubPanel, and ProfileEditor
 *   - Use useState for staging state, dirty state, applying state, error state
 *   - Use useEffect to load profile when selectedIdentityId changes
 *   - Use useCallback for handlers
 *   - Use useNostlingState to access identities list
 *   - Import SubPanel from ../SubPanel
 *   - Import ProfileEditor from ./ProfileEditor
 *   - Import useThemeColors from themes/ThemeContext
 *   - Import window.api for IPC calls
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Heading, HStack, IconButton, Input } from '@chakra-ui/react';
import type { IdentitiesPanelProps, IdentityProfileData } from './types';
import { SubPanel } from '../SubPanel';
import { IdentityProfileView } from './IdentityProfileView';
import { useThemeColors } from '../../themes/ThemeContext';
import { HoverInfoProvider, useHoverInfoProps, useHoverInfo } from '../HoverInfo';
import { getPreferredDisplayName } from '../../utils/sidebar';
import { QrCodeIcon } from '../qr-icons';
import { CopyButton } from '../CopyButton';

// Pencil icon for editing (matches ContactsPanel)
const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

// Check icon for saving
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// Close icon for canceling
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function IdentitiesPanelInner({
  selectedIdentityId,
  identities,
  onSelectIdentity,
  onCancel,
  onDirtyChange,
  onSaved,
  onShowQr,
  onRemove,
}: IdentitiesPanelProps): React.ReactElement {
  const colors = useThemeColors();
  const panelRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const { showInfo, hideInfo } = useHoverInfo();

  const [originalProfile, setOriginalProfile] = useState<IdentityProfileData | null>(null);
  const [stagedProfile, setStagedProfile] = useState<IdentityProfileData | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');

  // Load profile when identity selected
  useEffect(() => {
    const loadProfile = async () => {
      if (!selectedIdentityId) {
        setOriginalProfile(null);
        setStagedProfile(null);
        setIsDirty(false);
        onDirtyChange?.(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Find identity to get label
        const identity = identities.find((i) => i.id === selectedIdentityId);
        if (!identity) {
          throw new Error('Identity not found');
        }

        // Load profile content via IPC
        const profileRecord = await window.api.nostling!.profiles.getPrivateAuthored(selectedIdentityId);

        // Build profile data
        const profileData: IdentityProfileData = {
          label: identity.label,
          content: profileRecord?.content || {},
        };

        setOriginalProfile(profileData);
        setStagedProfile(profileData);
        setIsDirty(false);
        onDirtyChange?.(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
        setOriginalProfile(null);
        setStagedProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();

    // Auto-focus panel for keyboard navigation
    setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
  }, [selectedIdentityId, identities, onDirtyChange]);

  // Handle profile change from ProfileEditor
  const handleProfileChange = useCallback((updatedProfile: IdentityProfileData) => {
    setStagedProfile(updatedProfile);

    // Calculate dirty state
    const dirty = originalProfile
      ? JSON.stringify(updatedProfile) !== JSON.stringify(originalProfile)
      : false;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [originalProfile, onDirtyChange]);

  // Handle Cancel action
  const handleCancel = useCallback(() => {
    if (originalProfile) {
      setStagedProfile(originalProfile);
      setIsDirty(false);
      onDirtyChange?.(false);
    }
    onCancel();
  }, [originalProfile, onCancel, onDirtyChange]);

  // Handle Apply action
  const handleApply = useCallback(async () => {
    if (!selectedIdentityId || !stagedProfile) return;

    setIsApplying(true);
    setError(null);

    try {
      // Update identity label
      await window.api.nostling!.identities.updateLabel(selectedIdentityId, stagedProfile.label);

      // Update profile content
      const result = await window.api.nostling!.profiles.updatePrivate({
        identityId: selectedIdentityId,
        content: stagedProfile.content,
      });

      // Notify parent to refresh identities list (for sidebar update)
      onSaved?.();

      // Check for partial/complete send failures
      const failedSends = result.sendResults.filter((r: any) => !r.success);
      if (failedSends.length > 0) {
        const totalContacts = result.sendResults.length;
        if (failedSends.length === totalContacts) {
          setError(`Profile saved but failed to send to all ${totalContacts} contact(s)`);
        } else {
          setError(`Profile saved but failed to send to ${failedSends.length} of ${totalContacts} contact(s)`);
        }
        // Don't return to chat on partial failure - let user see the error
        setOriginalProfile(stagedProfile);
        setIsDirty(false);
        onDirtyChange?.(false);
      } else {
        // Complete success: update original and return to chat
        setOriginalProfile(stagedProfile);
        setIsDirty(false);
        onDirtyChange?.(false);
        onCancel();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsApplying(false);
    }
  }, [selectedIdentityId, stagedProfile, onCancel, onSaved, onDirtyChange]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) {
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel, isApplying]);

  // Get hover props for action buttons
  const cancelHoverProps = useHoverInfoProps('Discard changes and return to chat');
  const applyHoverProps = useHoverInfoProps('Save profile and send to contacts');
  const removeHoverProps = useHoverInfoProps('Permanently remove this identity');

  // Get display name for the title
  const headingDisplayName = stagedProfile
    ? getPreferredDisplayName({
        profileName: stagedProfile.content.name || stagedProfile.label,
        npub: '', // Not needed for identity
      })
    : 'Identity Profile';

  // Get the current identity's npub
  const currentIdentity = selectedIdentityId
    ? identities.find((i) => i.id === selectedIdentityId)
    : null;
  const currentNpub = currentIdentity?.npub || '';

  // Handle showing QR code for current identity
  const handleShowQr = useCallback(() => {
    if (currentNpub && onShowQr) {
      onShowQr(currentNpub, stagedProfile?.label);
    }
  }, [currentNpub, onShowQr, stagedProfile?.label]);

  // Handler for copy message that works with the HoverInfo context
  const handleCopyMessage = useCallback((message: string | null) => {
    if (message) {
      showInfo(message);
    } else {
      hideInfo();
    }
  }, [showInfo, hideInfo]);

  // Focus input when label editing starts
  useEffect(() => {
    if (isEditingLabel) {
      labelInputRef.current?.focus();
      labelInputRef.current?.select();
    }
  }, [isEditingLabel]);

  const startEditingLabel = () => {
    if (stagedProfile && !isApplying) {
      setIsEditingLabel(true);
      setDraftLabel(stagedProfile.label);
    }
  };

  const cancelEditingLabel = () => {
    setIsEditingLabel(false);
    setDraftLabel('');
  };

  const saveEditingLabel = () => {
    const trimmed = draftLabel.trim();
    if (!trimmed || !stagedProfile) {
      cancelEditingLabel();
      return;
    }

    const updatedProfile = { ...stagedProfile, label: trimmed };
    handleProfileChange(updatedProfile);
    setIsEditingLabel(false);
  };

  // Build the custom title element with editable label (like ContactsPanel)
  const titleElement = (
    <Box className="group">
      {isEditingLabel ? (
        <HStack align="center" gap={1}>
          <Input
            ref={labelInputRef}
            size="sm"
            value={draftLabel}
            placeholder="Enter label..."
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                saveEditingLabel();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelEditingLabel();
              }
            }}
            data-testid="identities-panel-label-input"
          />
          <Box {...useHoverInfoProps('Save the edited label')}>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Save label"
              onClick={saveEditingLabel}
              color={colors.textSubtle}
              _hover={{ color: colors.textMuted }}
              data-testid="identities-panel-save-label"
            >
              <CheckIcon />
            </IconButton>
          </Box>
          <Box {...useHoverInfoProps('Cancel editing')}>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Cancel editing"
              onClick={cancelEditingLabel}
              color={colors.textSubtle}
              _hover={{ color: colors.textMuted }}
              data-testid="identities-panel-cancel-label"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </HStack>
      ) : (
        <HStack align="center" gap={1}>
          <Heading
            size="sm"
            color={colors.textMuted}
            data-testid="identities-panel-display-name"
          >
            {headingDisplayName}
          </Heading>
          {stagedProfile && !isApplying && (
            <HStack
              gap={0}
              opacity={0}
              _groupHover={{ opacity: 1 }}
              transition="opacity 0.15s"
            >
              <Box {...useHoverInfoProps('Edit identity label')}>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Edit identity label"
                  onClick={startEditingLabel}
                  color={colors.textSubtle}
                  _hover={{ color: colors.textMuted }}
                  data-testid="identities-panel-edit-label"
                >
                  <PencilIcon />
                </IconButton>
              </Box>
              {currentNpub && onShowQr && (
                <Box {...useHoverInfoProps('Display QR code for sharing')}>
                  <IconButton
                    size="xs"
                    variant="ghost"
                    aria-label="Show QR code"
                    onClick={handleShowQr}
                    color={colors.textSubtle}
                    _hover={{ color: colors.textMuted }}
                    data-testid="identities-panel-show-qr"
                  >
                    <QrCodeIcon />
                  </IconButton>
                </Box>
              )}
              {currentNpub && (
                <Box {...useHoverInfoProps('Copy public key to clipboard')}>
                  <CopyButton
                    size="xs"
                    variant="ghost"
                    aria-label="Copy npub"
                    textToCopy={currentNpub}
                    color={colors.textSubtle}
                    _hover={{ color: colors.textMuted }}
                    data-testid="identities-panel-copy-npub"
                    copyMessage="npub copied to clipboard"
                    onCopyMessage={handleCopyMessage}
                  />
                </Box>
              )}
            </HStack>
          )}
        </HStack>
      )}
    </Box>
  );

  // Handle remove action
  const handleRemove = useCallback(() => {
    if (selectedIdentityId && onRemove) {
      onRemove(selectedIdentityId);
    }
  }, [selectedIdentityId, onRemove]);

  // Define SubPanel actions
  const actions = [];
  if (onRemove && selectedIdentityId) {
    actions.push({
      label: 'Remove',
      onClick: handleRemove,
      variant: 'ghost' as const,
      colorPalette: 'red' as const,
      disabled: isApplying || isDirty,
      testId: 'identities-panel-remove',
      hoverProps: removeHoverProps,
    });
  }
  actions.push(
    {
      label: 'Cancel',
      onClick: handleCancel,
      variant: 'ghost' as const,
      disabled: isApplying,
      testId: 'identities-panel-cancel',
      hoverProps: cancelHoverProps,
    },
    {
      label: isApplying ? 'Saving...' : 'Apply',
      onClick: handleApply,
      variant: 'outline' as const,
      colorPalette: 'blue' as const,
      disabled: isApplying || !isDirty,
      testId: 'identities-panel-apply',
      hoverProps: applyHoverProps,
    },
  );

  return (
    <SubPanel
      title={headingDisplayName}
      titleElement={titleElement}
      actions={actions}
      testId="identities-panel"
    >
      <Box
        ref={panelRef}
        tabIndex={0}
        outline="none"
        data-testid="identities-panel-content"
      >
        {isLoading && (
          <Box data-testid="identities-panel-loading">
            Loading profile...
          </Box>
        )}

        {error && (
          <Box
            bg="rgb(239, 68, 68)"
            color="#fecaca"
            p={3}
            borderRadius="md"
            mb={4}
            data-testid="identities-panel-error"
          >
            {error}
          </Box>
        )}

        {!isLoading && stagedProfile && (
          <IdentityProfileView
            profile={stagedProfile}
            originalProfile={originalProfile}
            displayName={headingDisplayName}
            disabled={isApplying}
            onChange={handleProfileChange}
            npub={currentNpub}
            onShowQr={onShowQr ? handleShowQr : undefined}
          />
        )}
      </Box>
    </SubPanel>
  );
}

/**
 * IdentitiesPanel - Edit identity profile with inline field editing.
 *
 * Wraps the inner component with HoverInfoProvider to enable hover info
 * text display for all interactive elements.
 */
export function IdentitiesPanel(props: IdentitiesPanelProps): React.ReactElement {
  return (
    <HoverInfoProvider>
      <IdentitiesPanelInner {...props} />
    </HoverInfoProvider>
  );
}

IdentitiesPanel.displayName = 'IdentitiesPanel';
