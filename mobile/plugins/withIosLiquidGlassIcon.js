const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ICON_NAME = 'AppIcon';

/**
 * Installs the layered iOS 26 Icon Composer document alongside the generated
 * asset catalog. Xcode 26 gives a matching `.icon` document precedence over
 * the legacy AppIcon appiconset and generates fallbacks for earlier iOS.
 */
module.exports = function withIosLiquidGlassIcon(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const targetName = cfg.modRequest.projectName;
      const source = path.join(cfg.modRequest.projectRoot, 'assets', 'ios', `${ICON_NAME}.icon`);
      const destination = path.join(iosRoot, targetName, `${ICON_NAME}.icon`);

      if (!fs.existsSync(source)) {
        throw new Error(`Missing iOS Icon Composer asset: ${source}`);
      }

      fs.rmSync(destination, { recursive: true, force: true });
      fs.cpSync(source, destination, { recursive: true });
      return cfg;
    },
  ]);

  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const firstTarget = project.getFirstTarget().firstTarget;
    const targetUuid = firstTarget.uuid;
    const targetName = cfg.modRequest.projectName;
    const relativePath = `${targetName}/${ICON_NAME}.icon`;

    if (!project.hasFile(relativePath)) {
      const groups = project.hash.project.objects.PBXGroup || {};
      const targetGroupUuid = Object.keys(groups).find((uuid) => {
        const group = groups[uuid];
        const name = group && typeof group === 'object' ? group.name : null;
        return typeof name === 'string' && name.replace(/"/g, '') === targetName;
      });

      // node-xcode assumes a group named Resources exists while normal Expo
      // projects keep assets in the app group. Give the helper its expected
      // lookup target, then place the actual file in the app group below.
      if (!project.pbxGroupByName('Resources')) {
        project.addPbxGroup([], 'Resources');
      }

      project.addResourceFile(
        relativePath,
        {
          target: targetUuid,
          lastKnownFileType: 'folder.iconcomposer.icon',
        },
        targetGroupUuid,
      );
    }

    for (const configuration of Object.values(project.pbxXCBuildConfigurationSection())) {
      if (!configuration || typeof configuration !== 'object' || !configuration.buildSettings) continue;
      if (configuration.buildSettings.PRODUCT_BUNDLE_IDENTIFIER) {
        configuration.buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = ICON_NAME;
      }
    }

    return cfg;
  });
};
