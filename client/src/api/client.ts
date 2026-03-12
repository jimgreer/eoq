import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export const authApi = axios.create({
  baseURL: '/auth',
  withCredentials: true,
});
