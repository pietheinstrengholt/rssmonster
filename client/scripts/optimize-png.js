import sharp from 'sharp';

// Preserve every visible pixel while reducing the install-time icon cache.
export const optimizePng = async contents => {
  const image = sharp(contents);
  const { isOpaque } = await image.stats();
  if (isOpaque) image.removeAlpha();
  return image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
};
