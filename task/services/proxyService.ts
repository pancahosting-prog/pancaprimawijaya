export const getProxiedUrl = (
  originalUrl?: string,
  forceAbsolute = false,
  downloadFilename?: string
): string => {
  if (!originalUrl) return '';
  if (originalUrl.startsWith('#') || originalUrl.startsWith('data:')) return originalUrl;

  let proxied = '';

  // If already proxied
  if (originalUrl.includes('/api/proxy-file')) {
    proxied = originalUrl;
  } else if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
    proxied = `/api/proxy-file?url=${encodeURIComponent(originalUrl)}`;
  } else {
    return originalUrl;
  }

  if (downloadFilename) {
    const separator = proxied.includes('?') ? '&' : '?';
    proxied += `${separator}download=true&filename=${encodeURIComponent(downloadFilename)}`;
  }

  if (forceAbsolute && typeof window !== 'undefined') {
    if (!proxied.startsWith('http://') && !proxied.startsWith('https://')) {
      proxied = `${window.location.origin}${proxied}`;
    }
  }

  return proxied;
};

export const isImageFile = (fileType?: string, fileNameOrUrl?: string): boolean => {
  if (fileType) {
    const ft = fileType.toLowerCase();
    if (ft.includes('image') || ft === 'img' || ft === 'photo' || ft === 'picture') return true;
  }
  if (fileNameOrUrl) {
    const clean = fileNameOrUrl.split('?')[0].toLowerCase();
    if (/\.(jpeg|jpg|gif|png|webp|svg|bmp|ico|heic|tiff)$/i.test(clean)) return true;
  }
  return false;
};

export const isPdfFile = (fileType?: string, fileNameOrUrl?: string): boolean => {
  if (fileType) {
    const ft = fileType.toLowerCase();
    if (ft.includes('pdf')) return true;
  }
  if (fileNameOrUrl) {
    const clean = fileNameOrUrl.split('?')[0].toLowerCase();
    if (/\.pdf$/i.test(clean)) return true;
  }
  return false;
};export const getDirectUrl = (url?: string): string => {
  if (!url) return '';
  if (url.includes('/api/proxy-file?url=')) {
    try {
      const match = url.match(/url=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    } catch {
      // ignore
    }
  }
  return url;
};

export const handleImageError = (
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  fallbackUrl?: string
) => {
  const img = e.currentTarget;
  const currentSrc = img.src;

  // If failed on proxied URL, fallback to direct original URL
  if (currentSrc.includes('/api/proxy-file')) {
    const directUrl = getDirectUrl(currentSrc) || fallbackUrl;
    if (directUrl && directUrl !== currentSrc) {
      img.src = directUrl;
      return;
    }
  }

  // If directUrl failed as well, or if fallbackUrl provided
  if (fallbackUrl && img.src !== fallbackUrl) {
    img.src = fallbackUrl;
    return;
  }

  // Final fallback SVG placeholder if image cannot be loaded at all
  img.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="12" fill="%2394a3b8">Gambar Tidak Tersedia</text></svg>`;
};
