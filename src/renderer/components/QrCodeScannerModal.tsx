import React, { useEffect, useRef, useState } from 'react';
import { Dialog, Button, VStack, Text, Box } from '@chakra-ui/react';
import jsQR from 'jsqr';
import { extractNpubFromNostrData } from '../utils/npub-validation';

/**
 * QR Code Scanner Modal Component
 *
 * CONTRACT:
 *   Inputs:
 *     - isOpen: boolean flag, indicates whether modal is visible
 *     - onClose: callback function, invoked when modal should close
 *     - identityId: string identifier, non-empty, references the currently selected identity
 *     - onNpubScanned: callback function (npub: string) => void, invoked with scanned npub
 *
 *   Outputs:
 *     - React component rendering a modal dialog with camera feed
 *     - Side effects: invokes onNpubScanned callback with valid npub when QR code scanned
 *
 *   Invariants:
 *     - Camera stream only active when modal is open
 *     - Camera stream must stop when modal closes (cleanup)
 *     - Only valid npubs trigger onNpubScanned callback (invalid QR codes ignored)
 *     - Callback invoked with exact scanned npub value (no modification)
 *
 *   Properties:
 *     - Idempotent cleanup: calling stopCamera() multiple times is safe
 *     - Monotonic state: scanning state progresses from idle → requesting → active → success/error
 *     - Error recovery: permission denial does not crash, shows error message
 *     - Resource cleanup: camera stream released on component unmount or modal close
 *
 *   Algorithm:
 *     1. When modal opens:
 *        a. Request camera permissions via navigator.mediaDevices.getUserMedia
 *        b. If granted: start camera stream, display video feed
 *        c. If denied: display permission error message
 *
 *     2. QR code scanning loop (while camera active):
 *        a. Capture current video frame to canvas (using requestAnimationFrame)
 *        b. Extract image data from canvas context
 *        c. Pass image data to jsQR decoder
 *        d. If QR code detected:
 *           - Extract decoded text content
 *           - Validate using isValidNpub() function
 *           - If valid: call createContact(identityId, npub)
 *           - If invalid: continue scanning (ignore)
 *        e. If no QR code: continue scanning
 *
 *     3. npub detection flow:
 *        a. When valid npub detected:
 *           - Set state to 'success'
 *           - Stop camera stream
 *           - Invoke onNpubScanned(npub) callback
 *           - Parent component handles population of form field
 *
 *     4. Cleanup on modal close:
 *        a. Stop video stream tracks (mediaStream.getTracks().forEach(track.stop()))
 *        b. Clear video element srcObject
 *        c. Cancel animation frame loop
 *        d. Reset state to idle
 *
 *   Camera Permissions:
 *     - Request: { video: { facingMode: "environment" } } for rear camera preference
 *     - Fallback: accept any available camera if environment not available
 *     - Error handling: permission denied → show user-friendly error, allow retry
 *
 *   npub Validation:
 *     - Use isValidNpub() function from crypto module
 *     - Validation rules:
 *       * Must start with "npub1"
 *       * Valid bech32 encoding
 *       * Decodes to exactly 64 hex characters
 *     - Invalid npubs: silently ignored, scanning continues
 *
 *   Visual Feedback States:
 *     - Loading: "Initializing camera..." during getUserMedia request
 *     - Active: Live camera feed with scanning indicator overlay
 *     - Success: "QR code scanned!" message (modal remains open for parent to handle)
 *     - Error: Permission denied / camera access error messages
 *     - Scanning overlay: Semi-transparent frame indicating scan area
 */

type ScannerState = 'idle' | 'requesting' | 'active' | 'success' | 'error' | 'scan_error';

export interface QrCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  identityId: string;
  onNpubScanned: (npub: string) => void;
}

export function QrCodeScannerModal({
  isOpen,
  onClose,
  identityId,
  onNpubScanned,
}: QrCodeScannerModalProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const lastFrameTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const loggedDimensionsRef = useRef<boolean>(false);

  const [state, setState] = useState<ScannerState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanErrorMessage, setScanErrorMessage] = useState<string | null>(null);

  const stopCamera = React.useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    processingRef.current = false;
    frameCountRef.current = 0;
    loggedDimensionsRef.current = false;
  }, []);

  const handleNpubScanned = React.useCallback(
    (npub: string) => {
      setState('success');
      stopCamera();
      onNpubScanned(npub);
    },
    [stopCamera, onNpubScanned]
  );

  const scanFrame = React.useCallback(() => {
    if (!videoRef.current || !canvasRef.current || processingRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Frame rate limiting: target 20fps (50ms between frames)
    const now = performance.now();
    const timeSinceLastFrame = now - lastFrameTimeRef.current;
    if (timeSinceLastFrame < 50) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    lastFrameTimeRef.current = now;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Log dimensions once when scanning starts
    if (!loggedDimensionsRef.current) {
      console.log('[QR Scanner] Video dimensions:', video.videoWidth, 'x', video.videoHeight);
      console.log('[QR Scanner] Canvas dimensions:', canvas.width, 'x', canvas.height);
      loggedDimensionsRef.current = true;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Log frame count periodically
    frameCountRef.current++;
    if (frameCountRef.current % 100 === 0) {
      console.log('[QR Scanner] Scanned frames:', frameCountRef.current, '- Image data size:', imageData.data.length);
    }

    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (code && code.data) {
      // Log ANY detected QR code
      console.log('[QR Scanner] QR Code detected!');
      console.log('[QR Scanner] Raw data:', code.data);

      processingRef.current = true;
      const result = extractNpubFromNostrData(code.data);
      console.log('[QR Scanner] Extraction result:', result);

      if (result.success) {
        console.log('[QR Scanner] Valid npub extracted:', result.npub);
        handleNpubScanned(result.npub);
      } else {
        console.log('[QR Scanner] Invalid QR code:', result.error);
        setScanErrorMessage(result.error);
        setState('scan_error');
        stopCamera();
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [handleNpubScanned, stopCamera]);

  const startCamera = React.useCallback(async () => {
    setState('requesting');
    setErrorMessage(null);

    try {
      let stream: MediaStream | null = null;

      // Request high resolution for better QR code detection
      const videoConstraints = {
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            ...videoConstraints,
          },
        });
        console.log('[QR Scanner] Camera started with environment facing mode');
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });
        console.log('[QR Scanner] Camera started with default facing mode');
      }

      if (!isMountedRef.current) return;

      if (!stream) {
        setErrorMessage('Failed to access camera');
        setState('error');
        return;
      }

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (!isMountedRef.current) return;
          if (videoRef.current) {
            videoRef.current.play();
            setState('active');
            animationFrameRef.current = requestAnimationFrame(scanFrame);
          }
        };
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      const message =
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Camera permission denied'
          : 'Failed to access camera';
      setErrorMessage(message);
      setState('error');
    }
  }, [scanFrame]);

  useEffect(() => {
    isMountedRef.current = true;

    if (isOpen) {
      setState('idle');
      setErrorMessage(null);
      startCamera();
    } else {
      stopCamera();
      setState('idle');
    }

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  const handleRetry = () => {
    stopCamera();
    setState('idle');
    setErrorMessage(null);
    setScanErrorMessage(null);
    startCamera();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Scan QR Code</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger />
          <Dialog.Body>
            <VStack gap={4} align="stretch">
              {state === 'requesting' && (
                <Text textAlign="center" color="blue.500">
                  Initializing camera...
                </Text>
              )}

              {(state === 'requesting' || state === 'active') && (
                <Box position="relative" w="100%" minH="400px" paddingTop="75%">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      borderRadius: '8px',
                      objectFit: 'cover',
                      opacity: state === 'active' ? 1 : 0,
                    }}
                  />
                  <canvas
                    ref={canvasRef}
                    style={{
                      display: 'none',
                    }}
                  />
                  {state === 'active' && (
                    <Box
                      position="absolute"
                      top="50%"
                      left="50%"
                      transform="translate(-50%, -50%)"
                      w="80%"
                      h="80%"
                      border="3px dashed"
                      borderColor="white"
                      borderRadius="12px"
                      pointerEvents="none"
                      boxShadow="0 0 0 9999px rgba(0, 0, 0, 0.3)"
                    />
                  )}
                </Box>
              )}

              {state === 'success' && (
                <Text textAlign="center" color="green.500" fontWeight="bold">
                  QR code scanned!
                </Text>
              )}

              {state === 'scan_error' && scanErrorMessage && (
                <VStack gap={2} align="stretch">
                  <Text textAlign="center" color="orange.500" fontWeight="bold">
                    Invalid QR Code
                  </Text>
                  <Text textAlign="center" color="gray.600" fontSize="sm">
                    {scanErrorMessage}
                  </Text>
                  <Button onClick={handleRetry} size="sm">
                    Scan Again
                  </Button>
                </VStack>
              )}

              {state === 'error' && errorMessage && (
                <VStack gap={2} align="stretch">
                  <Text textAlign="center" color="red.500">
                    {errorMessage}
                  </Text>
                  <Button onClick={handleRetry} size="sm">
                    Retry
                  </Button>
                </VStack>
              )}
            </VStack>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
