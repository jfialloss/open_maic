'use client';

import type { PPTWidgetElement } from '@/lib/types/slides';
import { ElementOutline } from '../ElementOutline';
import { useElementShadow } from '../hooks/useElementShadow';

export interface BaseWidgetElementProps {
  elementInfo: PPTWidgetElement;
  target?: string;
}

/**
 * Base html widget element component
 * Renders an iframe with the generated HTML simulation/widget
 */
export function BaseWidgetElement({ elementInfo, target }: BaseWidgetElementProps) {
  const { shadowStyle } = useElementShadow(elementInfo.shadow);

  return (
    <div
      className="base-element-widget absolute"
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
    >
      <div
        className="rotate-wrapper w-full h-full"
        style={{ transform: `rotate(${elementInfo.rotate || 0}deg)` }}
      >
        <div
          className="element-content relative w-full h-full overflow-hidden rounded-md"
          style={{
            boxShadow: shadowStyle,
            // When in thumbnail/editor, disable pointer events to allow dragging
            // But if it is the main presentation view, we might want interaction.
            pointerEvents: target === 'thumbnail' || target === 'editor' ? 'none' : 'auto',
          }}
        >
          <ElementOutline
            width={elementInfo.width}
            height={elementInfo.height}
            outline={elementInfo.outline}
          />
          <iframe
            title="Widget Simulation"
            srcDoc={elementInfo.html}
            sandbox={elementInfo.sandbox || 'allow-scripts'}
            className="w-full h-full border-0"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
