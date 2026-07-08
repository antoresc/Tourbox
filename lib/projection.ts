// Equirectangular Europe projection, ported verbatim from the source index.html
// (script lines 271-279). Any city — IT or abroad — sits on one continuous map.
export const BBOX = { minLng: -11, maxLng: 32, minLat: 34, maxLat: 61 };
export const COSLAT = Math.cos(((BBOX.minLat + BBOX.maxLat) / 2) * Math.PI / 180);
export const VW = 1000;
export const K = VW / ((BBOX.maxLng - BBOX.minLng) * COSLAT);
export const VH = (BBOX.maxLat - BBOX.minLat) * K;

export const project = (lng: number, lat: number): [number, number] => [
  (lng - BBOX.minLng) * COSLAT * K,
  (BBOX.maxLat - lat) * K,
];

export const PAD = 46;
export const FULL = { x: -PAD, y: -PAD, w: VW + PAD * 2, h: VH + PAD * 2 };
export const ASPECT = FULL.w / FULL.h;
