import React from 'react';
import { Image, TouchableOpacity, View, StyleSheet } from 'react-native';
import { HeaderBackButton } from '@react-navigation/elements';
import Icon from './ui/Icon';
import { Colors } from '../styles/colors';
import { themedStyles, pick } from '../theme';
import { WorkspaceButton } from './WorkspaceSwitcher';

const HEADER_LOGO = require('../../assets/precastezy-logo.png');
const HEADER_LOGO_ON_DARK = require('../../assets/precastezy-logo-on-dark.png');

/** Wordmark shown on the left of the navigation header when there is no back button. */
export const HeaderBrand = () => (
  <Image
    source={pick(HEADER_LOGO, HEADER_LOGO_ON_DARK)}
    style={styles.brand}
    resizeMode="contain"
    accessibilityLabel="PrecastEzy"
  />
);

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
  // Screen names stay out of the bar; the wordmark is the header.
  headerTitle: () => null,
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
    paddingLeft: 12,
  },
  headerRightContainerStyle: {
    paddingRight: 12,
  },
  headerLeft: ({ canGoBack, label, tintColor }) =>
    canGoBack ? (
      <HeaderBackButton
        tintColor={tintColor}
        label={label}
        displayMode="minimal"
        onPress={() => navigation.goBack()}
      />
    ) : (
      <HeaderBrand />
    ),
  headerRight: () => (
    <View style={styles.rightCluster}>
      {/* Only shown to users who can work in more than one area */}
      <WorkspaceButton navigation={navigation} />
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

const styles = themedStyles(() => ({
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brand: {
    width: 168,
    height: 40,
  },
}));

export default {
  getDefaultHeaderOptions,
  getHeaderOptions,
  HeaderBrand,
};

