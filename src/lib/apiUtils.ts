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

export const safeSetLocalStorage = (key: string, value: any): boolean => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
    return true;
  } catch (err) {
    console.warn(`[localStorage] Error writing key "${key}":`, err);
    return false;
  }
};

export const safeGetLocalStorage = <T = any>(key: string, fallback: T): T => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const item = window.localStorage.getItem(key);
    if (item === null) return fallback;
    try {
      return JSON.parse(item) as T;
    } catch {
      return (item as unknown) as T;
    }
  } catch (err) {
    console.warn(`[localStorage] Error reading key "${key}":`, err);
    return fallback;
  }
};

