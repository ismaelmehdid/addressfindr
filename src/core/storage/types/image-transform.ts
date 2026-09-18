export type ImageResize = 'cover' | 'contain' | 'fill';

export type ImageFormat = 'origin';

export type ImageTransform = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: ImageResize;
  format?: ImageFormat;
};

export const IMAGE_DIMENSION_MIN = 1;
export const IMAGE_DIMENSION_MAX = 2500;
export const IMAGE_QUALITY_MIN = 20;
export const IMAGE_QUALITY_MAX = 100;
