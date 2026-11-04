import React from 'react';

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  displayValue?: string | number;
}

export const Slider: React.FC<SliderProps> = ({ displayValue, className = '', style, ...props }) => {
  const min = parseFloat(String(props.min ?? 0));
  const max = parseFloat(String(props.max ?? 100));
  const val = parseFloat(String(props.value ?? props.defaultValue ?? min));
  const frac = max > min ? Math.min(Math.max((val - min) / (max - min), 0), 1) : 0;
  return (
    <div
      className={`slider-wrapper ${className}`.trim()}
      style={{ ...style, ['--slider-frac' as string]: frac }}
    >
      <input type="range" {...props} />
      {displayValue !== undefined && displayValue !== null && (
        <span className="slider-value-display">{displayValue}</span>
      )}
    </div>
  );
};
