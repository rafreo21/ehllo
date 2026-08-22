import assert from "node:assert/strict";
import test from "node:test";

const PROFILE = {
  name: "Alex Morgan",
  role: "Consultant",
  company: "Northstar",
  cardUrl: "https://aftermeet.app/c/alex-morgan",
  themeColor: "#5146E5",
};

// Meet, Zoom and Teams mirror your self-view but not the stream participants receive, so the
// two views are horizontal mirrors of each other and text reads correctly in exactly one of
// them. That is why there are two exports rather than one, and why the mirrored one flips the
// WHOLE frame: self-view shows mirror(frame), so the frame has to be pre-mirrored for
// mirror(frame) to look right.

test("virtual background svg is not mirrored by default", async () => {
  const { buildVirtualBackgroundSvg } = await import("../lib/share-assets.ts");
  const svg = await buildVirtualBackgroundSvg(PROFILE);
  assert.ok(!svg.includes("scale(-1,1)"), "default export must not be flipped");
});

test("virtual background svg mirrors the whole canvas when asked", async () => {
  const { buildVirtualBackgroundSvg } = await import("../lib/share-assets.ts");
  const { VIRTUAL_BG_PANEL } = await import("../lib/share-assets.ts");
  const svg = await buildVirtualBackgroundSvg(PROFILE, true);
  // translate by the full canvas width then scale -1: a flip about the vertical centre line,
  // which keeps the artwork on-canvas instead of pushing it off the left edge.
  assert.ok(
    svg.includes(`translate(${VIRTUAL_BG_PANEL.canvasWidth},0) scale(-1,1)`),
    "mirrored export must flip about the canvas centre",
  );
  // Still one balanced group.
  assert.equal(svg.split("<g transform=").length - 1, 1);
  assert.ok(svg.includes("</g>"));
});

test("mirrored and default filenames do not collide", async () => {
  const { shareAssetFilename } = await import("../lib/share-assets.ts");
  const plain = shareAssetFilename("virtual-background", "alex-morgan", "jpg", false);
  const mirrored = shareAssetFilename("virtual-background", "alex-morgan", "jpg", true);
  assert.equal(plain, "ehllo-virtual-background-alex-morgan.jpg");
  assert.equal(mirrored, "ehllo-virtual-background-alex-morgan-mirrored.jpg");
  assert.notEqual(plain, mirrored);
});

test("the watch face is never mirrored, whatever the flag says", async () => {
  // The flag is virtual-background only. A mirrored watch face would just be broken.
  const { shareAssetFilename } = await import("../lib/share-assets.ts");
  assert.equal(
    shareAssetFilename("watch-face", "alex-morgan", "png", true),
    "ehllo-watch-face-alex-morgan-mirrored.png",
  );
});

test("mirrored jpeg puts the panel on the opposite side of the canvas", async (t) => {
  const { sharpAvailable } = await import("../lib/sharp-runtime.ts");
  if (!sharpAvailable()) {
    t.skip("sharp unavailable in this environment");
    return;
  }
  const { buildVirtualBackgroundJpeg, VIRTUAL_BG_PANEL } = await import("../lib/share-assets.ts");
  const sharp = (await import("sharp")).default;

  const [plain, mirrored] = await Promise.all([
    buildVirtualBackgroundJpeg(PROFILE, false),
    buildVirtualBackgroundJpeg(PROFILE, true),
  ]);

  // The panel is a near-white rounded card. Measure how bright each half of the panel's row
  // band is; the panel side should be far brighter than the empty side.
  const brightness = async (buffer, left) => {
    const { data } = await sharp(buffer)
      .extract({
        left,
        top: VIRTUAL_BG_PANEL.y,
        width: VIRTUAL_BG_PANEL.width,
        height: VIRTUAL_BG_PANEL.height,
      })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let total = 0;
    for (const value of data) total += value;
    return total / data.length;
  };

  const rightX = VIRTUAL_BG_PANEL.x;
  const leftX = VIRTUAL_BG_PANEL.canvasWidth - VIRTUAL_BG_PANEL.x - VIRTUAL_BG_PANEL.width;

  const plainRight = await brightness(plain, rightX);
  const plainLeft = await brightness(plain, leftX);
  const mirroredRight = await brightness(mirrored, rightX);
  const mirroredLeft = await brightness(mirrored, leftX);

  assert.ok(plainRight > plainLeft + 20, `default panel should sit right (${plainRight} vs ${plainLeft})`);
  assert.ok(mirroredLeft > mirroredRight + 20, `mirrored panel should sit left (${mirroredLeft} vs ${mirroredRight})`);
});
