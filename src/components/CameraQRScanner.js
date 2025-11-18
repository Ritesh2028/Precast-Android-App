import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Camera, CameraView } from 'expo-camera';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const { width, height } = Dimensions.get('window');

const CameraQRScanner = ({ visible, onClose, onScan, navigation }) => {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [manualData, setManualData] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [scanLineAnimation] = useState(new Animated.Value(0));
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [cameraRef, setCameraRef] = useState(null);
  const [qrDetected, setQrDetected] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [detectedData, setDetectedData] = useState('');
  const baseZoomRef = React.useRef(0);
  const [outerCornerAnim] = useState(new Animated.Value(0));
  const [innerCornerAnim] = useState(new Animated.Value(0));
  const handlePinchEvent = (e) => {
    const scale = e.nativeEvent.scale || 1;
    // Lower sensitivity for smoother, slower zooming
    const sensitivity = 0.25; // smaller = slower
    let targetZoom = baseZoomRef.current + (scale - 1) * sensitivity;
    targetZoom = Math.min(1, Math.max(0, targetZoom));
    // Smoothly ease towards the target (exponential smoothing)
    setZoomLevel((current) => {
      const smoothing = 0.12; // smaller = slower approach
      const eased = current + (targetZoom - current) * smoothing;
      return Math.min(1, Math.max(0, eased));
    });
  };
  const handlePinchStateChange = (e) => {
    if (e.nativeEvent.state === State.BEGAN) {
      baseZoomRef.current = zoomLevel;
    } else if (
      e.nativeEvent.state === State.END ||
      e.nativeEvent.state === State.CANCELLED ||
      e.nativeEvent.state === State.FAILED
    ) {
      baseZoomRef.current = zoomLevel;
    }
  };

  useEffect(() => {
  const getCameraPermissions = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

    if (visible) {
      getCameraPermissions();
      setScanned(false);
      setQrDetected(false);
      setShowActionModal(false);
      setZoomLevel(0);
      baseZoomRef.current = 0;
      startScanLineAnimation();
      // Start pulsing animations for corners
      Animated.loop(
        Animated.sequence([
          Animated.timing(outerCornerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(outerCornerAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(innerCornerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(innerCornerAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [visible]);

  const startScanLineAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnimation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnimation, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };


  const handleBarCodeScanned = ({ type, data }) => {
    if (!scanned) {
      setScanned(true);
      setQrDetected(true);
      setDetectedData(data);
      setShowActionModal(true);
    }
  };

  // Test function to manually trigger QR detection
  const testQRDetection = () => {
    setScanned(true);
    setQrDetected(true);
    setDetectedData('TEST_QR_CODE_12345');
    setTimeout(() => {
      setShowActionModal(true);
    }, 500);
  };

  const handleManualSubmit = () => {
    if (manualData.trim()) {
      onScan(manualData.trim());
      setManualData('');
      onClose();
    } else {
      Alert.alert('Input Required', 'Please enter QR code data.');
    }
  };

  const handleDemoScan = () => {
    const demoCodes = ['JOB-001', 'JOB-002', 'JOB-003', 'PRODUCT-ABC', 'LOCATION-XYZ'];
    const randomCode = demoCodes[Math.floor(Math.random() * demoCodes.length)];
    onScan(randomCode);
    onClose();
  };

  const resetScanner = () => {
    setScanned(false);
  };

  const toggleFlash = () => {
    setFlashEnabled(!flashEnabled);
  };

  const toggleZoom = () => {
    const zoomLevels = [0, 0.5, 1];
    const currentIndex = zoomLevels.indexOf(zoomLevel);
    const nextIndex = (currentIndex + 1) % zoomLevels.length;
    const newZoom = zoomLevels[nextIndex];
    setZoomLevel(newZoom);
  };

  // Extract element ID from QR code data
  const extractElementId = (data) => {
    if (!data) return null;
    // If QR content is JSON, try to parse id fields first
    try {
      const obj = typeof data === 'string' ? JSON.parse(data) : data;
      if (obj && typeof obj === 'object') {
        if (obj.id) return String(obj.id);
        if (obj.element_id) return String(obj.element_id);
        if (obj.elementTypeId) return String(obj.elementTypeId);
      }
    } catch (_) {
      // not JSON, proceed with regex extraction
    }
    // 1) Strong match: /scan_element/{id}
    const directPath = data.match(/scan_element\/(\d{5,10})/);
    if (directPath) return directPath[1];
    // 2) Query-like: id=1234567
    const queryId = data.match(/[?&#]id=(\d{5,10})/i);
    if (queryId) return queryId[1];
    // 3) Plain numeric
    const numericMatch = data.match(/^\d{5,10}$/);
    if (numericMatch) return numericMatch[0];
    // 4) Full API URL
    const fullUrlMatch = data.match(/\/api\/scan_element\/(\d{5,10})/);
    if (fullUrlMatch) return fullUrlMatch[1];
    // 5) Fallback: pick the longest 5-10 digit sequence
    const anyNumberMatch = data.match(/(\d{5,10})/);
    if (anyNumberMatch) return anyNumberMatch[1];
    return null;
  };

  // Handle Details button press - navigate to ElementDetailsScreen
  const handleDetailsPress = () => {
    const elementId = extractElementId(detectedData);
    if (!elementId) {
      Alert.alert('Error', 'Could not extract element ID from QR code');
      return;
    }

    setShowActionModal(false);
    onClose();
    
    // Navigate to ElementDetailsScreen with elementId
    if (navigation) {
      navigation.navigate('ElementDetails', { elementId });
    } else {
      // Fallback: use onScan callback
      onScan(detectedData);
    }
  };

  // Helpers for pinch-to-zoom
  const distanceBetweenTouches = (touches) => {
    const [a, b] = touches;
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleGestureStart = (e) => {
    const { touches } = e.nativeEvent;
    if (touches.length === 2) {
      const dist = distanceBetweenTouches(touches);
      setInitialPinchDistance(dist);
      setInitialZoomLevel(zoomLevel);
    }
  };

  const handleGestureMove = (e) => {
    const { touches } = e.nativeEvent;
    if (touches.length === 2 && initialPinchDistance) {
      const dist = distanceBetweenTouches(touches);
      const scale = dist / initialPinchDistance;
      // Smooth scaling around the initial zoom
      let nextZoom = initialZoomLevel * scale;
      // If initial is 0, base from scale amount
      if (initialZoomLevel === 0) {
        nextZoom = Math.min(1, Math.max(0, (scale - 1) * 1.2));
      }
      nextZoom = Math.min(1, Math.max(0, nextZoom));
      setZoomLevel(nextZoom);
    }
  };

  const handleGestureEnd = () => {
    setInitialPinchDistance(null);
  };

  if (!visible) return null;

  if (hasPermission === null) {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Requesting camera permission...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (hasPermission === false) {
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Camera Permission Required</Text>
            <Text style={styles.modalSubtitle}>
              Please allow camera access to scan QR codes.
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <PinchGestureHandler
          onGestureEvent={handlePinchEvent}
          onHandlerStateChange={handlePinchStateChange}
          shouldCancelWhenOutside={false}
        >
          <View style={{ flex: 1 }}>
            <CameraView
              style={styles.camera}
              facing={'back'}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              enableTorch={flashEnabled}
              zoom={zoomLevel}
              ref={setCameraRef}
            >
          {/* Pinch handler wraps the camera; no overlay needed */}
          {/* Debug Text */}
         
          {/* Top Header */}
          <View style={styles.topHeader}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>QR Scanner</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Dark Overlays */}
          <View style={styles.topOverlay} pointerEvents="none" />
          <View style={styles.bottomOverlay} pointerEvents="none" />
          <View style={styles.leftOverlay} pointerEvents="none" />
          <View style={styles.rightOverlay} pointerEvents="none" />

          {/* Center Scan Area */}
          <View style={styles.centerArea} pointerEvents="none">
            <View style={[styles.scanBox, qrDetected && styles.scanBoxGlow]}>
              <View style={styles.scanFrame}>
                {/* Outer colored corners */}
                <Animated.View style={[styles.corner, styles.topLeft, qrDetected && styles.cornerGlow, { opacity: outerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]} />
                <Animated.View style={[styles.corner, styles.topRight, qrDetected && styles.cornerGlow, { opacity: outerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]} />
                <Animated.View style={[styles.corner, styles.bottomLeft, qrDetected && styles.cornerGlow, { opacity: outerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]} />
                <Animated.View style={[styles.corner, styles.bottomRight, qrDetected && styles.cornerGlow, { opacity: outerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }]} />
                {/* Inner white corners with a gap from outer */}
                <Animated.View style={[styles.cornerAccent, styles.topLeftAccent, { opacity: innerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]} />
                <Animated.View style={[styles.cornerAccent, styles.topRightAccent, { opacity: innerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]} />
                <Animated.View style={[styles.cornerAccent, styles.bottomLeftAccent, { opacity: innerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]} />
                <Animated.View style={[styles.cornerAccent, styles.bottomRightAccent, { opacity: innerCornerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]} />
                <Animated.View 
                  style={[
                    styles.scanLine,
                    {
                      transform: [{
                        translateY: scanLineAnimation.interpolate({
                          inputRange: [0, 1],
                          // Move from inner top accent (≈6px) to inner bottom accent (scanBox 250 - 6 - lineHeight 4 = 240)
                          outputRange: [12, 235],
                        })
                      }],
                      opacity: scanLineAnimation.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.2, 1, 0.2],
                      })
                    }
                  ]} 
                />
              </View>
            </View>
            
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <TouchableOpacity style={styles.controlButton} onPress={() => setShowManualInput(true)}>
              <View style={styles.controlIcon}>
                <Image source={require('../icons/image (1).png')} style={{ width: 40, height: 40, tintColor: '#ffffff' }} resizeMode="contain" />
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.controlButton} onPress={toggleFlash}>
              <View style={[styles.controlIcon, flashEnabled && styles.controlIconActive]}>
                <Image source={require('../icons/light.png')} style={{ width: 40, height: 40, tintColor: '#ffffff' }} resizeMode="contain" />
              </View>
            </TouchableOpacity>
          </View>
            </CameraView>
          </View>
        </PinchGestureHandler>

        {showManualInput && (
          <Modal
            animationType="slide"
            transparent={true}
            visible={showManualInput}
            onRequestClose={() => setShowManualInput(false)}
          >
            <View style={styles.centeredView}>
              <View style={styles.modalView}>
                <Text style={styles.modalTitle}>Manual QR Entry</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter QR code data manually"
                  value={manualData}
                  onChangeText={setManualData}
                  autoFocus={true}
                />
                <View style={styles.buttonRow}>
                  <TouchableOpacity 
                    style={styles.cancelButton} 
                    onPress={() => setShowManualInput(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.submitButton} onPress={handleManualSubmit}>
                    <Text style={styles.submitButtonText}>Submit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Action Modal */}
        <Modal
          visible={showActionModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowActionModal(false)}
        >
          <View style={styles.centeredView}>
            <View style={styles.actionModalView}>
              <Text style={styles.actionModalTitle}>QR Code Detected!</Text>
              <Text style={styles.actionModalData}>{detectedData}</Text>
              <View style={styles.actionButtonContainer}>
                <TouchableOpacity
                  style={[
                    styles.actionButton, 
                    styles.detailsButton
                  ]}
                  onPress={handleDetailsPress}
                >
                  <Text style={styles.actionButtonText}>📋 Details</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.taskButton]}
                  onPress={() => {
                    setShowActionModal(false);
                    onScan(detectedData);
                    onClose();
                  }}
                >
                  <Text style={styles.actionButtonText}>✅ Task</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowActionModal(false);
                  setQrDetected(false);
                  setScanned(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  centerArea: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -150 }, { translateY: -150 }],
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scanBox: {
    width: 250,
    height: 250,
    position: 'relative',
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 45,
    height: 45,
    borderWidth: 6,
  },
  cornerAccent: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderWidth: 2,
  },
  topLeft: {
    top: -10,
    left: -10,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 14,
    borderColor: '#FF3B30',
  },
  topLeftAccent: {
    top: 6,
    left: 6,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 10,
    borderColor: '#ffffff',
  },
  topRight: {
    top: -10,
    right: -10,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 14,
    borderColor: '#FF9500',
  },
  topRightAccent: {
    top: 6,
    right: 6,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 10,
    borderColor: '#ffffff',
  },
  bottomLeft: {
    bottom: -10,
    left: -10,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderColor: '#007AFF',
  },
  bottomLeftAccent: {
    bottom: 6,
    left: 6,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderColor: '#ffffff',
  },
  bottomRight: {
    bottom: -10,
    right: -10,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 14,
    borderColor: '#34C759',
  },
  bottomRightAccent: {
    bottom: 6,
    right: 6,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 10,
    borderColor: '#ffffff',
  },
  scanInstruction: {
    color: '#fff',
    fontSize: FontSizes.regular,
    marginTop: 20,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    fontWeight: FontWeights.semiBold,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    letterSpacing: 0.5,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 60,
    backgroundColor: 'transparent',
    zIndex: 10,

  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlIcon: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  controlIconText: {
    fontSize: FontSizes.large + 4,
    color: '#fff',
  },
  headerTitle: {
    color: '#fff',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
  },
  flashButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashButtonText: {
    color: '#fff',
    fontSize: FontSizes.large,
  },
  flashButtonActive: {
    backgroundColor: '#FFD700',
  },
  flashButtonTextActive: {
    color: '#000',
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'transparent',
    zIndex: 5,
    transform: [{ translateY: -140 }],
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'transparent',
    zIndex: 5,
    transform: [{ translateY: 140 }],
  },
  leftOverlay: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '50%',
    height: 280,
    backgroundColor: 'transparent',
    zIndex: 5,
    transform: [{ translateX: -140 }, { translateY: -140 }],
  },
  rightOverlay: {
    position: 'absolute',
    top: '50%',
    right: 0,
    width: '50%',
    height: 280,
    backgroundColor: 'transparent',
    zIndex: 5,
    transform: [{ translateX: 140 }, { translateY: -140 }],
  },
  scanBoxGlow: {
    shadowColor: '#00FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },
  cornerGlow: {
    shadowColor: '#00FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 15,
  },
  scanLine: {
    position: 'absolute',
    left: 15,
    right: 15,
    height: 4,
    backgroundColor: '#00FF00',
    shadowColor: '#00FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 12,
    borderRadius: 3,
  },
  controlIconActive: {
    backgroundColor: '#FFD700',
  },
  controlIconTextActive: {
    color: '#000',
  },
  gestureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Transparent layer to capture multi-touch gestures without visual impact
    backgroundColor: 'transparent',
    zIndex: 9,
  },
  pinchOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  actionModalView: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 300,
  },
  actionModalTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    marginBottom: 10,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  actionModalData: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    fontFamily: 'monospace',
  },
  actionButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  detailsButton: {
    backgroundColor: '#007AFF',
    marginRight: 10,
  },
  detailsButtonDisabled: {
    backgroundColor: '#007AFF',
    opacity: 0.6,
  },
  taskButton: {
    backgroundColor: '#34C759',
    marginLeft: 10,
  },
  actionButtonText: {
    color: 'white',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  debugContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
    zIndex: 20,
  },
  debugText: {
    color: 'white',
    fontSize: FontSizes.small,
    textAlign: 'center',
    marginBottom: 5,
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    fontSize: FontSizes.large + 2,
    fontWeight: FontWeights.bold,
    marginBottom: 20,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    width: '100%',
    fontSize: FontSizes.regular,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 15,
  },
  cancelButton: {
    backgroundColor: '#E5E5E5',
    borderRadius: 8,
    padding: 15,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: Colors.textPrimary,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.regular,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 15,
    minWidth: 100,
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.regular,
  },
});

export default CameraQRScanner;
