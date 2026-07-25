import React from 'react';

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  displayValue?: string | number;
}

export const Slider: React.FC<SliderProps> = ({ displayValue, className = '', style, ...props }) => {
  return (
    <div className={`slider-wrapper ${className}`.trim()} style={style}>
      <input type="range" {...props} />
      {displayValue !== undefined && displayValue !== null && (
        <span className="slider-value-display">{displayValue}</span>
      )}
    </div>
  );
};
