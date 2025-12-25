import { useEffect } from 'react';
import { BackHandler } from 'react-native';

export const useBackHandler = ({ canGoBack, onBackPress }) => {
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && onBackPress) {
        return onBackPress();
      }
      return false;
    });

    return () => backHandler.remove();
  }, [canGoBack, onBackPress]);
};

