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
            setUser(JSON.parse(userString));
        }
        
        // If there's a token in localStorage, set it as the default Authorization header
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
        
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        const response = await axios.post(`${API_URL}/auth/login`, { email, password });
        if (response.data?.user) {
            const { user } = response.data;
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);
        }
        return response;
    };

    const logout = () => {
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, isAuthenticated: !!user }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

