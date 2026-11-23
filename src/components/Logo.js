import React from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';

const SIZE_PRESETS = {
  small: { width: 140, height: 40, icon: 36, nameSize: FontSizes.medium },
  medium: { width: 200, height: 56, icon: 48, nameSize: FontSizes.large },
  large: { width: 260, height: 72, icon: 64, nameSize: FontSizes.extraLarge },
  xlarge: { width: 300, height: 84, icon: 80, nameSize: FontSizes.extraLarge + 4 },
};

/**
 * PrecastEzy brand mark.
 * - variant "light": logo for light backgrounds (login, forms)
 * - variant "dark": logo for navy/dark backgrounds (splash)
 * - showName: renders "PrecastEzy" text under/beside the mark when needed
 * - iconOnly: uses square icon asset instead of full wordmark
 */
const Logo = ({
  size = 'medium',
  variant = 'light',
  showName = false,
  iconOnly = false,
  style = {},
  nameStyle = {},
}) => {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.medium;

  const source = iconOnly
    ? require('../../assets/precastezy-icon.png')
    : variant === 'dark'
      ? require('../../assets/precastezy-logo-on-dark.png')
      : require('../../assets/precastezy-logo.png');

  const imageStyle = iconOnly
    ? { width: preset.icon, height: preset.icon }
    : { width: preset.width, height: preset.height };

  return (
    <View style={[styles.wrap, style]}>
      <Image source={source} style={imageStyle} resizeMode="contain" />
      {showName ? (
        <Text
          style={[
            styles.name,
            {
              fontSize: preset.nameSize,
              color: variant === 'dark' ? Colors.textOnNavy : Colors.brandNavy,
            },
            nameStyle,
          ]}
        >
          PrecastEzy
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 8,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});

export default Logo;
