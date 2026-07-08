import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { SyncErrorBanner } from "../SyncErrorBanner";
import { useObjectifs } from "../store";
import { useTheme } from "../ThemeContext";

export default function TabLayout() {
  const { couleurs: C } = useTheme();
  const objStore = useObjectifs();

  useEffect(() => {
    objStore.chargerEnveloppes();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <SyncErrorBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.carte,
            borderTopColor: C.carteBorder,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: C.tabActif,
          tabBarInactiveTintColor: C.tabInactif,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "500",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Aperçu",
            tabBarIcon: ({ color }) => (
              <Ionicons name="search-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="budget"
          options={{
            title: "Budget",
            tabBarIcon: ({ color }) => (
              <Ionicons name="wallet-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="planning"
          options={{
            title: "Planning",
            tabBarIcon: ({ color }) => (
              <Ionicons name="calendar-outline" size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            title: "Stats",
            tabBarIcon: ({ color }) => (
              <Ionicons name="bar-chart-outline" size={22} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
