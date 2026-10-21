export interface TapjackingInspectionResult {
  isObscured: boolean;
  coveringElementTag?: string;
  opacity: number;
}

export function inspectTapTarget(
  target: HTMLElement,
  x: number,
  y: number,
  doc: Document = document
): TapjackingInspectionResult {
  const coveringElement = doc.elementFromPoint(x, y);
  const isObscured =
    coveringElement !== target &&
    !(coveringElement && target.contains(coveringElement));
  const opacityValue = coveringElement
    ? doc.defaultView?.getComputedStyle(coveringElement).opacity
    : undefined;
  const opacity = Number.parseFloat(opacityValue ?? "1");

  return {
    isObscured,
    coveringElementTag: isObscured ? coveringElement?.tagName : undefined,
    opacity: Number.isFinite(opacity) ? opacity : 1,
  };
}
