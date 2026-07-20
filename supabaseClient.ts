import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Sur le rendu web côté serveur (SSR d'Expo Router), `window` n'existe pas
// encore : AsyncStorage (qui s'appuie sur window.localStorage sur web)
// planterait dès l'initialisation du client Supabase. On bascule sur un
// stockage no-op le temps du SSR ; le vrai storage prend le relais une fois
// hydraté dans le navigateur.
const storageServeurSSR = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

const storage =
  Platform.OS === "web" && typeof window === "undefined"
    ? storageServeurSSR
    : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
