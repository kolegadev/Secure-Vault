import { useState, useCallback } from 'react';

const API_BASE = '/api';

/**
 * Generic API hook for making requests.
 * @returns {{loading: boolean, error: string|null, request: (endpoint: string, options?: RequestInit) => Promise<any>}}
 */
export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        credentials: 'include',
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message = data?.error?.message || `HTTP ${response.status}`;
        throw new Error(message);
      }

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, request };
}

/**
 * Simple GET request hook.
 * @param {string} endpoint
 * @returns {{data: any, loading: boolean, error: string|null, refetch: () => void}}
 */
export function useFetch(endpoint) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || 'Request failed');
      setData(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  return { data, loading, error, refetch: fetchData };
}
