import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { Colors, Theme } from '../styles/colors';
import { FontWeights } from '../styles/fonts';
import { themed, themedStyles } from '../theme';

/**
 * Mobile button aligned with web `button.tsx` variants
 * (default / outline / secondary / destructive / ghost / link).
 */
const VARIANT_STYLES = themed(() => ({
  default: {
    container: {
      backgroundColor: Colors.primary,
      borderColor: Colors.primaryDark,
      borderWidth: 1,
    },
    text: { color: Colors.primaryForeground },
  },
  outline: {
    container: {
      backgroundColor: Colors.background,
      borderColor: Colors.border,
      borderWidth: 1,
    },
    text: { color: Colors.textPrimary },
  },
  secondary: {
    container: {
      backgroundColor: Colors.secondary,
      borderColor: Colors.border,
      borderWidth: 1,
    },
    text: { color: Colors.textPrimary },
  },
  destructive: {
    container: {
      backgroundColor: Colors.destructive,
      borderColor: Colors.destructive,
      borderWidth: 1,
    },
    text: { color: Colors.primaryForeground },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    text: { color: Colors.textPrimary },
  },
  link: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      paddingHorizontal: 0,
      minHeight: undefined,
      height: undefined,
    },
    text: { color: Colors.primary, textDecorationLine: 'underline' },
  },
}));

const SIZE_STYLES = {
  default: {
    container: { minHeight: Theme.buttonHeight, paddingHorizontal: 16, paddingVertical: 10 },
    text: { fontSize: Theme.fontButton },
  },
  sm: {
    container: { minHeight: Theme.buttonHeightSm, paddingHorizontal: 12, paddingVertical: 8 },
    text: { fontSize: 12 },
  },
  lg: {
    container: { minHeight: Theme.buttonHeightLg, paddingHorizontal: 24, paddingVertical: 12 },
    text: { fontSize: 15 },
  },
};

const AppButton = ({
  title,
  children,
  onPress,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled = false,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  fullWidth = false,
  accessibilityLabel,
}) => {
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.default;
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.default;
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || (typeof title === 'string' ? title : undefined)}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        sizeStyle.container,
        variantStyle.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'outline' || variant === 'secondary' || variant === 'ghost' || variant === 'link'
              ? Colors.primary
              : Colors.primaryForeground
          }
        />
      ) : (
        <View style={styles.content}>
          {leftIcon}
          {title ? (
            <Text style={[styles.text, sizeStyle.text, variantStyle.text, textStyle]}>{title}</Text>
          ) : (
            children
          )}
          {rightIcon}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = themedStyles(() => ({
  base: {
    borderRadius: Theme.radius,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.2,
    marginHorizontal: 4,
  },
}));

export default AppButton;
