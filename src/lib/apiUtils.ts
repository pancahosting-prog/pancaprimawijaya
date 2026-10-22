export const getApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 1. Check custom configured backend URL in localStorage if available
  if (typeof window !== 'undefined') {
    try {
      const customUrl = localStorage.getItem('mypanca_backend_url') || localStorage.getItem('backend_url');
      if (customUrl && customUrl.trim()) {
        return `${customUrl.trim().replace(/\/+$/, '')}${cleanPath}`;
      }
    } catch {
      // ignore
    }
  }

  // 2. Check environment variables
  const envUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || '').trim();

  // 3. In AI Studio dev/preview environment (.run.app) or localhost, prefer relative path
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('.run.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return cleanPath;
    }
  }

  // 4. If environment URL is defined, use it
  if (envUrl) {
    return `${envUrl.replace(/\/+$/, '')}${cleanPath}`;
  }

  // 5. Default fallback for production deployments (e.g. Vercel)
  return `https://pancaprima.my.id${cleanPath}`;
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

export const safeFetchJson = async <T = any>(path: string, options?: RequestInit): Promise<T | null> => {
  try {
    const url = getApiUrl(path);
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("application/json")) {
      return null;
    }
    const text = await res.text();
    if (!text || text.trim().startsWith("<")) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch (err) {
    return null;
  }
};

