import React, {
  useState, useCallback, useEffect, createContext, useContext,
} from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StoreProvider, useStore } from './src/store';
import { AuthProvider, useAuth } from './src/AuthContext';
import { ThemeProvider } from './src/lib/theme-context';
import { Icon, IconName } from './src/components/Icon';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { hasSeenOnboarding, markOnboardingSeen } from './src/lib/storage';
import { useTheme } from './src/lib/theme-context';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AddExpenseSheet from './src/components/AddExpenseSheet';
import ToastContainer from './src/components/Toast';

const Tab = createBottomTabNavigator();

// The FAB opens the add sheet from any tab.
const UIContext = createContext<{ openAddExpense: () => void } | undefined>(undefined);
const useUI = (): { openAddExpense: () => void } => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIContext');
  return ctx;
};

// The tab bar mirrors the web app: Home tab, floating + in the middle, Settings tab.
const TabBar: React.FC<any> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const { openAddExpense } = useUI();
  const { triggerHaptic } = useStore();

  const go = (route: string) => {
    triggerHaptic();
    const event = navigation.emit({ type: 'tabPress', target: state.routes[state.index].key, canPreventDefault: false });
    navigation.navigate(route);
  };

  const { theme } = useTheme();

  const tab = (route: string, label: string, icon: IconName) => {
    const active = state.routeNames[state.index] === route;
    return (
      <Pressable
        onPress={() => state.routeNames[state.index] !== route && go(route)}
        style={styles.tab}
        android_ripple={{ color: theme.surfacePressed, borderless: false }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
      >
        <Icon name={icon} size={21} color="" theme={theme} tone={active ? 'accent' : 'muted'} strokeWidth={active ? 2.4 : 1.9} />
        <Text style={[styles.tabLabel, { color: active ? theme.accent : theme.textTertiary, fontWeight: active ? '700' : '500' }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.tabbar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(8, insets.bottom) }]}>
      {tab('Home', 'Home', 'home')}
      <View style={styles.fabWrap}>
        <Pressable
          onPress={() => { triggerHaptic(); openAddExpense(); }}
          style={({ pressed }) => [styles.fab, { backgroundColor: theme.accent }, pressed && { backgroundColor: theme.accentHover }]}
          // Bounded, not borderless. This was `borderless: true, radius: 40` from when
          // the FAB was raised over the tab bar; a 40dp borderless ripple is 80dp wide on
          // a 52dp button, so it spilled past the circle and was clipped by the tab bar
          // into a pale crescent sitting permanently over the button. The ripple now
          // stays inside the view, which the borderRadius rounds to the circle.
          android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
        >
          <Icon name="plus" size={28} color={theme.textOnAccent} theme={theme} strokeWidth={2.6} />
        </Pressable>
      </View>
      {tab('Settings', 'Settings', 'sliders')}
    </View>
  );
};

const AccountGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading } = useAuth();
  if (isLoading) {
    return <View style={styles.flex1} />;
  }
  return <>{children}</>;
};

/**
 * Holds the tabs back until the stored data has been read. Without this the app
 * renders one frame of the guest wallet and then swaps to the real one, and the
 * first-run decision below has no settled state to read from.
 */
const OnboardingGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    // A read failure must not trap someone in a loop they cannot leave: treat an
    // unreadable flag as "already seen" and show the app.
    hasSeenOnboarding()
      .then(setSeen)
      .catch(() => setSeen(true));
  }, []);

  if (seen === null) return <View style={styles.flex1} />;
  if (seen) return <>{children}</>;

  return (
    <OnboardingScreen
      onDone={() => {
        void markOnboardingSeen();
        setSeen(true);
      }}
    />
  );
};

const AppContent: React.FC = () => {
  const [showAdd, setShowAdd] = useState(false);
  const openAddExpense = useCallback(() => setShowAdd(true), []);
  const closeAdd = useCallback(() => setShowAdd(false), []);

  return (
    <UIContext.Provider value={{ openAddExpense }}>
      <OnboardingGate>
      <View style={styles.flex1}>
        <NavigationContainer>
          <Tab.Navigator
            tabBar={props => <TabBar {...props} />}
            screenOptions={{ headerShown: false }}
          >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
        <AddExpenseSheet isOpen={showAdd} onClose={closeAdd} />
        <ToastContainer />
      </View>
      </OnboardingGate>
    </UIContext.Provider>
  );
};

const App: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
    <StatusBar style="auto" />
    <AuthProvider>
      <AccountGate>
        <StoreProvider>
          <AppContent />
        </StoreProvider>
      </AccountGate>
    </AuthProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

/** Layout only — colours come from the active theme at each call site. */
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    overflow: 'visible',
    zIndex: 10,
  },
  tab: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: { fontSize: 13, letterSpacing: -0.1 },
  fabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sits fully inside the tab bar rather than raised above it. The tab bar is
  // rendered by React Navigation inside a container that clips to its own bounds, so
  // an overhanging FAB loses its top and renders as a half-disc — which is exactly
  // what the first release build shipped. Staying inside removes the dependency on
  // overflow entirely.
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default App;
