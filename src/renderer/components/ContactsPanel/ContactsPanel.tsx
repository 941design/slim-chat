/**
 * ContactsPanel - Display full contact profile information.
 *
 * Read-only panel showing contact profile fields including banner, picture, and metadata.
 * Fetches full profile data from the database via IPC.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, Link, VStack, Spinner } from '@chakra-ui/react';
import { SubPanel } from '../SubPanel';
import { CachedImage } from '../CachedImage';
import { Avatar } from '../Avatar';
import { useThemeColors } from '../../themes/ThemeContext';
import { NostlingContact } from '../../../shared/types';
import { ProfileContent } from '../../../shared/profile-types';

interface ContactsPanelProps {
  selectedContact: NostlingContact;
  onClose: () => void;
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
  label,
  value,
  isLink,
}: {
  label: string;
  value: string;
  isLink?: boolean;
}): React.ReactElement {
  const colors = useThemeColors();

  return (
    <Box>
      <Text fontSize="sm" fontWeight="semibold" color={colors.textMuted} mb={1}>
        {label}
      </Text>
      {isLink ? (
        <Link
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          color="blue.500"
          _hover={{ textDecoration: 'underline' }}
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

export function ContactsPanel({ selectedContact, onClose }: ContactsPanelProps): React.ReactElement {
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
            <Box position="relative" height="150px" overflow="hidden" borderRadius="md">
              <CachedImage
                url={profileData.banner}
                height="100%"
                width="100%"
                objectFit="cover"
                data-testid="contacts-panel-banner"
              />

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

          {/* Add spacing after banner with overlaid picture */}
          {profileData?.banner && <Box height="30px" />}

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
          <VStack align="stretch" gap={4}>
            {/* Name */}
            <ProfileField label="Name" value={profileData?.displayName || selectedContact.npub} />

            {/* About */}
            {profileData?.about && <ProfileField label="About" value={profileData.about} />}

            {/* Website */}
            {profileData?.website && (
              <ProfileField label="Website" value={profileData.website} isLink={true} />
            )}

            {/* NIP-05 */}
            {profileData?.nip05 && <ProfileField label="NIP-05" value={profileData.nip05} />}

            {/* Lightning Address */}
            {profileData?.lud16 && (
              <ProfileField label="Lightning Address" value={profileData.lud16} />
            )}

            {/* npub for reference */}
            <Box borderTopWidth="1px" borderColor={colors.border} pt={4}>
              <Text fontSize="xs" fontWeight="semibold" color={colors.textMuted} mb={1}>
                Public Key
              </Text>
              <Text fontSize="xs" color={colors.text} fontFamily="monospace" wordBreak="break-all">
                {selectedContact.npub}
              </Text>
            </Box>
          </VStack>
        </VStack>
      )}
    </SubPanel>
  );
}
