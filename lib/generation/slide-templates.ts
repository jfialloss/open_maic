import { PPTElement } from '@/lib/types/slides';
import { nanoid } from 'nanoid';

export type TemplateId = 
  | 'TITLE_SLIDE' 
  | 'CONTENT_ONLY' 
  | 'TWO_COLUMNS_TEXT' 
  | 'IMAGE_RIGHT' 
  | 'IMAGE_LEFT' 
  | 'FORMULA_CENTERED';

export interface PredefinedSlot {
  type: 'text' | 'image' | 'video' | 'latex' | 'shape';
  left: number;
  top: number;
  width: number;
  height: number;
  defaultFontName?: string;
  defaultColor?: string;
  align?: 'left' | 'center' | 'right';
  fontSize?: number;
}

// Canvas Constants
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 562.5;

// Grid Master Definitions
export const SlideLayouts: Record<TemplateId, Record<string, PredefinedSlot>> = {
  TITLE_SLIDE: {
    title: { type: 'text', left: 100, top: 180, width: 800, height: 100, align: 'center', fontSize: 44, defaultColor: '#1e293b' },
    subtitle: { type: 'text', left: 100, top: 320, width: 800, height: 60, align: 'center', fontSize: 24, defaultColor: '#64748b' }
  },
  
  CONTENT_ONLY: {
    title: { type: 'text', left: 60, top: 60, width: 880, height: 80, fontSize: 36, defaultColor: '#1e293b' },
    content: { type: 'text', left: 60, top: 160, width: 880, height: 340, fontSize: 20, defaultColor: '#334155' }
  },
  
  TWO_COLUMNS_TEXT: {
    title: { type: 'text', left: 60, top: 60, width: 880, height: 80, fontSize: 36, defaultColor: '#1e293b' },
    leftText: { type: 'text', left: 60, top: 160, width: 420, height: 340, fontSize: 18, defaultColor: '#334155' },
    rightText: { type: 'text', left: 520, top: 160, width: 420, height: 340, fontSize: 18, defaultColor: '#334155' }
  },

  IMAGE_RIGHT: {
    title: { type: 'text', left: 60, top: 60, width: 880, height: 80, fontSize: 36, defaultColor: '#1e293b' },
    leftText: { type: 'text', left: 60, top: 160, width: 420, height: 340, fontSize: 18, defaultColor: '#334155' },
    rightMedia: { type: 'image', left: 520, top: 160, width: 420, height: 340 }
  },

  IMAGE_LEFT: {
    title: { type: 'text', left: 60, top: 60, width: 880, height: 80, fontSize: 36, defaultColor: '#1e293b' },
    leftMedia: { type: 'image', left: 60, top: 160, width: 420, height: 340 },
    rightText: { type: 'text', left: 520, top: 160, width: 420, height: 340, fontSize: 18, defaultColor: '#334155' }
  },

  FORMULA_CENTERED: {
    title: { type: 'text', left: 60, top: 60, width: 880, height: 80, fontSize: 36, align: 'center', defaultColor: '#1e293b' },
    topText: { type: 'text', left: 100, top: 150, width: 800, height: 80, fontSize: 20, align: 'center', defaultColor: '#334155' },
    formula: { type: 'latex', left: 100, top: 250, width: 800, height: 120 },
    bottomText: { type: 'text', left: 100, top: 400, width: 800, height: 100, fontSize: 18, align: 'center', defaultColor: '#64748b' }
  }
};

/**
 * Mapeador central que toma el JSON inyectado por la IA y lo convierte
 * en PPTElement[] con coordenadas estrictas.
 */
export function buildElementsFromTemplate(
  layoutId: string, 
  slotsContent: Record<string, any>
): PPTElement[] {
  const templateId = layoutId as TemplateId;
  const layout = SlideLayouts[templateId] || SlideLayouts.CONTENT_ONLY;
  const elements: PPTElement[] = [];

  for (const [slotKey, slotConfig] of Object.entries(layout)) {
    const rawContent = slotsContent[slotKey];
    if (!rawContent) continue; // Si la IA no llenó el slot, lo saltamos

    const baseEl = {
      id: `${slotConfig.type}_${nanoid(8)}`,
      type: slotConfig.type,
      left: slotConfig.left,
      top: slotConfig.top,
      width: slotConfig.width,
      height: slotConfig.height,
      rotate: 0,
    };

    if (slotConfig.type === 'text') {
      const alignCSS = slotConfig.align ? `text-align: ${slotConfig.align};` : '';
      let contentStr = typeof rawContent === 'string' ? rawContent : (rawContent.text || '');
      
      // Asegurar que haya etiquetas p si la IA dio texto plano
      if (!contentStr.match(/<p[^>]*>/i)) {
         contentStr = `<p>${contentStr}</p>`;
      }
      
      // Borrar estilos (font-size) que la IA haya inyectado por error
      contentStr = contentStr.replace(/style\s*=\s*['"][^'"]*['"]/ig, ''); 
      
      // Inyectar el CSS de nuestro Template Master en todos los párrafos
      contentStr = contentStr.replace(/<p[^>]*>/ig, `<p style="font-size: ${slotConfig.fontSize || 18}px; ${alignCSS}">`);

      elements.push({
        ...baseEl,
        type: 'text',
        defaultFontName: slotConfig.defaultFontName || 'Microsoft YaHei',
        defaultColor: slotConfig.defaultColor || '#333333',
        content: contentStr,
      } as any);
    } 
    else if (slotConfig.type === 'image' || slotConfig.type === 'video') {
      const isVideo = rawContent.type === 'video' || typeof rawContent.src === 'string' && rawContent.src.startsWith('gen_vid');
      elements.push({
        ...baseEl,
        type: isVideo ? 'video' : 'image',
        src: typeof rawContent === 'string' ? rawContent : rawContent.src,
        fixedRatio: true,
        autoplay: false
      } as any);
    }
    else if (slotConfig.type === 'latex') {
      elements.push({
        ...baseEl,
        type: 'latex',
        latex: typeof rawContent === 'string' ? rawContent : rawContent.latex,
        color: '#000000',
        align: 'center'
      } as any);
    }
  }

  return elements;
}
