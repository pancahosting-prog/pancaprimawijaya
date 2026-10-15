
export const getApiUrl = (path: string): string => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
