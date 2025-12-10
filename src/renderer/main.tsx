import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  ChakraProvider,
  createSystem,
  defaultConfig,
  defineConfig,
  Box,
  Flex,
  Text,
  Button,
  IconButton,
  Heading,
  VStack,
  HStack,
  Spacer,
} from '@chakra-ui/react';
import { AppStatus, UpdateState } from '../shared/types';
import './types.d.ts';
import { getStatusText, isRefreshEnabled } from './utils';

// Simple refresh icon component
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
  </svg>
);

// Custom dark theme for Chakra UI v3
const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: '#e0f7ff' },
          100: { value: '#b8ecfe' },
          200: { value: '#8ee0fb' },
          300: { value: '#63d4f8' },
          400: { value: '#38bdf8' },
          500: { value: '#0ea5e9' },
          600: { value: '#0284c7' },
          700: { value: '#0369a1' },
          800: { value: '#075985' },
          900: { value: '#0c4a6e' },
        },
      },
    },
  },
});

const system = createSystem(defaultConfig, config);

const initialUpdateState: UpdateState = { phase: 'idle' };

function useStatus() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState);

  useEffect(() => {
    async function load() {
      const next = await window.api.getStatus();
      setStatus(next);
      setUpdateState(next.updateState);
    }
    load();
    const unsubscribe = window.api.onUpdateState(async (state) => {
      setUpdateState(state);

      // BUG FIX: Re-fetch full status when update check completes
      // Root cause: onUpdateState only updated updateState, not full status including lastUpdateCheck
      // Bug report: bug-reports/footer-timestamp-not-updating-report.md
      // Fixed: 2025-12-07
      // This ensures lastUpdateCheck timestamp is displayed immediately when checks complete
      // Note: Only refresh for 'idle' and 'failed' states (check completion)
      // 'ready' state doesn't need timestamp update (comes from 'downloaded' -> 'verifying' -> 'ready')
      if (state.phase === 'idle' || state.phase === 'failed') {
        const refreshed = await window.api.getStatus();
        setStatus(refreshed);
      }
    });
    return unsubscribe;
  }, []);

  // CODE QUALITY: Add error handling for async IPC calls
  // Prevents unhandled promise rejections from IPC failures
  const refresh = async () => {
    try {
      await window.api.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const restart = async () => {
    try {
      await window.api.restartToUpdate();
    } catch (error) {
      console.error('Failed to restart:', error);
    }
  };

  // BUG FIX: Add download function for 'available' phase
  // Root cause: handlePrimary() was calling onCheck() for all non-ready phases
  // Bug report: bug-reports/download-update-button-not-working-report.md
  // Fixed: 2025-12-07
  const download = async () => {
    try {
      await window.api.updates.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
    }
  };

  return { status, updateState, refresh, restart, download };
}

function Header() {
  return (
    <Box
      as="header"
      px="4"
      py="3"
      borderBottomWidth="1px"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.300"
    >
      <Text fontSize="lg" fontWeight="semibold" color="brand.400">
        SlimChat Bootstrap
      </Text>
    </Box>
  );
}

/**
 * AUTO-UPDATE FOOTER FEATURE: Enhanced Footer Component (FR1, FR3, FR4, FR5, FR6, FR8)
 *
 * Displays current version, update status, progress, and provides update controls.
 * Implements all footer requirements from specification.
 */

interface FooterProps {
  version?: string;
  updateState: UpdateState;
  onRefresh: () => void;
  onDownload: () => void;
  onRestart: () => void;
}

function Footer({ version, updateState, onRefresh, onDownload, onRestart }: FooterProps) {
  const statusText = useMemo(() => getStatusText(updateState), [updateState]);
  const refreshEnabled = useMemo(() => isRefreshEnabled(updateState.phase), [updateState.phase]);

  const showDownloadButton = updateState.phase === 'available';
  const showRestartButton = updateState.phase === 'ready';

  return (
    <Flex
      as="footer"
      px="4"
      py="2"
      borderTopWidth="1px"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.300"
      alignItems="center"
      fontSize="sm"
    >
      <HStack gap="2">
        <Text color="gray.500" fontFamily="mono" fontSize="xs">
          {version ? `v${version}` : 'Loading...'}
        </Text>
        <Text color="gray.600">•</Text>
        <Text color="gray.400">{statusText}</Text>
      </HStack>
      <Spacer />
      <HStack gap="2">
        {showDownloadButton && (
          <Button size="sm" colorPalette="blue" onClick={onDownload}>
            Download Update
          </Button>
        )}
        {showRestartButton && (
          <Button size="sm" colorPalette="green" onClick={onRestart}>
            Restart to Update
          </Button>
        )}
        <IconButton
          aria-label="Check for updates"
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={!refreshEnabled}
        >
          <RefreshIcon />
        </IconButton>
      </HStack>
    </Flex>
  );
}

function Sidebar() {
  // Auto-update footer feature: Update controls moved to footer (FR9)
  // Sidebar kept intact for future features
  return (
    <Box
      as="aside"
      w="220px"
      borderRightWidth="1px"
      borderColor="whiteAlpha.100"
      bg="blackAlpha.200"
      p="4"
    >
      <VStack align="stretch" gap="4">
        <Box>
          <Heading size="sm" color="gray.300" mb="2">
            Placeholder
          </Heading>
          <Text fontSize="sm" color="gray.500">
            Future features here
          </Text>
        </Box>
      </VStack>
    </Box>
  );
}

function App() {
  const { status, updateState, refresh, restart, download } = useStatus();

  return (
    <Flex direction="column" h="100vh" bg="#0f172a">
      <Header />
      <Flex flex="1" overflow="hidden">
        <Sidebar />
        <Box as="main" flex="1" p="4" overflowY="auto">
          {/* Main content area */}
        </Box>
      </Flex>
      <Footer
        version={status?.version}
        updateState={updateState}
        onRefresh={refresh}
        onDownload={download}
        onRestart={restart}
      />
    </Flex>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ChakraProvider value={system}>
    <App />
  </ChakraProvider>
);
