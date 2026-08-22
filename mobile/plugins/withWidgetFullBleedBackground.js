const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/** Paints the complete WidgetKit host with the card's current theme colour. */
const TARGET_DIRECTORY = 'ExpoWidgetsTarget';
const WIDGETS = [
  ['QrScanWidget.swift', 'QrScanWidgetThemeBackground', 'qrScanWidgetThemeColor'],
  ['BusinessCardWidget.swift', 'BusinessCardWidgetThemeBackground', 'businessCardWidgetThemeColor'],
  ['RecentConnectionsWidget.swift', 'RecentConnectionsWidgetThemeBackground', 'recentConnectionsWidgetThemeColor'],
];

function colorHelper(modifierName, functionName) {
  return `
private struct ${modifierName}: ViewModifier {
  let color: Color

  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.containerBackground(color, for: .widget)
    } else {
      content.background(color)
    }
  }
}

private func ${functionName}(_ rawValue: Any?) -> Color {
  let raw = (rawValue as? String) ?? "#000000"
  let hex = raw.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
  guard hex.count == 6, let value = UInt64(hex, radix: 16) else {
    return Color.black
  }
  return Color(
    .sRGB,
    red: Double((value >> 16) & 0xFF) / 255.0,
    green: Double((value >> 8) & 0xFF) / 255.0,
    blue: Double(value & 0xFF) / 255.0,
    opacity: 1
  )
}
`;
}

module.exports = function withWidgetFullBleedBackground(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, TARGET_DIRECTORY);

      for (const [fileName, modifierName, functionName] of WIDGETS) {
        const sourcePath = path.join(targetDir, fileName);
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`[withWidgetFullBleedBackground] Missing generated widget source: ${sourcePath}`);
        }

        let source = fs.readFileSync(sourcePath, 'utf8');
        const entryView = 'WidgetsEntryView(entry: entry)';
        if (!source.includes(entryView)) {
          throw new Error(`[withWidgetFullBleedBackground] Could not find entry view in ${fileName}`);
        }

        source = source.replace(
          entryView,
          `${entryView}\n        .frame(maxWidth: .infinity, maxHeight: .infinity)\n        .modifier(${modifierName}(color: ${functionName}(entry.props?["themeColor"])))`,
        );
        source += colorHelper(modifierName, functionName);
        fs.writeFileSync(sourcePath, source);
      }

      return cfg;
    },
  ]);
};
