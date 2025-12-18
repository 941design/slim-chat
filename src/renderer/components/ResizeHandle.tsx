import React from 'react';
import { Box } from '@chakra-ui/react';
import { useThemeColors } from '../themes/ThemeContext';

interface ResizeHandleProps {
  onDragStart: (e: React.MouseEvent) => void;
  isDragging: boolean;
}

/**
 * A vertical drag handle for resizing the sidebar.
 * Positioned at the right edge of the sidebar.
 */
export function ResizeHandle({ onDragStart, isDragging }: ResizeHandleProps) {
  const colors = useThemeColors();

  return (
    <Box
      position="absolute"
      right="0"
      top="0"
      bottom="0"
      width="6px"
      cursor="col-resize"
      bg={isDragging ? colors.buttonPrimaryBg : 'transparent'}
      _hover={{
        bg: colors.borderSubtle,
      }}
      onMouseDown={onDragStart}
      data-testid="sidebar-resize-handle"
      zIndex={10}
      transition="background-color 0.15s ease"
    />
  );
}
