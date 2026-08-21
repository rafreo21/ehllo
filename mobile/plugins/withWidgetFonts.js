const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const plist = require('@expo/plist').default || require('@expo/plist');

/**
 * Puts the app's own typeface inside the widget extension.
 *
 * A widget extension is a separate bundle with its own resources, so a font that ships with
 * the app is not available to it. SwiftUI's Font.custom falls back to the system face without
 * complaining, which means a widget can silently render in San Francisco while every other
 * screen uses Airbnb Cereal - and nothing anywhere reports it.
 *
 * expo-widgets builds the extension target but gives it no resources phase, so this adds one,
 * copies the two weights the widgets actually ask for, and registers them in the extension's
 * own Info.plist. Book and Medium only: shipping six weights into a widget would be a megabyte
 * of binary for faces nothing draws.
 */
const TARGET_NAME = 'ExpoWidgetsTarget';
const FONTS = ['AirbnbCereal_W_Bk.otf', 'AirbnbCereal_W_Md.otf'];

module.exports = function withWidgetFonts(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const iosRoot = cfg.modRequest.platformProjectRoot;
    const targetDir = path.join(iosRoot, TARGET_NAME);
    if (!fs.existsSync(targetDir)) return cfg;

    const sourceDir = path.join(cfg.modRequest.projectRoot, 'assets', 'fonts');
    const copied = [];
    for (const font of FONTS) {
      const from = path.join(sourceDir, font);
      if (!fs.existsSync(from)) continue;
      fs.copyFileSync(from, path.join(targetDir, font));
      copied.push(font);
    }
    if (!copied.length) return cfg;

    // The widget target, by name. Not the first native target - that is the app.
    const targets = project.pbxNativeTargetSection();
    const targetUuid = Object.keys(targets).find((uuid) => {
      const name = targets[uuid] && targets[uuid].name;
      return typeof name === 'string' && name.replace(/"/g, '') === TARGET_NAME;
    });
    if (!targetUuid) return cfg;

    // Created with the files in it, rather than adding an empty phase and then calling
    // addResourceFile: that helper always resolves against a group literally named
    // "Resources", which a widget target does not have, and dereferences null. addBuildPhase
    // takes the paths directly and makes the file references itself - the same call
    // expo-widgets uses for the widget's Swift sources.
    const alreadyAdded = JSON.stringify(project.hash.project.objects.PBXBuildFile || {})
      .includes(copied[0]);
    if (!alreadyAdded) {
      project.addBuildPhase(
        copied,
        'PBXResourcesBuildPhase',
        'Resources',
        targetUuid,
        'app_extension',
        TARGET_NAME,
      );
    }

    // Registered on the extension itself. The app's own UIAppFonts does not reach in here.
    const plistPath = path.join(targetDir, 'Info.plist');
    if (fs.existsSync(plistPath)) {
      const parsed = plist.parse(fs.readFileSync(plistPath, 'utf8'));
      const existing = Array.isArray(parsed.UIAppFonts) ? parsed.UIAppFonts : [];
      parsed.UIAppFonts = [...new Set([...existing, ...copied])];
      fs.writeFileSync(plistPath, plist.build(parsed));
    }

    return cfg;
  });
};
