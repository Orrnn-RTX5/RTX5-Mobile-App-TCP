const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');

const BRIDGE_MARKER = 'rtx5-binary-tcp-bridge';

function withBridgeManifestAttributes(config) {
  return withAndroidManifest(config, async modConfig => {
    const mainApplication = modConfig.modResults.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$ = mainApplication.$ || {};
      mainApplication.$['android:extractNativeLibs'] = 'true';
      mainApplication.$['android:usesCleartextTraffic'] = 'true';
    }
    return modConfig;
  });
}

function withBridgeJniLibsCopy(config) {
  return withDangerousMod(config, [
    'android',
    async modConfig => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const platformProjectRoot = modConfig.modRequest.platformProjectRoot;
      const srcRoot = path.join(projectRoot, 'native', 'jniLibs');
      const dstRoot = path.join(platformProjectRoot, 'app', 'src', 'main', 'jniLibs');

      for (const abi of ['arm64-v8a', 'x86_64']) {
        const srcFile = path.join(srcRoot, abi, 'librtx5tcp.so');
        const dstDir = path.join(dstRoot, abi);
        const dstFile = path.join(dstDir, 'librtx5tcp.so');
        if (fs.existsSync(srcFile)) {
          fs.mkdirSync(dstDir, { recursive: true });
          fs.copyFileSync(srcFile, dstFile);
          try {
            fs.chmodSync(dstFile, 0o755);
          } catch {}
        }
      }

      const wrapperPropsPath = path.join(platformProjectRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');
      if (fs.existsSync(wrapperPropsPath)) {
        const wrapperProps = fs.readFileSync(wrapperPropsPath, 'utf8').replace(/networkTimeout=\d+/g, 'networkTimeout=60000');
        fs.writeFileSync(wrapperPropsPath, wrapperProps, 'utf8');
      }

      const gradlePropsPath = path.join(platformProjectRoot, 'gradle.properties');
      if (fs.existsSync(gradlePropsPath)) {
        const gradleProps = fs
          .readFileSync(gradlePropsPath, 'utf8')
          .replace(/reactNativeArchitectures=.*/g, 'reactNativeArchitectures=arm64-v8a,x86_64')
          .replace(/org\.gradle\.jvmargs=.*/g, 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Djava.net.preferIPv4Stack=true');
        fs.writeFileSync(gradlePropsPath, gradleProps, 'utf8');
      }

      return modConfig;
    },
  ]);
}

function withBridgeMainApplicationLauncher(config) {
  return withMainApplication(config, modConfig => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(BRIDGE_MARKER)) {
      return modConfig;
    }

    const helperMethod = `
  private external fun nativeStartRtx5Bridge(dataDir: String)

  private fun startRtx5BinaryTcpBridge() {
    // ${BRIDGE_MARKER}
    try {
      System.loadLibrary("rtx5tcp")
      try {
        nativeStartRtx5Bridge(filesDir.absolutePath)
      } catch (jniErr: Throwable) {
        android.util.Log.w("RTX5TCP", "nativeStartRtx5Bridge JNI call fallback to JNI_OnLoad", jniErr)
      }
      val deadline = System.currentTimeMillis() + 1200L
      while (System.currentTimeMillis() < deadline) {
        try {
          java.net.Socket().use { sock ->
            sock.connect(java.net.InetSocketAddress("127.0.0.1", 18404), 30)
            android.util.Log.i("RTX5TCP", "librtx5tcp.so in-process bridge ready on 127.0.0.1:18404")
            return
          }
        } catch (_: Throwable) {
          Thread.sleep(15)
        }
      }
      android.util.Log.i("RTX5TCP", "librtx5tcp.so loaded in-process (continuing startup)")
    } catch (outer: Throwable) {
      android.util.Log.e("RTX5TCP", "startRtx5BinaryTcpBridge fatal error", outer)
    }
  }
`;

    contents = contents.replace(
      /super\.onCreate\(\)/,
      `super.onCreate()\n    startRtx5BinaryTcpBridge()`,
    );

    const lastBrace = contents.lastIndexOf('}');
    if (lastBrace !== -1) {
      contents =
        contents.slice(0, lastBrace) +
        helperMethod +
        '\n}\n';
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = function withRtx5BinaryTcpBridge(config) {
  config = withBridgeManifestAttributes(config);
  config = withBridgeJniLibsCopy(config);
  config = withBridgeMainApplicationLauncher(config);
  return config;
};
