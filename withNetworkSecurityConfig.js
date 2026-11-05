const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withNetworkSecurityConfig = (config) => {
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    mainApplication.$['android:usesCleartextTraffic'] = 'true';
    mainApplication.$['android:extractNativeLibs'] = 'true';
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const writeConfig = (sourceSet, xmlContent) => {
        const resPath = path.join(config.modRequest.platformProjectRoot, 'app', 'src', sourceSet, 'res', 'xml');
        const filePath = path.join(resPath, 'network_security_config.xml');

        if (!fs.existsSync(resPath)) {
          fs.mkdirSync(resPath, { recursive: true });
        }

        fs.writeFileSync(filePath, xmlContent);
      };

      const loopbackAndProductionXml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Network security config for Android Binary TCP builds (loopback bridge 127.0.0.1:18404). -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">185.126.217.108</domain>
        <domain includeSubdomains="false">69.197.178.27</domain>
    </domain-config>
</network-security-config>
`;

      writeConfig('main', loopbackAndProductionXml);
      writeConfig('debug', loopbackAndProductionXml);
      writeConfig('debugOptimized', loopbackAndProductionXml);
      return config;
    },
  ]);

  return config;
};

module.exports = withNetworkSecurityConfig;
