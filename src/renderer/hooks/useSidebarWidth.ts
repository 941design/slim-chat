import { useState, useEffect, useCallback, useRef } from 'react';

const SIDEBAR_WIDTH_KEY = 'nostling-sidebar-width';
const DEFAULT_WIDTH_PERCENT = 20; // 20% of window width
const MIN_WIDTH_PERCENT = 10;
const MAX_WIDTH_PERCENT = 50;

/**
 * Hook for managing resizable sidebar width with localStorage persistence.
 * Width is stored as a percentage of window width (10-50%).
 */
export function useSidebarWidth() {
  // Initialize from localStorage or default
  const [widthPercent, setWidthPercent] = useState<number>(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= MIN_WIDTH_PERCENT && parsed <= MAX_WIDTH_PERCENT) {
        return parsed;
      }
    }
    return DEFAULT_WIDTH_PERCENT;
  });

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Persist to localStorage when width changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, widthPercent.toString());
  }, [widthPercent]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowWidth = window.innerWidth;
      const newWidthPercent = (e.clientX / windowWidth) * 100;

      // Clamp to min/max
      const clampedPercent = Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, newWidthPercent));
      setWidthPercent(clampedPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  // Calculate actual pixel width
  const widthPx = `${widthPercent}vw`;

  return {
    widthPx,
    widthPercent,
    isDragging,
    handleDragStart,
    containerRef,
    MIN_WIDTH_PERCENT,
    MAX_WIDTH_PERCENT,
  };
}
