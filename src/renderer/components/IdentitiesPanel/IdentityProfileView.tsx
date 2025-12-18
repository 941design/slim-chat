/**
 * IdentityProfileView Component
 *
 * Read-only profile view with inline editing capability for identity profiles.
 * Resembles ContactsPanel styling with pencil icons to indicate editable fields.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, Link, VStack, HStack, IconButton, Input, Textarea, Image } from '@chakra-ui/react';
import { CachedImage } from '../CachedImage';
import { Avatar } from '../Avatar';
import { useThemeColors } from '../../themes/ThemeContext';
import { useHoverInfoProps } from '../HoverInfo';
import { NpubDisplay } from '../NpubDisplay';
import type { IdentityProfileData } from './types';

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

// Upload icon for image fields
const UploadIcon = ({ size = 20 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

// Small dot indicator for unsaved changes
const UnsavedDot = () => (
  <Box
    as="span"
    display="inline-block"
    width="6px"
    height="6px"
    borderRadius="full"
    bg="orange.400"
    ml={1}
    verticalAlign="middle"
  />
);

type FieldKey = 'label' | 'name' | 'about' | 'picture' | 'banner' | 'website' | 'nip05' | 'lud16';

// Fixed width for label column to align all key-value pairs
const LABEL_WIDTH = '150px';
// Max width for input fields when editing
const INPUT_MAX_WIDTH = '280px';
// Default max width for banner (based on common Nostr banner dimensions: 1500x500px)
const BANNER_MAX_WIDTH = '1500px';

interface EditableFieldProps {
  fieldKey: FieldKey;
  label: string;
  value: string;
  originalValue: string;
  placeholder: string;
  isLink?: boolean;
  hoverInfo?: string;
  editingField: FieldKey | null;
  onStartEdit: (field: FieldKey) => void;
  onSaveEdit: (field: FieldKey, value: string) => void;
  onCancelEdit: () => void;
  disabled?: boolean;
  multiline?: boolean;
  isImageUrl?: boolean;
}

function EditableField({
  fieldKey,
  label,
  value,
  originalValue,
  placeholder,
  isLink,
  hoverInfo,
  editingField,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  disabled,
  multiline,
  isImageUrl,
}: EditableFieldProps): React.ReactElement {
  const colors = useThemeColors();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [draftValue, setDraftValue] = useState(value);
  const [imageError, setImageError] = useState(false);
  const isEditing = editingField === fieldKey;
  const hoverProps = hoverInfo ? useHoverInfoProps(hoverInfo) : {};

  // Check if this field has unsaved changes (different from original)
  const hasUnsavedChanges = value !== originalValue;

  // Reset draft when editing starts
  useEffect(() => {
    if (isEditing) {
      setDraftValue(value);
      setImageError(false);
      setTimeout(() => {
        inputRef.current?.focus();
        if (inputRef.current instanceof HTMLInputElement) {
          inputRef.current.select();
        }
      }, 0);
    }
  }, [isEditing, value]);

  // Reset image error when value changes
  useEffect(() => {
    setImageError(false);
  }, [value]);

  const handleSave = useCallback(() => {
    onSaveEdit(fieldKey, draftValue);
  }, [fieldKey, draftValue, onSaveEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    } else if (e.key === 'Enter' && multiline && e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // Prevent ESC from bubbling up to close the panel
      onCancelEdit();
    }
  }, [handleSave, onCancelEdit, multiline]);

  // Editing mode: label on left, input with limited width
  if (isEditing) {
    return (
      <Box className="group">
        <HStack align={multiline ? 'start' : 'center'} gap={2}>
          {/* Fixed-width label */}
          <Text
            fontSize="sm"
            color={colors.textMuted}
            width={LABEL_WIDTH}
            flexShrink={0}
          >
            {label}
          </Text>
          {/* Input with max width */}
          <HStack align="start" gap={1}>
            {multiline ? (
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                size="sm"
                value={draftValue}
                placeholder={placeholder}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
                width={INPUT_MAX_WIDTH}
                maxWidth={INPUT_MAX_WIDTH}
                data-testid={`identity-profile-${fieldKey}-input`}
              />
            ) : (
              <Input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                size="sm"
                value={draftValue}
                placeholder={placeholder}
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={handleKeyDown}
                width={INPUT_MAX_WIDTH}
                maxWidth={INPUT_MAX_WIDTH}
                data-testid={`identity-profile-${fieldKey}-input`}
              />
            )}
            <Box {...useHoverInfoProps('Save changes')}>
              <IconButton
                size="xs"
                variant="ghost"
                aria-label="Save"
                onClick={handleSave}
                color={colors.textSubtle}
                _hover={{ color: colors.textMuted }}
                data-testid={`identity-profile-${fieldKey}-save`}
              >
                <CheckIcon />
              </IconButton>
            </Box>
            <Box {...useHoverInfoProps('Cancel editing')}>
              <IconButton
                size="xs"
                variant="ghost"
                aria-label="Cancel"
                onClick={onCancelEdit}
                color={colors.textSubtle}
                _hover={{ color: colors.textMuted }}
                data-testid={`identity-profile-${fieldKey}-cancel`}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </HStack>
        </HStack>
      </Box>
    );
  }

  // Read-only view: label and value aligned with inline pencil icon
  return (
    <Box className="group">
      <HStack align={multiline && value ? 'start' : 'center'} gap={2}>
        {/* Fixed-width label with unsaved indicator */}
        <HStack width={LABEL_WIDTH} flexShrink={0} gap={0}>
          <Text fontSize="sm" color={colors.textMuted}>
            {label}
          </Text>
          {hasUnsavedChanges && <UnsavedDot />}
        </HStack>
        {/* Value with inline pencil icon */}
        <Text
          fontSize="sm"
          color={colors.text}
          as="span"
          display="inline"
          data-testid={`identity-profile-${fieldKey}-value`}
        >
          {value ? (
            isLink ? (
              <Box as="span" {...hoverProps}>
                <Link
                  href={value.startsWith('http') ? value : `https://${value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="blue.500"
                  _hover={{ textDecoration: 'underline' }}
                >
                  {value}
                </Link>
              </Box>
            ) : multiline ? (
              <Text as="span" whiteSpace="pre-wrap">
                {value}
              </Text>
            ) : (
              <Text as="span">{value}</Text>
            )
          ) : (
            <Text as="span" color={colors.textSubtle} fontStyle="italic">
              {placeholder}
            </Text>
          )}
          {/* Inline pencil icon (like npub icons in ContactsPanel) */}
          {!disabled && (
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
              <Box as="span" display="inline" {...useHoverInfoProps(`Edit ${label.toLowerCase()}`)}>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label={`Edit ${label}`}
                  onClick={() => onStartEdit(fieldKey)}
                  color={colors.textSubtle}
                  _hover={{ color: colors.textMuted }}
                  data-testid={`identity-profile-${fieldKey}-edit`}
                >
                  <PencilIcon />
                </IconButton>
              </Box>
            </HStack>
          )}
        </Text>
      </HStack>
      {/* Image preview for picture/banner URLs */}
      {isImageUrl && value && !imageError && (
        <Box mt={2} ml={LABEL_WIDTH} pl={2}>
          <Image
            src={value}
            alt={`${label} preview`}
            maxW="200px"
            maxH="150px"
            borderRadius="md"
            onError={() => setImageError(true)}
            data-testid={`identity-profile-${fieldKey}-preview`}
          />
        </Box>
      )}
    </Box>
  );
}

export interface IdentityProfileViewProps {
  profile: IdentityProfileData;
  originalProfile: IdentityProfileData | null;
  displayName: string;
  disabled?: boolean;
  onChange: (profile: IdentityProfileData) => void;
  onStartEditPicture?: () => void;
  onStartEditBanner?: () => void;
  /** The npub for this identity (displayed with QR code and copy icons) */
  npub?: string;
  /** Callback when user clicks QR code button */
  onShowQr?: () => void;
}

export function IdentityProfileView({
  profile,
  originalProfile,
  displayName,
  disabled = false,
  onChange,
  onStartEditPicture,
  onStartEditBanner,
  npub,
  onShowQr,
}: IdentityProfileViewProps): React.ReactElement {
  const colors = useThemeColors();
  const [editingField, setEditingField] = useState<FieldKey | null>(null);

  const handleStartEdit = useCallback((field: FieldKey) => {
    if (!disabled) {
      setEditingField(field);
    }
  }, [disabled]);

  const handleSaveEdit = useCallback((field: FieldKey, value: string) => {
    const trimmedValue = value.trim();

    if (field === 'label') {
      // Label is required, don't allow empty
      if (trimmedValue) {
        onChange({ ...profile, label: trimmedValue });
      }
    } else {
      // Content fields can be empty
      const updatedContent = { ...profile.content };
      if (trimmedValue) {
        updatedContent[field] = trimmedValue;
      } else {
        delete updatedContent[field];
      }
      onChange({ ...profile, content: updatedContent });
    }

    setEditingField(null);
  }, [profile, onChange]);

  const handleCancelEdit = useCallback(() => {
    setEditingField(null);
  }, []);

  // Get picture and banner URLs
  const pictureUrl = profile.content.picture;
  const bannerUrl = profile.content.banner;

  // Check if picture/banner have unsaved changes
  const pictureChanged = pictureUrl !== (originalProfile?.content.picture || '');
  const bannerChanged = bannerUrl !== (originalProfile?.content.banner || '');

  return (
    <VStack align="stretch" gap={6} position="relative">
      {/* Banner with overlaid picture */}
      {bannerUrl && (
        <Box position="relative" marginBottom="44px" className="group" maxWidth={BANNER_MAX_WIDTH}>
          <Box height="150px" overflow="hidden" borderRadius="md">
            <CachedImage
              url={bannerUrl}
              height="100%"
              width="100%"
              objectFit="cover"
              data-testid="identity-profile-banner-display"
            />
          </Box>
          {/* Upload icon overlay for banner - top right corner */}
          {!disabled && (
            <Box
              position="absolute"
              top={0}
              right={0}
              p={1}
              opacity={0}
              _groupHover={{ opacity: 1 }}
              transition="opacity 0.15s"
              zIndex={2}
              {...useHoverInfoProps('Change banner image')}
            >
              <IconButton
                size="sm"
                variant="solid"
                bg="blackAlpha.600"
                color="white"
                aria-label="Change banner"
                onClick={() => handleStartEdit('banner')}
                _hover={{ bg: 'blackAlpha.800' }}
                data-testid="identity-profile-banner-upload"
              >
                <UploadIcon size={16} />
              </IconButton>
            </Box>
          )}
          {/* Unsaved indicator for banner */}
          {bannerChanged && (
            <Box position="absolute" top={0} left={0} p={1} zIndex={2}>
              <UnsavedDot />
            </Box>
          )}

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
            className="group"
          >
            {pictureUrl ? (
              <CachedImage
                url={pictureUrl}
                height="100%"
                width="100%"
                objectFit="cover"
                data-testid="identity-profile-picture-display"
              />
            ) : (
              <Avatar displayName={displayName} size={72} />
            )}
            {/* Upload icon overlay for picture */}
            {!disabled && (
              <Box
                position="absolute"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                opacity={0}
                _groupHover={{ opacity: 1 }}
                transition="opacity 0.15s"
              >
                <Box {...useHoverInfoProps('Change profile picture')}>
                  <IconButton
                    size="sm"
                    variant="solid"
                    bg="blackAlpha.600"
                    color="white"
                    aria-label="Change picture"
                    onClick={() => handleStartEdit('picture')}
                    _hover={{ bg: 'blackAlpha.800' }}
                    borderRadius="full"
                    data-testid="identity-profile-picture-upload"
                  >
                    <UploadIcon size={16} />
                  </IconButton>
                </Box>
              </Box>
            )}
            {/* Unsaved indicator for picture */}
            {pictureChanged && (
              <Box position="absolute" top={0} right={0}>
                <UnsavedDot />
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Picture without banner - full width container for proper icon positioning */}
      {!bannerUrl && (
        <Box position="relative" marginBottom="44px" className="group" maxWidth={BANNER_MAX_WIDTH}>
          {/* Placeholder banner area */}
          <Box
            height="150px"
            overflow="hidden"
            borderRadius="md"
            bg={colors.surfaceBg}
            borderWidth="1px"
            borderStyle="dashed"
            borderColor={colors.borderSubtle}
          />
          {/* Upload icon overlay for banner - top right corner */}
          {!disabled && (
            <Box
              position="absolute"
              top={0}
              right={0}
              p={1}
              opacity={0}
              _groupHover={{ opacity: 1 }}
              transition="opacity 0.15s"
              zIndex={2}
              {...useHoverInfoProps('Add banner image')}
            >
              <IconButton
                size="sm"
                variant="solid"
                bg="blackAlpha.600"
                color="white"
                aria-label="Add banner"
                onClick={() => handleStartEdit('banner')}
                _hover={{ bg: 'blackAlpha.800' }}
                data-testid="identity-profile-banner-add"
              >
                <UploadIcon size={16} />
              </IconButton>
            </Box>
          )}

          {/* Profile picture overlaid on placeholder banner */}
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
            className="group"
          >
            {pictureUrl ? (
              <CachedImage
                url={pictureUrl}
                height="100%"
                width="100%"
                objectFit="cover"
                data-testid="identity-profile-picture-display"
              />
            ) : (
              <Avatar displayName={displayName} size={72} />
            )}
            {/* Upload icon overlay for picture */}
            {!disabled && (
              <Box
                position="absolute"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                opacity={0}
                _groupHover={{ opacity: 1 }}
                transition="opacity 0.15s"
              >
                <Box {...useHoverInfoProps('Change profile picture')}>
                  <IconButton
                    size="sm"
                    variant="solid"
                    bg="blackAlpha.600"
                    color="white"
                    aria-label="Change picture"
                    onClick={() => handleStartEdit('picture')}
                    _hover={{ bg: 'blackAlpha.800' }}
                    borderRadius="full"
                    data-testid="identity-profile-picture-upload"
                  >
                    <UploadIcon size={16} />
                  </IconButton>
                </Box>
              </Box>
            )}
            {/* Unsaved indicator for picture */}
            {pictureChanged && (
              <Box position="absolute" top={0} right={0}>
                <UnsavedDot />
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Profile fields */}
      <VStack align="stretch" gap={4}>
        {/* Label (identity-specific) */}
        <EditableField
          fieldKey="label"
          label="Label"
          value={profile.label}
          originalValue={originalProfile?.label || ''}
          placeholder="Work, Personal, etc."
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
        />

        {/* Name */}
        <EditableField
          fieldKey="name"
          label="Display Name"
          value={profile.content.name || ''}
          originalValue={originalProfile?.content.name || ''}
          placeholder="Not set"
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
        />

        {/* About */}
        <EditableField
          fieldKey="about"
          label="About"
          value={profile.content.about || ''}
          originalValue={originalProfile?.content.about || ''}
          placeholder="Not set"
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
          multiline
        />

        {/* Picture URL */}
        <EditableField
          fieldKey="picture"
          label="Picture URL"
          value={profile.content.picture || ''}
          originalValue={originalProfile?.content.picture || ''}
          placeholder="Not set"
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
          isImageUrl
        />

        {/* Banner URL */}
        <EditableField
          fieldKey="banner"
          label="Banner URL"
          value={profile.content.banner || ''}
          originalValue={originalProfile?.content.banner || ''}
          placeholder="Not set"
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
          isImageUrl
        />

        {/* Website */}
        <EditableField
          fieldKey="website"
          label="Website"
          value={profile.content.website || ''}
          originalValue={originalProfile?.content.website || ''}
          placeholder="Not set"
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
          isLink
          hoverInfo="Open website in browser"
        />

        {/* NIP-05 */}
        <EditableField
          fieldKey="nip05"
          label="NIP-05 Identifier"
          value={profile.content.nip05 || ''}
          originalValue={originalProfile?.content.nip05 || ''}
          placeholder="Not set"
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
        />

        {/* Lightning Address */}
        <EditableField
          fieldKey="lud16"
          label="Lightning Address"
          value={profile.content.lud16 || ''}
          originalValue={originalProfile?.content.lud16 || ''}
          placeholder="Not set"
          editingField={editingField}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          disabled={disabled}
        />

        {/* Public Key (npub) */}
        {npub && (
          <NpubDisplay
            npub={npub}
            onShowQr={onShowQr}
            testIdPrefix="identity-profile"
          />
        )}
      </VStack>
    </VStack>
  );
}

IdentityProfileView.displayName = 'IdentityProfileView';
