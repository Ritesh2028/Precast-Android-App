import React, { useState, useEffect, useRef } from 'react';
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
  Easing,
  Image,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './ui/Icon';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Camera, CameraView } from 'expo-camera';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { getTokens } from '../services/tokenManager';
import { validateSession, refreshSession } from '../services/authService';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { handleApiError, handle401Error } from '../services/errorHandler';
import { themedStyles } from '../theme';

const { width } = Dimensions.get('window');

// Scanner window. Everything is drawn relative to the box itself and the box is
// centred by layout, so it lines up on any screen (status/nav bars included).
const BOX = Math.round(Math.min(width * 0.72, 300));
const BOX_RADIUS = 28;
const BRACKET = 40; // length of each corner bracket arm
const STROKE = 5;
const LOGO_ON_DARK = require('../../assets/precastezy-logo-on-dark.png');

// Four rounded L-shaped corner brackets, inset by half the stroke so nothing clips.
const BRACKETS_PATH = (() => {
  const o = STROKE / 2;
  const b = BOX - STROKE;
  const r = BOX_RADIUS;
  const L = BRACKET;
  const x = o;
  const y = o;
  return [
    `M${x} ${y + L} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + L}`,
    `M${x + b - L} ${y} H${x + b - r} Q${x + b} ${y} ${x + b} ${y + r} V${y + L}`,
    `M${x + b} ${y + b - L} V${y + b - r} Q${x + b} ${y + b} ${x + b - r} ${y + b} H${x + b - L}`,
    `M${x + L} ${y + b} H${x + r} Q${x} ${y + b} ${x} ${y + b - r} V${y + b - L}`,
  ].join(' ');
})();

const CameraQRScanner = ({ visible, onClose, onScan, navigation, autoProcess = false }) => {
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
  const [hasPaperId, setHasPaperId] = useState(false);
  const [isValidQR, setIsValidQR] = useState(true);
  const baseZoomRef = React.useRef(0);
  const scanLoopRef = useRef(null);
  const insets = useSafeAreaInsets();
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
      setHasPaperId(false);
      setIsValidQR(true);
      setZoomLevel(0);
      baseZoomRef.current = 0;
      startScanLineAnimation();
    }
    return () => {
      scanLoopRef.current?.stop();
      scanLoopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // One-way sweep from the top of the window to the bottom, then restart.
  const startScanLineAnimation = () => {
    scanLoopRef.current?.stop();
    scanLineAnimation.setValue(0);
    scanLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnimation, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(250),
      ])
    );
    scanLoopRef.current.start();
  };



  const handleBarCodeScanned = ({ type, data }) => {
    if (!scanned) {
      setScanned(true);
      setQrDetected(true);
      setDetectedData(data);
      
      // If autoProcess is true, directly call onScan without validation or action modal
      if (autoProcess) {
        setScanned(false);
        setQrDetected(false);
        onScan(data);
        return;
      }
      
      // Parse QR code data to check for paper_id and is_valid
      const qrData = parseQRCodeData(data);
      
      if (qrData) {
        // First, check if is_valid is explicitly true
        // If is_valid is not true (false, null, undefined, or missing), show error
        if (qrData.is_valid !== true) {
          setIsValidQR(false);
          setHasPaperId(false);
          Alert.alert(
            'Invalid QR Code',
            'This QR code is invalid. Please scan a valid QR code.',
            [
              {
                text: 'OK',
                onPress: () => {
                  setScanned(false);
                  setQrDetected(false);
                  setHasPaperId(false);
                  setIsValidQR(true);
                }
              }
            ]
          );
          return;
        }
        
        // If is_valid is true, then check for paper_id
        setIsValidQR(true);
        
        // Check if paper_id exists
        if (qrData.paper_id) {
          setHasPaperId(true);
        } else {
          // paper_id is null or undefined in QR code JSON - disable button
          setHasPaperId(false);
        }
      } else {
        // If QR code is not JSON format, we can't find is_valid
        // Show error as per requirement: "if you not find show error invalid qr code"
        setIsValidQR(false);
        setHasPaperId(false);
        Alert.alert(
          'Invalid QR Code',
          'This QR code format is invalid. Please scan a valid QR code with is_valid field.',
          [
            {
              text: 'OK',
              onPress: () => {
                setScanned(false);
                setQrDetected(false);
                setHasPaperId(false);
                setIsValidQR(true);
              }
            }
          ]
        );
        return;
      }
      
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

  // Parse QR code data as JSON and extract paper_id, id, and is_valid
  const parseQRCodeData = (data) => {
    if (!data) return null;
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed && typeof parsed === 'object') {
        return {
          paper_id: parsed.paper_id,
          id: parsed.id,
          element_id: parsed.id || parsed.element_id,
          is_valid: parsed.is_valid,
          raw: parsed,
        };
      }
    } catch (error) {
      console.log('[CameraQRScanner] QR code data is not JSON, will extract from API');
    }
    return null;
  };

  // Handle Task button press - fetch element details and navigate to Questions screen
  const handleTaskPress = async () => {
    if (!navigation) {
      Alert.alert('Error', 'Navigation not available');
      return;
    }

    setShowActionModal(false);
    
    try {
      // First, try to parse QR code as JSON to get paper_id directly
      const qrData = parseQRCodeData(detectedData);
      console.log('[CameraQRScanner] Parsed QR code data:', JSON.stringify(qrData, null, 2));
      
      let paperId = null;
      let elementId = null;
      let taskId = null;
      let projectId = null;
      let stageId = null;
      let activityId = null;

      // If QR code contains JSON with paper_id, use it directly
      if (qrData && qrData.paper_id) {
        paperId = qrData.paper_id;
        elementId = qrData.element_id || qrData.id;
        taskId = qrData.id || qrData.task_id;
        
        console.log('[CameraQRScanner] Using paper_id from QR code JSON:', paperId);
        console.log('[CameraQRScanner] Element ID from QR code:', elementId);
        
        // Check if QR code is valid (if is_valid field exists)
        if (qrData.is_valid !== undefined && !qrData.is_valid) {
          Alert.alert('Invalid QR Code', 'This QR code is marked as invalid. Cannot proceed with questions.');
          onClose();
          return;
        }
        
        // If we have paper_id from QR code, we can navigate directly
        // But we might still want to fetch element details for other IDs
        if (paperId && elementId) {
          const { accessToken } = await getTokens();
          if (!accessToken) {
            Alert.alert('Authentication Required', 'Please login to proceed with task.');
            onClose();
            return;
          }

          // Try to fetch element details to get additional IDs (project_id, stage_id, etc.)
          try {
            let tokenToUse = accessToken;
            try {
              const sessionResult = await validateSession();
              if (sessionResult && sessionResult.session_id) {
                tokenToUse = sessionResult.session_id;
              }
            } catch (validateError) {
              console.log('[CameraQRScanner] Session validation failed, using original token');
            }

            const apiUrl = `${API_BASE_URL}/api/scan_element/${elementId}`;
            console.log('[CameraQRScanner] Fetching element details for additional IDs:', apiUrl);

            let headers = createAuthHeaders(tokenToUse, { useBearer: true });
            let response = await fetch(apiUrl, {
              method: 'GET',
              headers: headers,
            });

            if (response.status === 401) {
              headers = createAuthHeaders(tokenToUse, { useBearer: false });
              response = await fetch(apiUrl, {
                method: 'GET',
                headers: headers,
              });
            }

            if (response.ok) {
              const elementData = await response.json();
              taskId = elementData?.id || elementData?.task_id || taskId || elementId;
              projectId = elementData?.project_id || elementData?.project?.id;
              stageId = elementData?.stage_id || elementData?.stage?.id;
              activityId = elementData?.activity_id || taskId;
            }
          } catch (apiError) {
            console.log('[CameraQRScanner] Could not fetch element details, using QR code data only:', apiError);
            // Continue with QR code data only
          }

          onClose();
          navigation.navigate('Questions', { 
            paperId: paperId,
            taskId: taskId || elementId,
            projectId: projectId,
            stageId: stageId,
            activityId: activityId || taskId || elementId,
          });
          return;
        }
      }

      // Fallback: Extract element ID and fetch from API (original behavior)
      elementId = qrData?.element_id || qrData?.id || extractElementId(detectedData);
      if (!elementId) {
        Alert.alert('Error', 'Could not extract element ID from QR code');
        return;
      }

      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to proceed with task.');
        onClose();
        return;
      }

      // Validate session first to get session_id (same pattern as other API calls)
      let tokenToUse = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          tokenToUse = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('[CameraQRScanner] Session validation failed, using original token');
      }

      const apiUrl = `${API_BASE_URL}/api/scan_element/${elementId}`;
      console.log('[CameraQRScanner] Fetching element details for task:', apiUrl);

      // Try with Bearer token first
      let headers = createAuthHeaders(tokenToUse, { useBearer: true });
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headers,
      });

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        headers = createAuthHeaders(tokenToUse, { useBearer: false });
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headers,
        });
      }

      if (response.ok) {
        const elementData = await response.json();
        console.log('[CameraQRScanner] Element details fetched successfully');
        console.log('[CameraQRScanner] Full element data:', JSON.stringify(elementData, null, 2));
        
        // Extract paper_id from various possible locations in the response
        let paperId = 
          elementData?.paper_id || 
          elementData?.paper?.id || 
          elementData?.paper?.paper_id ||
          elementData?.qc_paper_id ||
          elementData?.qc_paper?.id ||
          elementData?.qc_paper?.paper_id ||
          (elementData?.paper && typeof elementData.paper === 'object' && elementData.paper.id) ||
          (elementData?.paper && typeof elementData.paper === 'number' && elementData.paper);
        
        console.log('[CameraQRScanner] Extracted paper_id:', paperId);
        console.log('[CameraQRScanner] Available keys in elementData:', Object.keys(elementData || {}));
        
        // If paper_id is not found, try QR code JSON first, then tasks API as fallback
        if (!paperId) {
          // First, try to get paper_id from QR code JSON
          const qrData = parseQRCodeData(detectedData);
          if (qrData && qrData.paper_id) {
            paperId = qrData.paper_id;
            console.log('[CameraQRScanner] Found paper_id from QR code JSON:', paperId);
          } else {
            // If not in QR code, try tasks API
            console.log('[CameraQRScanner] Paper ID not found in element data or QR code, trying tasks API as fallback...');
            try {
              const tasksApiUrl = `${API_BASE_URL}/api/app/tasks?element_id=${elementId}`;
              let tasksHeaders = createAuthHeaders(tokenToUse, { useBearer: true });
              let tasksResponse = await fetch(tasksApiUrl, {
                method: 'GET',
                headers: tasksHeaders,
              });
              
              if (tasksResponse.status === 401) {
                tasksHeaders = createAuthHeaders(tokenToUse, { useBearer: false });
                tasksResponse = await fetch(tasksApiUrl, {
                  method: 'GET',
                  headers: tasksHeaders,
                });
              }
              
              if (tasksResponse.ok) {
                const tasksData = await tasksResponse.json();
                const tasks = tasksData.tasks || [];
                // Find task matching this element_id
                const matchingTask = tasks.find(task => 
                  task.element_id === elementId || 
                  String(task.element_id) === String(elementId)
                );
                
                if (matchingTask) {
                  paperId = matchingTask.paper_id || matchingTask.paper?.id;
                  console.log('[CameraQRScanner] Found paper_id from tasks API:', paperId);
                }
              }
            } catch (fallbackError) {
              console.error('[CameraQRScanner] Fallback tasks API call failed:', fallbackError);
            }
          }
        }
        
        if (!paperId) {
          console.error('[CameraQRScanner] Paper ID not found. Element data structure:', JSON.stringify(elementData, null, 2));
          Alert.alert(
            'Error', 
            'Paper ID not found in element data. Cannot proceed with questions.\n\nPlease contact support if this issue persists.'
          );
          onClose();
          return;
        }

        // Get additional IDs needed for submission
        const taskId = elementData?.id || elementData?.task_id || elementId;
        const projectId = elementData?.project_id || elementData?.project?.id;
        const stageId = elementData?.stage_id || elementData?.stage?.id;
        const activityId = elementData?.activity_id || taskId;

        onClose();
        
        // Navigate to QuestionsScreen with all necessary data
        navigation.navigate('Questions', { 
          paperId: paperId,
          taskId: taskId,
          projectId: projectId,
          stageId: stageId,
          activityId: activityId,
        });
      } else {
        // If still 401, try to refresh token and retry once
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              const refreshResult = await refreshSession();
              if (refreshResult && (refreshResult.access_token || refreshResult.message)) {
                const { accessToken: newAccessToken } = await getTokens();
                let newToken = newAccessToken;
                
                // Validate new session
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                  }
                } catch (validateError) {
                  console.log('[CameraQRScanner] New session validation failed');
                }
                
                // Retry with new token
                let retryHeaders = createAuthHeaders(newToken, { useBearer: true });
                let retryResponse = await fetch(apiUrl, {
                  method: 'GET',
                  headers: retryHeaders,
                });
                
                if (retryResponse.status === 401) {
                  retryHeaders = createAuthHeaders(newToken, { useBearer: false });
                  retryResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: retryHeaders,
                  });
                }
                
                if (retryResponse.ok) {
                  const elementData = await retryResponse.json();
                  console.log('[CameraQRScanner] Retry - Full element data:', JSON.stringify(elementData, null, 2));
                  
                  // Extract paper_id from various possible locations in the response
                  let paperId = 
                    elementData?.paper_id || 
                    elementData?.paper?.id || 
                    elementData?.paper?.paper_id ||
                    elementData?.qc_paper_id ||
                    elementData?.qc_paper?.id ||
                    elementData?.qc_paper?.paper_id ||
                    (elementData?.paper && typeof elementData.paper === 'object' && elementData.paper.id) ||
                    (elementData?.paper && typeof elementData.paper === 'number' && elementData.paper);
                  
                  console.log('[CameraQRScanner] Retry - Extracted paper_id:', paperId);
                  
                  // If paper_id is not found, try QR code JSON first, then tasks API as fallback
                  if (!paperId) {
                    // First, try to get paper_id from QR code JSON
                    const qrData = parseQRCodeData(detectedData);
                    if (qrData && qrData.paper_id) {
                      paperId = qrData.paper_id;
                      console.log('[CameraQRScanner] Retry - Found paper_id from QR code JSON:', paperId);
                    } else {
                      // If not in QR code, try tasks API
                      console.log('[CameraQRScanner] Retry - Paper ID not found in element data or QR code, trying tasks API as fallback...');
                      try {
                        const tasksApiUrl = `${API_BASE_URL}/api/app/tasks?element_id=${elementId}`;
                        let tasksHeaders = createAuthHeaders(newToken, { useBearer: true });
                        let tasksResponse = await fetch(tasksApiUrl, {
                          method: 'GET',
                          headers: tasksHeaders,
                        });
                        
                        if (tasksResponse.status === 401) {
                          tasksHeaders = createAuthHeaders(newToken, { useBearer: false });
                          tasksResponse = await fetch(tasksApiUrl, {
                            method: 'GET',
                            headers: tasksHeaders,
                          });
                        }
                        
                        if (tasksResponse.ok) {
                          const tasksData = await tasksResponse.json();
                          const tasks = tasksData.tasks || [];
                          // Find task matching this element_id
                          const matchingTask = tasks.find(task => 
                            task.element_id === elementId || 
                            String(task.element_id) === String(elementId)
                          );
                          
                          if (matchingTask) {
                            paperId = matchingTask.paper_id || matchingTask.paper?.id;
                            console.log('[CameraQRScanner] Retry - Found paper_id from tasks API:', paperId);
                          }
                        }
                      } catch (fallbackError) {
                        console.error('[CameraQRScanner] Retry - Fallback tasks API call failed:', fallbackError);
                      }
                    }
                  }
                  
                  if (!paperId) {
                    console.error('[CameraQRScanner] Retry - Paper ID not found. Element data structure:', JSON.stringify(elementData, null, 2));
                    Alert.alert(
                      'Error', 
                      'Paper ID not found in element data. Cannot proceed with questions.\n\nPlease contact support if this issue persists.'
                    );
                    onClose();
                    return;
                  }

                  const taskId = elementData?.id || elementData?.task_id || elementId;
                  const projectId = elementData?.project_id || elementData?.project?.id;
                  const stageId = elementData?.stage_id || elementData?.stage?.id;
                  const activityId = elementData?.activity_id || taskId;

                  onClose();
                  navigation.navigate('Questions', { 
                    paperId: paperId,
                    taskId: taskId,
                    projectId: projectId,
                    stageId: stageId,
                    activityId: activityId,
                  });
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.error('[CameraQRScanner] Token refresh failed:', refreshError);
          }
        }
        
        const errorInfo = await handleApiError(response, 'Element Details API');
        Alert.alert('Error', errorInfo.message || 'Failed to fetch element details');
        onClose();
      }
    } catch (error) {
      console.error('[CameraQRScanner] Error fetching element details:', error);
      Alert.alert('Network Error', `Failed to fetch element details: ${error.message}`);
      onClose();
    }
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
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <PinchGestureHandler
          onGestureEvent={handlePinchEvent}
          onHandlerStateChange={handlePinchStateChange}
          shouldCancelWhenOutside={false}
        >
          <View style={sc.fill}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              enableTorch={flashEnabled}
              zoom={zoomLevel}
              ref={setCameraRef}
            />

            {/* Overlay: one even tone over the whole camera, laid out with flex */}
            <View style={[sc.overlay, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}>
              <View style={sc.topBar}>
                <TouchableOpacity
                  style={sc.roundButton}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close scanner"
                  hitSlop={8}
                >
                  <Icon name="x" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={sc.title}>Scan QR code</Text>
                <TouchableOpacity
                  style={[sc.roundButton, flashEnabled && sc.roundButtonOn]}
                  onPress={toggleFlash}
                  accessibilityRole="button"
                  accessibilityLabel={flashEnabled ? 'Turn flash off' : 'Turn flash on'}
                  hitSlop={8}
                >
                  <Icon name={flashEnabled ? 'zap' : 'zap-off'} size={20} color={flashEnabled ? '#111111' : '#FFFFFF'} />
                </TouchableOpacity>
              </View>

              <View style={sc.middle} pointerEvents="none">
                <View style={sc.box}>
                  {!qrDetected && (
                    <Animated.View
                      style={[
                        sc.sweep,
                        {
                          transform: [{
                            translateY: scanLineAnimation.interpolate({
                              inputRange: [0, 1],
                              outputRange: [BRACKET / 2, BOX - BRACKET / 2],
                            }),
                          }],
                          opacity: scanLineAnimation.interpolate({
                            inputRange: [0, 0.1, 0.9, 1],
                            outputRange: [0, 1, 1, 0],
                          }),
                        },
                      ]}
                    />
                  )}
                  <Svg width={BOX} height={BOX} style={StyleSheet.absoluteFill}>
                    <Path
                      d={BRACKETS_PATH}
                      stroke={qrDetected ? '#34C759' : '#FFFFFF'}
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </Svg>
                </View>

                <Text style={sc.hint}>
                  {qrDetected ? 'QR code detected' : 'Point your camera at an element QR code'}
                </Text>
                {zoomLevel > 0.02 ? (
                  <View style={sc.zoomChip}>
                    <Text style={sc.zoomText}>{`${(1 + zoomLevel * 7).toFixed(1)}×`}</Text>
                  </View>
                ) : (
                  <Text style={sc.subHint}>Pinch to zoom</Text>
                )}
              </View>

              <View style={sc.bottom}>
                <TouchableOpacity
                  style={sc.pill}
                  onPress={() => setShowManualInput(true)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Enter code manually"
                >
                  <Icon name="keyboard" size={18} color="#FFFFFF" />
                  <Text style={sc.pillText}>Enter code</Text>
                </TouchableOpacity>
                <Image source={LOGO_ON_DARK} style={sc.brand} resizeMode="contain" />
              </View>
            </View>
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
                  <Text style={styles.actionButtonText}>Element Details</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionButton, 
                    styles.taskButton,
                    (!hasPaperId || !isValidQR) && styles.taskButtonDisabled
                  ]}
                  onPress={handleTaskPress}
                  disabled={!hasPaperId || !isValidQR}
                >
                  <Text style={[
                    styles.actionButtonText,
                    (!hasPaperId || !isValidQR) && styles.actionButtonTextDisabled
                  ]}>
                    QC Begin
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowActionModal(false);
                  setQrDetected(false);
                  setScanned(false);
                  setHasPaperId(false);
                  setIsValidQR(true);
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

const styles = themedStyles(() => ({
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
    borderColor: Colors.error,
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
    borderColor: Colors.warning,
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
    borderColor: Colors.primary,
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
    borderColor: Colors.success,
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
    backgroundColor: Colors.primary,
    marginRight: 10,
  },
  detailsButtonDisabled: {
    backgroundColor: Colors.primary,
    opacity: 0.6,
  },
  taskButton: {
    backgroundColor: Colors.success,
    marginLeft: 10,
  },
  taskButtonDisabled: {
    backgroundColor: '#CCCCCC',
    opacity: 0.6,
  },
  actionButtonText: {
    color: 'white',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  actionButtonTextDisabled: {
    color: '#999999',
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
    color: Colors.textPrimary,
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
    backgroundColor: Colors.primary,
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
}));

// Camera UI is always dark (it sits on the live camera feed), so these styles are
// static and intentionally NOT theme-converted.
const TEXT_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.6)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
};

const sc = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  overlay: {
    // RN 0.88 removed StyleSheet.absoluteFillObject; spell the fill out.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    // One light, even scrim over the whole feed: text stays readable, no tone seams.
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  roundButtonOn: { backgroundColor: 'rgba(255, 255, 255, 0.95)' },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: FontWeights.semiBold, letterSpacing: 0.2, ...TEXT_SHADOW },
  middle: { alignItems: 'center', paddingHorizontal: 24 },
  box: { width: BOX, height: BOX, marginBottom: 28 },
  sweep: {
    position: 'absolute',
    left: BRACKET / 2,
    right: BRACKET / 2,
    top: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(160, 196, 255, 0.95)',
    shadowColor: '#7AAAF8',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  hint: { color: '#FFFFFF', fontSize: 16, fontWeight: FontWeights.medium, textAlign: 'center', ...TEXT_SHADOW },
  subHint: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 13, marginTop: 6, ...TEXT_SHADOW },
  zoomChip: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  zoomText: { color: '#FFFFFF', fontSize: 13, fontWeight: FontWeights.semiBold },
  bottom: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    marginBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  pillText: { color: '#FFFFFF', fontSize: 15, fontWeight: FontWeights.semiBold },
  brand: { width: 120, height: 31, opacity: 0.9 },
});

export default CameraQRScanner;
