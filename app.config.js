const appJson = require('./app.json');
const { execSync } = require('node:child_process');

const forcedExpoVersion = String(process.env.RTX5_FORCE_EXPO_VERSION ?? '').trim();
const forcedRuntimeVersion = String(process.env.RTX5_FORCE_RUNTIME_VERSION ?? '').trim();

const firstString = (...values) => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

const runGitCommand = (command) => {
  try {
    return execSync(command, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const resolveGitCommitSha = () =>
  (
    firstString(
      process.env.EAS_BUILD_GIT_COMMIT_HASH,
      process.env.GITHUB_SHA,
      process.env.RTX5_GIT_COMMIT_SHA,
      runGitCommand('git rev-parse --short=12 HEAD'),
    ) ?? ''
  ).slice(0, 12);

const resolveGitDirty = () => {
  const explicit = String(process.env.RTX5_GIT_DIRTY ?? '').trim();
  if (explicit) {
    return explicit;
  }
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) {
    return 'false';
  }
  return runGitCommand('git status --short') ? 'true' : 'false';
};

module.exports = ({ config }) => {
  const easBuildProfile = firstString(
    process.env.EAS_BUILD_PROFILE,
    process.env.RTX5_EAS_BUILD_PROFILE,
    process.env.EXPO_PUBLIC_APP_ENV,
    config.extra?.easBuildProfile,
  );
  const expoConfig = {
    ...config,
    ...appJson.expo,
    ...(forcedExpoVersion ? { version: forcedExpoVersion } : {}),
    ...(forcedRuntimeVersion ? { runtimeVersion: forcedRuntimeVersion } : {}),
    extra: {
      ...(config.extra ?? {}),
      ...(appJson.expo.extra ?? {}),
      sentryDsn: '',
      appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? config.extra?.appEnv ?? 'production',
      apiBaseUrl:
        process.env.EXPO_PUBLIC_API_BASE_URL ??
        config.extra?.apiBaseUrl ??
        'http://127.0.0.1:18404/api/v2',
      brokerDirectoryBaseUrl:
        process.env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL ??
        config.extra?.brokerDirectoryBaseUrl ??
        'http://127.0.0.1:18404/api/v2',
      gitCommitSha: resolveGitCommitSha(),
      gitDirty: resolveGitDirty(),
      ...(easBuildProfile ? { easBuildProfile } : {}),
    },
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
  };

  return expoConfig;
};
