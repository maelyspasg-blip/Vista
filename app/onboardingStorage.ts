import AsyncStorage from "@react-native-async-storage/async-storage";

const CLE_ONBOARDING_VU = "vista_onboarding_vu";

export async function marquerOnboardingVu(): Promise<void> {
  await AsyncStorage.setItem(CLE_ONBOARDING_VU, "1");
}

export async function getOnboardingVu(): Promise<boolean> {
  const valeur = await AsyncStorage.getItem(CLE_ONBOARDING_VU);
  return valeur === "1";
}
