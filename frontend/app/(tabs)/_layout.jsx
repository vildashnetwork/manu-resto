import React, { useContext } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionModeToggle, DrawerContext, HeaderBrandTitle, MenuButton } from '../../src/components/AppNavigation';
import { colors } from '../../src/theme';

const icon = (name) => ({ color, size }) => <Ionicons name={name} size={size} color={color} />;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const openDrawer = useContext(DrawerContext);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.forest },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        headerTitle: () => <HeaderBrandTitle />,
        headerTitleAlign: 'left',
        headerLeft: () => <MenuButton onPress={openDrawer} />,
        headerRight: () => <ConnectionModeToggle compact />,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: colors.line,
          height: 62 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Manu's Resto", tabBarLabel: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="sales" options={{ title: 'New sale', tabBarLabel: 'Sales', tabBarIcon: icon('cart-outline') }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: icon('bar-chart-outline') }} />
    </Tabs>
  );
}
