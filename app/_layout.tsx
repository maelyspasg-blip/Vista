import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding/index" />
      <Stack.Screen name="onboarding/inscription" />
      <Stack.Screen name="onboarding/preferences" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
