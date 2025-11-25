import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshQueue = [];

  useEffect(() => {
    const userString = localStorage.getItem('user');
  const savedToken = localStorage.getItem('token');
  const savedRefresh = localStorage.getItem('refreshToken');

    if (userString) {
      try {
        setUser(JSON.parse(userString));
      } catch (e) {
        console.error('Failed to parse user from localStorage', e);
      }
    }

    if (savedToken) {
      setToken(savedToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
    }

    setLoading(false);
  }, []);

  // Axios response interceptor to auto-refresh access token
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (res) => res,
      async (error) => {
        const originalRequest = error.config || {};
        const status = error.response?.status;
        const code = error.response?.data?.code;
        const isAuthEndpoint = (originalRequest.url || '').includes('/auth/');

        if ((status === 401 || status === 403) && code === 'token_expired' && !isAuthEndpoint && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            if (isRefreshing) {
              // Queue requests while refreshing
              return new Promise((resolve, reject) => {
                refreshQueue.push({ resolve, reject });
              })
                .then((newToken) => {
                  originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                  return axios(originalRequest);
                });
            }

            setIsRefreshing(true);
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
              throw new Error('No refresh token');
            }

            const resp = await axios.post(
              `${API_URL}/auth/refresh`,
              {},
              { headers: { Authorization: `Bearer ${refreshToken}` } }
            );

            const newToken = resp.data?.token;
            if (!newToken) throw new Error('No token in refresh response');

            localStorage.setItem('token', newToken);
            setToken(newToken);
            axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

            // Flush queued requests
            while (refreshQueue.length) {
              const p = refreshQueue.shift();
              p.resolve(newToken);
            }

            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return axios(originalRequest);
          } catch (e) {
            console.error('Token refresh failed:', e);
            while (refreshQueue.length) {
              const p = refreshQueue.shift();
              p.reject(e);
            }
            // force logout
            logout();
            return Promise.reject(error);
          } finally {
            setIsRefreshing(false);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, [isRefreshing]);

  // In AuthContext.jsx, update the login function to use setUser and setToken directly
  const login = async (email, password) => {
    try {
  const response = await axios.post(`${API_URL}/auth/login`, { email, password });
  const { token, refreshToken, user } = response.data;

      // Store token and user in localStorage
      localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);

      // Update state
      setUser(user);
  setToken(token);
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed. Please try again.'
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setUser(null);
    setToken(''); // ✅ clear token
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token, // ✅ now provided
        login,
        logout,
        loading,
        isAuthenticated: !!user && !!token,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
