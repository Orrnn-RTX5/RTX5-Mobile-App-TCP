const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function isDeviceTcpBridgeRunning(adbCommand, env) {
  const probe = spawnSync(
    adbCommand,
    ['shell', 'curl -s -m 1 http://127.0.0.1:18404/api/tcp-client/status'],
    { env, encoding: 'utf8', timeout: 4000 },
  );
  return probe.status === 0 && Boolean(probe.stdout && probe.stdout.includes('"connected"'));
}

function ensureDeviceTcpBridge({ adbCommand, projectRoot, state, env }) {
  try {
    if (isDeviceTcpBridgeRunning(adbCommand, env)) {
      console.log('[tcp:bridge] Native Binary TCP Bridge (librtx5tcp.so) is active on phone (127.0.0.1:18404).');
      return true;
    }

    const abiProbe = spawnSync(
      adbCommand,
      ['shell', 'getprop ro.product.cpu.abi'],
      { env, encoding: 'utf8', timeout: 4000 },
    );
    const abi = (abiProbe.stdout || '').trim() || 'arm64-v8a';
    const soPath = path.join(
      projectRoot,
      'native',
      'jniLibs',
      abi.includes('x86_64') ? 'x86_64' : 'arm64-v8a',
      'librtx5tcp.so',
    );
    if (!fs.existsSync(soPath)) {
      return false;
    }

    const tmpDir = path.join(os.tmpdir(), 'rtx5bridge');
    fs.mkdirSync(tmpDir, { recursive: true });
    const jarPath = path.join(tmpDir, 'bridge.jar');

    if (!fs.existsSync(jarPath) && state?.java?.path && state?.tools?.requiredBuildTools) {
      const javacPath = path.join(
        state.java.path,
        'bin',
        process.platform === 'win32' ? 'javac.exe' : 'javac',
      );
      const d8Path = path.join(
        state.tools.requiredBuildTools,
        process.platform === 'win32' ? 'd8.bat' : 'd8',
      );
      if (fs.existsSync(javacPath) && fs.existsSync(d8Path)) {
        const javaFile = path.join(tmpDir, 'MainApplication.java');
        fs.writeFileSync(
          javaFile,
          [
            'package com.rtx5.app;',
            'public class MainApplication {',
            '  public static native void nativeStartRtx5Bridge(String dataDir);',
            '  public static void main(String[] args) throws Exception {',
            '    System.load("/data/local/tmp/librtx5tcp.so");',
            '    try { nativeStartRtx5Bridge("/data/local/tmp"); } catch (Throwable t) {}',
            '    Thread.sleep(Long.MAX_VALUE);',
            '  }',
            '}',
          ].join('\n'),
          'utf8',
        );
        spawnSync(javacPath, ['--release', '8', '-d', tmpDir, javaFile], {
          env: { ...env, JAVA_HOME: state.java.path },
          stdio: 'ignore',
          timeout: 15000,
        });
        spawnSync(
          d8Path,
          ['--output', jarPath, path.join(tmpDir, 'com', 'rtx5', 'app', 'MainApplication.class')],
          {
            env: { ...env, JAVA_HOME: state.java.path },
            stdio: 'ignore',
            timeout: 15000,
          },
        );
      }
    }

    if (!fs.existsSync(jarPath)) {
      return false;
    }

    spawnSync(adbCommand, ['push', soPath, '/data/local/tmp/librtx5tcp.so'], {
      env,
      stdio: 'ignore',
      timeout: 15000,
    });
    spawnSync(adbCommand, ['push', jarPath, '/data/local/tmp/bridge.jar'], {
      env,
      stdio: 'ignore',
      timeout: 10000,
    });
    spawnSync(
      adbCommand,
      [
        'shell',
        'chmod 755 /data/local/tmp/librtx5tcp.so; RTX5_MOBILE_DATA_DIR=/data/local/tmp nohup app_process -Djava.class.path=/data/local/tmp/bridge.jar /data/local/tmp com.rtx5.app.MainApplication >/data/local/tmp/bridge.log 2>&1 </dev/null & sleep 1',
      ],
      { env, stdio: 'ignore', timeout: 10000 },
    );

    const active = isDeviceTcpBridgeRunning(adbCommand, env);
    if (active) {
      console.log('[tcp:bridge] Started Native Binary TCP Bridge (librtx5tcp.so) on phone (127.0.0.1:18404).');
    }
    return active;
  } catch {
    return false;
  }
}

module.exports = { ensureDeviceTcpBridge, isDeviceTcpBridgeRunning };
