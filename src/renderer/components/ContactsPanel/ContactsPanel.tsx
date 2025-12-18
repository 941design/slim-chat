/**
 * ContactsPanel - Display full contact profile information.
 *
 * Read-only panel showing contact profile fields including banner, picture, and metadata.
 * Fetches full profile data from the database via IPC.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, Link, VStack, HStack, IconButton, Spinner } from '@chakra-ui/react';
import { SubPanel } from '../SubPanel';
import { CachedImage } from '../CachedImage';
import { Avatar } from '../Avatar';
import { useThemeColors } from '../../themes/ThemeContext';
import { NostlingContact } from '../../../shared/types';
import { ProfileContent } from '../../../shared/profile-types';
import { QrCodeIcon } from '../qr-icons';

// Copy icon for the contact profile
const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

interface ContactsPanelProps {
  selectedContact: NostlingContact;
  onClose: () => void;
  onShowQr?: (contact: NostlingContact) => void;
}

interface ProfileData {
  displayName: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
}

function ProfileField({
  value,
  isLink,
}: {
  value: string;
  isLink?: boolean;
}): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Box>
      {isLink ? (
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
      ) : (
        <Text fontSize="sm" color={colors.text} whiteSpace="pre-wrap">
          {value}
        </Text>
      )}
    </Box>
  );
}

export function ContactsPanel({ selectedContact, onClose, onShowQr }: ContactsPanelProps): React.ReactElement {
  const colors = useThemeColors();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const content: ProfileContent = profile?.content || {};

        // Display name precedence: alias > profileName > name/display_name from profile > npub
        const displayName =
          selectedContact.alias ||
          selectedContact.profileName ||
          content.display_name ||
          content.name ||
          selectedContact.npub;

        setProfileData({
          displayName,
          about: content.about,
          picture: content.picture || selectedContact.picture || undefined,
          banner: content.banner,
          website: content.website,
          nip05: content.nip05,
          lud16: content.lud16,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load profile');
        // Still set basic profile data from contact
        setProfileData({
          displayName: selectedContact.alias || selectedContact.profileName || selectedContact.npub,
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

  return (
    <SubPanel
      title="Contact Profile"
      actions={[
        {
          label: 'Close',
          onClick: onClose,
          variant: 'ghost',
          testId: 'contacts-panel-close',
        },
      ]}
      testId="contacts-panel"
    >
      {isLoading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <Spinner size="lg" color={colors.buttonPrimaryBg} />
        </Box>
      ) : (
        <VStack align="stretch" gap={6}>
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
                  <Avatar displayName={profileData?.displayName || '?'} size={80} />
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
                <Avatar displayName={profileData?.displayName || '?'} size={80} />
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

          {/* Profile fields */}
          <VStack align="stretch" gap={3}>
            {/* Name */}
            <Text fontSize="lg" fontWeight="semibold" color={colors.text}>
              {profileData?.displayName || selectedContact.npub}
            </Text>

            {/* About */}
            {profileData?.about && <ProfileField value={profileData.about} />}

            {/* Website */}
            {profileData?.website && (
              <ProfileField value={profileData.website} isLink={true} />
            )}

            {/* NIP-05 */}
            {profileData?.nip05 && <ProfileField value={profileData.nip05} />}

            {/* Lightning Address */}
            {profileData?.lud16 && (
              <ProfileField value={profileData.lud16} />
            )}

            {/* npub with hover icons */}
            <Box
              className="group"
              borderTopWidth="1px"
              borderColor={colors.border}
              pt={4}
            >
              <Text
                fontSize="xs"
                color={colors.textMuted}
                fontFamily="monospace"
                wordBreak="break-all"
                data-testid="contacts-panel-npub"
                as="span"
                display="inline"
              >
                {selectedContact.npub}
                <HStack
                  as="span"
                  display="inline-flex"
                  gap={0}
                  opacity={0}
                  _groupHover={{ opacity: 1 }}
                  transition="opacity 0.15s"
                  verticalAlign="middle"
                  ml={1}
                >
                  {onShowQr && (
                    <IconButton
                      size="xs"
                      variant="ghost"
                      aria-label="Show QR code"
                      title="Show QR code for this contact"
                      onClick={() => onShowQr(selectedContact)}
                      color={colors.textSubtle}
                      _hover={{ color: colors.textMuted }}
                      data-testid="contacts-panel-show-qr"
                    >
                      <QrCodeIcon />
                    </IconButton>
                  )}
                  <IconButton
                    size="xs"
                    variant="ghost"
                    aria-label="Copy npub"
                    title="Copy npub to clipboard"
                    onClick={() => navigator.clipboard.writeText(selectedContact.npub)}
                    color={colors.textSubtle}
                    _hover={{ color: colors.textMuted }}
                    data-testid="contacts-panel-copy-npub"
                  >
                    <CopyIcon />
                  </IconButton>
                </HStack>
              </Text>
            </Box>
          </VStack>
        </VStack>
      )}
    </SubPanel>
  );
}
