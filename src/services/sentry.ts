import type { ComponentType } from 'react';
import type { ErrorInfo } from 'react';

export const isSentryEnabled = false;

export const wrapWithSentry = <P extends object>(Component: ComponentType<P>): ComponentType<P> =>
  Component;

export const captureErrorBoundaryException = (_error: Error, _errorInfo: ErrorInfo) => {
  // Sentry disabled in Binary TCP builds.
};
