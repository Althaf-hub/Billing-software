import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AuthState {
  jwt: string | null;
  shopId: string | null;
  userId: string | null;
  role: string | null;
  login: (jwt: string, shopId: string, userId: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  jwt: null,
  shopId: null,
  userId: null,
  role: null,
  login: async (jwt, shopId, userId, role) => {
    await SecureStore.setItemAsync('jwt', jwt);
    await SecureStore.setItemAsync('shopId', shopId);
    await SecureStore.setItemAsync('userId', userId);
    await SecureStore.setItemAsync('role', role);
    set({ jwt, shopId, userId, role });
  },
  logout: async () => {
    await SecureStore.deleteItemAsync('jwt');
    await SecureStore.deleteItemAsync('shopId');
    await SecureStore.deleteItemAsync('userId');
    await SecureStore.deleteItemAsync('role');
    set({ jwt: null, shopId: null, userId: null, role: null });
  },
}));

export const loadAuthState = async () => {
  const jwt = await SecureStore.getItemAsync('jwt');
  const shopId = await SecureStore.getItemAsync('shopId');
  const userId = await SecureStore.getItemAsync('userId');
  const role = await SecureStore.getItemAsync('role');
  
  if (jwt && shopId && userId && role) {
    useAuthStore.setState({ jwt, shopId, userId, role });
  }
};
