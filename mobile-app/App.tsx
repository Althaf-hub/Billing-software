import { useEffect, useState } from 'react';
import './global.css';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text, View, ActivityIndicator } from 'react-native';
import { ShoppingCart, Users, History } from 'lucide-react-native';

import { initDb, seedDummyData } from './src/lib/db';
import { loadAuthState, useAuthStore } from './src/lib/store';
import LoginScreen from './src/screens/LoginScreen';
import BillingScreen from './src/screens/BillingScreen';
import CustomersScreen from './src/screens/CustomersScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SyncIndicator from './src/components/SyncIndicator';
import { syncNow } from './src/lib/sync';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#09090b' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerRight: () => <SyncIndicator />,
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#71717a',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e4e4e7' },
      }}
    >
      <Tab.Screen
        name="Billing"
        component={BillingScreen}
        options={{
          title: 'New Sale',
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Customers"
        component={CustomersScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'Sales History',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const jwt = useAuthStore((s) => s.jwt);

  useEffect(() => {
    async function setup() {
      try {
        await initDb();
        await seedDummyData();
        await loadAuthState(); // restore JWT/shopId from SecureStore
      } catch (e) {
        console.error('App setup error:', e);
      } finally {
        setIsReady(true);
      }
    }
    setup();
  }, []);

  useEffect(() => {
    if (!isReady || !jwt) return;
    void syncNow().catch(() => {
      // Offline use is expected; the header keeps the queued-sale status visible.
    });
  }, [isReady, jwt]);

  if (!isReady) {
    return (
      <View className="flex-1 bg-zinc-950 items-center justify-center">
        <ActivityIndicator size="large" color="#6366f1" />
        <Text className="text-zinc-400 mt-4 text-base">Initializing…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={jwt ? 'Main' : 'Login'}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      </Stack.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}
