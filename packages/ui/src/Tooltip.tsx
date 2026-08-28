import { useState, useRef, type ReactNode, type HTMLAttributes } from "react";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

export interface TooltipProps extends HTMLAttributes<HTMLDivElement> {
  content: ReactNode;
  placement?: TooltipPlacement;
  children: ReactNode;
  disabled?: boolean;
}

function placementStyles(placement: TooltipPlacement): React.CSSProperties {
  switch (placement) {
    case "top":
      return { bottom: "calc(100% + 0.5rem)", left: "50%", transform: "translateX(-50%)" };
    case "bottom":
      return { top: "calc(100% + 0.5rem)", left: "50%", transform: "translateX(-50%)" };
    case "left":
      return { right: "calc(100% + 0.5rem)", top: "50%", transform: "translateY(-50%)" };
    case "right":
      return { left: "calc(100% + 0.5rem)", top: "50%", transform: "translateY(-50%)" };
  }
}

export function Tooltip({
  content,
  placement = "top",
  children,
  disabled,
  style,
  ...props
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", display: "inline-block", ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...props}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 50,
            minWidth: "160px",
            maxWidth: "320px",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            background: "#111827",
            color: "#f9fafb",
            fontSize: "0.8125rem",
            lineHeight: "1.25rem",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.15)",
            pointerEvents: "none",
            ...placementStyles(placement),
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
