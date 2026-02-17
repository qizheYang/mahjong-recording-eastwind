import { create } from 'zustand';
import { adminSignIn, adminGetMe } from '../lib/api';

interface AdminStore {
  token: string | null;
  username: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  checkAuth: () => Promise<void>;
}

export const useAdminStore = create<AdminStore>((set, get) => ({
  token: localStorage.getItem('adminToken'),
  username: localStorage.getItem('adminUsername'),

  async signIn(username: string, password: string) {
    const res = await adminSignIn(username, password);
    localStorage.setItem('adminToken', res.token);
    localStorage.setItem('adminUsername', res.username);
    set({ token: res.token, username: res.username });
  },

  signOut() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    set({ token: null, username: null });
  },

  async checkAuth() {
    const token = get().token;
    if (!token) return;
    try {
      const res = await adminGetMe(token);
      set({ username: res.username });
    } catch {
      // Token expired or invalid
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUsername');
      set({ token: null, username: null });
    }
  },
}));
