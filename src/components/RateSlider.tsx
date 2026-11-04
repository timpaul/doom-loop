import React from 'react';
import { Slider } from './Slider';

// Full cycle/length range, in seconds. Stored values are always seconds, so
// tracks saved with the old Short/Med/Long (Fast/Med/Slow) range toggles load unchanged.
export const RATE_MIN = 0.01;
export const RATE_MAX = 3600;
const POSITIONS = 1000;
const LOG_SPAN = Math.log(RATE_MAX / RATE_MIN);

export function rateToPosition(seconds: number): number {
  const clamped = Math.min(Math.max(seconds || RATE_MIN, RATE_MIN), RATE_MAX);
  return Math.round((Math.log(clamped / RATE_MIN) / LOG_SPAN) * POSITIONS);
}

export function positionToRate(pos: number): number {
  const v = RATE_MIN * Math.exp((pos / POSITIONS) * LOG_SPAN);
  // Round to 3 significant figures to keep stored values tidy
  const rounded = Number(v.toPrecision(3));
  return Math.min(Math.max(rounded, RATE_MIN), RATE_MAX);
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 Hz';
  if (seconds < 1) {
    const hz = 1 / seconds;
    return hz >= 10 ? `${Math.round(hz)}hz` : `${+hz.toFixed(1)}hz`;
  }
  if (seconds < 60) return `${+seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  if (seconds < 3600) return `${+(seconds / 60).toFixed(1)}m`;
  return `${+(seconds / 3600).toFixed(2)}h`;
}

interface RateSliderProps {
  value: number; // seconds
  onChange: (seconds: number) => void;
  'aria-label'?: string;
}

export const RateSlider: React.FC<RateSliderProps> = ({ value, onChange, ...rest }) => (
  <Slider
    min={0}
    max={POSITIONS}
    step={1}
    value={rateToPosition(value)}
    onChange={e => onChange(positionToRate(parseInt(e.target.value, 10)))}
    aria-label={rest['aria-label']}
    displayValue={formatDuration(value || RATE_MIN)}
  />
);

