import React from 'react';

interface MetricTooltipProps {
  title: string;
  meaning: string;
  detail?: string;
  align?: 'left' | 'center' | 'right';
  placement?: 'top' | 'bottom';
  className?: string;
  children: React.ReactNode;
}

export const MetricTooltip: React.FC<MetricTooltipProps> = ({
  title,
  meaning,
  detail,
  align = 'center',
  placement = 'top',
  className = '',
  children,
}) => {
  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'left'
      ? 'left-0'
      : 'left-1/2 -translate-x-1/2';

  const placementClass =
    placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2';

  const arrowAlignClass =
    align === 'right'
      ? 'right-3'
      : align === 'left'
      ? 'left-3'
      : 'left-1/2 -translate-x-1/2';

  const arrowPlacementClass =
    placement === 'bottom'
      ? '-top-1.5 border-l border-t bg-[#2B221A]'
      : '-bottom-1.5 border-r border-b bg-[#2B221A]';

  return (
    <span className={`relative inline-flex items-center group ${className}`}>
      <span
        tabIndex={0}
        className="inline-flex items-center gap-1 cursor-help rounded-sm border-b border-dotted border-current/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]/50"
      >
        {children}
      </span>

      <span
        role="tooltip"
        className={`pointer-events-none opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150 absolute z-50 w-64 sm:w-72 rounded-lg bg-[#2B221A] text-[#FAF7EE] border border-[#4E4135] px-3.5 py-2.5 text-left shadow-[0_12px_28px_-6px_rgba(20,14,8,0.5)] whitespace-normal ${placementClass} ${alignClass}`}
      >
        <span
          aria-hidden="true"
          className={`absolute w-2.5 h-2.5 rotate-45 border-[#4E4135] ${arrowPlacementClass} ${arrowAlignClass}`}
        />
        <span className="block font-sans text-xs font-semibold text-[#FFFDF8] tracking-tight">
          {title}
        </span>
        <span className="block font-sans text-[11px] leading-relaxed text-[#E3DACB] mt-1">
          {meaning}
        </span>
        {detail && (
          <span className="block font-mono text-[10px] leading-snug text-[#BFB4A2] mt-1.5 pt-1.5 border-t border-[#45392E] tabular-nums">
            {detail}
          </span>
        )}
      </span>
    </span>
  );
};
