// Ported from reactbits (DavidHDev/react-bits), MIT + Commons Clause v1.0:
// usable inside this product, not redistributable as components.
'use client';

import React from 'react';

// Upstream expects these keyframes in tailwind.config; this repo has no such entry,
// so the animation is carried in-file (self-contained, like status-mark/lattice-loader)
// rather than via `animate-star-movement-*` utilities Tailwind would never emit.
const STYLE =
  '@keyframes sb-star-bottom{0%{transform:translate(0,0);opacity:1}100%{transform:translate(-100%,0);opacity:0}}' +
  '@keyframes sb-star-top{0%{transform:translate(0,0);opacity:1}100%{transform:translate(100%,0);opacity:0}}';

type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
  as?: T;
  className?: string;
  children?: React.ReactNode;
  color?: string;
  speed?: React.CSSProperties['animationDuration'];
  thickness?: number;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
};

const StarBorder = <T extends React.ElementType = 'button'>({
  as,
  className = '',
  color = 'white',
  speed = '6s',
  thickness = 1,
  backgroundColor = "var(--background)",
  textColor = "var(--foreground)",
  borderColor = "var(--border)",
  children,
  ...rest
}: StarBorderProps<T>) => {
  const Component = as || 'button';

  return (
    <Component
      className={`relative inline-block overflow-hidden rounded-[20px] ${className}`}
      {...(rest as any)}
      style={{
        padding: `${thickness}px 0`,
        ...(rest as any).style
      }}
    >
      <style>{STYLE}</style>
      <div
        className="absolute w-[300%] h-[50%] opacity-70 bottom-[-11px] right-[-250%] rounded-full z-0"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animation: 'sb-star-bottom linear infinite alternate',
          animationDuration: speed
        }}
      ></div>
      <div
        className="absolute w-[300%] h-[50%] opacity-70 top-[-10px] left-[-250%] rounded-full z-0"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 10%)`,
          animation: 'sb-star-top linear infinite alternate',
          animationDuration: speed
        }}
      ></div>
      <div
        className="relative z-1 border text-center text-[16px] py-[16px] px-[26px] rounded-[20px]"
        style={{ background: backgroundColor, color: textColor, borderColor }}
      >
        {children}
      </div>
    </Component>
  );
};

export { StarBorder }
export default StarBorder;

// tailwind.config.js
// module.exports = {
//   theme: {
//     extend: {
//       animation: {
//         'star-movement-bottom': 'star-movement-bottom linear infinite alternate',
//         'star-movement-top': 'star-movement-top linear infinite alternate',
//       },
//       keyframes: {
//         'star-movement-bottom': {
//           '0%': { transform: 'translate(0%, 0%)', opacity: '1' },
//           '100%': { transform: 'translate(-100%, 0%)', opacity: '0' },
//         },
//         'star-movement-top': {
//           '0%': { transform: 'translate(0%, 0%)', opacity: '1' },
//           '100%': { transform: 'translate(100%, 0%)', opacity: '0' },
//         },
//       },
//     },
//   }
// }
