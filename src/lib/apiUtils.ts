export const getApiUrl = (path: string): string => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};

export const safeSetLocalStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    if (
      err.name === 'QuotaExceededError' || 
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
      err.code === 22 ||
      err.number === -2147024882
    ) {
      console.warn(`[LocalStorage] QuotaExceededError caught for key '${key}'. Auto-cleaning old logs & cache...`);
      try {
        // 1. Prune mypanca_db_user_logs aggressively
        try {
          const savedLogs = localStorage.getItem('mypanca_db_user_logs');
          if (savedLogs) {
            const parsed = JSON.parse(savedLogs);
            if (Array.isArray(parsed) && parsed.length > 10) {
              localStorage.setItem('mypanca_db_user_logs', JSON.stringify(parsed.slice(0, 10)));
            } else if (key !== 'mypanca_db_user_logs') {
              localStorage.removeItem('mypanca_db_user_logs');
            }
          }
        } catch {
          try { localStorage.removeItem('mypanca_db_user_logs'); } catch {}
        }

        // 2. Prune old chat and temporary deleted items cache
        ['mypanca_mobile_ai_chat', 'mypanca_gemini_ai_chat', 'mypanca_mobile_team_messages', 'mypanca_db_deleted'].forEach(k => {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 10) {
                localStorage.setItem(k, JSON.stringify(parsed.slice(-10)));
              }
            }
          } catch {
            try { localStorage.removeItem(k); } catch {}
          }
        });

        // 3. Retry setting target key with truncated value
        let valueToSave = value;
        if (key === 'mypanca_db_user_logs') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              valueToSave = JSON.stringify(parsed.slice(0, 15));
            }
          } catch {}
        }

        try {
          localStorage.setItem(key, valueToSave);
        } catch (retrySetErr) {
          console.warn(`[LocalStorage] Final retry setItem failed for key '${key}', removing key to free space.`, retrySetErr);
          if (key === 'mypanca_db_user_logs') {
            try { localStorage.removeItem(key); } catch {}
          }
        }
      } catch (retryErr) {
        console.error(`[LocalStorage] Unable to set key '${key}' after cleanup:`, retryErr);
      }
    } else {
      console.error(`[LocalStorage] Error setting key '${key}':`, err);
    }
  }
};
