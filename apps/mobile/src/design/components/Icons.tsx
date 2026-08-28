import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

/**
 * The instrument's icon set.
 *
 * Thin-line glyphs drawn on a 24pt grid with round caps, matching the
 * reference hardware's printed iconography. Everything takes a colour rather
 * than owning one, so active/inactive states are the caller's decision and
 * stay consistent with the rest of the chrome.
 */

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const defaults = { size: 22, color: '#5C6675', strokeWidth: 1.8 };

/** A waveform — the Player. */
export function WaveformIcon({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth }: IconProps) {
  const bars = [
    { x: 4, h: 8 },
    { x: 8, h: 14 },
    { x: 12, h: 18 },
    { x: 16, h: 12 },
    { x: 20, h: 6 },
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {bars.map((bar) => (
        <Line
          key={bar.x}
          x1={bar.x}
          y1={12 - bar.h / 2}
          x2={bar.x}
          y2={12 + bar.h / 2}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

/** A dial with a pointer — the Explorer. */
export function DialIcon({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Line x1={12} y1={3.5} x2={12} y2={6.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={2.2} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Line x1={13.6} y1={10.4} x2={16.5} y2={7.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** A flask — the Lab. */
export function FlaskIcon({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9.5 3.5 H14.5 M10.5 3.5 V9 L5.6 17.6 A2 2 0 0 0 7.3 20.5 H16.7 A2 2 0 0 0 18.4 17.6 L13.5 9 V3.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Line x1={8.2} y1={14} x2={15.8} y2={14} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** A pulse trace — the Trials. */
export function PulseIcon({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 12 H7.5 L10 6.5 L14 17.5 L16.5 12 H21"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** A person — the Profile. */
export function PersonIcon({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8.2} r={3.6} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Path
        d="M4.8 20.2 C5.6 16.6 8.5 14.6 12 14.6 C15.5 14.6 18.4 16.6 19.2 20.2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** A library — stacked archive. */
export function LibraryIcon({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={4} width={16} height={4.5} rx={1.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Rect x={4} y={11} width={16} height={4.5} rx={1.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Line x1={4.5} y1={20} x2={19.5} y2={20} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Transport glyphs — solid, because a control face is not an outline. */
export function PlayIcon({ size = defaults.size, color = defaults.color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8.5 5.8 C8.5 5 9.4 4.6 10 5 L18.6 11 C19.2 11.4 19.2 12.6 18.6 13 L10 19 C9.4 19.4 8.5 19 8.5 18.2 Z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = defaults.size, color = defaults.color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={7} y={5.5} width={3.4} height={13} rx={1.4} fill={color} />
      <Rect x={13.6} y={5.5} width={3.4} height={13} rx={1.4} fill={color} />
    </Svg>
  );
}

export function SkipIcon({
  size = defaults.size,
  color = defaults.color,
  direction = 'forward',
}: IconProps & { direction?: 'forward' | 'back' }) {
  const flip = direction === 'back' ? { transform: [{ scaleX: -1 }] } : undefined;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={flip}>
      <Path d="M5 6.6 C5 5.9 5.8 5.5 6.4 5.9 L13 10.6 C13.5 11 13.5 11.9 13 12.3 L6.4 17 C5.8 17.4 5 17 5 16.3 Z" fill={color} />
      <Path d="M12 6.6 C12 5.9 12.8 5.5 13.4 5.9 L20 10.6 C20.5 11 20.5 11.9 20 12.3 L13.4 17 C12.8 17.4 12 17 12 16.3 Z" fill={color} />
    </Svg>
  );
}

/** A chevron, for headers and disclosure rows. */
export function ChevronIcon({
  size = defaults.size,
  color = defaults.color,
  strokeWidth = defaults.strokeWidth,
  direction = 'down',
}: IconProps & { direction?: 'down' | 'up' | 'left' | 'right' }) {
  const rotation = { down: '0', up: '180', left: '90', right: '-90' }[direction];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${rotation}deg` }] }}>
      <Path
        d="M6.5 9.5 L12 15 L17.5 9.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** An ellipsis, for overflow menus. */
export function EllipsisIcon({ size = defaults.size, color = defaults.color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5.5} cy={12} r={1.7} fill={color} />
      <Circle cx={12} cy={12} r={1.7} fill={color} />
      <Circle cx={18.5} cy={12} r={1.7} fill={color} />
    </Svg>
  );
}

/** A stop square — solid, a control face. */
export function StopIcon({ size = defaults.size, color = defaults.color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6.5} y={6.5} width={11} height={11} rx={2.4} fill={color} />
    </Svg>
  );
}

/** A speaker, with an optional muted state. */
export function SpeakerIcon({
  size = defaults.size,
  color = defaults.color,
  strokeWidth = defaults.strokeWidth,
  muted,
}: IconProps & { muted?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4.5 9.5 H7.5 L12 5.8 V18.2 L7.5 14.5 H4.5 A1 1 0 0 1 3.5 13.5 V10.5 A1 1 0 0 1 4.5 9.5 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill="none"
      />
      {muted ? (
        <>
          <Line x1={15.5} y1={9.5} x2={20.5} y2={14.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={20.5} y1={9.5} x2={15.5} y2={14.5} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Path d="M15.5 9.2 A4 4 0 0 1 15.5 14.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
          <Path d="M17.8 7 A7.4 7.4 0 0 1 17.8 17" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
        </>
      )}
    </Svg>
  );
}

/** An information mark, for "what am I actually hearing" affordances. */
export function InfoIcon({ size = defaults.size, color = defaults.color, strokeWidth = defaults.strokeWidth }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={12} cy={8.3} r={1.15} fill={color} />
      <Line x1={12} y1={11.4} x2={12} y2={16.2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Interlinked stereo rings — the binaural mark on the reference hardware. */
export function StereoRingsIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={8} cy={12} r={5} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={12} cy={12} r={5} stroke={color} strokeWidth={strokeWidth} fill="none" opacity={0.75} />
      <Circle cx={16} cy={12} r={5} stroke={color} strokeWidth={strokeWidth} fill="none" />
    </Svg>
  );
}
