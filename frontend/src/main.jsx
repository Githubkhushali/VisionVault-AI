import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import './index.css';
import App from './App.jsx';

// Axios Interceptor for Auth
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('vv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('vv_token');
      localStorage.removeItem('vv_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Fetch Interceptor for Auth (Monkey patch)
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  const token = localStorage.getItem('vv_token');
  if (token && typeof resource === 'string' && resource.startsWith('/api')) {
    config = config || {};
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`
    };
  }
  const response = await originalFetch(resource, config);
  if (response.status === 401) {
    localStorage.removeItem('vv_token');
    localStorage.removeItem('vv_user');
    window.location.href = '/login';
  }
  return response;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
