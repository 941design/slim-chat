/**
 * ContactsPanel - Display full contact profile information.
 *
 * Read-only panel showing contact profile fields including banner, picture, and metadata.
 * Header displays editable alias with pencil/clear icons on hover.
 * Fetches full profile data from the database via IPC.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Text, Link, VStack, HStack, IconButton, Spinner, Input, Heading } from '@chakra-ui/react';
import { SubPanel } from '../SubPanel';
import { CachedImage } from '../CachedImage';
import { Avatar } from '../Avatar';
import { useThemeColors } from '../../themes/ThemeContext';
import { NostlingContact } from '../../../shared/types';
import { ProfileContent } from '../../../shared/profile-types';
import { getPreferredDisplayName } from '../../utils/sidebar';
import { HoverInfoProvider, useHoverInfoProps, useHoverInfo } from '../HoverInfo';
import { NpubDisplay } from '../NpubDisplay';

// Pencil icon for editing
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

// X circle icon for clearing alias
const XCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

// Closed lock icon for private profile
const LockClosedIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Open lock icon for public profile
const LockOpenIcon = ({ size = 14 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
);

interface ContactsPanelProps {
  selectedContact: NostlingContact;
  onClose: () => void;
  onShowQr?: (contact: NostlingContact) => void;
  onRemove?: (contact: NostlingContact) => void;
  onRename?: (contactId: string, alias: string) => Promise<void>;
  onClearAlias?: (contactId: string) => Promise<void>;
  /**
   * Optional callback to display hover info text in the main window footer.
   * When provided, hover info will be displayed in the external footer
   * instead of a panel-specific footer.
   */
  onHoverInfo?: (text: string | null) => void;
}

interface ProfileData {
  profileName?: string; // Name from profile (not alias)
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
  source?: 'private_received' | 'public_discovered'; // Profile source (private or public)
}

function ProfileField({
  label,
  value,
  isLink,
  hoverInfo,
}: {
  label?: string;
  value: string;
  isLink?: boolean;
  hoverInfo?: string;
}): React.ReactElement {
  const colors = useThemeColors();
  const hoverProps = hoverInfo ? useHoverInfoProps(hoverInfo) : {};

  return (
    <Box>
      {label && (
        <Text fontSize="xs" color={colors.textMuted} mb={1}>
          {label}
        </Text>
      )}
      {isLink ? (
        <Box as="span" {...hoverProps}>
          <Link
            href={value.startsWith('http') ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            color="blue.500"
            _hover={{ textDecoration: 'underline' }}
            fontSize="sm"
          >
            {value}
          </Link>
        </Box>
      ) : (
        <Text fontSize="sm" color={colors.text} whiteSpace="pre-wrap">
          {value}
        </Text>
      )}
    </Box>
  );
}

/**
 * Inner component that renders the contact panel content.
 * Must be wrapped in HoverInfoProvider to use hover info features.
 */
function ContactsPanelInner({ selectedContact, onClose, onShowQr, onRemove, onRename, onClearAlias, onHoverInfo }: ContactsPanelProps): React.ReactElement {
  // Get hover info props for action buttons
  const removeHoverProps = useHoverInfoProps('Remove this contact from your list');
  const returnHoverProps = useHoverInfoProps('Return to conversation view');
  const { showInfo, hideInfo } = useHoverInfo();
  const colors = useThemeColors();

  // Handler for copy message that works with the HoverInfo context
  const handleCopyMessage = useCallback((message: string | null) => {
    if (message) {
      showInfo(message);
    } else {
      hideInfo();
    }
  }, [showInfo, hideInfo]);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftAlias, setDraftAlias] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  // Get the display name for heading (precedence resolved in backend: alias > private > public > npub)
  const headingDisplayName = getPreferredDisplayName({
    profileName: selectedContact.profileName,
    npub: selectedContact.npub,
  });

  // Determine if contact has an alias that can be cleared
  const hasAlias = selectedContact.alias && selectedContact.alias.trim().length > 0;

  const startEditing = () => {
    setIsEditing(true);
    setDraftAlias(selectedContact.alias || '');
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setDraftAlias('');
  };

  const saveEditing = async () => {
    const trimmed = draftAlias.trim();
    if (!trimmed) {
      cancelEditing();
      return;
    }
    if (onRename) {
      await onRename(selectedContact.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleClearAlias = async () => {
    if (onClearAlias) {
      await onClearAlias(selectedContact.id);
    }
  };

  // Fetch full profile data when contact changes
  useEffect(() => {
    let cancelled = false;

    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch full profile from database via IPC
        const profile = await window.api.nostling?.profiles.getContactProfile(selectedContact.id);

        if (cancelled) return;

        // Build profile data from fetched content
        // Only use profile data if we have a profile - never mix sources
        if (profile) {
          const content: ProfileContent = profile.content || {};
          const profileSource = profile.source as 'private_received' | 'public_discovered';

          // Profile name from profile data (display_name > name), NOT alias
          const profileName = content.display_name || content.name || undefined;

          setProfileData({
            profileName,
            about: content.about,
            picture: content.picture || undefined,
            banner: content.banner,
            website: content.website,
            nip05: content.nip05,
            lud16: content.lud16,
            source: profileSource,
          });
        } else {
          // No profile available - use only basic contact info
          setProfileData({
            profileName: selectedContact.profileName || undefined,
            picture: selectedContact.picture || undefined,
            source: undefined,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load profile');
        // Still set basic profile data from contact
        setProfileData({
          profileName: selectedContact.profileName || undefined,
          picture: selectedContact.picture || undefined,
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedContact.id, selectedContact.alias, selectedContact.profileName, selectedContact.npub, selectedContact.picture]);

  // Build actions array with optional remove button
  const actions = [];
  if (onRemove) {
    actions.push({
      label: 'Remove',
      onClick: () => onRemove(selectedContact),
      variant: 'ghost' as const,
      colorPalette: 'gray' as const,
      testId: 'contacts-panel-remove',
      hoverProps: removeHoverProps,
    });
  }
  actions.push({
    label: 'Return',
    onClick: onClose,
    variant: 'outline' as const,
    colorPalette: 'blue' as const,
    testId: 'contacts-panel-close',
    hoverProps: returnHoverProps,
  });

  // Build the custom title element with editable alias
  const titleElement = (
    <Box className="group">
      {isEditing ? (
        <HStack align="center" gap={1}>
          <Input
            ref={inputRef}
            size="sm"
            value={draftAlias}
            placeholder="Enter alias..."
            onChange={(e) => setDraftAlias(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                void saveEditing();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelEditing();
              }
            }}
            data-testid="contacts-panel-alias-input"
          />
          <Box {...useHoverInfoProps('Save the edited alias')}>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Save alias"
              onClick={() => void saveEditing()}
              color={colors.textSubtle}
              _hover={{ color: colors.textMuted }}
              data-testid="contacts-panel-save-alias"
            >
              <CheckIcon />
            </IconButton>
          </Box>
          <Box {...useHoverInfoProps('Cancel editing')}>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Cancel editing"
              onClick={cancelEditing}
              color={colors.textSubtle}
              _hover={{ color: colors.textMuted }}
              data-testid="contacts-panel-cancel-edit"
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
            data-testid="contacts-panel-display-name"
          >
            {headingDisplayName}
          </Heading>
          <HStack
            gap={0}
            opacity={0}
            _groupHover={{ opacity: 1 }}
            transition="opacity 0.15s"
          >
            {onRename && (
              <Box {...useHoverInfoProps('Edit contact alias')}>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Edit contact alias"
                  onClick={startEditing}
                  color={colors.textSubtle}
                  _hover={{ color: colors.textMuted }}
                  data-testid="contacts-panel-edit-alias"
                >
                  <PencilIcon />
                </IconButton>
              </Box>
            )}
            {hasAlias && onClearAlias && (
              <Box {...useHoverInfoProps('Remove alias to show profile name')}>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label="Remove alias"
                  onClick={() => void handleClearAlias()}
                  color={colors.textSubtle}
                  _hover={{ color: colors.textMuted }}
                  data-testid="contacts-panel-clear-alias"
                >
                  <XCircleIcon />
                </IconButton>
              </Box>
            )}
          </HStack>
        </HStack>
      )}
    </Box>
  );

  return (
    <SubPanel
      title={headingDisplayName}
      titleElement={titleElement}
      actions={actions}
      testId="contacts-panel"
    >
      {isLoading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <Spinner size="lg" color={colors.buttonPrimaryBg} />
        </Box>
      ) : (
        <VStack align="stretch" gap={6} position="relative">
          {/* Profile source lock icon - always top right */}
          {profileData?.source && (
            <Box
              position="absolute"
              top={0}
              right={0}
              p={1}
              borderRadius="md"
              bg="blackAlpha.600"
              color={profileData.source === 'private_received' ? 'green.400' : 'red.400'}
              zIndex={1}
              {...useHoverInfoProps(
                profileData.source === 'private_received'
                  ? 'Private profile shared directly with you'
                  : 'Public profile from Nostr relays'
              )}
              data-testid="contacts-panel-profile-source"
            >
              {profileData.source === 'private_received' ? <LockClosedIcon size={16} /> : <LockOpenIcon size={16} />}
            </Box>
          )}

          {/* Banner with overlaid picture */}
          {profileData?.banner && (
            <Box position="relative" marginBottom="44px">
              <Box height="150px" overflow="hidden" borderRadius="md">
                <CachedImage
                  url={profileData.banner}
                  height="100%"
                  width="100%"
                  objectFit="cover"
                  data-testid="contacts-panel-banner"
                />
              </Box>

              {/* Profile picture overlaid on banner */}
              <Box
                position="absolute"
                bottom="-40px"
                left={4}
                width="80px"
                height="80px"
                borderRadius="full"
                overflow="hidden"
                borderWidth="4px"
                borderColor={colors.surfaceBg}
                bg={colors.surfaceBg}
              >
                {profileData?.picture ? (
                  <CachedImage
                    url={profileData.picture}
                    height="100%"
                    width="100%"
                    objectFit="cover"
                    data-testid="contacts-panel-picture"
                  />
                ) : (
                  <Avatar displayName={headingDisplayName} size={80} />
                )}
              </Box>
            </Box>
          )}

          {/* Picture without banner */}
          {!profileData?.banner && (
            <Box width="80px" height="80px" borderRadius="full" overflow="hidden">
              {profileData?.picture ? (
                <CachedImage
                  url={profileData.picture}
                  height="100%"
                  width="100%"
                  objectFit="cover"
                  data-testid="contacts-panel-picture"
                />
              ) : (
                <Avatar displayName={headingDisplayName} size={80} />
              )}
            </Box>
          )}

          {/* Error message if any */}
          {error && (
            <Box
              bg="red.900"
              color="red.200"
              p={3}
              borderRadius="md"
              fontSize="sm"
            >
              {error}
            </Box>
          )}

          {/* Profile fields (read-only, from profile data) */}
          <VStack align="stretch" gap={3}>
            {/* Profile Name (from profile, not alias) */}
            {profileData?.profileName && (
              <ProfileField value={profileData.profileName} />
            )}

            {/* About */}
            {profileData?.about && <ProfileField value={profileData.about} />}

            {/* Website */}
            {profileData?.website && (
              <ProfileField value={profileData.website} isLink={true} hoverInfo="Open website in browser" />
            )}

            {/* NIP-05 */}
            {profileData?.nip05 && <ProfileField value={profileData.nip05} />}

            {/* Lightning Address */}
            {profileData?.lud16 && (
              <ProfileField value={profileData.lud16} />
            )}

            {/* npub with hover icons */}
            <Box
              borderTopWidth="1px"
              borderColor={colors.border}
              pt={4}
            >
              <NpubDisplay
                npub={selectedContact.npub}
                onShowQr={onShowQr ? () => onShowQr(selectedContact) : undefined}
                testIdPrefix="contacts-panel"
                onCopyMessage={handleCopyMessage}
              />
            </Box>
          </VStack>
        </VStack>
      )}
    </SubPanel>
  );
}

/**
 * ContactsPanel - Display full contact profile information with hover info.
 *
 * Wraps the inner component with HoverInfoProvider to enable hover info
 * text display for all interactive elements. When onHoverInfo is provided,
 * the hover info text is displayed in the main window footer instead of
 * a panel-specific footer.
 */
export function ContactsPanel(props: ContactsPanelProps): React.ReactElement {
  return (
    <HoverInfoProvider onInfoChange={props.onHoverInfo}>
      <ContactsPanelInner {...props} />
    </HoverInfoProvider>
  );
}
