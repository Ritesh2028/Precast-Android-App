import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import Icon from './ui/Icon';
import { Colors } from '../styles/colors';

/*
 * Default header configuration for React Navigation
 * This can be used in screenOptions to ensure consistent header styling across all screens
 */
const HeaderAction = ({ icon, label, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.surface,
    }}
    activeOpacity={0.7}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <Icon name={icon} size={20} color={Colors.textPrimary} />
  </TouchableOpacity>
);

export const getDefaultHeaderOptions = (navigation) => ({
  // Height comes from React Navigation so it respects notches / status bars.
  headerStyle: {
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.headerBorder,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerShadowVisible: false,
  headerTintColor: Colors.textPrimary,
  headerTitleStyle: {
    fontWeight: '700',
    fontSize: 18,
    color: Colors.textPrimary,
  },
  headerTitleAlign: 'center',
  headerBackButtonDisplayMode: 'minimal',
  // Native-feeling push transition + swipe-back gesture.
  animation: 'slide_from_right',
  gestureEnabled: true,
  cardStyle: { backgroundColor: Colors.surface },
  headerTitleContainerStyle: {
    paddingHorizontal: 10,
  },
  headerLeftContainerStyle: {
    paddingLeft: 6,
  },
  headerRightContainerStyle: {
    paddingRight: 12,
  },
  headerRight: () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <HeaderAction icon="bell" label="Open notifications" onPress={() => navigation.navigate('Notifications')} />
      <HeaderAction icon="scan" label="Open scanner" onPress={() => navigation.navigate('Scan')} />
    </View>
  ),
});

/**
 * Get header options for a specific screen
 * @param {Object} navigation - Navigation object
 * @param {Object} customOptions - Custom options to override defaults
 * @returns {Object} Header options
 */
export const getHeaderOptions = (navigation, customOptions = {}) => {
  const defaultOptions = getDefaultHeaderOptions(navigation);
  return {
    ...defaultOptions,
    ...customOptions,
    // Merge nested objects properly
    headerStyle: {
      ...defaultOptions.headerStyle,
      ...(customOptions.headerStyle || {}),
    },
    headerTitleStyle: {
      ...defaultOptions.headerTitleStyle,
      ...(customOptions.headerTitleStyle || {}),
    },
    headerTitleContainerStyle: {
      ...defaultOptions.headerTitleContainerStyle,
      ...(customOptions.headerTitleContainerStyle || {}),
    },
    headerLeftContainerStyle: {
      ...defaultOptions.headerLeftContainerStyle,
      ...(customOptions.headerLeftContainerStyle || {}),
    },
    headerRightContainerStyle: {
      ...defaultOptions.headerRightContainerStyle,
      ...(customOptions.headerRightContainerStyle || {}),
    },
  };
};

export default {
  getDefaultHeaderOptions,
  getHeaderOptions,
};

