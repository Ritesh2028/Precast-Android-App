import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  Platform,
  Modal,
  Dimensions,
  PanResponder,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { getTokens } from '../services/tokenManager';
import { logout, validateSession, refreshSession } from '../services/authService';
import { handle401Error, handleApiError } from '../services/errorHandler';
import BirdsEyeViewModal from '../components/BirdsEyeViewModal';
import BottomNavigation from '../components/BottomNavigation';
import ProjectDropdown from '../components/ProjectDropdown';
import { DateFilter } from '../components/DateFilter';
import LineChart from '../components/LineChart';
import TowerFloorEditor from '../components/TowerFloorEditor';
import CameraQRScanner from '../components/CameraQRScanner';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ErectionManagerScreen = ({ route, navigation, hideBottomNav = false }) => {
  const { paperId, taskId, projectId, stageId, activityId } = route.params || {};
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [paperData, setPaperData] = useState(null);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [questionComments, setQuestionComments] = useState({}); // Comments per question: { questionId: 'comment text' }
  const [questionPhotos, setQuestionPhotos] = useState({}); // Photos per question: { questionId: [photo1, photo2, ...] }
  const [status, setStatus] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [annotationVisible, setAnnotationVisible] = useState(false);
  const [photoToAnnotate, setPhotoToAnnotate] = useState(null);
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [isDrawing, setIsDrawing] = useState(true);
  const [strokeColor, setStrokeColor] = useState('#007AFF');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPenOptions, setShowPenOptions] = useState(false);
  const annotationViewRef = useRef(null);
  const [birdsEyeViewVisible, setBirdsEyeViewVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [refreshing, setRefreshing] = useState(false);
  
  // Dashboard state
  const [selectedProject, setSelectedProject] = useState('All Projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [erectionLogs, setErectionLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [erectionReceivingLogs, setErectionReceivingLogs] = useState([]);
  const [loadingReceivingLogs, setLoadingReceivingLogs] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetailModalVisible, setOrderDetailModalVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logDetailModalVisible, setLogDetailModalVisible] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [elementDetailModalVisible, setElementDetailModalVisible] = useState(false);
  const [erectionElements, setErectionElements] = useState([]);
  const [loadingElements, setLoadingElements] = useState(false);
  const [productionChartData, setProductionChartData] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [currentFilterType, setCurrentFilterType] = useState('monthly');
  const [currentFilter, setCurrentFilter] = useState(() => ({
    type: 'monthly',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  }));
  const [showCreateRequest, setShowCreateRequest] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [showReceiveDispatch, setShowReceiveDispatch] = useState(false);
  const [showMarkErected, setShowMarkErected] = useState(false);
  // Removed taskSection state - both sections will be shown together
  const [pendingDispatchOrders, setPendingDispatchOrders] = useState([]);
  const [loadingDispatchOrders, setLoadingDispatchOrders] = useState(false);
  const [selectedDispatchItems, setSelectedDispatchItems] = useState([]);
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [receiveComments, setReceiveComments] = useState('');
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [submittingReceive, setSubmittingReceive] = useState(false);
  
  // Mark Erected states
  const [incompleteErectedElements, setIncompleteErectedElements] = useState([]);
  const [loadingIncompleteElements, setLoadingIncompleteElements] = useState(false);
  const [selectedErectElements, setSelectedErectElements] = useState([]);
  const [erectComments, setErectComments] = useState('');
  const [erectModalVisible, setErectModalVisible] = useState(false);
  const [submittingErect, setSubmittingErect] = useState(false);
  
  // QR Scanner state
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  
  const statusOptions = ['Completed', 'In Progress'];
  
  // Color options for annotation
  const colorOptions = [
    '#007AFF', // Blue (Primary)
    '#FF3B30', // Red
    '#34C759', // Green
    '#FF9500', // Orange
    '#5856D6', // Purple
    '#000000', // Black
  ];
  
  // Pen size options
  const penSizes = [3, 5, 7, 10];

  const validateToken = (token) => {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch (error) {
      console.log('Token validation error:', error);
      return false;
    }
  };

  // Extract element_id from QR code data
  const extractElementIdFromQR = (qrData) => {
    if (!qrData) return null;
    
    try {
      // Try to parse as JSON first
      const parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
      if (parsed && typeof parsed === 'object') {
        // Check for element_id in various possible fields
        if (parsed.element_id) return String(parsed.element_id);
        if (parsed.id && parsed.paper_id) return String(parsed.id); // If it's a task/paper QR
        if (parsed.elementId) return String(parsed.elementId);
      }
    } catch (e) {
      // Not JSON, try regex extraction
    }
    
    // Try regex to extract numbers (element IDs are usually numeric)
    const numberMatch = String(qrData).match(/\d+/);
    if (numberMatch) {
      return numberMatch[0];
    }
    
    return null;
  };

  // Handle QR scan for marking erected
  const handleQRScanForErect = async (qrData) => {
    console.log('[ErectionManagerScreen] QR scanned:', qrData);
    
    // Ensure scanner is closed immediately
    setQrScannerVisible(false);
    
    const elementId = extractElementIdFromQR(qrData);
    if (!elementId) {
      Alert.alert(
        'Invalid QR Code',
        'Could not extract element ID from QR code. Please scan a valid element QR code.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log('[ErectionManagerScreen] Extracted element ID:', elementId);

    // Switch to task tab if not already there
    if (activeTab !== 'task') {
      setActiveTab('task');
    }

    // Ensure incomplete elements are loaded
    if (incompleteErectedElements.length === 0 && !loadingIncompleteElements) {
      console.log('[ErectionManagerScreen] Loading incomplete elements...');
      await loadIncompleteErectedElements();
      // Wait for state to update
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Function to find and process element
    const findAndProcessElement = () => {
      const foundElement = incompleteErectedElements.find(
        element => String(element.element_id) === String(elementId)
      );

      if (foundElement) {
        console.log('[ErectionManagerScreen] Element found:', foundElement.element_id);
        selectAndShowModal(foundElement);
      } else {
        console.log('[ErectionManagerScreen] Element not found in list');
        showElementNotFoundAlert(elementId);
      }
    };

    // If still loading, wait for it to complete
    if (loadingIncompleteElements) {
      console.log('[ErectionManagerScreen] Waiting for elements to load...');
      const maxWaitTime = 5000; // 5 seconds max
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (!loadingIncompleteElements || (Date.now() - startTime) > maxWaitTime) {
          clearInterval(checkInterval);
          findAndProcessElement();
        }
      }, 300);
      return;
    }

    // Find and process element immediately
    findAndProcessElement();
  };

  // Helper function to show element not found alert
  const showElementNotFoundAlert = (elementId) => {
    Alert.alert(
      'Element Not Found',
      `Element ID ${elementId} is not in the incomplete erected elements list. It may already be erected or not received yet.`,
      [{ text: 'OK' }]
    );
  };

  // Helper function to select element and show modal
  const selectAndShowModal = (foundElement) => {
    // Ensure scanner is closed first
    setQrScannerVisible(false);
    
    // Check if already selected
    const isAlreadySelected = selectedErectElements.some(
      e => String(e.element_id) === String(foundElement.element_id)
    );

    if (!isAlreadySelected) {
      // Add to selected elements
      setSelectedErectElements(prev => [...prev, foundElement]);
    }

    // Show the erect modal after a short delay to ensure scanner is closed
    setTimeout(() => {
      setErectModalVisible(true);
    }, 300);
  };

  // Handle QR scan from scanner
  const handleQRScan = (qrData) => {
    console.log('[ErectionManagerScreen] QR scan received:', qrData);
    // Close scanner immediately
    setQrScannerVisible(false);
    // Small delay to ensure scanner closes before processing
    setTimeout(() => {
      // Process the QR scan
      handleQRScanForErect(qrData);
    }, 100);
  };

  // Override header QR button to open our scanner for marking erected
  useEffect(() => {
    // Set navigation options to handle QR scan
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
          >
            <Image
              source={require('../icons/bell.png')}
              style={{ width: 24, height: 24, tintColor: '#333' }}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              // Open our QR scanner for marking erected
              setQrScannerVisible(true);
            }}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Open scanner for marking erected"
          >
            <Image
              source={require('../icons/qr-code.png')}
              style={{ width: 24, height: 24, tintColor: '#333' }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation]);

  // Also handle when user navigates to Scan screen and comes back
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Check if we have QR scan data from route params (if user navigated to Scan screen)
      const qrScanData = route.params?.qrScanData;
      if (qrScanData) {
        handleQRScanForErect(qrScanData);
        // Clear the param to avoid processing again
        navigation.setParams({ qrScanData: undefined });
      }
    });

    return unsubscribe;
  }, [navigation, route.params]);

  useEffect(() => {
    if (paperId) {
    loadQuestions();
    requestPermissions();
    } else {
      setLoading(false);
      setPaperData(null);
      // Load dashboard data when no paperId (home screen)
      // Data will be loaded when project is selected
    }
  }, [paperId]);

  // Handle project selection
  const handleProjectSelect = (project) => {
    const projectName = typeof project === 'string' ? project : (project?.name || 'All Projects');
    const projectId = project?.project_id === 'all' || project?.project_id === null ? null : project?.project_id;
    setSelectedProject(projectName);
    setSelectedProjectId(projectId);
  };

  // Reload dashboard when project changes
  useEffect(() => {
    if (!paperId && selectedProjectId) {
      const filter = {
        type: currentFilterType,
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
      };
      loadProductionReports(filter);
      loadErectionLogs();
      loadErectionReceivingLogs();
      loadErectionElements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, paperId]);

  const requestPermissions = async () => {
    // Request camera permission
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus.status !== 'granted') {
      console.log('Camera permission not granted');
    }
    
    // Request media library permission
    const mediaStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (mediaStatus.status !== 'granted') {
      console.log('Media library permission not granted');
    }
  };

  // Load erection logs
  const loadErectionLogs = async () => {
    const projectId = selectedProjectId;
    
    if (!projectId) {
      setErectionLogs([]);
      return;
    }

    setLoadingLogs(true);

    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('⚠️ [ErectionManagerScreen] Session validation failed');
      }

      const logsUrl = `${API_BASE_URL}/api/stock-erected/logs/${projectId}`;
      console.log('📱 [ErectionManagerScreen] Fetching erection logs from:', logsUrl);

      // Try with Bearer token first
      let headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [ErectionManagerScreen] Erection Logs API - Attempt 1: With Bearer token');

      let response = await fetch(logsUrl, { headers: headersWithBearer });
      console.log('📱 [ErectionManagerScreen] Erection Logs Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [ErectionManagerScreen] Erection Logs API returned 401 with Bearer, trying without...');
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [ErectionManagerScreen] Erection Logs API - Attempt 2: Without Bearer prefix');
        response = await fetch(logsUrl, { headers: headersWithoutBearer });
        console.log('📱 [ErectionManagerScreen] Erection Logs Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const logsData = await response.json();
        console.log('✅ [ErectionManagerScreen] Erection logs loaded successfully');
        if (Array.isArray(logsData)) {
          setErectionLogs(logsData);
        } else if (Array.isArray(logsData?.data)) {
          setErectionLogs(logsData.data);
        } else {
          setErectionLogs([]);
        }
      } else {
        const errorText = await response.text().catch(() => '');
        console.log('❌ [ErectionManagerScreen] Erection Logs API Error');
        console.log('📱 [ErectionManagerScreen] Error status:', response.status);
        console.log('📱 [ErectionManagerScreen] Error response:', errorText);
        setErectionLogs([]);
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error loading erection logs:', error);
      setErectionLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Load erection elements
  const loadErectionElements = async () => {
    const projectId = selectedProjectId;
    
    if (!projectId) {
      setErectionElements([]);
      return;
    }

    setLoadingElements(true);

    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('⚠️ [ErectionManagerScreen] Session validation failed');
      }

      const elementsUrl = `${API_BASE_URL}/api/erection_stock/received/${projectId}`;
      console.log('📱 [ErectionManagerScreen] Fetching erection elements from:', elementsUrl);

      // Try with Bearer token first
      let headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [ErectionManagerScreen] Erection Elements API - Attempt 1: With Bearer token');

      let response = await fetch(elementsUrl, { headers: headersWithBearer });
      console.log('📱 [ErectionManagerScreen] Erection Elements Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [ErectionManagerScreen] Erection Elements API returned 401 with Bearer, trying without...');
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [ErectionManagerScreen] Erection Elements API - Attempt 2: Without Bearer prefix');
        response = await fetch(elementsUrl, { headers: headersWithoutBearer });
        console.log('📱 [ErectionManagerScreen] Erection Elements Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const elementsData = await response.json();
        console.log('✅ [ErectionManagerScreen] Erection elements loaded successfully');
        if (Array.isArray(elementsData)) {
          setErectionElements(elementsData);
        } else if (Array.isArray(elementsData?.data)) {
          setErectionElements(elementsData.data);
        } else {
          setErectionElements([]);
        }
      } else {
        const errorText = await response.text().catch(() => '');
        console.log('❌ [ErectionManagerScreen] Erection Elements API Error');
        console.log('📱 [ErectionManagerScreen] Error status:', response.status);
        console.log('📱 [ErectionManagerScreen] Error response:', errorText);
        setErectionElements([]);
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error loading erection elements:', error);
      setErectionElements([]);
    } finally {
      setLoadingElements(false);
    }
  };

  // Load erection receiving logs (dispatch orders)
  const loadErectionReceivingLogs = async () => {
    const projectId = selectedProjectId;
    
    if (!projectId) {
      setErectionReceivingLogs([]);
      return;
    }

    setLoadingReceivingLogs(true);

    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('⚠️ [ErectionManagerScreen] Session validation failed');
      }

      const receivingLogsUrl = `${API_BASE_URL}/api/dispatch_order/${projectId}`;
      console.log('📱 [ErectionManagerScreen] Fetching erection receiving logs from:', receivingLogsUrl);

      // Try with Bearer token first
      let headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [ErectionManagerScreen] Erection Receiving Logs API - Attempt 1: With Bearer token');

      let response = await fetch(receivingLogsUrl, { headers: headersWithBearer });
      console.log('📱 [ErectionManagerScreen] Erection Receiving Logs Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [ErectionManagerScreen] Erection Receiving Logs API returned 401 with Bearer, trying without...');
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [ErectionManagerScreen] Erection Receiving Logs API - Attempt 2: Without Bearer prefix');
        response = await fetch(receivingLogsUrl, { headers: headersWithoutBearer });
        console.log('📱 [ErectionManagerScreen] Erection Receiving Logs Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const receivingLogsData = await response.json();
        console.log('✅ [ErectionManagerScreen] Erection receiving logs loaded successfully');
        if (Array.isArray(receivingLogsData)) {
          setErectionReceivingLogs(receivingLogsData);
        } else if (Array.isArray(receivingLogsData?.data)) {
          setErectionReceivingLogs(receivingLogsData.data);
        } else {
          setErectionReceivingLogs([]);
        }
      } else {
        const errorText = await response.text().catch(() => '');
        console.log('❌ [ErectionManagerScreen] Erection Receiving Logs API Error');
        console.log('📱 [ErectionManagerScreen] Error status:', response.status);
        console.log('📱 [ErectionManagerScreen] Error response:', errorText);
        setErectionReceivingLogs([]);
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error loading erection receiving logs:', error);
      setErectionReceivingLogs([]);
    } finally {
      setLoadingReceivingLogs(false);
    }
  };

  // Load production reports for line chart
  const loadProductionReports = async (filter) => {
    const projectId = selectedProjectId;
    
    if (!projectId) {
      setProductionChartData([]);
      return;
    }

    setLoadingChart(true);
    setCurrentFilterType(filter.type);

    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('⚠️ [ErectionManagerScreen] Session validation failed');
      }

      let productionUrl = `${API_BASE_URL}/api/production_reports/${projectId}?type=${filter.type}&year=${filter.year}`;

      if (filter.month) {
        productionUrl += `&month=${filter.month}`;
      }

      if (filter.type === 'weekly' && filter.date) {
        const day = filter.date.getDate();
        productionUrl += `&date=${day}`;
      }

      console.log('📱 [ErectionManagerScreen] Fetching production reports from:', productionUrl);

      // Try with Bearer token first
      let headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [ErectionManagerScreen] Production Reports API - Attempt 1: With Bearer token');

      let response = await fetch(productionUrl, { headers: headersWithBearer });
      console.log('📱 [ErectionManagerScreen] Production Reports Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [ErectionManagerScreen] Production Reports API returned 401 with Bearer, trying without...');
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [ErectionManagerScreen] Production Reports API - Attempt 2: Without Bearer prefix');
        response = await fetch(productionUrl, { headers: headersWithoutBearer });
        console.log('📱 [ErectionManagerScreen] Production Reports Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const productionData = await response.json();
        console.log('✅ [ErectionManagerScreen] Production reports loaded successfully');
        if (Array.isArray(productionData)) {
          setProductionChartData(productionData);
        } else if (Array.isArray(productionData?.data)) {
          setProductionChartData(productionData.data);
        } else {
          setProductionChartData([]);
        }
      } else {
        const errorText = await response.text().catch(() => '');
        console.log('❌ [ErectionManagerScreen] Production Reports API Error');
        console.log('📱 [ErectionManagerScreen] Error status:', response.status);
        console.log('📱 [ErectionManagerScreen] Error response:', errorText);
        setProductionChartData([]);
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error loading production reports:', error);
      setProductionChartData([]);
    } finally {
      setLoadingChart(false);
    }
  };

  // Handle date filter change
  const handleDateFilterChange = (filter) => {
    setCurrentFilterType(filter.type);
    setCurrentFilter(filter);
    loadProductionReports(filter);
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      if (!paperId) {
        // Refresh dashboard data for current project
        if (selectedProjectId) {
          await loadProductionReports(currentFilter);
          await loadErectionLogs();
          await loadErectionReceivingLogs();
          await loadErectionElements();
        }
      } else {
        // Refresh questions when in question mode
        await loadQuestions();
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to view questions.');
        navigation.goBack();
        return;
      }

      const apiUrl = `${API_BASE_URL}/api/erection-manager/questions/${paperId}`;
      console.log('📱 [ErectionManagerScreen] Fetching questions from:', apiUrl);
      console.log('📱 [ErectionManagerScreen] Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

      // First, validate the session to ensure it exists in the database
      let currentToken = accessToken;
      try {
        console.log('📱 [ErectionManagerScreen] Validating session before Questions API call...');
        const sessionResult = await validateSession();
        console.log('📱 [ErectionManagerScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
          console.log('✅ [ErectionManagerScreen] Session validated, using session_id for Questions API');
          console.log('📱 [ErectionManagerScreen] Session_id (first 20 chars):', currentToken.substring(0, 20) + '...');
        } else {
          console.log('⚠️ [ErectionManagerScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [ErectionManagerScreen] Session validation failed, using original token:', validateError);
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [ErectionManagerScreen] Questions API - Attempt 1: With Bearer token');
      console.log('📱 [ErectionManagerScreen] Request headers:', JSON.stringify(headersWithBearer, null, 2));
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });

      console.log('📱 [ErectionManagerScreen] Questions API Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        console.log('❌ [ErectionManagerScreen] Questions API returned 401 with Bearer token');
        console.log('📱 [ErectionManagerScreen] Response body:', responseText1);
        console.log('📱 [ErectionManagerScreen] Questions API - Attempt 2: Without Bearer prefix...');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        console.log('📱 [ErectionManagerScreen] Request headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        
        console.log('📱 [ErectionManagerScreen] Questions API Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [ErectionManagerScreen] Questions API Success!');
        console.log('📱 [ErectionManagerScreen] Questions loaded successfully:', JSON.stringify(data, null, 2));
        setPaperData(data);
      } else {
        const errorText = await response.text();
        console.log('❌ [ErectionManagerScreen] Questions API Error');
        console.log('📱 [ErectionManagerScreen] Error status:', response.status);
        console.log('📱 [ErectionManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [ErectionManagerScreen] Questions API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [ErectionManagerScreen] Token refreshed successfully');
                
                // Validate the new session to get session_id
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [ErectionManagerScreen] New session validated, using session_id for retry');
                  }
                } catch (validateError) {
                  console.log('⚠️ [ErectionManagerScreen] New session validation failed, using access_token');
                }
                
                console.log('🔄 [ErectionManagerScreen] Retrying Questions API with refreshed token...');
                // Retry with new token - try Bearer first
                response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: createAuthHeaders(newToken, { useBearer: true, includeSessionId: true }),
                });
                
                // If still 401, try without Bearer
                if (response.status === 401) {
                  response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: createAuthHeaders(newToken, { useBearer: false, includeSessionId: true }),
                  });
                }
                
                if (response.ok) {
                  const data = await response.json();
                  console.log('✅ [ErectionManagerScreen] Questions API retry successful!');
                  setPaperData(data);
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [ErectionManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to fetch questions. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error fetching questions:', error);
      await handleApiError(error, navigation, 'Network error fetching questions.');
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (questionId, optionId) => {
    setSelectedOptions({
      ...selectedOptions,
      [questionId]: optionId,
    });
  };


  const handleTakePhoto = async (questionId = null) => {
    try {
      // Check camera permission
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Camera permission is required to take photos.'
          );
          return;
        }
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1.0,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const photoData = {
          uri: asset.uri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`,
          width: asset.width,
          height: asset.height,
        };
        
        // Open annotation modal instead of directly uploading
        setPhotoToAnnotate(photoData);
        setCurrentQuestionId(questionId);
        setPaths([]);
        setCurrentPath('');
        setAnnotationVisible(true);
      }
    } catch (error) {
      console.log('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleChooseFromGallery = async (questionId = null) => {
    try {
      // Check media library permission
      const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Media library permission is required to select photos.'
          );
          return;
        }
      }

      // Launch image library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1.0,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const photoData = {
          uri: asset.uri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`,
          width: asset.width,
          height: asset.height,
        };
        
        // Open annotation modal instead of directly uploading
        setPhotoToAnnotate(photoData);
        setCurrentQuestionId(questionId);
        setPaths([]);
        setCurrentPath('');
        setAnnotationVisible(true);
      }
    } catch (error) {
      console.log('Error choosing photo:', error);
      Alert.alert('Error', 'Failed to choose photo. Please try again.');
    }
  };

  const uploadPhotoToServer = async (photoData, questionId = null) => {
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to upload photos.');
        return;
      }

      const apiUrl = `${API_BASE_URL}/api/upload`;
      console.log('📱 [ErectionManagerScreen] Uploading photo to:', apiUrl);

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [ErectionManagerScreen] Using validated session_id for upload');
        }
      } catch (validateError) {
        console.log('⚠️ [ErectionManagerScreen] Session validation failed, using original token');
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', {
        uri: photoData.uri,
        type: photoData.type,
        name: photoData.name,
      });

      // Try with Bearer token first
      const headersWithBearer = {
        ...createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true }),
        // Let fetch set multipart boundaries automatically
      };
      console.log('📱 [ErectionManagerScreen] Upload - Attempt 1: With Bearer token');

      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: formData,
      });

      console.log('📱 [ErectionManagerScreen] Upload Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [ErectionManagerScreen] Upload returned 401 with Bearer, trying without...');
        const headersWithoutBearer = {
          ...createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
        };
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headersWithoutBearer,
          body: formData,
        });
        console.log('📱 [ErectionManagerScreen] Upload Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [ErectionManagerScreen] Photo uploaded successfully:', JSON.stringify(responseData, null, 2));
        
        // Add uploaded photo to photos array with server response data
        const uploadedPhoto = {
          ...photoData,
          serverResponse: responseData,
          file_name: responseData.file_name, // Save file_name from response
          uploaded: true,
        };
        
        if (questionId) {
          // Add to question-specific photos
          const currentQuestionPhotos = questionPhotos[questionId] || [];
          setQuestionPhotos({
            ...questionPhotos,
            [questionId]: [...currentQuestionPhotos, uploadedPhoto],
          });
        }
      } else {
        const errorText = await response.text();
        console.log('❌ [ErectionManagerScreen] Error uploading photo');
        console.log('📱 [ErectionManagerScreen] Error status:', response.status);
        console.log('📱 [ErectionManagerScreen] Error response:', errorText);
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to upload photo. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error uploading photo:', error);
      await handleApiError(error, navigation, 'Network error uploading photo.');
    }
  };

  const handleRemovePhoto = (questionId, photoIndex) => {
    // Remove from question-specific photos
    const questionPhotosList = questionPhotos[questionId] || [];
    const newPhotos = questionPhotosList.filter((_, i) => i !== photoIndex);
    setQuestionPhotos({
      ...questionPhotos,
      [questionId]: newPhotos,
    });
  };

  // PanResponder for drawing on the image
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        return isDrawing;
      },
      onMoveShouldSetPanResponder: () => {
        return isDrawing;
      },
      onPanResponderGrant: (evt) => {
        if (!isDrawing) {
          return;
        }
        const { locationX, locationY } = evt.nativeEvent;
        const newPath = `M${locationX},${locationY}`;
        setCurrentPath(newPath);
      },
      onPanResponderMove: (evt) => {
        if (!isDrawing) return;
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prevPath) => {
          if (!prevPath) {
            return `M${locationX},${locationY}`;
          }
          return `${prevPath} L${locationX},${locationY}`;
        });
      },
      onPanResponderRelease: () => {
        setCurrentPath((prevPath) => {
          if (prevPath) {
            setPaths((prevPaths) => {
              const newPaths = [...prevPaths, { path: prevPath, color: strokeColor, width: strokeWidth }];
              return newPaths;
            });
          }
          return '';
        });
      },
    })
  ).current;

  const handleSaveAnnotation = async () => {
    try {
      if (!annotationViewRef.current || !photoToAnnotate) {
        return;
      }

      // Capture the annotated image
      const uri = await captureRef(annotationViewRef.current, {
        format: 'jpg',
        quality: 0.9,
      });

      // Create new photo data with annotated image
      const annotatedPhotoData = {
        ...photoToAnnotate,
        uri: uri,
        name: `annotated_${Date.now()}.jpg`,
      };

      // Close annotation modal
      setAnnotationVisible(false);
      setPhotoToAnnotate(null);
      setPaths([]);
      setCurrentPath('');

      // Upload the annotated photo
      await uploadPhotoToServer(annotatedPhotoData, currentQuestionId);
      setCurrentQuestionId(null);
    } catch (error) {
      console.log('Error saving annotation:', error);
      Alert.alert('Error', 'Failed to save annotated photo. Please try again.');
    }
  };

  const handleCancelAnnotation = () => {
    setAnnotationVisible(false);
    setPhotoToAnnotate(null);
    setPaths([]);
    setCurrentPath('');
    setCurrentQuestionId(null);
  };

  const handleClearAnnotation = () => {
    setPaths([]);
    setCurrentPath('');
  };

  const handleTabPress = useCallback((tabId, screenName) => {
    setActiveTab(tabId);
    const state = navigation.getState?.();
    const currentRoute = state?.routes?.[state?.index || 0]?.name;
    
    // Erection Manager specific navigation - don't navigate to QA/QC screens
    if (tabId === 'home') {
      // Home tab: Navigate to ErectionManager screen (current screen)
      if (currentRoute !== 'ErectionManager') {
        navigation.navigate('ErectionManager');
      }
      // Reset showCreateRequest when switching to home
      setShowCreateRequest(false);
    } else if (tabId === 'task') {
      // Task tab: Show Create Request section (don't navigate)
      // Stay on current screen and show the Create Request UI
      setShowCreateRequest(true);
    } else if (tabId === 'me') {
      // Me tab: Navigate to UserProfile
      if (currentRoute !== 'UserProfile') {
        navigation.navigate('UserProfile');
      }
      // Reset showCreateRequest when switching to me
      setShowCreateRequest(false);
    }
  }, [navigation]);

  const handleSubmit = async () => {
    // Check if all questions are answered
    if (!paperData || !paperData.questions) {
      Alert.alert('Error', 'No questions available');
      return;
    }

    const unansweredQuestions = paperData.questions.filter(
      (q) => !selectedOptions[q.id]
    );

    if (unansweredQuestions.length > 0) {
      Alert.alert('Incomplete', 'Please answer all questions before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to submit answers.');
        return;
      }

      if (!validateToken(accessToken)) {
        // Try to refresh token instead of logging out immediately
        const shouldContinue = await handle401Error(null, null, navigation);
        if (!shouldContinue) {
          return;
        }
      }

      // Prepare submission data according to API structure
      const submissionData = {
        answers: paperData.questions.map((question) => {
          // Get question-specific photos or fallback to global photos
          const questionSpecificPhotos = questionPhotos[question.id] || [];
          const questionPhotoFileNames = questionSpecificPhotos
            .filter(photo => photo.file_name)
            .map(photo => photo.file_name);
          
          // Use first photo's file_name for this question, or empty string if no photos
          const imagePath = questionPhotoFileNames.length > 0 ? questionPhotoFileNames[0] : '';
          
          // Get question-specific comment
          const questionComment = questionComments[question.id] || '';
          
          return {
            project_id: projectId || paperData.paper?.project_id || null,
            question_id: question.id,
            option_id: selectedOptions[question.id],
            task_id: taskId || null,
            stage_id: stageId || null,
            comment: questionComment,
            image_path: imagePath, // Use file_name from uploaded photo for this question
          };
        }),
        status: {
          activity_id: activityId || taskId || null,
          status: status.toLowerCase() === 'completed' ? 'completed' : (status.toLowerCase() === 'in progress' ? 'in progress' : status),
        },
      };

      const apiUrl = `${API_BASE_URL}/api/erection-manager/questions/answers`;
      console.log('📱 [ErectionManagerScreen] Submitting answers to:', apiUrl);
      console.log('📱 [ErectionManagerScreen] Submission data:', JSON.stringify(submissionData, null, 2));

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [ErectionManagerScreen] Using validated session_id for submission');
        }
      } catch (validateError) {
        console.log('⚠️ [ErectionManagerScreen] Session validation failed, using original token');
      }

      // Try with Bearer token first
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [ErectionManagerScreen] Submit - Attempt 1: With Bearer token');
      
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: JSON.stringify(submissionData),
      });

      console.log('📱 [ErectionManagerScreen] Submit Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [ErectionManagerScreen] Submit returned 401 with Bearer, trying without...');
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
          body: JSON.stringify(submissionData),
        });
        console.log('📱 [ErectionManagerScreen] Submit Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [ErectionManagerScreen] Answers submitted successfully:', JSON.stringify(responseData, null, 2));
        Alert.alert('Success', 'Your responses have been submitted successfully.', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('❌ [ErectionManagerScreen] Error submitting answers');
        console.log('📱 [ErectionManagerScreen] Error status:', response.status);
        console.log('📱 [ErectionManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [ErectionManagerScreen] Submit API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                // Validate the new session
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                  }
                } catch (validateError) {
                  console.log('⚠️ [ErectionManagerScreen] New session validation failed');
                }
                
                console.log('🔄 [ErectionManagerScreen] Retrying submit with refreshed token...');
                // Retry with new token
                response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: createAuthHeaders(newToken, { useBearer: true, includeSessionId: true }),
                  body: JSON.stringify(submissionData),
                });
                
                if (response.status === 401) {
                  response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: createAuthHeaders(newToken, { useBearer: false, includeSessionId: true }),
                    body: JSON.stringify(submissionData),
                  });
                }
                
                if (response.ok) {
                  const responseData = await response.json();
                  console.log('✅ [ErectionManagerScreen] Submit retry successful!');
                  Alert.alert('Success', 'Your responses have been submitted successfully.', [
                    {
                      text: 'OK',
                      onPress: () => navigation.goBack(),
                    },
                  ]);
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [ErectionManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to submit answers. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [ErectionManagerScreen] Error submitting answers:', error);
      await handleApiError(error, navigation, 'Network error submitting answers.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle save erection request
  const handleSaveErectionRequest = async (allBlocks) => {
    setSubmittingRequest(true);
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to create request.');
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('Session validation failed');
      }

      const url = `${API_BASE_URL}/api/stock_erection`;
      const headers = {
        ...createAuthHeaders(currentToken, { useBearer: true }),
        'Content-Type': 'application/json',
      };

      let response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(allBlocks),
      });

      if (response.status === 401) {
        const headersWithoutBearer = {
          ...createAuthHeaders(currentToken, { useBearer: false }),
          'Content-Type': 'application/json',
        };
        response = await fetch(url, {
          method: 'POST',
          headers: headersWithoutBearer,
          body: JSON.stringify(allBlocks),
        });
      }

      if (response.ok) {
        Alert.alert('Success', 'Erection request created successfully!', [
          {
            text: 'OK',
            onPress: () => {
              setShowCreateRequest(false);
              // Optionally refresh data or navigate
            },
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('Error creating erection request:', errorText);
        Alert.alert('Error', 'Failed to create erection request. Please try again.');
      }
    } catch (error) {
      console.error('Error creating erection request:', error);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Load pending dispatch orders for receiving
  const loadPendingDispatchOrders = async () => {
    const projectId = selectedProjectId || route.params?.projectId;
    
    if (!projectId) {
      setPendingDispatchOrders([]);
      return;
    }

    setLoadingDispatchOrders(true);

    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('Session validation failed');
      }

      const url = `${API_BASE_URL}/api/dispatch_order/${projectId}`;
      const headers = createAuthHeaders(currentToken, { useBearer: true });
      
      let response = await fetch(url, { headers });
      
      if (response.status === 401) {
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        response = await fetch(url, { headers: headersWithoutBearer });
      }

      if (response.ok) {
        const responseData = await response.json();
        // Filter for pending/accepted orders that haven't been received
        const pending = Array.isArray(responseData) 
          ? responseData.filter(order => order.current_status === 'Accepted' || order.current_status === 'Pending')
          : [];
        setPendingDispatchOrders(pending);
      } else {
        setPendingDispatchOrders([]);
      }
    } catch (err) {
      console.error('Error loading dispatch orders:', err);
      setPendingDispatchOrders([]);
    } finally {
      setLoadingDispatchOrders(false);
    }
  };

  // Load incomplete erected elements
  const loadIncompleteErectedElements = async () => {
    const projectId = selectedProjectId || route.params?.projectId;
    
    if (!projectId) {
      setIncompleteErectedElements([]);
      return;
    }

    setLoadingIncompleteElements(true);

    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('Session validation failed');
      }

      const url = `${API_BASE_URL}/api/erection_stock/received/${projectId}`;
      const headers = createAuthHeaders(currentToken, { useBearer: true });
      
      let response = await fetch(url, { headers });
      
      if (response.status === 401) {
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        response = await fetch(url, { headers: headersWithoutBearer });
      }

      if (response.ok) {
        const responseData = await response.json();
        // Filter for incomplete erected elements (erected === false)
        const incomplete = Array.isArray(responseData) 
          ? responseData.filter(element => element.erected === false)
          : [];
        setIncompleteErectedElements(incomplete);
      } else {
        setIncompleteErectedElements([]);
      }
    } catch (err) {
      console.error('Error loading incomplete erected elements:', err);
      setIncompleteErectedElements([]);
    } finally {
      setLoadingIncompleteElements(false);
    }
  };

  // Load dispatch orders and incomplete elements when task tab is active
  useEffect(() => {
    if (activeTab === 'task') {
      loadPendingDispatchOrders();
      loadIncompleteErectedElements();
    }
  }, [activeTab, selectedProjectId]);

  // Toggle order expansion (show/hide items)
  const toggleOrderExpansion = (orderId, event) => {
    if (event) {
      event.stopPropagation();
    }
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  // Toggle order selection (selects/deselects all items in an order)
  const toggleOrderSelection = (order) => {
    if (!order.items || order.items.length === 0) {
      return;
    }

    setSelectedDispatchItems(prev => {
      // Check if all items in this order are already selected
      const orderItems = order.items.map(item => `${order.id}_${item.element_id}`);
      const allSelected = orderItems.every(itemKey => 
        prev.some(i => `${i.orderId}_${i.element_id}` === itemKey)
      );

      if (allSelected) {
        // Deselect all items in this order
        return prev.filter(i => i.orderId !== order.id);
      } else {
        // Select all items in this order
        const newItems = order.items.map(item => ({ ...item, orderId: order.id }));
        // Remove any existing items from this order first, then add all
        const filtered = prev.filter(i => i.orderId !== order.id);
        return [...filtered, ...newItems];
      }
    });
  };

  // Toggle erect element selection
  const toggleErectElementSelection = (element) => {
    setSelectedErectElements(prev => {
      const exists = prev.find(e => e.element_id === element.element_id);
      if (exists) {
        return prev.filter(e => e.element_id !== element.element_id);
      } else {
        return [...prev, element];
      }
    });
  };

  // Handle marking dispatch items as received
  const handleMarkAsReceived = async () => {
    if (!receiveComments.trim()) {
      Alert.alert('Error', 'Please enter comments before marking items as received.');
      return;
    }

    if (selectedDispatchItems.length === 0) {
      Alert.alert('Error', 'Please select at least one item to mark as received.');
      return;
    }

    setSubmittingReceive(true);
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to mark items as received.');
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('Session validation failed');
      }

      const projectId = selectedProjectId || route.params?.projectId;
      const elementIds = selectedDispatchItems.map(item => item.element_id);

      const url = `${API_BASE_URL}/api/erection_stock/update_when_erected`;
      const headers = {
        ...createAuthHeaders(currentToken, { useBearer: true }),
        'Content-Type': 'application/json',
      };

      const requestBody = {
        element_ids: elementIds,
        project_id: Number(projectId),
        comments: receiveComments.trim(),
      };

      let response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401) {
        const headersWithoutBearer = {
          ...createAuthHeaders(currentToken, { useBearer: false }),
          'Content-Type': 'application/json',
        };
        response = await fetch(url, {
          method: 'PUT',
          headers: headersWithoutBearer,
          body: JSON.stringify(requestBody),
        });
      }

      if (response.ok) {
        Alert.alert('Success', 'Items marked as received successfully!', [
          {
            text: 'OK',
            onPress: () => {
              setReceiveModalVisible(false);
              setReceiveComments('');
              setSelectedDispatchItems([]);
              loadPendingDispatchOrders();
            },
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('Error marking items as received:', errorText);
        Alert.alert('Error', 'Failed to mark items as received. Please try again.');
      }
    } catch (error) {
      console.error('Error marking items as received:', error);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmittingReceive(false);
    }
  };

  // Handle marking elements as erected
  const handleMarkAsErected = async () => {
    if (!erectComments.trim()) {
      Alert.alert('Error', 'Please enter comments before erecting elements.');
      return;
    }

    if (selectedErectElements.length === 0) {
      Alert.alert('Error', 'Please select at least one element to erect.');
      return;
    }

    setSubmittingErect(true);
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to erect elements.');
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('Session validation failed');
      }

      const projectId = selectedProjectId || route.params?.projectId;
      const elementIds = selectedErectElements.map(element => element.element_id);

      const url = `${API_BASE_URL}/api/erection_stock/update_when_erected`;
      const headers = {
        ...createAuthHeaders(currentToken, { useBearer: true }),
        'Content-Type': 'application/json',
      };

      const requestBody = {
        element_ids: elementIds,
        project_id: Number(projectId),
        comments: erectComments.trim(),
      };

      let response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401) {
        const headersWithoutBearer = {
          ...createAuthHeaders(currentToken, { useBearer: false }),
          'Content-Type': 'application/json',
        };
        response = await fetch(url, {
          method: 'PUT',
          headers: headersWithoutBearer,
          body: JSON.stringify(requestBody),
        });
      }

      if (response.ok) {
        Alert.alert('Success', 'Elements erected successfully!', [
          {
            text: 'OK',
            onPress: () => {
              setErectModalVisible(false);
              setErectComments('');
              setSelectedErectElements([]);
              loadIncompleteErectedElements();
            },
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('Error erecting elements:', errorText);
        Alert.alert('Error', 'Failed to erect elements. Please try again.');
      }
    } catch (error) {
      console.error('Error erecting elements:', error);
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setSubmittingErect(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading Erection Manager questions...</Text>
        </View>
        {/* Bottom Navigation */}
        {!hideBottomNav && (
          <BottomNavigation
            activeTab={activeTab}
            onTabPress={handleTabPress}
          />
        )}
      </View>
    );
  }

  if (!paperId) {
    // Home Dashboard Screen
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.dashboardContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#007AFF"
              colors={['#007AFF']}
            />
          }
        >
          {/* Show Create Request and Receive Dispatch when task tab is active */}
          {activeTab === 'task' ? (
            <View style={styles.taskSectionContainer}>
              {/* Operation Buttons */}
              <View style={styles.operationButtonsContainer}>
                <TouchableOpacity
                  style={[
                    styles.operationButton,
                    showCreateRequest && styles.operationButtonActive
                  ]}
                  onPress={() => {
                    setShowCreateRequest(!showCreateRequest);
                    setShowReceiveDispatch(false);
                    setShowMarkErected(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.operationButtonText,
                    showCreateRequest && styles.operationButtonTextActive
                  ]}>
                    Create Request
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.operationButton,
                    showReceiveDispatch && styles.operationButtonActive
                  ]}
                  onPress={() => {
                    setShowReceiveDispatch(!showReceiveDispatch);
                    setShowCreateRequest(false);
                    setShowMarkErected(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.operationButtonText,
                    showReceiveDispatch && styles.operationButtonTextActive
                  ]}>
                    Receive Dispatch
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.operationButton,
                    showMarkErected && styles.operationButtonActive
                  ]}
                  onPress={() => {
                    setShowMarkErected(!showMarkErected);
                    setShowCreateRequest(false);
                    setShowReceiveDispatch(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.operationButtonText,
                    showMarkErected && styles.operationButtonTextActive
                  ]}>
                    Mark Erected
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Create Request Section */}
              {showCreateRequest && (
                <View style={styles.createRequestSection}>
                  <View style={styles.createRequestHeader}>
                    <Text style={styles.createRequestTitle}>Create Request</Text>
                  </View>
                  <View style={styles.createRequestContent}>
                    <TowerFloorEditor
                      projectId={selectedProjectId || projectId}
                      onSave={handleSaveErectionRequest}
                    />
                  </View>
                </View>
              )}

              {/* Receive Dispatch Section */}
              {showReceiveDispatch && (
                <View style={styles.receiveDispatchSection}>
                  <View style={styles.receiveDispatchHeader}>
                    <Text style={styles.receiveDispatchTitle}>Receive Dispatch</Text>
                  </View>
                {loadingDispatchOrders ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading dispatch orders...</Text>
                  </View>
                ) : pendingDispatchOrders.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No pending dispatch orders</Text>
                  </View>
                ) : (
                  <View style={styles.dispatchOrdersContainer}>
                    {pendingDispatchOrders.map((order) => {
                      // Check if all items in this order are selected
                      const orderItems = order.items || [];
                      const orderItemKeys = orderItems.map(item => `${order.id}_${item.element_id}`);
                      const allItemsSelected = orderItems.length > 0 && orderItemKeys.every(itemKey => 
                        selectedDispatchItems.some(i => `${i.orderId}_${i.element_id}` === itemKey)
                      );
                      const isExpanded = expandedOrders.has(order.id);
                      
                      return (
                      <View
                        key={order.id}
                        style={[
                          styles.dispatchOrderCard,
                          allItemsSelected && styles.dispatchOrderCardSelected
                        ]}
                      >
                        <TouchableOpacity
                          onPress={() => toggleOrderSelection(order)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.dispatchOrderHeader}>
                            <View style={styles.dispatchOrderCheckbox}>
                              <View style={[
                                styles.checkbox,
                                allItemsSelected && styles.checkboxSelected
                              ]}>
                                {allItemsSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                              </View>
                            </View>
                            <View style={styles.dispatchOrderHeaderLeft}>
                              <Text style={styles.dispatchOrderId}>
                                {order.dispatch_order_id || 'N/A'}
                              </Text>
                              <Text style={styles.dispatchOrderDate}>
                                {order.dispatch_date 
                                  ? new Date(order.dispatch_date).toLocaleDateString()
                                  : 'N/A'}
                              </Text>
                            </View>
                            <View style={[
                              styles.dispatchStatusBadge,
                              order.current_status === 'Accepted' && styles.dispatchStatusBadgeAccepted,
                              order.current_status === 'Pending' && styles.dispatchStatusBadgePending,
                            ]}>
                              <Text style={[
                                styles.dispatchStatusBadgeText,
                                order.current_status === 'Accepted' && styles.dispatchStatusBadgeTextAccepted,
                                order.current_status === 'Pending' && styles.dispatchStatusBadgeTextPending,
                              ]}>
                                {order.current_status || 'N/A'}
                              </Text>
                            </View>
                            {order.items && order.items.length > 0 && (
                              <TouchableOpacity
                                style={styles.expandButton}
                                onPress={(e) => toggleOrderExpansion(order.id, e)}
                                activeOpacity={0.5}
                              >
                                <Text style={[
                                  styles.arrowIcon,
                                  isExpanded && styles.arrowIconExpanded
                                ]}>
                                  →
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </TouchableOpacity>

                        <View style={styles.dispatchOrderDetails}>
                          <View style={styles.dispatchDetailRow}>
                            <Text style={styles.dispatchDetailLabel}>Project:</Text>
                            <Text style={styles.dispatchDetailValue}>{order.project_name || 'N/A'}</Text>
                          </View>
                          <View style={styles.dispatchDetailRow}>
                            <Text style={styles.dispatchDetailLabel}>Driver:</Text>
                            <Text style={styles.dispatchDetailValue}>{order.driver_name || 'N/A'}</Text>
                          </View>
                        </View>

                        {order.items && order.items.length > 0 && isExpanded && (
                          <View style={styles.dispatchItemsContainer}>
                            <Text style={styles.dispatchItemsTitle}>
                              Items ({order.items.length})
                            </Text>
                            {order.items.map((item, index) => (
                              <View
                                key={index}
                                style={styles.dispatchItemCard}
                              >
                                <View style={styles.dispatchItemDetails}>
                                  <Text style={styles.dispatchItemName}>
                                    {item.element_type_name || 'N/A'}
                                  </Text>
                                  <Text style={styles.dispatchItemInfo}>
                                    Element ID: {item.element_id || 'N/A'}
                                  </Text>
                                  <Text style={styles.dispatchItemInfo}>
                                    Type: {item.element_type || 'N/A'} | Weight: {item.weight || '0'} kg
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                    })}
                  </View>
                )}

                {selectedDispatchItems.length > 0 && (
                  <View style={styles.receiveActionBar}>
                    <Text style={styles.selectedItemsCount}>
                      {selectedDispatchItems.length} item(s) from {new Set(selectedDispatchItems.map(i => i.orderId)).size} order(s) selected
                    </Text>
                    <TouchableOpacity
                      style={styles.receiveButton}
                      onPress={() => setReceiveModalVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.receiveButtonText}>
                        Mark as Received
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                </View>
              )}

              {/* Mark Erected Section */}
              {showMarkErected && (
                <View style={styles.markErectedSection}>
                  <View style={styles.markErectedHeader}>
                    <Text style={styles.markErectedTitle}>Mark Erected</Text>
                  </View>
                {loadingIncompleteElements ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading incomplete erected elements...</Text>
                  </View>
                ) : incompleteErectedElements.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No incomplete erected elements</Text>
                  </View>
                ) : (
                  <View style={styles.erectElementsContainer}>
                    {incompleteErectedElements.map((element) => {
                      const isSelected = selectedErectElements.some(
                        e => e.element_id === element.element_id
                      );
                      return (
                        <TouchableOpacity
                          key={element.id || element.element_id}
                          style={[
                            styles.erectElementCard,
                            isSelected && styles.erectElementCardSelected
                          ]}
                          onPress={() => toggleErectElementSelection(element)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.erectElementCheckbox}>
                            <View style={[
                              styles.checkbox,
                              isSelected && styles.checkboxSelected
                            ]}>
                              {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                            </View>
                          </View>
                          <View style={styles.erectElementDetails}>
                            <Text style={styles.erectElementName}>
                              Element ID: {element.element_id || 'N/A'}
                            </Text>
                            <Text style={styles.erectElementInfo}>
                              Type: {element.element_type_name || 'N/A'}
                            </Text>
                            <Text style={styles.erectElementInfo}>
                              Element Type: {element.element_type || 'N/A'}
                            </Text>
                            <Text style={styles.erectElementInfo}>
                              Tower: {element.tower_name || 'N/A'} | Floor: {element.floor_name || 'N/A'}
                            </Text>
                            <View style={styles.erectElementStatusRow}>
                              <Text style={styles.erectElementInfo}>
                                Status: 
                              </Text>
                              <View style={[
                                styles.erectedBadge,
                                element.erected && styles.erectedBadgeActive
                              ]}>
                                <Text style={[
                                  styles.erectedBadgeText,
                                  element.erected && styles.erectedBadgeTextActive
                                ]}>
                                  {element.erected ? 'Erected' : 'Not Erected'}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.erectElementStatusRow}>
                              <Text style={styles.erectElementInfo}>
                                Approval: 
                              </Text>
                              <Text style={[
                                styles.erectElementInfo,
                                element.approved_status ? styles.approvedText : styles.pendingText
                              ]}>
                                {element.approved_status ? 'Approved' : 'Pending'}
                              </Text>
                            </View>
                            {element.order_at && (
                              <Text style={styles.erectElementInfo}>
                                Order Date: {new Date(element.order_at).toLocaleDateString()}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {selectedErectElements.length > 0 && (
                  <View style={styles.erectActionBar}>
                    <Text style={styles.selectedItemsCount}>
                      {selectedErectElements.length} element(s) selected
                    </Text>
                    <TouchableOpacity
                      style={styles.erectButton}
                      onPress={() => setErectModalVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.erectButtonText}>
                        Mark as Erected
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              )}

            </View>
          ) : (
            <>
              {/* Header */}
             

              {/* Project Dropdown */}
              <View style={styles.projectDropdownWrapper}>
                <ProjectDropdown
                  selectedProject={
                    typeof selectedProject === 'string'
                      ? selectedProject
                      : selectedProject?.name || 'All Projects'
                  }
                  onProjectSelect={handleProjectSelect}
                  navigation={navigation}
                  includeAllOption={false}
                />
              </View>

              {/* Date Filter */}
              <View style={styles.dateFilterWrapper}>
                <DateFilter
                  onChange={handleDateFilterChange}
                  startDate={new Date(2023, 0, 1)}
                />
              </View>

              {/* Production Overview Chart */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Production Overview</Text>
            </View>
            <View style={styles.chartContainer}>
              {loadingChart ? (
                <View style={styles.chartLoadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              ) : (
                <LineChart
                  data={productionChartData}
                  height={280}
                  showLegend={true}
                  lines={[
                    { key: 'casted', label: 'Casted', color: '#8B5CF6' },
                    { key: 'erected', label: 'Erected', color: '#10B981' },
                    { key: 'planned', label: 'Planned', color: '#F59E42' },
                    { key: 'stockyard', label: 'Stockyard', color: '#697565' },
                    { key: 'dispatch', label: 'Dispatch', color: '#4B70F5' },
                  ]}
                  hideCheckouts={false}
                />
              )}
            </View>
          </View>

          {/* Erection Request Log Section */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Erection Request Log</Text>
            </View>
            <View style={styles.logsContainer}>
              {loadingLogs ? (
                <View style={styles.chartLoadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading logs...</Text>
                </View>
              ) : erectionLogs.length === 0 ? (
                <View style={styles.chartLoadingContainer}>
                  <Text style={styles.noDataText}>No logs available</Text>
                </View>
              ) : (
                <ScrollView 
                  style={styles.logsScrollView}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {erectionLogs.map((log) => (
                    <TouchableOpacity
                      key={log.id}
                      style={styles.logCard}
                      onPress={() => {
                        setSelectedLog(log);
                        setLogDetailModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.logCardHeader}>
                        <Text style={styles.logElementName}>
                          {log.element_type_name || 'N/A'} - {log.tower_name || 'N/A'}
                        </Text>
                        <View style={[
                          styles.statusBadge,
                          log.status === 'Erected' && styles.statusBadgeErected,
                          log.status === 'Approved' && styles.statusBadgeApproved,
                          log.status === 'Received' && styles.statusBadgeReceived,
                          log.status === 'Pending' && styles.statusBadgePending,
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            log.status === 'Erected' && styles.statusBadgeTextErected,
                            log.status === 'Approved' && styles.statusBadgeTextApproved,
                            log.status === 'Received' && styles.statusBadgeTextReceived,
                            log.status === 'Pending' && styles.statusBadgeTextPending,
                          ]}>
                            {log.status || 'N/A'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.logDetails}>
                        <View style={styles.logDetailRow}>
                          <Text style={styles.logDetailLabel}>Floor:</Text>
                          <Text style={styles.logDetailValue}>{log.floor_name || 'N/A'}</Text>
                        </View>
                        <View style={styles.logDetailRow}>
                          <Text style={styles.logDetailLabel}>Acted By:</Text>
                          <Text style={styles.logDetailValue}>{log.acted_by_name || 'N/A'}</Text>
                        </View>
                        <View style={styles.logDetailRow}>
                          <Text style={styles.logDetailLabel}>Action At:</Text>
                          <Text style={styles.logDetailValue}>
                            {log.Action_at 
                              ? new Date(log.Action_at).toLocaleString() 
                              : 'N/A'}
                          </Text>
                        </View>
                        <View style={styles.logDetailRow}>
                          <Text style={styles.logDetailLabel}></Text>
                          <Text style={[styles.logDetailValue, styles.clickableHint, styles.arrowIcon]}>→</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>

          {/* Erection Receiving Log Section */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Erection Receiving Log</Text>
            </View>
            <View style={styles.logsContainer}>
              {loadingReceivingLogs ? (
                <View style={styles.chartLoadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading receiving logs...</Text>
                </View>
              ) : erectionReceivingLogs.length === 0 ? (
                <View style={styles.chartLoadingContainer}>
                  <Text style={styles.noDataText}>No receiving logs available</Text>
                </View>
              ) : (
                <ScrollView 
                  style={styles.logsScrollView}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {erectionReceivingLogs.map((order) => (
                    <TouchableOpacity
                      key={order.id}
                      style={styles.logCard}
                      onPress={() => {
                        setSelectedOrder(order);
                        setOrderDetailModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.logCardHeader}>
                        <Text style={styles.logElementName}>
                          {order.dispatch_order_id || 'N/A'}
                        </Text>
                        <View style={[
                          styles.statusBadge,
                          order.current_status === 'Accepted' && styles.statusBadgeApproved,
                          order.current_status === 'Pending' && styles.statusBadgePending,
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            order.current_status === 'Accepted' && styles.statusBadgeTextApproved,
                            order.current_status === 'Pending' && styles.statusBadgeTextPending,
                          ]}>
                            {order.current_status || 'N/A'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.logDetails}>
                        <View style={styles.logDetailRow}>
                          <Text style={styles.logDetailLabel}>Project:</Text>
                          <Text style={styles.logDetailValue}>{order.project_name || 'N/A'}</Text>
                        </View>
                        <View style={styles.logDetailRow}>
                          <Text style={styles.logDetailLabel}>Dispatch Date:</Text>
                          <Text style={styles.logDetailValue}>
                            {order.dispatch_date 
                              ? new Date(order.dispatch_date).toLocaleString() 
                              : 'N/A'}
                          </Text>
                        </View>
                        <View style={styles.logDetailRow}>
                          <Text style={styles.logDetailLabel}>Driver Name:</Text>
                          <Text style={styles.logDetailValue}>{order.driver_name || 'N/A'}</Text>
                        </View>
                        {order.items && order.items.length > 0 && (
                          <View style={styles.logDetailRow}>
                            <Text style={styles.logDetailLabel}>Items ({order.items.length}):</Text>
                            <Text style={[styles.logDetailValue, styles.clickableHint, styles.arrowIcon]}>→</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>

          {/* Erection Elements Section */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Erection Elements</Text>
            </View>
            <View style={styles.elementsContainer}>
              {loadingElements ? (
                <View style={styles.chartLoadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading elements...</Text>
                </View>
              ) : erectionElements.length === 0 ? (
                <View style={styles.chartLoadingContainer}>
                  <Text style={styles.noDataText}>No elements available</Text>
                </View>
              ) : (
                <ScrollView 
                  style={styles.elementsScrollView}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {erectionElements.map((element) => (
                    <TouchableOpacity
                      key={element.id}
                      style={styles.elementCard}
                      onPress={() => {
                        setSelectedElement(element);
                        setElementDetailModalVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.elementCardHeader}>
                        <Text style={styles.elementName}>
                          {element.element_type_name || 'N/A'} - {element.tower_name || 'N/A'}
                        </Text>
                        <View style={[
                          styles.erectedBadge,
                          element.erected && styles.erectedBadgeActive
                        ]}>
                          <Text style={[
                            styles.erectedBadgeText,
                            element.erected && styles.erectedBadgeTextActive
                          ]}>
                            {element.erected ? 'Erected' : 'Not Erected'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.elementDetails}>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Element Type:</Text>
                          <Text style={styles.elementDetailValue}>{element.element_type || 'N/A'}</Text>
                        </View>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Floor:</Text>
                          <Text style={styles.elementDetailValue}>{element.floor_name || 'N/A'}</Text>
                        </View>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Approved Status:</Text>
                          <Text style={styles.elementDetailValue}>
                            {element.approved_status ? 'Approved' : 'Not Approved'}
                          </Text>
                        </View>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}></Text>
                          <Text style={[styles.elementDetailValue, styles.clickableHint, styles.arrowIcon]}>→</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
            </>
          )}
        </ScrollView>

        {/* Order Detail Modal */}
        <Modal
          visible={orderDetailModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setOrderDetailModalVisible(false);
            setSelectedOrder(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Dispatch Order Details</Text>
                <TouchableOpacity
                  onPress={() => {
                    setOrderDetailModalVisible(false);
                    setSelectedOrder(null);
                  }}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={true}>
                {selectedOrder && (
                  <>
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Order Information</Text>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Order ID:</Text>
                        <Text style={styles.modalDetailValue}>{selectedOrder.dispatch_order_id || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Project:</Text>
                        <Text style={styles.modalDetailValue}>{selectedOrder.project_name || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Status:</Text>
                        <View style={[
                          styles.statusBadge,
                          selectedOrder.current_status === 'Accepted' && styles.statusBadgeApproved,
                          selectedOrder.current_status === 'Pending' && styles.statusBadgePending,
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            selectedOrder.current_status === 'Accepted' && styles.statusBadgeTextApproved,
                            selectedOrder.current_status === 'Pending' && styles.statusBadgeTextPending,
                          ]}>
                            {selectedOrder.current_status || 'N/A'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Dispatch Date:</Text>
                        <Text style={styles.modalDetailValue}>
                          {selectedOrder.dispatch_date 
                            ? new Date(selectedOrder.dispatch_date).toLocaleString() 
                            : 'N/A'}
                        </Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Driver Name:</Text>
                        <Text style={styles.modalDetailValue}>{selectedOrder.driver_name || 'N/A'}</Text>
                      </View>
                      {selectedOrder.vehicle_id && (
                        <View style={styles.modalDetailRow}>
                          <Text style={styles.modalDetailLabel}>Vehicle ID:</Text>
                          <Text style={styles.modalDetailValue}>{selectedOrder.vehicle_id}</Text>
                        </View>
                      )}
                    </View>

                    {selectedOrder.items && selectedOrder.items.length > 0 && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>Items ({selectedOrder.items.length})</Text>
                        {selectedOrder.items.map((item, index) => (
                          <View key={index} style={styles.modalItemCard}>
                            <View style={styles.modalItemHeader}>
                              <Text style={styles.modalItemNumber}>Item {index + 1}</Text>
                            </View>
                            <View style={styles.modalItemDetails}>
                              <View style={styles.modalDetailRow}>
                                <Text style={styles.modalDetailLabel}>Element Type Name:</Text>
                                <Text style={styles.modalDetailValue}>{item.element_type_name || 'N/A'}</Text>
                              </View>
                              <View style={styles.modalDetailRow}>
                                <Text style={styles.modalDetailLabel}>Element Type:</Text>
                                <Text style={styles.modalDetailValue}>{item.element_type || 'N/A'}</Text>
                              </View>
                              <View style={styles.modalDetailRow}>
                                <Text style={styles.modalDetailLabel}>Element ID:</Text>
                                <Text style={styles.modalDetailValue}>{item.element_id || 'N/A'}</Text>
                              </View>
                              {item.weight && (
                                <View style={styles.modalDetailRow}>
                                  <Text style={styles.modalDetailLabel}>Weight:</Text>
                                  <Text style={styles.modalDetailValue}>{item.weight.toFixed(2)} kg</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Erection Request Log Detail Modal */}
        <Modal
          visible={logDetailModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setLogDetailModalVisible(false);
            setSelectedLog(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Erection Request Log Details</Text>
                <TouchableOpacity
                  onPress={() => {
                    setLogDetailModalVisible(false);
                    setSelectedLog(null);
                  }}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={true}>
                {selectedLog && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Log Information</Text>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>ID:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.id || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Stock Erected ID:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.stock_erected_id || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Element ID:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.element_id || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Element Type Name:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.element_type_name || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Element Type ID:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.element_type_id || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Tower Name:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.tower_name || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Floor Name:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.floor_name || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Status:</Text>
                      <View style={[
                        styles.statusBadge,
                        selectedLog.status === 'Erected' && styles.statusBadgeErected,
                        selectedLog.status === 'Approved' && styles.statusBadgeApproved,
                        selectedLog.status === 'Received' && styles.statusBadgeReceived,
                        selectedLog.status === 'Pending' && styles.statusBadgePending,
                      ]}>
                        <Text style={[
                          styles.statusBadgeText,
                          selectedLog.status === 'Erected' && styles.statusBadgeTextErected,
                          selectedLog.status === 'Approved' && styles.statusBadgeTextApproved,
                          selectedLog.status === 'Received' && styles.statusBadgeTextReceived,
                          selectedLog.status === 'Pending' && styles.statusBadgeTextPending,
                        ]}>
                          {selectedLog.status || 'N/A'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Acted By:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.acted_by_name || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Acted By ID:</Text>
                      <Text style={styles.modalDetailValue}>{selectedLog.acted_by || 'N/A'}</Text>
                    </View>
                    <View style={styles.modalDetailRow}>
                      <Text style={styles.modalDetailLabel}>Action At:</Text>
                      <Text style={styles.modalDetailValue}>
                        {selectedLog.Action_at 
                          ? new Date(selectedLog.Action_at).toLocaleString() 
                          : 'N/A'}
                      </Text>
                    </View>
                    {selectedLog.comments && (
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Comments:</Text>
                        <Text style={styles.modalDetailValue}>{selectedLog.comments}</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Erection Element Detail Modal */}
        <Modal
          visible={elementDetailModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setElementDetailModalVisible(false);
            setSelectedElement(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Erection Element Details</Text>
                <TouchableOpacity
                  onPress={() => {
                    setElementDetailModalVisible(false);
                    setSelectedElement(null);
                  }}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={true}>
                {selectedElement && (
                  <>
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Element Information</Text>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>ID:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.id || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Precast Stock ID:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.precast_stock_id || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Element ID:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.element_id || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Element Type:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.element_type || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Element Type Name:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.element_type_name || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Element Type ID:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.element_type_id || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Tower Name:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.tower_name || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Floor Name:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.floor_name || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Floor ID:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.floor_id || 'N/A'}</Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Project ID:</Text>
                        <Text style={styles.modalDetailValue}>{selectedElement.project_id || 'N/A'}</Text>
                      </View>
                    </View>

                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Status Information</Text>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Erected:</Text>
                        <View style={[
                          styles.erectedBadge,
                          selectedElement.erected && styles.erectedBadgeActive
                        ]}>
                          <Text style={[
                            styles.erectedBadgeText,
                            selectedElement.erected && styles.erectedBadgeTextActive
                          ]}>
                            {selectedElement.erected ? 'Yes' : 'No'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Approved Status:</Text>
                        <Text style={styles.modalDetailValue}>
                          {selectedElement.approved_status ? 'Approved' : 'Not Approved'}
                        </Text>
                      </View>
                      <View style={styles.modalDetailRow}>
                        <Text style={styles.modalDetailLabel}>Disable:</Text>
                        <Text style={styles.modalDetailValue}>
                          {selectedElement.deceble ? 'Yes' : 'No'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Date Information</Text>
                      {selectedElement.order_at && (
                        <View style={styles.modalDetailRow}>
                          <Text style={styles.modalDetailLabel}>Order At:</Text>
                          <Text style={styles.modalDetailValue}>
                            {selectedElement.order_at !== '0000-01-01T00:00:00Z' && selectedElement.order_at !== '0000-01-01T09:17:48.505298Z'
                              ? new Date(selectedElement.order_at).toLocaleString()
                              : 'N/A'}
                          </Text>
                        </View>
                      )}
                      {selectedElement.action_approve_reject && (
                        <View style={styles.modalDetailRow}>
                          <Text style={styles.modalDetailLabel}>Action Approve/Reject Date:</Text>
                          <Text style={styles.modalDetailValue}>
                            {new Date(selectedElement.action_approve_reject).toLocaleString()}
                          </Text>
                        </View>
                      )}
                    </View>

                    {selectedElement.comments && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>Comments</Text>
                        <View style={styles.modalDetailRow}>
                          <Text style={styles.modalDetailValue}>{selectedElement.comments}</Text>
                        </View>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Receive Dispatch Modal */}
        <Modal
          visible={receiveModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setReceiveModalVisible(false);
            setReceiveComments('');
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.receiveModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Mark as Received</Text>
                <TouchableOpacity
                  onPress={() => {
                    setReceiveModalVisible(false);
                    setReceiveComments('');
                  }}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={true}>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>
                    {selectedDispatchItems.length === 1
                      ? `Mark item as received`
                      : `Mark ${selectedDispatchItems.length} items as received`}
                  </Text>
                  
                  <View style={styles.commentsInputContainer}>
                    <Text style={styles.commentsLabel}>Comments *</Text>
                    <TextInput
                      style={styles.commentsInput}
                      placeholder="Enter comments for receiving items..."
                      placeholderTextColor={Colors.textSecondary}
                      multiline
                      numberOfLines={4}
                      value={receiveComments}
                      onChangeText={setReceiveComments}
                      textAlignVertical="top"
                    />
                  </View>

                  <View style={styles.selectedItemsList}>
                    <Text style={styles.selectedItemsListTitle}>Selected Items:</Text>
                    {selectedDispatchItems.map((item, index) => (
                      <View key={index} style={styles.selectedItemRow}>
                        <Text style={styles.selectedItemText}>
                          {item.element_type_name || 'N/A'} (ID: {item.element_id || 'N/A'})
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setReceiveModalVisible(false);
                    setReceiveComments('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSubmitButton,
                    (!receiveComments.trim() || submittingReceive) && styles.modalSubmitButtonDisabled
                  ]}
                  onPress={handleMarkAsReceived}
                  disabled={!receiveComments.trim() || submittingReceive}
                  activeOpacity={0.7}
                >
                  {submittingReceive ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSubmitButtonText}>Mark as Received</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Mark Erected Modal */}
        <Modal
          visible={erectModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setErectModalVisible(false);
            setErectComments('');
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.receiveModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Mark as Erected</Text>
                <TouchableOpacity
                  onPress={() => {
                    setErectModalVisible(false);
                    setErectComments('');
                  }}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={true}>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>
                    {selectedErectElements.length === 1
                      ? `Erect element ID: ${selectedErectElements[0].element_id}`
                      : `Erect ${selectedErectElements.length} selected elements`}
                  </Text>
                  
                  <View style={styles.commentsInputContainer}>
                    <Text style={styles.commentsLabel}>Comments *</Text>
                    <TextInput
                      style={styles.commentsInput}
                      placeholder="Enter comments for erecting elements..."
                      placeholderTextColor={Colors.textSecondary}
                      multiline
                      numberOfLines={4}
                      value={erectComments}
                      onChangeText={setErectComments}
                      textAlignVertical="top"
                    />
                  </View>

                  <View style={styles.selectedItemsList}>
                    <Text style={styles.selectedItemsListTitle}>Selected Elements:</Text>
                    {selectedErectElements.map((element, index) => (
                      <View key={index} style={styles.selectedItemRow}>
                        <Text style={styles.selectedItemText}>
                          Element ID: {element.element_id || 'N/A'} - {element.element_type_name || 'N/A'} ({element.element_type || 'N/A'})
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setErectModalVisible(false);
                    setErectComments('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSubmitButton,
                    (!erectComments.trim() || submittingErect) && styles.modalSubmitButtonDisabled
                  ]}
                  onPress={handleMarkAsErected}
                  disabled={!erectComments.trim() || submittingErect}
                  activeOpacity={0.7}
                >
                  {submittingErect ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSubmitButtonText}>Mark as Erected</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* QR Scanner for Marking Erected */}
        <CameraQRScanner
          visible={qrScannerVisible}
          onClose={() => setQrScannerVisible(false)}
          onScan={handleQRScan}
          navigation={navigation}
          autoProcess={true}
        />

        {!hideBottomNav && (
          <BottomNavigation
            activeTab={activeTab}
            onTabPress={handleTabPress}
          />
        )}
      </View>
    );
  }

  if (!paperData) {
    return (
      <View style={styles.container}>
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No questions available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadQuestions}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        </View>
        {/* Bottom Navigation */}
        {!hideBottomNav && (
          <BottomNavigation
            activeTab={activeTab}
            onTabPress={handleTabPress}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Create Request Section */}
        <View style={styles.createRequestSection}>
          <View style={styles.createRequestHeader}>
            <Text style={styles.createRequestTitle}>Create Request</Text>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowCreateRequest(!showCreateRequest)}
              activeOpacity={0.7}
            >
              <Text style={styles.toggleButtonText}>
                {showCreateRequest ? 'Hide' : 'Show'}
              </Text>
            </TouchableOpacity>
          </View>

          {showCreateRequest && (
            <View style={styles.createRequestContent}>
              <TowerFloorEditor
                projectId={projectId}
                onSave={handleSaveErectionRequest}
              />
            </View>
          )}
        </View>

        {/* Questions List */}
        {paperData.questions && paperData.questions.length > 0 ? (
          paperData.questions.map((question, index) => {
            const questionPhotosList = questionPhotos[question.id] || [];
            const questionComment = questionComments[question.id] || '';
            
            return (
              <View key={question.id} style={styles.questionCard}>
                <View style={styles.questionHeader}>
                  <View style={styles.questionNumberBadge}>
                    <Text style={styles.questionNumber}>Q{index + 1}</Text>
                  </View>
                  <Text style={styles.questionText}>{question.question_text}</Text>
                </View>

                {/* Options */}
                <View style={styles.optionsContainer}>
                  {question.options && question.options.length > 0 ? (
                    <View style={styles.optionsRow}>
                      {question.options.map((option) => {
                        const isSelected = selectedOptions[question.id] === option.id;
                        return (
                          <TouchableOpacity
                            key={option.id}
                            style={[
                              styles.optionButton,
                              isSelected && styles.optionButtonSelected,
                            ]}
                            onPress={() => handleOptionSelect(question.id, option.id)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.optionContent}>
                              <View style={[
                                styles.radioButton,
                                isSelected && styles.radioButtonSelected,
                              ]}>
                                {isSelected && <View style={styles.radioButtonInner} />}
                              </View>
                              <Text style={[
                                styles.optionText,
                                isSelected && styles.optionTextSelected,
                              ]} numberOfLines={2}>
                                {option.option_text}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.noOptionsText}>No options available</Text>
                  )}
                </View>

                {/* Comment Section for this Question */}
                <View style={styles.questionCommentSection}>
                  <Text style={styles.questionSectionTitle}>Add Comment</Text>
                  <TextInput
                    style={styles.questionCommentInput}
                    placeholder="Add your comment here (optional)..."
                    placeholderTextColor={BWTheme.textSecondary}
                    multiline
                    numberOfLines={3}
                    value={questionComment}
                    onChangeText={(text) => {
                      setQuestionComments({
                        ...questionComments,
                        [question.id]: text,
                      });
                    }}
                    textAlignVertical="top"
                  />
                </View>

                {/* Photo Upload Section for this Question */}
                <View style={styles.questionPhotoSection}>
                  <Text style={styles.questionSectionTitle}>Add Photo</Text>
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={() => handleTakePhoto(question.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.uploadButtonText}>Take Photo</Text>
                  </TouchableOpacity>

                  {/* Display Selected Photos for this Question */}
                  {questionPhotosList.length > 0 && (
                    <View style={styles.photosContainer}>
                      {questionPhotosList.map((photo, photoIndex) => (
                        <View key={photoIndex} style={styles.photoItem}>
                          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                          <TouchableOpacity
                            style={styles.removePhotoButton}
                            onPress={() => handleRemovePhoto(question.id, photoIndex)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.removePhotoText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No questions available</Text>
          </View>
        )}

        {/* Status Section */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionTitle}>Status</Text>
          <TouchableOpacity
            style={styles.statusDropdown}
            onPress={() => setStatusDropdownOpen(!statusDropdownOpen)}
            activeOpacity={0.7}
          >
            <Text style={[styles.statusDropdownText, !status && styles.statusPlaceholder]}>
              {status || 'Select a Status'}
            </Text>
            <Text style={[styles.dropdownArrow, statusDropdownOpen && styles.dropdownArrowOpen]}>
              ▼
            </Text>
          </TouchableOpacity>

          {/* Status Dropdown List - Inline */}
          {statusDropdownOpen && (
            <View style={styles.statusDropdownList}>
              {statusOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.statusOption,
                    status === option && styles.statusOptionSelected,
                  ]}
                  onPress={() => {
                    setStatus(option);
                    setStatusDropdownOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      status === option && styles.statusOptionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Submit Button */}
        {paperData.questions && paperData.questions.length > 0 && (
          <TouchableOpacity
            style={[
              styles.submitButton,
              submitting && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Answers</Text>
            )}
          </TouchableOpacity>
        )}

       
        
      </ScrollView>

      {/* Bird's Eye View Modal */}
      <BirdsEyeViewModal
        visible={!!birdsEyeViewVisible}
        onClose={() => setBirdsEyeViewVisible(false)}
        projectId={projectId || null}
      />

      {/* Bottom Navigation */}
      {!hideBottomNav && (
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />
      )}
    </View>
  );
};

// White Background and Black Font Theme
const BWTheme = {
  background: '#FFFFFF',
  card: '#FAFAFA',
  surface: '#F5F5F5',
  textPrimary: '#000000',
  textSecondary: '#4A4A4A',
  textTertiary: '#808080',
  border: '#E0E0E0',
  borderLight: '#D0D0D0',
  divider: '#E0E0E0',
  accent: '#000000',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BWTheme.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BWTheme.background,
    padding: 60,
  },
  loadingText: {
    marginTop: 20,
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  errorText: {
    fontSize: FontSizes.regular,
    color: '#FF3B30',
    marginBottom: 16,
    fontWeight: FontWeights.medium,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  paperHeader: {
    backgroundColor: BWTheme.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  paperHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paperHeaderText: {
    flex: 1,
  },
  paperTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  paperSubtitle: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
  },
  birdsEyeViewButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  birdsEyeViewIcon: {
    width: 20,
    height: 20,
    tintColor: '#007AFF',
  },
  questionCard: {
    backgroundColor: BWTheme.card,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  questionHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  questionNumberBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  questionNumber: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: '#FFFFFF',
  },
  questionText: {
    flex: 1,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textPrimary,
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  questionCommentSection: {
    marginTop: 6,
    marginBottom: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  questionSectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  questionCommentInput: {
    backgroundColor: BWTheme.background,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    padding: 8,
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  questionPhotoSection: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  photoItem: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 8,
  },
  photoPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  removePhotoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: FontWeights.bold,
  },
  optionsContainer: {
    marginTop: 4,
    marginBottom: 6,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    minWidth: '48%',
    padding: 8,
    borderRadius: 8,
    backgroundColor: BWTheme.background,
    borderWidth: 1.5,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  optionButtonSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: BWTheme.border,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: '#007AFF',
  },
  radioButtonInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  optionText: {
    flex: 1,
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  optionTextSelected: {
    color: '#007AFF',
    fontWeight: FontWeights.semiBold,
  },
  noOptionsText: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 12,
  },
  statusSection: {
    backgroundColor: BWTheme.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statusDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BWTheme.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
  },
  statusDropdownText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    flex: 1,
    fontWeight: FontWeights.regular,
  },
  statusPlaceholder: {
    color: BWTheme.textSecondary,
  },
  dropdownArrow: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    marginLeft: 8,
    transform: [{ rotate: '0deg' }],
  },
  dropdownArrowOpen: {
    transform: [{ rotate: '180deg' }],
  },
  statusDropdownList: {
    backgroundColor: BWTheme.background,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  statusOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  statusOptionSelected: {
    backgroundColor: BWTheme.card,
  },
  statusOptionText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.regular,
  },
  statusOptionTextSelected: {
    color: '#007AFF',
    fontWeight: FontWeights.semiBold,
  },
  paperFooter: {
    backgroundColor: BWTheme.card,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  footerText: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
  // Dashboard styles
  dashboardContent: {
    padding: 12,
    paddingBottom: 100,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
  },
  dashboardTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: '#8B5CF6',
    textTransform: 'capitalize',
  },
  projectDropdownWrapper: {
    marginBottom: 12,
  },
  dateFilterWrapper: {
    marginBottom: 12,
  },
  chartCard: {
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  chartHeader: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
  },
  chartContainer: {
    width: '100%',
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartLoadingContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textSecondary,
    textAlign: 'center',
  },
  logsContainer: {
    width: '100%',
    maxHeight: 400,
  },
  logsScrollView: {
    maxHeight: 400,
  },
  logCard: {
    backgroundColor: BWTheme.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  logCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logElementName: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  statusBadgeErected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  statusBadgeApproved: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  statusBadgeReceived: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  statusBadgePending: {
    backgroundColor: '#FCE4EC',
    borderColor: '#E91E63',
  },
  statusBadgeText: {
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textSecondary,
  },
  statusBadgeTextErected: {
    color: '#4CAF50',
  },
  statusBadgeTextApproved: {
    color: '#2196F3',
  },
  statusBadgeTextReceived: {
    color: '#FF9800',
  },
  statusBadgeTextPending: {
    color: '#E91E63',
  },
  logDetails: {
    gap: 8,
  },
  logDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  logDetailLabel: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    color: BWTheme.textSecondary,
    flex: 1,
  },
  logDetailValue: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.regular,
    color: BWTheme.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  itemsContainer: {
    flex: 1,
    marginTop: 4,
  },
  itemRow: {
    paddingVertical: 4,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: BWTheme.border,
    marginBottom: 4,
  },
  itemText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.regular,
    color: BWTheme.textPrimary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: BWTheme.background,
    borderRadius: 16,
    width: '100%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  modalTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BWTheme.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 20,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.bold,
  },
  modalScrollView: {
    maxHeight: '80%',
  },
  modalSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  modalSectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 16,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingVertical: 4,
  },
  modalDetailLabel: {
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.medium,
    color: BWTheme.textSecondary,
    flex: 1,
  },
  modalDetailValue: {
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.regular,
    color: BWTheme.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  modalItemCard: {
    backgroundColor: BWTheme.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  modalItemHeader: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  modalItemNumber: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
  },
  modalItemDetails: {
    gap: 8,
  },
  clickableHint: {
    color: '#007AFF',
    fontStyle: 'italic',
  },
  arrowIcon: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: '#007AFF',
    transform: [{ rotate: '0deg' }],
    textDecorationLine: 'none',
  },
  arrowIconExpanded: {
    transform: [{ rotate: '90deg' }],
    color: '#007AFF',
  },
  operationButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  operationButton: {
    flex: 1,
    backgroundColor: BWTheme.card,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1.5,
    borderColor: BWTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  operationButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  operationButtonText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textPrimary,
    textAlign: 'center',
  },
  operationButtonTextActive: {
    color: '#FFFFFF',
  },
  createRequestSection: {
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  createRequestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  createRequestTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: '#8B5CF6',
    textTransform: 'capitalize',
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  toggleButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
  },
  createRequestContent: {
    marginTop: 12,
  },
  taskSectionContainer: {
    flex: 1,
  },
  receiveDispatchSection: {
    marginTop: 24,
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  receiveDispatchHeader: {
    marginBottom: 16,
  },
  receiveDispatchTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: '#8B5CF6',
    textTransform: 'capitalize',
  },
  dispatchOrdersContainer: {
    // Removed maxHeight to allow full scrolling in parent ScrollView
  },
  dispatchOrderCard: {
    backgroundColor: BWTheme.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dispatchOrderCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F7FF',
    borderWidth: 2,
  },
  dispatchOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dispatchOrderCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  dispatchOrderHeaderLeft: {
    flex: 1,
  },
  expandButton: {
    padding: 12,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 48,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  dispatchOrderId: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  dispatchOrderDate: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
  },
  dispatchStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  dispatchStatusBadgeAccepted: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  dispatchStatusBadgePending: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  dispatchStatusBadgeText: {
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textSecondary,
  },
  dispatchStatusBadgeTextAccepted: {
    color: '#4CAF50',
  },
  dispatchStatusBadgeTextPending: {
    color: '#FF9800',
  },
  dispatchOrderDetails: {
    marginBottom: 12,
    gap: 6,
  },
  dispatchDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dispatchDetailLabel: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  dispatchDetailValue: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.regular,
  },
  dispatchItemsContainer: {
    marginTop: 8,
  },
  dispatchItemsTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 8,
  },
  dispatchItemCard: {
    flexDirection: 'row',
    backgroundColor: BWTheme.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BWTheme.border,
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: BWTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BWTheme.background,
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
  },
  dispatchItemDetails: {
    flex: 1,
  },
  dispatchItemName: {
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  dispatchItemInfo: {
    fontSize: FontSizes.extraSmall,
    color: BWTheme.textSecondary,
    marginBottom: 2,
  },
  receiveActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: BWTheme.border,
    marginTop: 12,
  },
  selectedItemsCount: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  receiveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#34C759',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiveButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  markErectedSection: {
    marginTop: 24,
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  markErectedHeader: {
    marginBottom: 16,
  },
  markErectedTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: '#10B981',
    textTransform: 'capitalize',
  },
  erectElementsContainer: {
    // Removed maxHeight to allow full scrolling in parent ScrollView
  },
  erectElementCard: {
    flexDirection: 'row',
    backgroundColor: BWTheme.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    alignItems: 'flex-start',
  },
  erectElementCardSelected: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  erectElementCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  erectElementDetails: {
    flex: 1,
  },
  erectElementName: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 6,
  },
  erectElementInfo: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    marginBottom: 4,
  },
  erectElementStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  approvedText: {
    color: '#4CAF50',
    fontWeight: FontWeights.semiBold,
  },
  pendingText: {
    color: '#FF9800',
    fontWeight: FontWeights.semiBold,
  },
  erectActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: BWTheme.border,
    marginTop: 12,
  },
  erectButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#10B981',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  erectButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  receiveModalContent: {
    backgroundColor: BWTheme.background,
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  commentsInputContainer: {
    marginTop: 16,
  },
  commentsLabel: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    color: BWTheme.textSecondary,
    marginBottom: 8,
  },
  commentsInput: {
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    padding: 12,
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    backgroundColor: BWTheme.surface,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  selectedItemsList: {
    marginTop: 16,
    padding: 12,
    backgroundColor: BWTheme.surface,
    borderRadius: 8,
  },
  selectedItemsListTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 8,
  },
  selectedItemRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  selectedItemText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BWTheme.border,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: BWTheme.surface,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  modalCancelButtonText: {
    color: BWTheme.textPrimary,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.medium,
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#34C759',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitButtonDisabled: {
    opacity: 0.6,
  },
  modalSubmitButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  elementsContainer: {
    width: '100%',
    maxHeight: 400,
  },
  elementsScrollView: {
    maxHeight: 400,
  },
  elementCard: {
    backgroundColor: BWTheme.background,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  elementCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  elementName: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  erectedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  erectedBadgeActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  erectedBadgeText: {
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textSecondary,
  },
  erectedBadgeTextActive: {
    color: '#4CAF50',
  },
  elementDetails: {
    gap: 8,
  },
  elementDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  elementDetailLabel: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    color: BWTheme.textSecondary,
    flex: 1,
  },
  elementDetailValue: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.regular,
    color: BWTheme.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
});

export default ErectionManagerScreen;

