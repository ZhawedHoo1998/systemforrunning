import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

export const authApi = {
  login: (login: string, password: string) =>
    api.post('/auth/login', { login, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const userApi = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  updatePassword: (id: string, password: string) =>
    api.put(`/users/${id}/password`, { password }),
  delete: (id: string) => api.delete(`/users/${id}`),
};

export const ideaApi = {
  list: (params?: any) => api.get('/ideas', { params }),
  get: (id: string) => api.get(`/ideas/${id}`),
  create: (data: any) => api.post('/ideas', data),
  update: (id: string, data: any) => api.put(`/ideas/${id}`, data),
  delete: (id: string) => api.delete(`/ideas/${id}`),
  score: (id: string, data: any) => api.post(`/ideas/${id}/score`, data),
  review: (id: string, data: any) => api.post(`/ideas/${id}/review`, data),
  vote: (id: string) => api.post(`/ideas/${id}/vote`),
  addComment: (id: string, content: string) =>
    api.post(`/ideas/${id}/comments`, { content }),
};

export const materialApi = {
  list: (params?: any) => api.get('/materials', { params }),
  get: (id: string) => api.get(`/materials/${id}`),
  create: (data: any) => api.post('/materials', data),
  update: (id: string, data: any) => api.put(`/materials/${id}`, data),
  delete: (id: string) => api.delete(`/materials/${id}`),
  use: (id: string) => api.post(`/materials/${id}/use`),
};

export const productApi = {
  list: (params?: any) => api.get('/products', { params }),
  get: (id: string) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
  update: (id: string, data: any) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  getBrands: () => api.get('/products/brands'),
  createBrand: (data: any) => api.post('/products/brands', data),
  getCarModels: (params?: any) => api.get('/products/car-models', { params }),
  createCarModel: (data: any) => api.post('/products/car-models', data),
  getFragrances: () => api.get('/products/fragrances'),
  createFragrance: (data: any) => api.post('/products/fragrances', data),
  getTags: () => api.get('/products/tags'),
  createTag: (data: any) => api.post('/products/tags', data),
};

export const taskApi = {
  list: (params?: any) => api.get('/tasks', { params }),
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.put(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  updateStatus: (id: string, status: string, note?: string) =>
    api.put(`/tasks/${id}/status`, { status, note }),
  submit: (id: string, data: any) => api.post(`/tasks/${id}/submit`, data),
  review: (id: string, data: any) => api.post(`/tasks/${id}/review`, data),
  assign: (id: string, data: any) => api.post(`/tasks/${id}/assign`, data),
  getVersions: (id: string) => api.get(`/tasks/${id}/versions`),
};

export const noteApi = {
  list: (params?: any) => api.get('/notes', { params }),
  get: (id: string) => api.get(`/notes/${id}`),
  create: (data: any) => api.post('/notes', data),
  update: (id: string, data: any) => api.put(`/notes/${id}`, data),
  delete: (id: string) => api.delete(`/notes/${id}`),
  addMetrics: (id: string, data: any) => api.post(`/notes/${id}/metrics`, data),
  getMetrics: (id: string) => api.get(`/notes/${id}/metrics`),
  getAnalysis: (id: string) => api.get(`/notes/${id}/analysis`),
  getAccounts: () => api.get('/notes/accounts/list'),
  createAccount: (data: any) => api.post('/notes/accounts', data),
};

export const dashboardApi = {
  getOverview: () => api.get('/dashboard/overview'),
  getWeekly: () => api.get('/dashboard/weekly'),
  getTrends: (params?: any) => api.get('/dashboard/trends', { params }),
  getRankings: (params?: any) => api.get('/dashboard/rankings', { params }),
  getMyTodos: () => api.get('/dashboard/my-todos'),
};

export const notificationApi = {
  list: (params?: any) => api.get('/notifications', { params }),
  markRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
};
