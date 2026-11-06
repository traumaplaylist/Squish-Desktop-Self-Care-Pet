import type { SpeciesRig } from '../../rig';

/** Хомяк-булочка. Детали — из листа ChatGPT, масштаб подогнан вручную (тело 261×288). */
export const HAMSTER: SpeciesRig = {
  id: 'hamster',
  body: { w: 261, h: 288 },
  parts: {
    shadow: { src: 'shadow', x: 30, y: 272, w: 200 },
    feet: { src: 'feet', x: 60, y: 268, w: 140 },
    body: { src: 'body', x: 0, y: 0, w: 261 },
    armL: { src: 'arm-l', x: 12, y: 136, w: 44 },
    armR: { src: 'arm-r', x: 205, y: 136, w: 44 },
    blush: { src: 'blush', x: 48, y: 104, w: 165 },
  },
  shoulders: { l: { x: 40, y: 140 }, r: { x: 221, y: 140 } },
  eyes: {
    open: { src: 'eyes-open', x: 78, y: 52, w: 106 },
    closed: { src: 'eyes-closed', x: 80, y: 64, w: 106 },
    happy: { src: 'eyes-happy', x: 80, y: 64, w: 106 },
    sleepy: { src: 'eyes-sleepy', x: 74, y: 50, w: 113 },
  },
  mouths: {
    smile: { src: 'mouth-smile', x: 112, y: 96, w: 38 },
    open: { src: 'mouth-open', x: 117, y: 96, w: 28 },
    o: { src: 'mouth-o', x: 122, y: 100, w: 17 },
    flat: { src: 'mouth-flat', x: 117, y: 102, w: 28 },
  },
  anchors: { glass: { x: 250, y: 210 }, sweat: { x: 210, y: 40 }, neck: { x: 130, y: 132 } },
  outfits: {
    wizard: {
      // Сверено с эталоном ChatGPT: конус шляпы за головой (уши торчат перед ним),
      // поля поверх лба; плащ от плеч почти до лапок, живот виден в разрезе.
      back: [{ src: 'hat-cone', x: 38, y: -90, w: 184, h: 116 }],
      front: [{ src: 'cape-front', x: -40, y: 136, w: 341, h: 140 }],
      top: [{ src: 'hat-brim', x: -14, y: 14, w: 273, h: 38 }],
      prop: { src: 'wand', x: 234, y: 112, w: 34 },
    },
  },
};
