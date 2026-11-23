import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Colors } from '../../styles/colors';

/**
 * App-wide stroke icon set (Lucide geometry — same family as the web app).
 * Drawn with react-native-svg so no icon-font linking is required.
 *
 * Part shapes: 'd-string' = <Path>, ['c', cx, cy, r] = <Circle>,
 * ['r', x, y, size] = square <Rect rx=1>, ['rr', x, y, w, h] = <Rect rx=1>.
 */
const CLIPBOARD = 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2';

const ICONS = {
  home: [
    'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
    'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ],
  'list-checks': ['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', ['c', 12, 7, 4]],
  bell: [
    'M10.268 21a2 2 0 0 0 3.464 0',
    'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
  ],
  scan: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 12h10'],
  search: [['c', 11, 11, 8], 'm21 21-4.3-4.3'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  'x-circle': [['c', 12, 12, 10], 'm15 9-6 6', 'm9 9 6 6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevrons-up-down': ['m7 15 5 5 5-5', 'm7 9 5-5 5 5'],
  'chevrons-down-up': ['m7 20 5-5 5 5', 'm7 4 5 5 5-5'],
  box: [
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'm3.3 7 8.7 5 8.7-5',
    'M12 22V12',
  ],
  qr: [
    ['r', 3, 3, 5], ['r', 16, 3, 5], ['r', 3, 16, 5],
    'M21 16h-3a2 2 0 0 0-2 2v3', 'M21 21v.01', 'M12 7v3a2 2 0 0 1-2 2H7', 'M3 12h.01',
    'M12 3h.01', 'M12 16v.01', 'M16 12h1', 'M21 12v.01', 'M12 21v-1',
  ],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  refresh: [
    'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5',
    'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5',
  ],
  'alert-circle': [['c', 12, 12, 10], 'M12 8v4', 'M12 16h.01'],
  'wifi-off': [
    'M12 20h.01', 'M8.5 16.429a5 5 0 0 1 7 0', 'M5 12.859a10 10 0 0 1 5.17-2.69',
    'M19 12.859a10 10 0 0 0-2.007-1.523', 'M2 8.82a15 15 0 0 1 4.177-2.643',
    'M22 8.82a15 15 0 0 0-11.288-3.764', 'm2 2 20 20',
  ],
  clipboard: [['rr', 8, 2, 8, 4], CLIPBOARD, 'M12 11h4', 'M12 16h4', 'M8 11h.01', 'M8 16h.01'],
  'clipboard-check': [['rr', 8, 2, 8, 4], CLIPBOARD, 'm9 14 2 2 4-4'],
  'check-circle': [['c', 12, 12, 10], 'm9 12 2 2 4-4'],
  clock: [['c', 12, 12, 10], 'M12 6v6l4 2'],
  layers: [
    'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
    'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65',
    'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
  ],
  'file-text': [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4',
    'M10 9H8', 'M16 13H8', 'M16 17H8',
  ],
  building: [
    'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z', 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2',
    'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', 'M10 6h4', 'M10 10h4', 'M10 14h4', 'M10 18h4',
  ],
  'more-vertical': [['c', 12, 12, 1], ['c', 12, 5, 1], ['c', 12, 19, 1]],
  eye: [
    'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
    ['c', 12, 12, 3],
  ],
};

const Icon = ({ name, size = 20, color = Colors.textPrimary, strokeWidth = 2, style }) => {
  const parts = ICONS[name];
  if (!parts) return null;
  const common = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <Path key={i} d={p} {...common} />;
        if (p[0] === 'c') return <Circle key={i} cx={p[1]} cy={p[2]} r={p[3]} {...common} />;
        if (p[0] === 'r') return <Rect key={i} x={p[1]} y={p[2]} width={p[3]} height={p[3]} rx={1} {...common} />;
        return <Rect key={i} x={p[1]} y={p[2]} width={p[3]} height={p[4]} rx={1} {...common} />;
      })}
    </Svg>
  );
};

export default React.memo(Icon);
