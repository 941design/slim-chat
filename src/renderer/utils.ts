import type { UpdateState, UpdatePhase } from '../shared/types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export function getStatusText(updateState: UpdateState): string {
  const { phase, version: newVersion, detail, progress } = updateState;

  switch (phase) {
    case 'idle':
      return 'Up to date';
    case 'checking':
      return 'Checking for updates...';
    case 'available':
      return newVersion && newVersion.trim() ? `Update available: v${newVersion}` : 'Update available';
    case 'downloading':
      if (progress) {
        const percent = Math.round(progress.percent);
        const transferred = formatBytes(progress.transferred);
        const total = formatBytes(progress.total);
        const speed = formatBytes(progress.bytesPerSecond) + '/s';
        return `Downloading update: ${percent}% (${transferred} / ${total}) @ ${speed}`;
      }
      return 'Downloading update...';
    case 'downloaded':
      return 'Update downloaded';
    case 'verifying':
      return 'Verifying update...';
    case 'ready':
      return newVersion && newVersion.trim() ? `Update ready: v${newVersion}` : 'Update ready';
    case 'mounting':
      if (progress) {
        const percent = Math.round(progress.percent);
        return `Preparing update... ${percent}%`;
      }
      return 'Preparing update...';
    case 'mounted':
      return 'Drag SlimChat to Applications folder';
    case 'failed':
      return detail && detail.trim() ? `Update failed: ${detail}` : 'Update failed';
    default:
      return 'Unknown state';
  }
}

export function isRefreshEnabled(phase: UpdatePhase): boolean {
  return phase === 'idle' || phase === 'available' || phase === 'ready' || phase === 'failed';
}
