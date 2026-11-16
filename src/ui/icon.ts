import { createElement, type IconNode } from 'lucide';

/** A decorative lucide icon (hidden from assistive tech; the control carries the label). */
export function icon(node: IconNode, size = 18): SVGElement {
  return createElement(node, { width: size, height: size, 'aria-hidden': 'true' });
}
