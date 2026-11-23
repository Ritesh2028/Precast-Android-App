/**
 * PrecastEzy mobile theme — mirrors web "Industrial Precision" + accent-blue,
 * in light and dark (PreacastEzy-Frontend/src/index.css :root / .dark).
 *
 * `Colors` and `BWTheme` are LIVE objects that follow the device light/dark
 * setting (see src/theme/runtime.js). Rules:
 *  - Read `Colors.x` during render or inside `themedStyles(() => ...)`.
 *  - Never copy Colors into a plain module-level constant or StyleSheet.create
 *    at module scope; use `themedStyles` / `themed` from '../theme' instead.
 *  - Palette values live in src/theme/palettes.js (both schemes, same keys).
 */
import { Colors, BWTheme } from '../theme/runtime';

export { Colors, BWTheme };

/** Web-like control sizing (button.tsx h-9 / radius ~0.625rem). */
export const Theme = {
  radius: 10,
  radiusLg: 12,
  radiusSm: 8,
  buttonHeight: 40,
  buttonHeightSm: 36,
  buttonHeightLg: 44,
  fontButton: 13,
};

export default Colors;
