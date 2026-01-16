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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const DispatchManagerScreen = ({ route, navigation, hideBottomNav = false }) => {
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
  const [dispatchOrders, setDispatchOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState({});
  const [selectedProject, setSelectedProject] = useState('Select Project');
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || null);
  const [showDispatchTask, setShowDispatchTask] = useState(false);
  const [dispatchItems, setDispatchItems] = useState([]);
  const [loadingDispatchItems, setLoadingDispatchItems] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [transporters, setTransporters] = useState([]);
  const [loadingTransporters, setLoadingTransporters] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [vehicleCapacity, setVehicleCapacity] = useState(0);
  const [vehicleDetails, setVehicleDetails] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [driverName, setDriverName] = useState('');
  const [driverPhoneNo, setDriverPhoneNo] = useState('');
  const [emergencyContactPhoneNo, setEmergencyContactPhoneNo] = useState('');
  const [sendingDispatch, setSendingDispatch] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);
  const [createVehicleVisible, setCreateVehicleVisible] = useState(false);
  const [newVehicleNumber, setNewVehicleNumber] = useState('');
  const [newTransporterId, setNewTransporterId] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newTruckType, setNewTruckType] = useState('flatbed');
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newEmergencyPhone, setNewEmergencyPhone] = useState('');
  
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

  useEffect(() => {
    if (paperId) {
    loadQuestions();
    requestPermissions();
    } else {
      setLoading(false);
      setPaperData(null);
    }
  }, [paperId]);

  useEffect(() => {
    if (route?.params?.openTask) {
      setActiveTab('task');
      setShowDispatchTask(true);
    }
  }, [route?.params?.openTask]);

  useEffect(() => {
    if (projectId && !selectedProjectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId, selectedProjectId]);

  useEffect(() => {
    if (!paperId && selectedProjectId) {
      loadDispatchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, selectedProjectId]);

  useEffect(() => {
    if (!paperId && showDispatchTask && selectedProjectId) {
      loadDispatchItems();
      loadVehicles();
      loadTransporters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, showDispatchTask, selectedProjectId]);

  const handleProjectSelect = (project) => {
    const projectName = typeof project === 'string' ? project : (project?.name || 'Select Project');
    const projectIdValue = project?.project_id === 'all' || project?.project_id === null ? null : project?.project_id;
    setSelectedProject(projectName);
    setSelectedProjectId(projectIdValue);
  };

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

  const fetchWithAuthRetry = async (url, options = {}) => {
    const { accessToken } = await getTokens();
    if (!accessToken) {
      throw new Error('Authentication Required');
    }

    // Validate session first
    let currentToken = accessToken;
    try {
      const sessionResult = await validateSession();
      if (sessionResult && sessionResult.session_id) {
        currentToken = sessionResult.session_id;
      }
    } catch (_) {
      // Continue with original token
    }

    const headersWithBearer = {
      ...createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true }),
      ...(options.headers || {}),
    };

    let response = await fetch(url, {
      ...options,
      headers: headersWithBearer,
    });

    if (response.status === 401) {
      const headersWithoutBearer = {
        ...createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
        ...(options.headers || {}),
      };
      response = await fetch(url, {
        ...options,
        headers: headersWithoutBearer,
      });
    }

    return response;
  };

  const loadDispatchOrders = async () => {
    const projectIdToUse = selectedProjectId || projectId;
    if (!projectIdToUse) {
      console.log('📱 [DispatchManagerScreen] No projectId available for dispatch orders');
      return;
    }

    try {
      setLoadingOrders(true);
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        console.log('📱 [DispatchManagerScreen] No access token for dispatch orders');
        return;
      }

      const apiUrl = `${API_BASE_URL}/api/dispatch_order/${projectIdToUse}`;
      console.log('📱 [DispatchManagerScreen] Fetching dispatch orders from:', apiUrl);

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [DispatchManagerScreen] Using validated session_id for dispatch orders');
        }
      } catch (validateError) {
        console.log('⚠️ [DispatchManagerScreen] Session validation failed, using original token');
      }

      // Try with Bearer token first
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [DispatchManagerScreen] Dispatch Orders API - Attempt 1: With Bearer token');
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });

      console.log('📱 [DispatchManagerScreen] Dispatch Orders API Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [DispatchManagerScreen] Dispatch Orders API returned 401 with Bearer, trying without...');
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        console.log('📱 [DispatchManagerScreen] Dispatch Orders API Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [DispatchManagerScreen] Dispatch orders loaded successfully');
        setDispatchOrders(Array.isArray(data) ? data : []);
      } else {
        const errorText = await response.text();
        console.log('❌ [DispatchManagerScreen] Error loading dispatch orders');
        console.log('📱 [DispatchManagerScreen] Error status:', response.status);
        console.log('📱 [DispatchManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [DispatchManagerScreen] Dispatch Orders API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                  }
                } catch (validateError) {
                  console.log('⚠️ [DispatchManagerScreen] New session validation failed');
                }
                
                console.log('🔄 [DispatchManagerScreen] Retrying dispatch orders API with refreshed token...');
                response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: createAuthHeaders(newToken, { useBearer: true, includeSessionId: true }),
                });
                
                if (response.status === 401) {
                  response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: createAuthHeaders(newToken, { useBearer: false, includeSessionId: true }),
                  });
                }
                
                if (response.ok) {
                  const data = await response.json();
                  console.log('✅ [DispatchManagerScreen] Dispatch orders retry successful!');
                  setDispatchOrders(Array.isArray(data) ? data : []);
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [DispatchManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to fetch dispatch orders. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error fetching dispatch orders:', error);
      await handleApiError(error, navigation, 'Network error fetching dispatch orders.');
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadDispatchItems = async () => {
    if (!selectedProjectId) return;
    setLoadingDispatchItems(true);
    try {
      const url = `${API_BASE_URL}/api/stock-summary/approved-erected/${selectedProjectId}`;
      const response = await fetchWithAuthRetry(url, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setDispatchItems(data);
        } else if (Array.isArray(data?.data)) {
          setDispatchItems(data.data);
        } else {
          setDispatchItems([]);
        }
      } else {
        setDispatchItems([]);
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error loading dispatch items:', error);
      setDispatchItems([]);
    } finally {
      setLoadingDispatchItems(false);
    }
  };

  const loadVehicles = async () => {
    setLoadingVehicles(true);
    try {
      const url = `${API_BASE_URL}/api/vehicles`;
      const response = await fetchWithAuthRetry(url, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setVehicles(data);
        } else if (Array.isArray(data?.data)) {
          setVehicles(data.data);
        } else {
          setVehicles([]);
        }
      } else {
        setVehicles([]);
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error loading vehicles:', error);
      setVehicles([]);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const loadTransporters = async () => {
    setLoadingTransporters(true);
    try {
      const url = `${API_BASE_URL}/api/transporters`;
      const response = await fetchWithAuthRetry(url, { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setTransporters(data);
        } else if (Array.isArray(data?.data)) {
          setTransporters(data.data);
        } else {
          setTransporters([]);
        }
      } else {
        setTransporters([]);
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error loading transporters:', error);
      setTransporters([]);
    } finally {
      setLoadingTransporters(false);
    }
  };

  const handleSelectVehicle = (vehicle) => {
    setSelectedVehicleId(vehicle?.id || null);
    setVehicleCapacity(Number(vehicle?.capacity || 0));
    setVehicleDetails(vehicle || null);
    setSelectedItems({});
    setTaskError('');
    setDriverName(vehicle?.driver_name || '');
    setDriverPhoneNo(vehicle?.driver_contact_no || vehicle?.driver_phone_no || '');
    setEmergencyContactPhoneNo(vehicle?.emergency_contact_phone_no || '');
    setVehicleModalVisible(false);
  };

  const toggleDispatchItem = (elementId) => {
    setSelectedItems((prev) => ({
      ...prev,
      [elementId]: !prev[elementId],
    }));
  };

  const calculateSelectedCapacity = () => {
    return dispatchItems.reduce((total, item) => {
      const id = item.element_table_id || item.element_id;
      if (!id) return total;
      if (selectedItems[id]) {
        return total + (Number(item.weight) || 0);
      }
      return total;
    }, 0);
  };

  const calculateLeftCapacity = () => {
    return Number((Number(vehicleCapacity) - calculateSelectedCapacity()).toFixed(2));
  };

  const handleCreateVehicle = async () => {
    if (!newVehicleNumber || !newTransporterId || !newCapacity) {
      Alert.alert('Error', 'Please fill required vehicle details.');
      return;
    }

    try {
      const url = `${API_BASE_URL}/vehicles`;
      const payload = {
        vehicle_number: newVehicleNumber,
        transporter_id: Number(newTransporterId),
        capacity: Number(newCapacity),
        truck_type: newTruckType,
        driver_name: newDriverName,
        driver_phone_no: newDriverPhone,
        emergency_contact_phone_no: newEmergencyPhone,
      };

      const response = await fetchWithAuthRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        await loadVehicles();
        setCreateVehicleVisible(false);
        setNewVehicleNumber('');
        setNewTransporterId('');
        setNewCapacity('');
        setNewTruckType('flatbed');
        setNewDriverName('');
        setNewDriverPhone('');
        setNewEmergencyPhone('');
        if (data?.id) {
          handleSelectVehicle(data);
        }
      } else {
        Alert.alert('Error', 'Failed to create vehicle.');
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error creating vehicle:', error);
      Alert.alert('Error', 'Failed to create vehicle.');
    }
  };

  const handleSendDispatch = async () => {
    const selectedElementIds = Object.keys(selectedItems).filter((id) => selectedItems[id]);
    if (!selectedVehicleId) {
      setTaskError('Please select a vehicle');
      return;
    }
    if (selectedElementIds.length === 0) {
      setTaskError('Please select at least one item');
      return;
    }
    if (!driverName || driverName.trim().length < 2) {
      setTaskError('Driver name must be at least 2 characters');
      return;
    }
    if (driverPhoneNo.length !== 10) {
      setTaskError('Driver phone number must be exactly 10 digits');
      return;
    }
    if (emergencyContactPhoneNo.length !== 10) {
      setTaskError('Emergency contact phone number must be exactly 10 digits');
      return;
    }

    setSendingDispatch(true);
    setTaskError('');
    try {
      const url = `${API_BASE_URL}/dispatch_order`;
      const payload = {
        vehicle_id: selectedVehicleId,
        project_id: Number(selectedProjectId),
        driver_name: driverName,
        driver_phone_no: driverPhoneNo,
        emergency_contact_phone_no: emergencyContactPhoneNo,
        items: selectedElementIds.map((id) => Number(id)),
        vehicle_details: vehicleDetails,
      };

      const response = await fetchWithAuthRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert('Success', 'Dispatch order sent successfully!');
        setSelectedItems({});
        setDriverName('');
        setDriverPhoneNo('');
        setEmergencyContactPhoneNo('');
        await loadDispatchItems();
      } else {
        Alert.alert('Error', 'Failed to send dispatch. Please try again.');
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error sending dispatch:', error);
      Alert.alert('Error', 'Failed to send dispatch. Please try again.');
    } finally {
      setSendingDispatch(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}-${month}-${year} ${hours}:${minutes}`;
    } catch (error) {
      return dateString;
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'dispatched':
        return '#34C759'; // Green
      case 'accepted':
        return '#007AFF'; // Blue
      case 'pending':
        return '#FF9500'; // Orange
      case 'rejected':
        return '#FF3B30'; // Red
      default:
        return BWTheme.textSecondary;
    }
  };

  const splitDispatchOrders = (orders) => {
    const dispatchList = [];
    const receiveList = [];
    (orders || []).forEach((order) => {
      const status = String(order?.current_status || '').toLowerCase();
      if (status === 'accepted') {
        receiveList.push(order);
      } else if (status === 'dispatched') {
        dispatchList.push(order);
      }
    });
    return { dispatchList, receiveList };
  };

  const toggleOrderItems = (orderId) => {
    setExpandedOrders((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  };

  const renderOrderList = (orders, emptyText) => {
    if (!orders || orders.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyText}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDispatchOrders}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return orders.map((order) => (
      <View key={order.id} style={styles.orderCard}>
        {/* Order Header */}
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderLeft}>
            <Text style={styles.orderId}>{order.dispatch_order_id}</Text>
            <Text style={styles.projectName}>{order.project_name}</Text>
          </View>
          <View style={styles.orderHeaderRight}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.current_status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(order.current_status) }]}>
                {order.current_status}
              </Text>
            </View>
            {order.items && order.items.length > 0 && (
              <TouchableOpacity
                style={styles.arrowButton}
                onPress={() => toggleOrderItems(order.id)}
                accessibilityRole="button"
                accessibilityLabel={expandedOrders[order.id] ? 'Hide items' : 'Show items'}
              >
                <Text style={styles.arrowText}>
                  {expandedOrders[order.id] ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Order Details */}
        <View style={styles.orderDetails}>
          <View style={styles.orderDetailRow}>
            <Text style={styles.orderDetailLabel}>Dispatch Date:</Text>
            <Text style={styles.orderDetailValue}>{formatDate(order.dispatch_date)}</Text>
          </View>
          <View style={styles.orderDetailRow}>
            <Text style={styles.orderDetailLabel}>Driver Name:</Text>
            <Text style={styles.orderDetailValue}>{order.driver_name}</Text>
          </View>
          <View style={styles.orderDetailRow}>
            <Text style={styles.orderDetailLabel}>Vehicle ID:</Text>
            <Text style={styles.orderDetailValue}>{order.vehicle_id}</Text>
          </View>
        </View>

        {/* Items Section */}
        {order.items && order.items.length > 0 && expandedOrders[order.id] && (
          <View style={styles.itemsSection}>
            <Text style={styles.itemsTitle}>Items ({order.items.length})</Text>
            {order.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemType}>{item.element_type_name || item.element_type}</Text>
                  <Text style={styles.itemId}>Element ID: {item.element_id}</Text>
                </View>
                {item.weight > 0 && (
                  <Text style={styles.itemWeight}>{item.weight} kg</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    ));
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

      const apiUrl = `${API_BASE_URL}/api/dispatch-manager/questions/${paperId}`;
      console.log('📱 [DispatchManagerScreen] Fetching questions from:', apiUrl);
      console.log('📱 [DispatchManagerScreen] Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

      // First, validate the session to ensure it exists in the database
      let currentToken = accessToken;
      try {
        console.log('📱 [DispatchManagerScreen] Validating session before Questions API call...');
        const sessionResult = await validateSession();
        console.log('📱 [DispatchManagerScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
          console.log('✅ [DispatchManagerScreen] Session validated, using session_id for Questions API');
          console.log('📱 [DispatchManagerScreen] Session_id (first 20 chars):', currentToken.substring(0, 20) + '...');
        } else {
          console.log('⚠️ [DispatchManagerScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [DispatchManagerScreen] Session validation failed, using original token:', validateError);
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [DispatchManagerScreen] Questions API - Attempt 1: With Bearer token');
      console.log('📱 [DispatchManagerScreen] Request headers:', JSON.stringify(headersWithBearer, null, 2));
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });

      console.log('📱 [DispatchManagerScreen] Questions API Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        console.log('❌ [DispatchManagerScreen] Questions API returned 401 with Bearer token');
        console.log('📱 [DispatchManagerScreen] Response body:', responseText1);
        console.log('📱 [DispatchManagerScreen] Questions API - Attempt 2: Without Bearer prefix...');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        console.log('📱 [DispatchManagerScreen] Request headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        
        console.log('📱 [DispatchManagerScreen] Questions API Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [DispatchManagerScreen] Questions API Success!');
        console.log('📱 [DispatchManagerScreen] Questions loaded successfully:', JSON.stringify(data, null, 2));
        setPaperData(data);
      } else {
        const errorText = await response.text();
        console.log('❌ [DispatchManagerScreen] Questions API Error');
        console.log('📱 [DispatchManagerScreen] Error status:', response.status);
        console.log('📱 [DispatchManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [DispatchManagerScreen] Questions API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [DispatchManagerScreen] Token refreshed successfully');
                
                // Validate the new session to get session_id
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [DispatchManagerScreen] New session validated, using session_id for retry');
                  }
                } catch (validateError) {
                  console.log('⚠️ [DispatchManagerScreen] New session validation failed, using access_token');
                }
                
                console.log('🔄 [DispatchManagerScreen] Retrying Questions API with refreshed token...');
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
                  console.log('✅ [DispatchManagerScreen] Questions API retry successful!');
                  setPaperData(data);
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [DispatchManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to fetch questions. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error fetching questions:', error);
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
      console.log('📱 [DispatchManagerScreen] Uploading photo to:', apiUrl);

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [DispatchManagerScreen] Using validated session_id for upload');
        }
      } catch (validateError) {
        console.log('⚠️ [DispatchManagerScreen] Session validation failed, using original token');
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
      console.log('📱 [DispatchManagerScreen] Upload - Attempt 1: With Bearer token');

      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: formData,
      });

      console.log('📱 [DispatchManagerScreen] Upload Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [DispatchManagerScreen] Upload returned 401 with Bearer, trying without...');
        const headersWithoutBearer = {
          ...createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
        };
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headersWithoutBearer,
          body: formData,
        });
        console.log('📱 [DispatchManagerScreen] Upload Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [DispatchManagerScreen] Photo uploaded successfully:', JSON.stringify(responseData, null, 2));
        
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
        console.log('❌ [DispatchManagerScreen] Error uploading photo');
        console.log('📱 [DispatchManagerScreen] Error status:', response.status);
        console.log('📱 [DispatchManagerScreen] Error response:', errorText);
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to upload photo. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error uploading photo:', error);
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
    
    // Dispatch Manager specific navigation - don't navigate to QA/QC screens
    if (tabId === 'home') {
      // Home tab: Navigate to DispatchManager screen (current screen)
      if (currentRoute !== 'DispatchManager') {
        navigation.navigate('DispatchManager');
      }
      setShowDispatchTask(false);
    } else if (tabId === 'task') {
      // Task tab: Show Dispatch Items section
      if (currentRoute !== 'DispatchManager') {
        navigation.navigate('DispatchManager', { openTask: true });
      } else {
        setShowDispatchTask(true);
      }
    } else if (tabId === 'me') {
      // Me tab: Navigate to UserProfile
      if (currentRoute !== 'UserProfile') {
        navigation.navigate('UserProfile');
      }
      setShowDispatchTask(false);
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

      const apiUrl = `${API_BASE_URL}/api/dispatch-manager/questions/answers`;
      console.log('📱 [DispatchManagerScreen] Submitting answers to:', apiUrl);
      console.log('📱 [DispatchManagerScreen] Submission data:', JSON.stringify(submissionData, null, 2));

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [DispatchManagerScreen] Using validated session_id for submission');
        }
      } catch (validateError) {
        console.log('⚠️ [DispatchManagerScreen] Session validation failed, using original token');
      }

      // Try with Bearer token first
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [DispatchManagerScreen] Submit - Attempt 1: With Bearer token');
      
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: JSON.stringify(submissionData),
      });

      console.log('📱 [DispatchManagerScreen] Submit Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [DispatchManagerScreen] Submit returned 401 with Bearer, trying without...');
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
          body: JSON.stringify(submissionData),
        });
        console.log('📱 [DispatchManagerScreen] Submit Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [DispatchManagerScreen] Answers submitted successfully:', JSON.stringify(responseData, null, 2));
        Alert.alert('Success', 'Your responses have been submitted successfully.', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('❌ [DispatchManagerScreen] Error submitting answers');
        console.log('📱 [DispatchManagerScreen] Error status:', response.status);
        console.log('📱 [DispatchManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [DispatchManagerScreen] Submit API 401 - attempting token refresh...');
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
                  console.log('⚠️ [DispatchManagerScreen] New session validation failed');
                }
                
                console.log('🔄 [DispatchManagerScreen] Retrying submit with refreshed token...');
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
                  console.log('✅ [DispatchManagerScreen] Submit retry successful!');
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
            console.log('❌ [DispatchManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to submit answers. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [DispatchManagerScreen] Error submitting answers:', error);
      await handleApiError(error, navigation, 'Network error submitting answers.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Dispatch Manager questions...</Text>
      </View>
    );
  }

  if (showDispatchTask) {
    const selectedCapacity = calculateSelectedCapacity();
    const leftCapacity = calculateLeftCapacity();
    return (
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.homeHeader}>
            <Text style={styles.homeTitle}>Dispatch Items</Text>
          {selectedProjectId ? (
            <Text style={styles.homeSubtitle}>Project ID: {selectedProjectId}</Text>
          ) : (
            <Text style={styles.homeSubtitle}>Select a project to dispatch items</Text>
          )}
          </View>

            <View style={styles.projectDropdownWrapper}>
              <ProjectDropdown
                selectedProject={selectedProject}
                onProjectSelect={handleProjectSelect}
                navigation={navigation}
                includeAllOption={false}
              />
            </View>

          {!selectedProjectId ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No project selected</Text>
              <Text style={styles.emptySubtext}>Select a project to load dispatch items</Text>
            </View>
          ) : (
            <>
              <View style={styles.taskGrid}>
                {/* Left Column - Vehicle + Driver Form */}
                <View style={styles.taskLeft}>
                  <View style={styles.taskCard}>
                    <View style={styles.taskHeaderRow}>
                      <Text style={styles.taskSectionTitle}>Select Vehicle</Text>
                      <TouchableOpacity
                        style={styles.resetButton}
                        onPress={() => {
                          setSelectedVehicleId(null);
                          setVehicleCapacity(0);
                          setVehicleDetails(null);
                          setSelectedItems({});
                          setDriverName('');
                          setDriverPhoneNo('');
                          setEmergencyContactPhoneNo('');
                          setTaskError('');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.resetButtonText}>Reset</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.selectVehicleButton}
                      onPress={() => setShowVehicleDropdown((prev) => !prev)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.selectVehicleText}>
                        {selectedVehicleId ? `Vehicle ID: ${selectedVehicleId}` : 'Select Vehicle'}
                      </Text>
                      <Text style={styles.dropdownArrow}>{showVehicleDropdown ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showVehicleDropdown && (
                      <View style={styles.dropdownList}>
                        {loadingVehicles ? (
                          <View style={styles.dropdownLoading}>
                            <ActivityIndicator size="small" color="#007AFF" />
                          </View>
                        ) : (
                          <ScrollView style={styles.dropdownScroll}>
                            {vehicles.map((vehicle) => (
                              <TouchableOpacity
                                key={vehicle.id}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  handleSelectVehicle(vehicle);
                                  setShowVehicleDropdown(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.dropdownItemText}>
                                  {vehicle.vehicle_number || `Vehicle ${vehicle.id}`}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.createVehicleButton}
                      onPress={() => setCreateVehicleVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.createVehicleText}>Create Vehicle</Text>
                    </TouchableOpacity>

                    <Text style={styles.taskSectionTitle}>Driver Details</Text>
                    <TextInput
                      style={styles.taskInput}
                      placeholder="Driver Name"
                      value={driverName}
                      onChangeText={setDriverName}
                    />
                    <TextInput
                      style={styles.taskInput}
                      placeholder="Driver Contact Number"
                      keyboardType="number-pad"
                      value={driverPhoneNo}
                      onChangeText={setDriverPhoneNo}
                    />
                    <TextInput
                      style={styles.taskInput}
                      placeholder="Emergency Contact Number"
                      keyboardType="number-pad"
                      value={emergencyContactPhoneNo}
                      onChangeText={setEmergencyContactPhoneNo}
                    />
                  </View>
                </View>

                {/* Right Column - Items + Capacity + Send */}
                <View style={styles.taskRight}>
                  <View style={styles.elementsCard}>
                    <Text style={styles.taskSectionTitle}>Available Elements</Text>
                    {loadingDispatchItems ? (
      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#007AFF" />
                        <Text style={styles.loadingText}>Loading items...</Text>
                      </View>
                    ) : dispatchItems.length === 0 ? (
                      <Text style={styles.emptySubtext}>No elements available</Text>
                    ) : (
                      dispatchItems.map((item) => {
                        const elementId = item.element_table_id || item.element_id;
                        const isChecked = !!selectedItems[elementId];
                        return (
                          <TouchableOpacity
                            key={elementId}
                            style={styles.itemRow}
                            onPress={() => toggleDispatchItem(elementId)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.checkboxContainer}>
                              <View style={[styles.checkbox, isChecked && styles.checkboxSelected]}>
                                {isChecked && <Text style={styles.checkboxCheck}>✓</Text>}
                              </View>
                            </View>
                            <View style={styles.itemInfo}>
                              <Text style={styles.itemType}>{item.element_type_name || item.element_type}</Text>
                              <Text style={styles.itemId}>Weight: {Number(item.weight || 0).toFixed(2)} kg</Text>
                              <Text style={styles.itemId}>
                                Tower: {item.tower_name || 'N/A'}, Floor: {item.floor_name || 'N/A'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>

                  <View style={styles.capacityRow}>
                    <View style={styles.capacityItem}>
                      <Text style={styles.capacityLabel}>Total Capacity</Text>
                      <Text style={styles.capacityValuePurple}>{vehicleCapacity} kg</Text>
                    </View>
                    <View style={styles.capacityItem}>
                      <Text style={styles.capacityLabel}>Selected Capacity</Text>
                      <Text style={styles.capacityValueBlue}>{selectedCapacity.toFixed(2)} kg</Text>
                    </View>
                    <View style={styles.capacityItem}>
                      <Text style={styles.capacityLabel}>Left Capacity</Text>
                      <Text style={leftCapacity < 0 ? styles.capacityValueRed : styles.capacityValueGreen}>
                        {leftCapacity} kg
                      </Text>
                    </View>
                  </View>

                  <View style={styles.sendRow}>
                    <TouchableOpacity
                      style={[styles.sendDispatchButton, sendingDispatch && styles.sendDispatchButtonDisabled]}
                      onPress={handleSendDispatch}
                      disabled={sendingDispatch}
                      activeOpacity={0.8}
                    >
                      {sendingDispatch ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.sendDispatchText}>Send Dispatch</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {taskError ? <Text style={styles.errorText}>{taskError}</Text> : null}
                </View>
              </View>
            </>
          )}
          </ScrollView>

          {/* Vehicle Selection Modal */}
          <Modal
            visible={vehicleModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setVehicleModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContentSmall}>
                <Text style={styles.modalTitle}>Select Vehicle</Text>
                {loadingVehicles ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                    {vehicles.map((vehicle) => (
                      <TouchableOpacity
                        key={vehicle.id}
                        style={styles.modalListItem}
                        onPress={() => handleSelectVehicle(vehicle)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.modalListItemText}>
                          {vehicle.vehicle_number || `Vehicle ${vehicle.id}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => setVehicleModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalButtonCancelText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Create Vehicle Modal */}
          <Modal
            visible={createVehicleVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setCreateVehicleVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.modalTitle}>Create Vehicle</Text>
                  <TextInput
                    style={styles.taskInput}
                    placeholder="Vehicle Number"
                    value={newVehicleNumber}
                    onChangeText={setNewVehicleNumber}
                  />
                  <TextInput
                    style={styles.taskInput}
                    placeholder="Capacity"
                    keyboardType="numeric"
                    value={newCapacity}
                    onChangeText={setNewCapacity}
                  />
                  <TextInput
                    style={styles.taskInput}
                    placeholder="Truck Type (flatbed or type A)"
                    value={newTruckType}
                    onChangeText={setNewTruckType}
                  />
                  <TextInput
                    style={styles.taskInput}
                    placeholder="Driver Name"
                    value={newDriverName}
                    onChangeText={setNewDriverName}
                  />
                  <TextInput
                    style={styles.taskInput}
                    placeholder="Driver Phone No"
                    keyboardType="number-pad"
                    value={newDriverPhone}
                    onChangeText={setNewDriverPhone}
                  />
                  <TextInput
                    style={styles.taskInput}
                    placeholder="Emergency Contact Phone No"
                    keyboardType="number-pad"
                    value={newEmergencyPhone}
                    onChangeText={setNewEmergencyPhone}
                  />

                  <Text style={styles.modalLabel}>Select Transporter</Text>
                  {loadingTransporters ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
                      {transporters.map((transporter) => (
                        <TouchableOpacity
                          key={transporter.id}
                          style={[
                            styles.modalListItem,
                            newTransporterId === String(transporter.id) && styles.modalListItemSelected,
                          ]}
                          onPress={() => setNewTransporterId(String(transporter.id))}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.modalListItemText,
                              newTransporterId === String(transporter.id) && styles.modalListItemTextSelected,
                            ]}
                          >
                            {transporter.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonCancel]}
                      onPress={() => setCreateVehicleVisible(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.modalButtonCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonApprove]}
                      onPress={handleCreateVehicle}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.modalButtonApproveText}>Create</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

        {!hideBottomNav && (
          <BottomNavigation
            activeTab={activeTab}
            onTabPress={handleTabPress}
          />
        )}
      </View>
    );
  }

  // Show dispatch orders in home section when no paperId
  if (!paperId) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Header Section */}
          

          {/* Project Filter */}
          <View style={styles.projectDropdownWrapper}>
            <ProjectDropdown
              selectedProject={selectedProject}
              onProjectSelect={handleProjectSelect}
              navigation={navigation}
              includeAllOption={false}
            />
          </View>

          {/* Show message if no projectId */}
          {!selectedProjectId ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No project selected</Text>
              <Text style={styles.emptySubtext}>Select a project to view dispatch orders</Text>
        <TouchableOpacity 
          style={styles.retryButton} 
          onPress={() => navigation.navigate('Scan')}
        >
          <Text style={styles.retryButtonText}>Scan QR Code</Text>
        </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Loading State */}
              {loadingOrders ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading dispatch orders...</Text>
                </View>
              ) : (
                <>
                  {(() => {
                    const { dispatchList, receiveList } = splitDispatchOrders(dispatchOrders);
                    return (
                      <>
                        {/* Dispatch Section */}
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>Dispatch</Text>
                          <Text style={styles.sectionSubtitle}>Orders to dispatch</Text>
                        </View>
                        {renderOrderList(dispatchList, 'No dispatch orders found')}

                        {/* Receive Section */}
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>Receive</Text>
                          <Text style={styles.sectionSubtitle}>Orders marked as received</Text>
                        </View>
                        {renderOrderList(receiveList, 'No received orders found')}
                      </>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </ScrollView>

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

  if (!paperData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No questions available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadQuestions}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        

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
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: FontSizes.small,
    color: BWTheme.textTertiary,
    textAlign: 'center',
    marginBottom: 16,
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
  // Dispatch Orders Home Section Styles
  homeHeader: {
    backgroundColor: BWTheme.card,
    padding: 16,
    borderRadius: 12,
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
  homeTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  homeSubtitle: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  projectDropdownWrapper: {
    marginBottom: 12,
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
  },
  sectionSubtitle: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
    marginTop: 2,
  },
  orderCard: {
    backgroundColor: BWTheme.card,
    padding: 12,
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
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  orderHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  orderHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrowButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  arrowText: {
    fontSize: FontSizes.medium,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.bold,
  },
  orderId: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  projectName: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    textTransform: 'uppercase',
  },
  orderDetails: {
    marginBottom: 8,
  },
  orderDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderDetailLabel: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
    flex: 1,
  },
  orderDetailValue: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.semiBold,
    flex: 1,
    textAlign: 'right',
  },
  taskCard: {
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  taskGrid: {
    flexDirection: SCREEN_WIDTH >= 900 ? 'row' : 'column',
    gap: 12,
  },
  taskLeft: {
    flex: SCREEN_WIDTH >= 900 ? 0.42 : 1,
  },
  taskRight: {
    flex: SCREEN_WIDTH >= 900 ? 0.58 : 1,
  },
  taskHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BWTheme.border,
    backgroundColor: BWTheme.background,
  },
  resetButtonText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  elementsCard: {
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  taskSectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 8,
  },
  selectVehicleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BWTheme.border,
    backgroundColor: BWTheme.background,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectVehicleText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  createVehicleButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  createVehicleText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  dropdownArrow: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    marginLeft: 8,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    backgroundColor: BWTheme.background,
    maxHeight: 220,
    marginBottom: 8,
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  dropdownItemText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
  },
  dropdownLoading: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  taskInput: {
    backgroundColor: BWTheme.background,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    padding: 10,
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    marginBottom: 8,
  },
  capacityRow: {
    flexDirection: SCREEN_WIDTH >= 900 ? 'row' : 'column',
    gap: 8,
    backgroundColor: BWTheme.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
    marginTop: 12,
  },
  capacityItem: {
    flex: 1,
  },
  capacityLabel: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
    marginBottom: 4,
  },
  capacityValuePurple: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: '#8B5CF6',
  },
  capacityValueBlue: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: '#007AFF',
  },
  capacityValueGreen: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: '#34C759',
  },
  capacityValueRed: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: '#FF3B30',
  },
  sendRow: {
    alignItems: SCREEN_WIDTH >= 900 ? 'flex-end' : 'stretch',
    marginTop: 12,
  },
  capacityCard: {
    backgroundColor: BWTheme.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  capacityText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
    marginBottom: 4,
  },
  capacityPositive: {
    color: '#34C759',
  },
  capacityNegative: {
    color: '#FF3B30',
  },
  sendDispatchButton: {
    backgroundColor: '#9CA3AF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    minWidth: SCREEN_WIDTH >= 900 ? 200 : undefined,
  },
  sendDispatchButtonDisabled: {
    opacity: 0.6,
  },
  sendDispatchText: {
    color: '#fff',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  modalLabel: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    marginTop: 4,
    marginBottom: 6,
  },
  modalList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalListContent: {
    paddingVertical: 2,
  },
  modalScroll: {
    width: '100%',
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalListItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  modalListItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  modalListItemText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
  },
  modalListItemTextSelected: {
    color: '#007AFF',
    fontWeight: FontWeights.bold,
  },
  checkboxContainer: {
    marginRight: 10,
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: BWTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BWTheme.background,
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 12,
    fontWeight: FontWeights.bold,
  },
  itemsSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  itemsTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BWTheme.background,
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemType: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  itemId: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
  },
  itemWeight: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    color: BWTheme.textSecondary,
  },
});

export default DispatchManagerScreen;

