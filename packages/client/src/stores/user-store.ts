import { create } from 'zustand';
import { userLogin, userGetMe } from '../lib/api';

interface UserStore {
  token: string | null;
  username: string | null;
  login: (username: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setFromRegister: (token: string, username: string) => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  token: localStorage.getItem('userToken'),
  username: localStorage.getItem('userUsername'),

  async login(username: string) {
    const res = await userLogin(username);
    localStorage.setItem('userToken', res.token);
    localStorage.setItem('userUsername', res.username);
    set({ token: res.token, username: res.username });
  },

  logout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userUsername');
    set({ token: null, username: null });
  },

  async checkAuth() {
    const token = get().token;
    if (!token) return;
    try {
      const res = await userGetMe(token);
      set({ username: res.username });
    } catch {
      localStorage.removeItem('userToken');
      localStorage.removeItem('userUsername');
      set({ token: null, username: null });
    }
  },

  setFromRegister(token: string, username: string) {
    localStorage.setItem('userToken', token);
    localStorage.setItem('userUsername', username);
    set({ token, username });
  },
}));
