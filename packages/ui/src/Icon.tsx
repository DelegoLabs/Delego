import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  ariaLabel?: string;
  reserveLayoutSpace?: boolean;
}

export function Icon({
  size = 24,
  ariaLabel,
  reserveLayoutSpace = true,
  style,
  children,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
      style={{
        aspectRatio: "1/1",
        ...(reserveLayoutSpace ? { display: "inline-block" } : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </svg>
  );
}
