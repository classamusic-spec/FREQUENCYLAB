import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import {
  IBMPlexMono_300Light,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { colors } from '../src/design/tokens';
import { usePreferences } from '../src/state/preferences';
import { useProtocolLibrary } from '../src/state/library';
import { useHistory } from '../src/state/history';
import { useExperiments } from '../src/state/experiments';
import { usePlayerAttachment } from '../src/state/player';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(colors.background);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexMono_300Light,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const [hydrated, setHydrated] = useState(false);
  const hydratePreferences = usePreferences((state) => state.hydrate);
  const hydrateProtocols = useProtocolLibrary((state) => state.hydrate);
  const hydrateHistory = useHistory((state) => state.hydrate);
  const hydrateExperiments = useExperiments((state) => state.hydrate);
  const preferences = usePreferences((state) => state.preferences);
  const router = useRouter();

  usePlayerAttachment();

  useEffect(() => {
    void Promise.all([
      hydratePreferences(),
      hydrateProtocols(),
      hydrateHistory(),
      hydrateExperiments(),
    ]).finally(() => setHydrated(true));
  }, [hydrateExperiments, hydrateHistory, hydratePreferences, hydrateProtocols]);

  const ready = fontsLoaded && hydrated;

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();
    if (!preferences.onboardingCompletedAt) {
      router.replace('/onboarding');
    }
  }, [preferences.onboardingCompletedAt, ready, router]);

  if (!ready) {
    // Held on the splash background rather than flashing an unstyled tree.
    return <View style={styles.boot} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: preferences.reducedMotion ? 'none' : 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen
            name="session"
            options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
          />
          <Stack.Screen name="calibration" options={{ presentation: 'modal' }} />
          <Stack.Screen name="diagnostics" options={{ presentation: 'modal' }} />
          <Stack.Screen name="ai" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  boot: { flex: 1, backgroundColor: colors.background },
});
