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
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
