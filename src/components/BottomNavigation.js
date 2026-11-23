import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './ui/Icon';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const TABS = [
  { id: 'home', label: 'Home', icon: 'home', screen: 'Dashboard' },
  { id: 'task', label: 'Tasks', icon: 'list-checks', screen: 'QCStatus' },
  { id: 'me', label: 'Profile', icon: 'user', screen: 'UserProfile' },
];

const TabButton = ({ tab, active, onPress }) => {
  const tint = active ? Colors.primary : Colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      style={styles.tab}
      android_ripple={{ color: Colors.primarySoft, borderless: true, radius: 40 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
    >
      <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
        <Icon name={tab.icon} size={22} color={tint} strokeWidth={active ? 2.3 : 2} />
      </View>
      <Text style={[styles.tabLabel, { color: tint }, active && styles.tabLabelActive]}>{tab.label}</Text>
    </Pressable>
  );
};

const BottomNavigation = ({ activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();
  const [localActive, setLocalActive] = useState(activeTab || 'home');

  useEffect(() => {
    if (activeTab) setLocalActive(activeTab);
  }, [activeTab]);

  const tabs = useMemo(() => TABS, []);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          active={localActive === tab.id}
          onPress={() => {
            // Respond instantly — no artificial delay before switching.
            setLocalActive(tab.id);
            onTabPress && onTabPress(tab.id, tab.screen);
          }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.headerBorder,
    paddingTop: 6,
    shadowColor: Colors.brandNavy,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  iconWrap: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.primarySoft,
  },
  tabLabel: {
    fontSize: FontSizes.tabLabel + 1,
    fontWeight: FontWeights.medium,
    marginTop: 3,
  },
  tabLabelActive: {
    fontWeight: FontWeights.bold,
  },
});

export default React.memo(BottomNavigation);
