import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import CameraQRScanner from '../components/CameraQRScanner';

const QRScannerScreen = ({ navigation, route }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      setVisible(false);
    });
    return unsubscribe;
  }, [navigation]);

  const handleClose = () => {
    setVisible(false);
    navigation.goBack();
  };

  const handleScan = (data) => {
    if (route?.params?.onScan) {
      route.params.onScan(data);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraQRScanner
        visible={visible}
        onClose={handleClose}
        onScan={handleScan}
        navigation={navigation}
      />
    </View>
  );
};

export default QRScannerScreen;
