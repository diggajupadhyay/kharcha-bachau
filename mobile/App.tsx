import React, { useState, useCallback, createContext, useContext } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StoreProvider, useStore } from './src/store';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AddExpenseSheet from './src/components/AddExpenseSheet';
import ToastContainer from './src/components/Toast';
import { colors } from './src/lib/theme';

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

  return (
    <View style={[styles.tabbar, { paddingBottom: Math.max(8, insets.bottom) }]}>
      <Pressable
        onPress={() => state.index !== 0 && go('Home')}
        style={styles.tab}
        android_ripple={{ color: '#f1f5f9' }}
      >
        <Text style={[styles.tabIcon, state.index === 0 && styles.tabIconActive]}>▦</Text>
        <Text style={[styles.tabLabel, state.index === 0 && styles.tabLabelActive]}>Home</Text>
      </Pressable>

      <View style={styles.fabWrap}>
        <Pressable
          onPress={() => { triggerHaptic(); openAddExpense(); }}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: true, radius: 40 }}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => state.index !== 1 && go('Settings')}
        style={styles.tab}
        android_ripple={{ color: '#f1f5f9' }}
      >
        <Text style={[styles.tabIcon, state.index === 1 && styles.tabIconActive]}>⚙️</Text>
        <Text style={[styles.tabLabel, state.index === 1 && styles.tabLabelActive]}>Settings</Text>
      </Pressable>
    </View>
  );
};

const AppContent: React.FC = () => {
  const [showAdd, setShowAdd] = useState(false);
  const openAddExpense = useCallback(() => setShowAdd(true), []);
  const closeAdd = useCallback(() => setShowAdd(false), []);

  return (
    <UIContext.Provider value={{ openAddExpense }}>
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
    </UIContext.Provider>
  );
};

const App: React.FC = () => (
  <SafeAreaProvider>
    <StatusBar style="dark" />
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  </SafeAreaProvider>
);

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate300,
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
  tabIcon: { fontSize: 22, color: colors.slate600 },
  tabIconActive: { color: colors.emerald600 },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.slate600 },
  tabLabelActive: { color: colors.emerald600, fontWeight: '700' },
  fabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.emerald600,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  fabPressed: { transform: [{ scale: 0.94 }], backgroundColor: colors.emerald700 },
  fabIcon: { fontSize: 32, color: colors.white, fontWeight: '400', marginTop: -4 },
});

export default App;
