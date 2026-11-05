import { APP_DISPLAY_VERSION } from '../config/appDisplayVersion';

export type OtaUpdateStatus = 'idle' | 'available' | 'downloading' | 'restarting' | 'error';

export type OtaUpdatePromptController = {
  visible: boolean;
  targetVersion: string;
  status: OtaUpdateStatus;
  progressPercent: number;
  errorMessage: string | null;
  onInstall: () => void;
  onRetry: () => void;
  onDismiss: () => void;
};

const noop = () => {};

export function useOtaUpdateOnLaunch(): OtaUpdatePromptController {
  return {
    visible: false,
    targetVersion: APP_DISPLAY_VERSION,
    status: 'idle',
    progressPercent: 0,
    errorMessage: null,
    onInstall: noop,
    onRetry: noop,
    onDismiss: noop,
  };
}
