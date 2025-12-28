/**
 * Avatar Search Tab Component
 *
 * Orchestrates avatar search UI: filter, grid display, pagination, loading/error states.
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - onAvatarSelected: callback function invoked when user selects avatar
 *       Signature: (avatarUrl: string) => void
 *       Parameter: full HTTPS URL to selected avatar (sanitized)
 *
 *   Outputs:
 *     - React element rendering search interface
 *     - Invokes onAvatarSelected with sanitized full URL when avatar clicked
 *
 *   Invariants:
 *     - Vocabulary loaded exactly once on component mount
 *     - Avatar search triggered on mount with default filter (empty = all)
 *     - Search re-triggered when filter changes (resets to page 1)
 *     - Search re-triggered when page changes (preserves current filter)
 *     - All selected URLs pass through sanitizePictureUrl before callback
 *     - Loading state shown during API requests (vocabulary or search)
 *     - Error state shown when API requests fail
 *
 *   Properties:
 *     - Reactivity: filter changes immediately trigger new search
 *     - Pagination state: current page persists until filter changes
 *     - Error recovery: user can retry failed requests via filter/pagination changes
 *     - URL sanitization: all avatar URLs validated before selection
 *     - Empty results: shows "No avatars found" when search returns empty array
 *
 *   Algorithm:
 *     1. Initialize component state:
 *        a. vocabulary: empty object (AvatarVocabulary)
 *        b. avatars: empty array (AvatarItem[])
 *        c. currentPage: 1
 *        d. hasNextPage: false
 *        e. selectedSubject: "" (all)
 *        f. isLoadingVocab: true
 *        g. isLoadingSearch: false
 *        h. error: null (string | null)
 *
 *     2. On component mount (useEffect):
 *        a. Call avatarApiClient.fetchVocabulary()
 *        b. If successful:
 *           - Store vocabulary in state
 *           - Set isLoadingVocab = false
 *        c. If error:
 *           - Set error message
 *           - Set isLoadingVocab = false
 *        d. Trigger initial search (see step 3)
 *
 *     3. Perform avatar search (function):
 *        a. Set isLoadingSearch = true
 *        b. Clear error state
 *        c. Calculate offset: (currentPage - 1) × PAGE_SIZE
 *        d. Call avatarApiClient.searchAvatars(selectedSubject, PAGE_SIZE, offset)
 *        e. If successful:
 *           - Store items in avatars state
 *           - Set hasNextPage = (items.length === PAGE_SIZE)
 *           - Set isLoadingSearch = false
 *        f. If error:
 *           - Set error message
 *           - Set isLoadingSearch = false
 *           - Keep previous avatars (or empty array if first search)
 *
 *     4. On filter change (SubjectFilter onChange):
 *        a. Update selectedSubject state
 *        b. Reset currentPage to 1
 *        c. Trigger search with new filter and page 1
 *
 *     5. On pagination (Previous/Next):
 *        a. Update currentPage (decrement for Previous, increment for Next)
 *        b. Trigger search with current filter and new page
 *
 *     6. On avatar click (AvatarGrid onAvatarClick):
 *        a. Receive full URL from grid
 *        b. Call sanitizePictureUrl(fullUrl)
 *        c. If sanitized URL is null:
 *           - Log warning (should not happen with known-good API)
 *           - Do not invoke callback
 *        d. If sanitized URL is valid:
 *           - Invoke onAvatarSelected(sanitizedUrl)
 *
 *     7. Render layout (VStack):
 *        a. SubjectFilter at top
 *           - vocabulary prop: vocabulary state
 *           - selectedValue prop: selectedSubject state
 *           - onChange prop: filter change handler
 *           - isLoading prop: isLoadingVocab
 *        b. Error message (if error state is not null):
 *           - Text component with error message
 *           - Red color
 *        c. Loading indicator (if isLoadingSearch):
 *           - Spinner or "Loading avatars..." text
 *        d. AvatarGrid (if not loading and no error):
 *           - avatars prop: avatars state
 *           - baseUrl prop: BASE_URL constant
 *           - onAvatarClick prop: avatar click handler
 *        e. PaginationControls at bottom
 *           - currentPage prop: currentPage state
 *           - hasNextPage prop: hasNextPage state
 *           - onPrevious prop: previous page handler
 *           - onNext prop: next page handler
 *           - isLoading prop: isLoadingSearch
 *
 *   Constants:
 *     - PAGE_SIZE: 20 (number of avatars per page)
 *     - BASE_URL: "https://wp10665333.server-he.de"
 *
 *   Error Messages:
 *     - Vocabulary fetch error: "Unable to load filter options. Please try again."
 *     - Search error (network): "Unable to load avatars. Check your connection."
 *     - Search error (API): "Error searching avatars: {API message}"
 *
 *   Styling:
 *     - Use VStack for vertical layout
 *     - Spacing between sections: consistent gaps
 *     - Error message: red text, medium size
 *     - Loading indicator: centered spinner or text
 *     - Use useThemeColors hook for consistent theming
 *
 *   Testing Considerations:
 *     - Property: vocabulary loaded exactly once on mount
 *     - Property: initial search triggered with empty filter
 *     - Property: filter change resets page to 1
 *     - Property: pagination preserves current filter
 *     - Property: selected URLs sanitized before callback
 *     - Property: error state shown when API fails
 *     - Property: hasNextPage = true when full page returned
 *     - Property: hasNextPage = false when partial page returned
 *
 * Implementation Notes:
 *   - Import useState, useEffect, useCallback from React
 *   - Import VStack, Text, Spinner from @chakra-ui/react
 *   - Import SubjectFilter, AvatarGrid, PaginationControls from same directory
 *   - Import avatarApiClient from services
 *   - Import sanitizePictureUrl from utils
 *   - Import useThemeColors from themes/ThemeContext
 *   - Use functional React component with typed props
 */

import React, { useState, useEffect, useCallback } from 'react';
import { VStack, Text, Spinner } from '@chakra-ui/react';
import type { AvatarSearchTabProps } from './types';
import type { AvatarVocabulary, AvatarItem } from './types';
import { SubjectFilter } from './SubjectFilter';
import { AvatarGrid } from './AvatarGrid';
import { PaginationControls } from './PaginationControls';
import { avatarApiClient, BASE_URL } from '../../services/avatar-api-client';
import { sanitizePictureUrl } from '../../utils/url-sanitizer';
import { useThemeColors } from '../../themes/ThemeContext';

const PAGE_SIZE = 20;

export function AvatarSearchTab({ onAvatarSelected }: AvatarSearchTabProps): React.ReactElement {
  const colors = useThemeColors();

  // State management (per contract lines 36-43)
  const [vocabulary, setVocabulary] = useState<AvatarVocabulary>({});
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [isLoadingVocab, setIsLoadingVocab] = useState<boolean>(true);
  const [isLoadingSearch, setIsLoadingSearch] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Avatar search function (per contract lines 55-67)
  const performSearch = useCallback(async (subject: string, page: number) => {
    setIsLoadingSearch(true);
    setError(null);

    const offset = (page - 1) * PAGE_SIZE;

    try {
      const result = await avatarApiClient.searchAvatars(subject, PAGE_SIZE, offset);
      setAvatars(result.items);
      setHasNextPage(result.items.length === PAGE_SIZE);
      setIsLoadingSearch(false);
    } catch (err) {
      console.error('[AvatarSearchTab] Failed to load avatars:', err);
      const errorMessage = err instanceof Error && err.message.includes('Network')
        ? 'Unable to load avatars. Check your connection.'
        : err instanceof Error
        ? `Error searching avatars: ${err.message}`
        : 'Error searching avatars: Unknown error';

      setError(errorMessage);
      setIsLoadingSearch(false);
    }
  }, []);;

  // On component mount: fetch vocabulary and trigger initial search (per contract lines 45-53)
  useEffect(() => {
    const loadVocabulary = async () => {
      try {
        const vocab = await avatarApiClient.fetchVocabulary();
        setVocabulary(vocab);
        setIsLoadingVocab(false);
      } catch (err) {
        console.error('[AvatarSearchTab] Failed to load vocabulary:', err);
        setError('Unable to load filter options. Please try again.');
        setIsLoadingVocab(false);
      }
    };

    loadVocabulary();
    performSearch('', 1);
  }, [performSearch]);

  // Filter change handler (per contract lines 69-72)
  const handleFilterChange = useCallback((newSubject: string) => {
    setSelectedSubject(newSubject);
    setCurrentPage(1);
    performSearch(newSubject, 1);
  }, [performSearch]);

  // Pagination handlers (per contract lines 74-76)
  const handlePrevious = useCallback(() => {
    const newPage = currentPage - 1;
    setCurrentPage(newPage);
    performSearch(selectedSubject, newPage);
  }, [currentPage, selectedSubject, performSearch]);

  const handleNext = useCallback(() => {
    const newPage = currentPage + 1;
    setCurrentPage(newPage);
    performSearch(selectedSubject, newPage);
  }, [currentPage, selectedSubject, performSearch]);

  // Avatar click handler (per contract lines 78-85)
  const handleAvatarClick = useCallback((fullUrl: string) => {
    const sanitizedUrl = sanitizePictureUrl(fullUrl);

    if (sanitizedUrl === null) {
      console.warn('[AvatarSearchTab] Sanitization rejected URL:', fullUrl);
      return;
    }

    onAvatarSelected(sanitizedUrl);
  }, [onAvatarSelected]);

  // Render layout (per contract lines 87-107)
  return (
    <VStack gap={4} align="stretch">
      <SubjectFilter
        vocabulary={vocabulary}
        selectedValue={selectedSubject}
        onChange={handleFilterChange}
        isLoading={isLoadingVocab}
      />

      {error && (
        <Text color="red.500" fontSize="md">
          {error}
        </Text>
      )}

      {isLoadingSearch && !error && (
        <VStack gap={2} py={8}>
          <Spinner size="lg" color={colors.text} />
          <Text color={colors.text}>Loading avatars...</Text>
        </VStack>
      )}

      {!isLoadingSearch && !error && (
        <AvatarGrid
          avatars={avatars}
          baseUrl={BASE_URL}
          onAvatarClick={handleAvatarClick}
        />
      )}

      <PaginationControls
        currentPage={currentPage}
        hasNextPage={hasNextPage}
        onPrevious={handlePrevious}
        onNext={handleNext}
        isLoading={isLoadingSearch}
      />
    </VStack>
  );
}
