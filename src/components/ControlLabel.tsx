import React, { useRef, useState } from 'react';
import { CONTROL_HELP } from '../controlHelp';

const TIP_WIDTH = 220; // keep in sync with .control-help-tip width in App.css
const GAP = 12;
const MARGIN = 8;

interface Position {
  top: number;
  left: number;
  placement: 'left' | 'above' | 'below';
  arrowX: number;
}

interface ControlLabelProps {
  /** Key into CONTROL_HELP, e.g. "PLUCK.Attack" */
  help: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * A control label with a hover/focus tooltip. The tooltip sits to the left of
 * the label when there is room, otherwise above it (or below if there is no
 * room above), clamped to the viewport.
 */
export const ControlLabel: React.FC<ControlLabelProps> = ({ help, style, children }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const text = CONTROL_HELP[help];

  const show = () => {
    const el = ref.current;
    if (!el || !text) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    if (r.left >= TIP_WIDTH + GAP + MARGIN) {
      setPos({ placement: 'left', left: r.left - GAP, top: r.top + r.height / 2, arrowX: 0 });
      return;
    }
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center, TIP_WIDTH / 2 + MARGIN), vw - TIP_WIDTH / 2 - MARGIN);
    const arrowX = center - left;
    // Rough height estimate (~3 lines) to decide whether there is room above
    if (r.top > 100) {
      setPos({ placement: 'above', left, top: r.top - GAP + 4, arrowX });
    } else {
      setPos({ placement: 'below', left, top: r.bottom + GAP - 4, arrowX });
    }
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className="control-label"
      style={style}
      tabIndex={text ? 0 : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos && text && (
        <span
          role="tooltip"
          className={`control-help-tip ${pos.placement}`}
          style={{ top: pos.top, left: pos.left, ['--arrow-x' as string]: `${pos.arrowX}px` }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

