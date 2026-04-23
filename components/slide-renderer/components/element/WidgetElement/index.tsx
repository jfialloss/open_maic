'use client';

import type { PPTWidgetElement } from '@/lib/types/slides';
import { BaseWidgetElement } from './BaseWidgetElement';

export interface WidgetElementProps {
  elementInfo: PPTWidgetElement;
  selectElement: (e: React.MouseEvent | React.TouchEvent, element: PPTWidgetElement, canMove?: boolean) => void;
}

/**
 * Editable widget element component
 */
export function WidgetElement({ elementInfo, selectElement }: WidgetElementProps) {
  return (
    <div
      className="element-widget w-full h-full"
      onMouseDown={(e) => selectElement(e, elementInfo)}
      onTouchStart={(e) => selectElement(e, elementInfo)}
    >
      <BaseWidgetElement elementInfo={elementInfo} target="editor" />
    </div>
  );
}
