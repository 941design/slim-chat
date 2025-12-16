import React, { useState } from 'react';
import { Box, Circle } from '@chakra-ui/react';
import { sanitizePictureUrl } from '../utils/url-sanitizer';

/**
 * Avatar Component
 *
 * Displays profile avatar as either:
 * - Profile picture (circular image) when pictureUrl provided
 * - Letter circle (first letter of displayName) as fallback
 *
 * This is a complete, trivial implementation.
 */

interface AvatarProps {
  /**
   * Display name for letter extraction and alt text
   */
  displayName: string;

  /**
   * Optional profile picture URL
   * If provided and loads successfully, displays image instead of letter
   */
  pictureUrl?: string | null;

  /**
   * Avatar diameter in pixels
   * Default: 32px (medium size for list items)
   */
  size?: number;

  /**
   * Background color for letter circle
   * Should be semantic theme color
   */
  backgroundColor?: string;

  /**
   * Text color for letter
   * Should be semantic theme color
   */
  textColor?: string;
}

/**
 * Extract first letter from display name for avatar
 *
 * CONTRACT:
 *   Inputs:
 *     - displayName: string, non-empty (assumed from getPreferredDisplayName)
 *
 *   Outputs:
 *     - single uppercase letter
 *
 *   Invariants:
 *     - Result is always exactly 1 character
 *     - Result is always uppercase
 *
 *   Properties:
 *     - Deterministic: same input always produces same output
 *     - Non-empty: displayName.length > 0 implies result.length === 1
 */
function extractLetter(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return '?';
  return trimmed[0].toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({
  displayName,
  pictureUrl,
  size = 32,
  backgroundColor = 'blue.500',
  textColor = 'white',
}) => {
  const [imageError, setImageError] = useState(false);
  const letter = extractLetter(displayName);

  // Sanitize URL to prevent XSS attacks
  const sanitizedUrl = sanitizePictureUrl(pictureUrl);

  // Show image if URL provided, sanitized, and not failed
  const showImage = sanitizedUrl && !imageError;

  return (
    <Circle size={`${size}px`} bg={showImage ? 'transparent' : backgroundColor} color={textColor} position="relative">
      {showImage ? (
        <img
          src={sanitizedUrl}
          alt={displayName}
          onError={() => setImageError(true)}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <Box fontSize={`${size * 0.5}px`} fontWeight="bold" lineHeight="1" fontFamily="body">
          {letter}
        </Box>
      )}
    </Circle>
  );
};
