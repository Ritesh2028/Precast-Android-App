import { useState, useEffect } from 'react';
import * as Network from 'expo-network';

export const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        setIsConnected(networkState.isConnected ?? true);
      } catch (error) {
        console.warn('Network check error:', error);
        setIsConnected(true); // Default to connected
      }
    };

    checkNetwork();
    
    // Check periodically
    const interval = setInterval(checkNetwork, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return { isConnected };
};

