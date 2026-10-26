import axios from "axios";

export const API_BASE_URL =
  "https://ai-hospital-5iqz.onrender.com";
export const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("userToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("userToken");
      localStorage.removeItem("user");
    }
    return Promise.reject(error);
  },
);

export default api;
