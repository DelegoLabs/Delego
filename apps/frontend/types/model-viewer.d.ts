/**
 * Ambient type declarations for the <model-viewer> custom element.
 *
 * @google/model-viewer registers a custom element that is not part of the
 * standard DOM typings. Declaring it here:
 *   1. Removes the need for `@ts-ignore` on the JSX usage.
 *   2. Gives the ref callback an explicit, non-any element type.
 *   3. Exposes the subset of attributes and methods used in this project.
 *
 * Extend `ModelViewerElement` as additional properties are consumed.
 */

/** A subset of the model-viewer custom-element API used by this project. */
export interface ModelViewerElement extends HTMLElement {
  /** URL of the glTF/GLB model to display. */
  src: string;

  /** Accessible label for the model. */
  alt: string;

  /**
   * When present (empty string) the model auto-rotates.
   * Pass `"false"` to stop rotation without removing the attribute entirely.
   */
  "auto-rotate": string;

  /** Enables interactive orbit / pan / zoom controls. */
  "camera-controls": boolean;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      /**
       * Google's `<model-viewer>` web component.
       * https://modelviewer.dev/
       */
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<ModelViewerElement> & {
          src?: string;
          alt?: string;
          "auto-rotate"?: string;
          "camera-controls"?: boolean;
          poster?: string;
          style?: React.CSSProperties;
          ref?: React.Ref<ModelViewerElement>;
        },
        ModelViewerElement
      >;
    }
  }
}
