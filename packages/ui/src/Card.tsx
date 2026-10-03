import type { HTMLAttributes, ReactNode } from "react";

/** Props accepted by the shared card component. */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: ReactNode;
  /**
   * Heading level for the card title. Defaults to 3 to match how cards have
   * always rendered; pass 2 on pages whose top-level heading is an `h1`, since
   * an `h1` followed straight by an `h3` skips a level and fails the
   * `heading-order` rule Lighthouse gates on.
   */
  titleLevel?: 2 | 3 | 4 | 5 | 6;
  /** Optional ARIA label for accessibility */
  ariaLabel?: string;
  /** Optional ARIA describedby for additional context */
  ariaDescribedBy?: string;
}

/** Simple card container with accessibility support — TODO: add variants and theming */
export function Card({
  title,
  children,
  titleLevel = 3,
  style,
  ariaLabel,
  ariaDescribedBy,
  ...props
}: CardProps) {
  const cardId = props.id || `card-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div
      id={cardId}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        padding: "1rem",
        background: "#fff",
        ...style,
      }}
      {...props}
    >
      {title && (
        <TitleHeading level={titleLevel} id={`${cardId}-title`}>
          {title}
        </TitleHeading>
      )}
      {children}
    </div>
  );
}

/**
 * Renders the card title at the requested level, keeping its id and spacing in
 * one place rather than repeating them across five heading tags.
 */
function TitleHeading({
  level,
  id,
  children,
}: {
  level: NonNullable<CardProps["titleLevel"]>;
  id: string;
  children: ReactNode;
}) {
  const style = { margin: "0 0 0.5rem", fontSize: "1rem" } as const;
  switch (level) {
    case 2:
      return (
        <h2 id={id} style={style}>
          {children}
        </h2>
      );
    case 4:
      return (
        <h4 id={id} style={style}>
          {children}
        </h4>
      );
    case 5:
      return (
        <h5 id={id} style={style}>
          {children}
        </h5>
      );
    case 6:
      return (
        <h6 id={id} style={style}>
          {children}
        </h6>
      );
    default:
      return (
        <h3 id={id} style={style}>
          {children}
        </h3>
      );
  }
}
