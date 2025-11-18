import React from 'react';
import { Image } from 'react-native';

const Logo = ({ 
  size = 'medium', 
  style = {}
}) => {
  const getSize = () => {
    switch (size) {
      case 'small':
        return { width: 60, height: 60 };
      case 'medium':
        return { width: 120, height: 120 };
      case 'large':
        return { width: 180, height: 180 };
      case 'xlarge':
        return { width: 240, height: 240 };
      default:
        return { width: 120, height: 120 };
    }
  };

  const logoSize = getSize();

  return (
    <Image
      source={require('../../assets/precast.png')}
      style={[logoSize, style]}
      resizeMode="contain"
    />
  );
};

export default Logo;
