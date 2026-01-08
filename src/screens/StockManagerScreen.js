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
import { DateFilter } from '../components/DateFilter';
import LineChart from '../components/LineChart';
import ProjectDropdown from '../components/ProjectDropdown';
import PieChart from '../components/PieChart';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const StockManagerScreen = ({ route, navigation, hideBottomNav = false }) => {
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
  const [productionChartData, setProductionChartData] = useState([]);
  const [elementTypeData, setElementTypeData] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingElementType, setLoadingElementType] = useState(false);
  const [currentFilterType, setCurrentFilterType] = useState('yearly');
  const [currentFilter, setCurrentFilter] = useState(() => ({
    type: 'yearly',
    year: new Date().getFullYear(),
  }));
  const [selectedProject, setSelectedProject] = useState('All Projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [elementList, setElementList] = useState([]);
  const [loadingElements, setLoadingElements] = useState(false);
  
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
      // Load dashboard data when no paperId (home screen)
      // Elements will be loaded when project is selected
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
      };
      loadDashboardData(filter);
      loadElementList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, paperId]);

  // Load dashboard data
  const loadDashboardData = async (filter) => {
    // Use selectedProjectId from state
    const projectId = selectedProjectId;
    
    if (!projectId) {
      // If no project selected, don't load data
      setProductionChartData([]);
      setElementTypeData([]);
      return;
    }

    setLoadingChart(true);
    setLoadingElementType(true);
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
        console.log('⚠️ [StockManagerScreen] Session validation failed');
      }

      let stockyardUrl = `${API_BASE_URL}/api/stockyard_reports/${projectId}?type=${filter.type}&year=${filter.year}`;
      let elementTypeUrl = `${API_BASE_URL}/api/element_type_reports/${projectId}?type=${filter.type}&year=${filter.year}`;

      if (filter.month) {
        stockyardUrl += `&month=${filter.month}`;
        elementTypeUrl += `&month=${filter.month}`;
      }

      if (filter.type === 'weekly' && filter.date) {
        const day = filter.date.getDate();
        stockyardUrl += `&date=${day}`;
        elementTypeUrl += `&date=${day}`;
      }

      console.log('📱 [StockManagerScreen] Fetching dashboard data...');
      console.log('📱 [StockManagerScreen] Stockyard URL:', stockyardUrl);
      console.log('📱 [StockManagerScreen] Element Type URL:', elementTypeUrl);

      // Try with Bearer token first
      let headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [StockManagerScreen] Dashboard API - Attempt 1: With Bearer token');

      let stockyardRes = await fetch(stockyardUrl, { headers: headersWithBearer });
      let elementTypeRes = await fetch(elementTypeUrl, { headers: headersWithBearer });

      console.log('📱 [StockManagerScreen] Stockyard Response 1 - Status:', stockyardRes.status);
      console.log('📱 [StockManagerScreen] Element Type Response 1 - Status:', elementTypeRes.status);

      // If 401, try without Bearer prefix
      if (stockyardRes.status === 401 || elementTypeRes.status === 401) {
        console.log('❌ [StockManagerScreen] Dashboard API returned 401 with Bearer, trying without...');
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [StockManagerScreen] Dashboard API - Attempt 2: Without Bearer prefix');

        if (stockyardRes.status === 401) {
          stockyardRes = await fetch(stockyardUrl, { headers: headersWithoutBearer });
        }
        if (elementTypeRes.status === 401) {
          elementTypeRes = await fetch(elementTypeUrl, { headers: headersWithoutBearer });
        }

        console.log('📱 [StockManagerScreen] Stockyard Response 2 - Status:', stockyardRes.status);
        console.log('📱 [StockManagerScreen] Element Type Response 2 - Status:', elementTypeRes.status);
      }

      // Handle stockyard chart data
      if (stockyardRes.ok) {
        const stockyardData = await stockyardRes.json();
        console.log('✅ [StockManagerScreen] Stockyard data loaded successfully');
        if (Array.isArray(stockyardData)) {
          setProductionChartData(stockyardData);
        } else if (Array.isArray(stockyardData?.data)) {
          setProductionChartData(stockyardData.data);
        } else {
          setProductionChartData([]);
        }
      } else {
        const errorText = await stockyardRes.text().catch(() => '');
        console.log('❌ [StockManagerScreen] Stockyard API Error');
        console.log('📱 [StockManagerScreen] Error status:', stockyardRes.status);
        console.log('📱 [StockManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (stockyardRes.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [StockManagerScreen] Stockyard API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [StockManagerScreen] Token refreshed successfully');
                
                // Validate the new session
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [StockManagerScreen] New session validated, using session_id for retry');
                  }
                } catch (validateError) {
                  console.log('⚠️ [StockManagerScreen] New session validation failed, using access_token');
                }
                
                console.log('🔄 [StockManagerScreen] Retrying Stockyard API with refreshed token...');
                // Retry with new token - try Bearer first
                let retryHeaders = createAuthHeaders(newToken, { useBearer: true });
                stockyardRes = await fetch(stockyardUrl, { headers: retryHeaders });
                
                // If still 401, try without Bearer
                if (stockyardRes.status === 401) {
                  retryHeaders = createAuthHeaders(newToken, { useBearer: false });
                  stockyardRes = await fetch(stockyardUrl, { headers: retryHeaders });
                }
                
                if (stockyardRes.ok) {
                  const stockyardData = await stockyardRes.json();
                  if (Array.isArray(stockyardData)) {
                    setProductionChartData(stockyardData);
                  } else if (Array.isArray(stockyardData?.data)) {
                    setProductionChartData(stockyardData.data);
                  } else {
                    setProductionChartData([]);
                  }
                  return; // Success, skip setting empty data
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [StockManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        setProductionChartData([]);
      }

      // Handle element type pie chart data
      if (elementTypeRes.ok) {
        const elementTypeResData = await elementTypeRes.json();
        console.log('✅ [StockManagerScreen] Element type data loaded successfully');
        if (Array.isArray(elementTypeResData)) {
          setElementTypeData(elementTypeResData);
        } else if (Array.isArray(elementTypeResData?.data)) {
          setElementTypeData(elementTypeResData.data);
        } else {
          setElementTypeData([]);
        }
      } else {
        const errorText = await elementTypeRes.text().catch(() => '');
        console.log('❌ [StockManagerScreen] Element Type API Error');
        console.log('📱 [StockManagerScreen] Error status:', elementTypeRes.status);
        console.log('📱 [StockManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (elementTypeRes.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [StockManagerScreen] Element Type API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [StockManagerScreen] Token refreshed successfully');
                
                // Validate the new session
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [StockManagerScreen] New session validated, using session_id for retry');
                  }
                } catch (validateError) {
                  console.log('⚠️ [StockManagerScreen] New session validation failed, using access_token');
                }
                
                console.log('🔄 [StockManagerScreen] Retrying Element Type API with refreshed token...');
                // Retry with new token - try Bearer first
                let retryHeaders = createAuthHeaders(newToken, { useBearer: true });
                elementTypeRes = await fetch(elementTypeUrl, { headers: retryHeaders });
                
                // If still 401, try without Bearer
                if (elementTypeRes.status === 401) {
                  retryHeaders = createAuthHeaders(newToken, { useBearer: false });
                  elementTypeRes = await fetch(elementTypeUrl, { headers: retryHeaders });
                }
                
                if (elementTypeRes.ok) {
                  const elementTypeResData = await elementTypeRes.json();
                  if (Array.isArray(elementTypeResData)) {
                    setElementTypeData(elementTypeResData);
                  } else if (Array.isArray(elementTypeResData?.data)) {
                    setElementTypeData(elementTypeResData.data);
                  } else {
                    setElementTypeData([]);
                  }
                  return; // Success, skip setting empty data
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [StockManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        setElementTypeData([]);
      }
    } catch (error) {
      console.log('❌ [StockManagerScreen] Error loading dashboard data:', error);
      setProductionChartData([]);
      setElementTypeData([]);
    } finally {
      setLoadingChart(false);
      setLoadingElementType(false);
    }
  };

  // Load element list
  const loadElementList = async () => {
    const projectId = selectedProjectId;
    
    if (!projectId) {
      setElementList([]);
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
        console.log('⚠️ [StockManagerScreen] Session validation failed');
      }

      const elementListUrl = `${API_BASE_URL}/api/precast_stock/all/${projectId}`;
      console.log('📱 [StockManagerScreen] Fetching element list from:', elementListUrl);

      // Try with Bearer token first
      let headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [StockManagerScreen] Element List API - Attempt 1: With Bearer token');

      let response = await fetch(elementListUrl, { headers: headersWithBearer });
      console.log('📱 [StockManagerScreen] Element List Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [StockManagerScreen] Element List API returned 401 with Bearer, trying without...');
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [StockManagerScreen] Element List API - Attempt 2: Without Bearer prefix');
        response = await fetch(elementListUrl, { headers: headersWithoutBearer });
        console.log('📱 [StockManagerScreen] Element List Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const elementData = await response.json();
        console.log('✅ [StockManagerScreen] Element list loaded successfully');
        if (Array.isArray(elementData)) {
          setElementList(elementData);
        } else if (Array.isArray(elementData?.data)) {
          setElementList(elementData.data);
        } else {
          setElementList([]);
        }
      } else {
        const errorText = await response.text().catch(() => '');
        console.log('❌ [StockManagerScreen] Element List API Error');
        console.log('📱 [StockManagerScreen] Error status:', response.status);
        console.log('📱 [StockManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [StockManagerScreen] Element List API 401 - attempting token refresh...');
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
                  console.log('⚠️ [StockManagerScreen] New session validation failed');
                }
                
                console.log('🔄 [StockManagerScreen] Retrying Element List API with refreshed token...');
                // Retry with new token - try Bearer first
                let retryHeaders = createAuthHeaders(newToken, { useBearer: true });
                response = await fetch(elementListUrl, { headers: retryHeaders });
                
                // If still 401, try without Bearer
                if (response.status === 401) {
                  retryHeaders = createAuthHeaders(newToken, { useBearer: false });
                  response = await fetch(elementListUrl, { headers: retryHeaders });
                }
                
                if (response.ok) {
                  const elementResData = await response.json();
                  if (Array.isArray(elementResData)) {
                    setElementList(elementResData);
                  } else if (Array.isArray(elementResData?.data)) {
                    setElementList(elementResData.data);
                  } else {
                    setElementList([]);
                  }
                  return; // Success, skip setting empty data
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [StockManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        setElementList([]);
      }
    } catch (error) {
      console.log('❌ [StockManagerScreen] Error loading element list:', error);
      setElementList([]);
    } finally {
      setLoadingElements(false);
    }
  };

  // Handle date filter change
  const handleDateFilterChange = (filter) => {
    setCurrentFilterType(filter.type);
    setCurrentFilter(filter);
    loadDashboardData(filter);
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      if (!paperId) {
        // Refresh dashboard data for current project/filter
        if (selectedProjectId) {
          await loadDashboardData(currentFilter);
          await loadElementList();
        }
      } else {
        // Refresh questions when in question mode
        await loadQuestions();
      }
    } catch (error) {
      console.log('❌ [StockManagerScreen] Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
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

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to view questions.');
        navigation.goBack();
        return;
      }

      const apiUrl = `${API_BASE_URL}/api/stock-manager/questions/${paperId}`;
      console.log('📱 [StockManagerScreen] Fetching questions from:', apiUrl);
      console.log('📱 [StockManagerScreen] Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

      // First, validate the session to ensure it exists in the database
      let currentToken = accessToken;
      try {
        console.log('📱 [StockManagerScreen] Validating session before Questions API call...');
        const sessionResult = await validateSession();
        console.log('📱 [StockManagerScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
          console.log('✅ [StockManagerScreen] Session validated, using session_id for Questions API');
          console.log('📱 [StockManagerScreen] Session_id (first 20 chars):', currentToken.substring(0, 20) + '...');
        } else {
          console.log('⚠️ [StockManagerScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [StockManagerScreen] Session validation failed, using original token:', validateError);
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [StockManagerScreen] Questions API - Attempt 1: With Bearer token');
      console.log('📱 [StockManagerScreen] Request headers:', JSON.stringify(headersWithBearer, null, 2));
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });

      console.log('📱 [StockManagerScreen] Questions API Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        console.log('❌ [StockManagerScreen] Questions API returned 401 with Bearer token');
        console.log('📱 [StockManagerScreen] Response body:', responseText1);
        console.log('📱 [StockManagerScreen] Questions API - Attempt 2: Without Bearer prefix...');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        console.log('📱 [StockManagerScreen] Request headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        
        console.log('📱 [StockManagerScreen] Questions API Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [StockManagerScreen] Questions API Success!');
        console.log('📱 [StockManagerScreen] Questions loaded successfully:', JSON.stringify(data, null, 2));
        setPaperData(data);
      } else {
        const errorText = await response.text();
        console.log('❌ [StockManagerScreen] Questions API Error');
        console.log('📱 [StockManagerScreen] Error status:', response.status);
        console.log('📱 [StockManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [StockManagerScreen] Questions API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [StockManagerScreen] Token refreshed successfully');
                
                // Validate the new session to get session_id
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [StockManagerScreen] New session validated, using session_id for retry');
                  }
                } catch (validateError) {
                  console.log('⚠️ [StockManagerScreen] New session validation failed, using access_token');
                }
                
                console.log('🔄 [StockManagerScreen] Retrying Questions API with refreshed token...');
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
                  console.log('✅ [StockManagerScreen] Questions API retry successful!');
                  setPaperData(data);
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [StockManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to fetch questions. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [StockManagerScreen] Error fetching questions:', error);
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
      console.log('📱 [StockManagerScreen] Uploading photo to:', apiUrl);

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [StockManagerScreen] Using validated session_id for upload');
        }
      } catch (validateError) {
        console.log('⚠️ [StockManagerScreen] Session validation failed, using original token');
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
      console.log('📱 [StockManagerScreen] Upload - Attempt 1: With Bearer token');

      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: formData,
      });

      console.log('📱 [StockManagerScreen] Upload Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [StockManagerScreen] Upload returned 401 with Bearer, trying without...');
        const headersWithoutBearer = {
          ...createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
        };
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headersWithoutBearer,
          body: formData,
        });
        console.log('📱 [StockManagerScreen] Upload Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [StockManagerScreen] Photo uploaded successfully:', JSON.stringify(responseData, null, 2));
        
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
        console.log('❌ [StockManagerScreen] Error uploading photo');
        console.log('📱 [StockManagerScreen] Error status:', response.status);
        console.log('📱 [StockManagerScreen] Error response:', errorText);
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to upload photo. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [StockManagerScreen] Error uploading photo:', error);
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
    
    // Stock Manager specific navigation - don't navigate to QA/QC screens
    if (tabId === 'home') {
      // Home tab: Navigate to StockManager screen (current screen)
      if (currentRoute !== 'StockManager') {
        navigation.navigate('StockManager');
      }
    } else if (tabId === 'task') {
      // Task tab: Navigate to Scan screen for QR code scanning
      if (currentRoute !== 'Scan') {
        navigation.navigate('Scan');
      }
    } else if (tabId === 'me') {
      // Me tab: Navigate to UserProfile
      if (currentRoute !== 'UserProfile') {
        navigation.navigate('UserProfile');
      }
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

      const apiUrl = `${API_BASE_URL}/api/stock-manager/questions/answers`;
      console.log('📱 [StockManagerScreen] Submitting answers to:', apiUrl);
      console.log('📱 [StockManagerScreen] Submission data:', JSON.stringify(submissionData, null, 2));

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [StockManagerScreen] Using validated session_id for submission');
        }
      } catch (validateError) {
        console.log('⚠️ [StockManagerScreen] Session validation failed, using original token');
      }

      // Try with Bearer token first
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [StockManagerScreen] Submit - Attempt 1: With Bearer token');
      
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: JSON.stringify(submissionData),
      });

      console.log('📱 [StockManagerScreen] Submit Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [StockManagerScreen] Submit returned 401 with Bearer, trying without...');
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
          body: JSON.stringify(submissionData),
        });
        console.log('📱 [StockManagerScreen] Submit Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [StockManagerScreen] Answers submitted successfully:', JSON.stringify(responseData, null, 2));
        Alert.alert('Success', 'Your responses have been submitted successfully.', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('❌ [StockManagerScreen] Error submitting answers');
        console.log('📱 [StockManagerScreen] Error status:', response.status);
        console.log('📱 [StockManagerScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [StockManagerScreen] Submit API 401 - attempting token refresh...');
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
                  console.log('⚠️ [StockManagerScreen] New session validation failed');
                }
                
                console.log('🔄 [StockManagerScreen] Retrying submit with refreshed token...');
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
                  console.log('✅ [StockManagerScreen] Submit retry successful!');
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
            console.log('❌ [StockManagerScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to submit answers. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [StockManagerScreen] Error submitting answers:', error);
      await handleApiError(error, navigation, 'Network error submitting answers.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading Stock Manager questions...</Text>
        </View>
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
    // Transform elementTypeData for donut + bottom legend
    const pieChartData = elementTypeData.map((item, index) => ({
      label: item.element_type || `Type ${index + 1}`,
      value: item.count || 0,
      color: item.color,
      element_type: item.element_type,
      count: item.count,
    }));

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
          {/* Header */}
          <View style={styles.dashboardHeader}>
            <Text style={styles.dashboardTitle}>Stockyard Report</Text>
          </View>

          {/* Project Dropdown just below title */}
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

          {/* Date Filter below project filter */}
          <View style={styles.dateFilterWrapper}>
            <DateFilter
              onChange={handleDateFilterChange}
              startDate={new Date(2023, 0, 1)}
            />
          </View>

          {/* Stockyard Overview Chart */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Stockyard Overview</Text>
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
                    { key: 'adjustments', label: 'Adjustments', color: '#8B5CF6' },
                    { key: 'checkins', label: 'Checkins', color: '#10B981' },
                    { key: 'checkouts', label: 'Checkouts', color: '#F59E42' },
                  ]}
                  hideCheckouts={currentFilterType === 'monthly'}
                />
              )}
            </View>
          </View>

          {/* Element Type Distribution - Donut + bottom legend (Google Charts style) */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Element Type Distribution</Text>
            </View>
            <View style={styles.pieChartContainer}>
              {loadingElementType ? (
                <View style={styles.chartLoadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              ) : pieChartData.length === 0 ? (
                <View style={styles.chartLoadingContainer}>
                  <Text style={styles.noDataText}>No data available</Text>
                </View>
              ) : (
                <PieChart data={pieChartData} title="" size={300} />
              ) }
            </View>
          </View>

          {/* Element List Section */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Element List</Text>
            </View>
            <View style={styles.elementListContainer}>
              {loadingElements ? (
                <View style={styles.chartLoadingContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  <Text style={styles.loadingText}>Loading elements...</Text>
                </View>
              ) : elementList.length === 0 ? (
                <View style={styles.chartLoadingContainer}>
                  <Text style={styles.noDataText}>No elements available</Text>
                </View>
              ) : (
                <View style={styles.elementList}>
                  {elementList.map((element) => (
                    <View key={element.id} style={styles.elementCard}>
                      <View style={styles.elementCardHeader}>
                        <Text style={styles.elementName}>{element.element_name || 'N/A'}</Text>
                        <View style={[
                          styles.dispatchStatusBadge,
                          element.dispatch_status && styles.dispatchStatusBadgeActive
                        ]}>
                          <Text style={[
                            styles.dispatchStatusText,
                            element.dispatch_status && styles.dispatchStatusTextActive
                          ]}>
                            {element.dispatch_status ? 'Dispatched' : 'In Stock'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.elementDetails}>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Element Type:</Text>
                          <Text style={styles.elementDetailValue}>{element.element_type || 'N/A'}</Text>
                        </View>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Tower:</Text>
                          <Text style={styles.elementDetailValue}>{element.tower_name || 'N/A'}</Text>
                        </View>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Floor:</Text>
                          <Text style={styles.elementDetailValue}>{element.floor_name || 'N/A'}</Text>
                        </View>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Production Date:</Text>
                          <Text style={styles.elementDetailValue}>
                            {element.production_date 
                              ? new Date(element.production_date).toLocaleDateString() 
                              : 'N/A'}
                          </Text>
                        </View>
                        <View style={styles.elementDetailRow}>
                          <Text style={styles.elementDetailLabel}>Mass:</Text>
                          <Text style={styles.elementDetailValue}>
                            {element.mass ? `${element.mass.toFixed(2)} kg` : 'N/A'}
                          </Text>
                        </View>
                        {(element.length || element.height || element.thickness) && (
                          <View style={styles.elementDetailRow}>
                            <Text style={styles.elementDetailLabel}>Dimensions:</Text>
                            <Text style={styles.elementDetailValue}>
                              {element.length ? `${element.length}mm` : ''}
                              {element.length && element.height ? ' × ' : ''}
                              {element.height ? `${element.height}mm` : ''}
                              {element.thickness ? ` × ${element.thickness}mm` : ''}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </ScrollView>

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
    marginBottom: 8,
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
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieChartContainer: {
    width: '100%',
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textSecondary,
    textAlign: 'center',
  },
  elementListContainer: {
    width: '100%',
  },
  elementList: {
    gap: 12,
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
  dispatchStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  dispatchStatusBadgeActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  dispatchStatusText: {
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textSecondary,
  },
  dispatchStatusTextActive: {
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

export default StockManagerScreen;

