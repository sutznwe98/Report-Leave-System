import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
     const [loading, setLoading] = useState(true);

    useEffect(() => {
        const userString = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        if (userString) {
            try {
                setUser(JSON.parse(userString));
            } catch (e) {
                console.error("Failed to parse user from localStorage", e);
            }
        }
        
        // If there's a token in localStorage, set it as the default Authorization header
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        const response = await axios.post(`${API_URL}/auth/login`, { email, password });
        if (response.data?.token && response.data?.user) {
            const { token, user } = response.data;
            // 1. Save token and user to localStorage
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            // 2. Set user state
            setUser(user);
            // 3. Set axios default header for subsequent requests
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        return response;
    };

    const logout = () => {
        // 1. Remove user and token from localStorage
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        // 2. Clear user state
        setUser(null);
        // 3. Remove the Authorization header from axios defaults
        delete axios.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated: !!user }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
