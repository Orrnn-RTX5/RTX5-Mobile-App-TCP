import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const sentrySource = readFileSync(resolve(process.cwd(), 'src/services/sentry.ts'), 'utf8');

test('Sentry is disabled in Binary TCP builds with safe no-op wrappers', () => {
  assert.match(sentrySource, /export const isSentryEnabled = false;/);
  assert.match(sentrySource, /export const wrapWithSentry = <P extends object>\(Component: ComponentType<P>\): ComponentType<P> =>\s*Component;/);
  assert.match(sentrySource, /export const captureErrorBoundaryException = \(_error: Error, _errorInfo: ErrorInfo\) => \{/);
  assert.match(sentrySource, /Sentry disabled in Binary TCP builds/);
});
