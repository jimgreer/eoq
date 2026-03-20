import axios from 'axios';

// X-Requested-With header provides CSRF protection - browsers block
// cross-origin JavaScript from setting custom headers without CORS approval
const csrfHeaders = { 'X-Requested-With': 'XMLHttpRequest' };

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: csrfHeaders,
});

export const authApi = axios.create({
  baseURL: '/auth',
  withCredentials: true,
  headers: csrfHeaders,
});
