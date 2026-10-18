
export const getApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || '';

  if (!envUrl) {
    return cleanPath;
  }

  // In AI Studio preview or local dev, prefer relative path so Vite/Express server handles API directly
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return cleanPath;
    }
  }

  return `${envUrl}${cleanPath}`;
};

