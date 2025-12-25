import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  Modal,
  FlatList,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import CameraQRScanner from '../components/CameraQRScanner';
import BottomNavigation from '../components/BottomNavigation';
import PieChart from '../components/PieChart';
import ProjectDropdown from '../components/ProjectDropdown';
import DrawingFilesModal from '../components/DrawingFilesModal';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { validateSession, refreshSession } from '../services/authService';
import { getTokens } from '../services/tokenManager';
import { logout } from '../services/authService';
import { handle401Error, handleApiError } from '../services/errorHandler';

const DashboardScreen = ({ navigation, hideBottomNav = false }) => {
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedFilters, setSelectedFilters] = useState(['All']);
  const [selectedProject, setSelectedProject] = useState('All Projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [drawingFilesModalVisible, setDrawingFilesModalVisible] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [selectedElementData, setSelectedElementData] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedJobForMenu, setSelectedJobForMenu] = useState(null);

  const validateTokenLocally = (token) => {
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

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${day}-${month}-${year}`;
    } catch (error) {
      return dateString;
    }
  };

  // Helper function to load tasks from API for a specific status
  const loadTasksFromAPI = async (token, statusParam) => {
    try {
      console.log('🔍 loadTasksFromAPI called with statusParam:', statusParam);
      
      // Build API URL with query parameters
      let apiUrl = `${API_BASE_URL}/api/app/tasks`;
      const queryParams = [];
      
      // Always include status parameter - it's required for filtering
      // Convert to string, trim, and ensure it's not empty
      const statusValue = statusParam ? String(statusParam).trim().toLowerCase() : '';
      
      console.log('🔍 Processed statusValue:', statusValue);
      
      // Add status parameter to query string if it's a valid non-empty value
      if (statusValue && statusValue.length > 0) {
        queryParams.push(`status=${encodeURIComponent(statusValue)}`);
        console.log('✅ Status parameter added to queryParams');
      } else {
        console.log('❌ Status parameter NOT added - statusValue is empty or invalid');
      }
      
      if (selectedProjectId && selectedProjectId !== 'all') {
        queryParams.push(`project_id=${encodeURIComponent(selectedProjectId)}`);
      }
      
      // Build the full URL with query string
      // Always add query string if we have any params
      if (queryParams.length > 0) {
        apiUrl += '?' + queryParams.join('&');
      }

      console.log('Loading tasks from API:');
      console.log('  Status Param (input):', statusParam);
      console.log('  Status Param (type):', typeof statusParam);
      console.log('  Status Param (processed):', statusParam ? String(statusParam).trim().toLowerCase() : 'N/A');
      console.log('  Full URL:', apiUrl);
      console.log('  Query Params Count:', queryParams.length);
      console.log('  Query Params:', queryParams);

      // First, validate the session to ensure it exists in the database
      let currentToken = token;
      console.log('📱 [DashboardScreen] loadTasksFromAPI - Starting API call');
      console.log('📱 [DashboardScreen] Original token (first 20 chars):', token ? token.substring(0, 20) + '...' : 'null');
      
      try {
        console.log('📱 [DashboardScreen] Validating session before Tasks API call...');
        const sessionResult = await validateSession();
        console.log('📱 [DashboardScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
          console.log('✅ [DashboardScreen] Session validated, using session_id for Tasks API');
          console.log('📱 [DashboardScreen] Session_id (first 20 chars):', currentToken.substring(0, 20) + '...');
        } else {
          console.log('⚠️ [DashboardScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [DashboardScreen] Session validation failed, using original token:', validateError);
        console.log('📱 [DashboardScreen] Validation error details:', JSON.stringify(validateError, null, 2));
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [DashboardScreen] Tasks API - Attempt 1: With Bearer token');
      console.log('📱 [DashboardScreen] Request URL:', apiUrl);
      console.log('📱 [DashboardScreen] Request headers:', JSON.stringify(headersWithBearer, null, 2));
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });

      console.log('📱 [DashboardScreen] Tasks API Response 1 - Status:', response.status);
      console.log('📱 [DashboardScreen] Tasks API Response 1 - Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        console.log('❌ [DashboardScreen] Tasks API returned 401 with Bearer token');
        console.log('📱 [DashboardScreen] Response body:', responseText1);
        console.log('📱 [DashboardScreen] Tasks API - Attempt 2: Without Bearer prefix...');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [DashboardScreen] Request headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        
        console.log('📱 [DashboardScreen] Tasks API Response 2 - Status:', response.status);
      }

      console.log('📱 [DashboardScreen] Tasks API Final response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [DashboardScreen] Tasks API Success!');
        console.log('📱 [DashboardScreen] Tasks loaded successfully:', JSON.stringify(data, null, 2));
        
        // Transform API data to match UI format
        // API returns: { tasks: [...], total_count: 85, filter: "pending" }
        const tasks = data.tasks || [];
        const transformedJobs = tasks.map((item) => {
          // Map status values: "Inprogress" -> "Pending", "Completed" -> "Completed"
          let mappedStatus = item.status || 'Pending';
          if (mappedStatus.toLowerCase() === 'inprogress') {
            mappedStatus = 'Pending';
          } else if (mappedStatus.toLowerCase() === 'completed') {
            mappedStatus = 'Completed';
          }
          
          return {
            id: item.element_name || `ELEM-${item.element_id}`,
            title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
            status: mappedStatus,
            priority: 'Medium', // API doesn't provide priority, defaulting
            assignedDate: item.stage_name || 'N/A', // Show stage name in assigned column
            drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
            test: item.stage_name || 'N/A',
            // Mark as NOT from complete-production API (from tasks API)
            fromCompleteProduction: false,
            // Store original data for navigation if needed
            originalData: item,
          };
        });

        return transformedJobs;
      } else {
        const errorText = await response.text();
        console.log('❌ [DashboardScreen] Tasks API Error');
        console.log('📱 [DashboardScreen] Error status:', response.status);
        console.log('📱 [DashboardScreen] Error response:', errorText);
        console.log('📱 [DashboardScreen] Error response (parsed):', JSON.parse(errorText || '{}'));
        
        // If 401, try to refresh token and retry once
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            console.log('📱 [DashboardScreen] Refresh token available:', refreshToken ? 'Yes' : 'No');
            
            if (refreshToken) {
              console.log('🔄 [DashboardScreen] Tasks API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              console.log('📱 [DashboardScreen] Token refresh response:', JSON.stringify(refreshResult, null, 2));
              
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [DashboardScreen] Token refreshed successfully');
                console.log('📱 [DashboardScreen] New access_token (first 20 chars):', refreshResult.access_token.substring(0, 20) + '...');
                console.log('📱 [DashboardScreen] Validating new session before retry...');
                
                // Validate the new session to get session_id
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  console.log('📱 [DashboardScreen] New session validation response:', JSON.stringify(newSessionResult, null, 2));
                  
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [DashboardScreen] New session validated, using session_id for retry');
                    console.log('📱 [DashboardScreen] New session_id (first 20 chars):', newToken.substring(0, 20) + '...');
                  } else {
                    console.log('⚠️ [DashboardScreen] New session validation returned no session_id, using access_token');
                  }
                } catch (validateError) {
                  console.log('❌ [DashboardScreen] New session validation failed, using access_token:', validateError);
                }
                
                console.log('🔄 [DashboardScreen] Retrying Tasks API with refreshed token...');
                console.log('📱 [DashboardScreen] Retry URL:', apiUrl);
                
                // Retry with new token - try Bearer first
                const retryHeadersWithBearer = createAuthHeaders(newToken, { useBearer: true });
                console.log('📱 [DashboardScreen] Retry headers (Bearer):', JSON.stringify(retryHeadersWithBearer, null, 2));
                
                let retryResponse = await fetch(apiUrl, {
                  method: 'GET',
                  headers: retryHeadersWithBearer,
                });
                
                console.log('📱 [DashboardScreen] Retry Response 1 - Status:', retryResponse.status);
                
                // If still 401, try without Bearer
                if (retryResponse.status === 401) {
                  const retryErrorText1 = await retryResponse.text().catch(() => '');
                  console.log('❌ [DashboardScreen] Retry with Bearer failed');
                  console.log('📱 [DashboardScreen] Retry error response:', retryErrorText1);
                  console.log('📱 [DashboardScreen] Retry - Attempt 2: Without Bearer...');
                  
                  const retryHeadersWithoutBearer = createAuthHeaders(newToken, { useBearer: false });
                  console.log('📱 [DashboardScreen] Retry headers (no Bearer):', JSON.stringify(retryHeadersWithoutBearer, null, 2));
                  
                  retryResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: retryHeadersWithoutBearer,
                  });
                  
                  console.log('📱 [DashboardScreen] Retry Response 2 - Status:', retryResponse.status);
                }
                
                if (retryResponse.ok) {
                  console.log('✅ [DashboardScreen] Tasks API retry successful!');
                  const data = await retryResponse.json();
                  console.log('📱 [DashboardScreen] Retry response data:', JSON.stringify(data, null, 2));
                  const tasks = data.tasks || [];
                  const transformedJobs = tasks.map((item) => {
                    let mappedStatus = item.status || 'Pending';
                    if (mappedStatus.toLowerCase() === 'inprogress') {
                      mappedStatus = 'Pending';
                    } else if (mappedStatus.toLowerCase() === 'completed') {
                      mappedStatus = 'Completed';
                    }
                    return {
                      id: item.element_name || `ELEM-${item.element_id}`,
                      title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
                      status: mappedStatus,
                      priority: 'Medium',
                      assignedDate: item.stage_name || 'N/A',
                      drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                      test: item.stage_name || 'N/A',
                      fromCompleteProduction: false,
                      originalData: item,
                    };
                  });
                  return transformedJobs;
                } else {
                  const retryErrorText = await retryResponse.text().catch(() => '');
                  console.log('❌ [DashboardScreen] Tasks API retry still failed');
                  console.log('📱 [DashboardScreen] Retry error status:', retryResponse.status);
                  console.log('📱 [DashboardScreen] Retry error response:', retryErrorText);
                }
              } else {
                console.log('❌ [DashboardScreen] Token refresh did not return access_token');
                console.log('📱 [DashboardScreen] Refresh result:', JSON.stringify(refreshResult, null, 2));
              }
            } else {
              console.log('❌ [DashboardScreen] No refresh token available');
            }
          } catch (refreshError) {
            console.log('❌ [DashboardScreen] Token refresh failed for Tasks API');
            console.log('📱 [DashboardScreen] Refresh error:', refreshError);
            console.log('📱 [DashboardScreen] Refresh error details:', JSON.stringify(refreshError, null, 2));
          }
        }
        
        return [];
      }
    } catch (error) {
      console.log('Error in loadTasksFromAPI:', error);
      return [];
    }
  };

  const loadProductionHistory = async (statusFilter = null) => {
    try {
      setJobsLoading(true);
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        console.log('No auth token found');
        setJobsLoading(false);
        return;
      }

      if (!validateTokenLocally(accessToken)) {
        console.log('Local token check failed, validating session with backend...');
        try {
          const sessionResult = await validateSession();
          if (!sessionResult?.session_id) {
            throw new Error('Invalid session');
          }
        } catch (e) {
          console.log('Server session validation failed:', e);
          // Try to refresh token before logging out
          const shouldContinue = await handle401Error(null, null, navigation);
          if (!shouldContinue) {
            return;
          }
        }
      }

      // Determine status filter - use current filter or default based on selectedFilters
      const currentFilter = statusFilter || (selectedFilters.includes('All') ? 'All' : selectedFilters[0]);
      const filterLower = currentFilter.toLowerCase();

      // If "All" filter is selected, call both APIs in parallel
      if (filterLower === 'all') {
        console.log('Loading all tasks: Calling both tasks API and complete-production API in parallel...');
        
        try {
          // Call both APIs in parallel
          const [pendingTasks, completedTasksResponse] = await Promise.all([
            // Call tasks API for pending/inprogress tasks
            loadTasksFromAPI(accessToken, null),
            // Call complete-production API for completed tasks
            (async () => {
              try {
                const apiUrl = `${API_BASE_URL}/api/app/complete-production`;
                console.log('📱 [DashboardScreen] Complete-production API - Starting call');
                console.log('📱 [DashboardScreen] Complete-production URL:', apiUrl);
                
                // Validate session first
                let completeToken = accessToken;
                try {
                  const sessionResult = await validateSession();
                  console.log('📱 [DashboardScreen] Complete-production - Session validation:', JSON.stringify(sessionResult, null, 2));
                  if (sessionResult && sessionResult.session_id) {
                    completeToken = sessionResult.session_id;
                    console.log('✅ [DashboardScreen] Using validated session_id for complete-production');
                  }
                } catch (validateError) {
                  console.log('⚠️ [DashboardScreen] Session validation failed for complete-production, using original token');
                }
                
                // Try with Bearer token first
                const completeHeaders = createAuthHeaders(completeToken, { useBearer: true });
                console.log('📱 [DashboardScreen] Complete-production headers:', JSON.stringify(completeHeaders, null, 2));
                
                let response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: completeHeaders,
                });
                
                console.log('📱 [DashboardScreen] Complete-production Response 1 - Status:', response.status);
                
                // If 401, try without Bearer prefix
                if (response.status === 401) {
                  const errorText1 = await response.text().catch(() => '');
                  console.log('❌ [DashboardScreen] Complete-production API returned 401 with Bearer');
                  console.log('📱 [DashboardScreen] Error response:', errorText1);
                  console.log('📱 [DashboardScreen] Trying without Bearer...');
                  
                  response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: createAuthHeaders(completeToken, { useBearer: false }),
                  });
                  
                  console.log('📱 [DashboardScreen] Complete-production Response 2 - Status:', response.status);
                }

                if (response.ok) {
                  const data = await response.json();
                  console.log('✅ [DashboardScreen] Complete-production API Success!');
                  console.log('📱 [DashboardScreen] Complete-production response:', JSON.stringify(data, null, 2));
                  const tasks = data.tasks || data || [];
                  // Transform completed tasks to match UI format
                  return Array.isArray(tasks) ? tasks.map((item) => {
                    let mappedStatus = item.status || 'Completed';
                    if (mappedStatus.toLowerCase() === 'inprogress') {
                      mappedStatus = 'Pending';
                    } else if (mappedStatus.toLowerCase() === 'completed') {
                      mappedStatus = 'Completed';
                    }
                    
                    return {
                      id: item.element_name || `ELEM-${item.element_id}`,
                      title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
                      status: mappedStatus,
                      priority: 'Medium',
                      assignedDate: item.stage_name || 'N/A', // Show stage name in assigned column
                      drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                      test: item.stage_name || 'N/A',
                      // Mark as from complete-production API
                      fromCompleteProduction: true,
                      originalData: item,
                    };
                  }) : [];
                }
                return [];
              } catch (error) {
                console.log('Error fetching completed tasks:', error);
                return [];
              }
            })()
          ]);
          
          // Combine results from both APIs
          const allTasks = [...(pendingTasks || []), ...(completedTasksResponse || [])];
          console.log(`Loaded ${allTasks.length} total tasks (${pendingTasks?.length || 0} from tasks API + ${completedTasksResponse?.length || 0} from complete-production API)`);
          
          setJobs(allTasks);
          setJobsLoading(false);
        } catch (error) {
          console.log('Error loading all tasks:', error);
          // Fallback to just tasks API
          const allTasks = await loadTasksFromAPI(accessToken, null);
          setJobs(allTasks || []);
          setJobsLoading(false);
        }
      } else if (filterLower === 'pending') {
        // Call tasks API without status parameter, then filter on frontend
        console.log('Loading all tasks, then filtering for pending...');
        const allTasks = await loadTasksFromAPI(accessToken, null); // Get all tasks without status filter
        // Filter for pending/inprogress tasks on frontend
        const pendingTasks = (allTasks || []).filter(task => {
          const taskStatus = task.originalData?.status || task.status || '';
          const statusLower = taskStatus.toLowerCase();
          return statusLower === 'inprogress' || statusLower === 'pending' || statusLower === 'in progress';
        });
        console.log(`Filtered ${pendingTasks.length} pending tasks from ${allTasks?.length || 0} total tasks`);
        setJobs(pendingTasks);
        setJobsLoading(false);
      } else if (filterLower === 'completed') {
        // Call complete-production API to get completed tasks
        console.log('Loading completed tasks from complete-production API...');
        try {
          const apiUrl = `${API_BASE_URL}/api/app/complete-production`;
          
          // Validate session first
          let completeToken = accessToken;
          try {
            const sessionResult = await validateSession();
            console.log('📱 [DashboardScreen] Complete-production (filter) - Session validation:', JSON.stringify(sessionResult, null, 2));
            if (sessionResult && sessionResult.session_id) {
              completeToken = sessionResult.session_id;
              console.log('✅ [DashboardScreen] Using validated session_id for complete-production');
            }
          } catch (validateError) {
            console.log('⚠️ [DashboardScreen] Session validation failed, using original token');
          }
          
          // Try GET request first to fetch completed tasks
          // Try with Bearer token first
          console.log('📱 [DashboardScreen] Complete-production API (filter) - Starting call');
          console.log('📱 [DashboardScreen] URL:', apiUrl);
          
          let response = await fetch(apiUrl, {
            method: 'GET',
            headers: createAuthHeaders(completeToken, { useBearer: true }),
          });
          
          console.log('📱 [DashboardScreen] Complete-production Response 1 - Status:', response.status);
          
          // If 401, try without Bearer prefix
          if (response.status === 401) {
            const errorText1 = await response.text().catch(() => '');
            console.log('❌ [DashboardScreen] Complete-production API returned 401 with Bearer');
            console.log('📱 [DashboardScreen] Error response:', errorText1);
            console.log('📱 [DashboardScreen] Trying without Bearer...');
            
            response = await fetch(apiUrl, {
              method: 'GET',
              headers: createAuthHeaders(completeToken, { useBearer: false }),
            });
            
            console.log('📱 [DashboardScreen] Complete-production Response 2 - Status:', response.status);
          }

          console.log('📱 [DashboardScreen] Complete-production API final response status:', response.status);

          if (response.ok) {
            const data = await response.json();
            console.log('✅ [DashboardScreen] Complete-production API Success!');
            console.log('📱 [DashboardScreen] Completed tasks loaded successfully:', JSON.stringify(data, null, 2));
            
            // Transform API data to match UI format
            // API might return tasks array or different structure
            const tasks = data.tasks || data || [];
            const transformedJobs = Array.isArray(tasks) ? tasks.map((item) => {
              // Map status values: "Inprogress" -> "Pending", "Completed" -> "Completed"
              let mappedStatus = item.status || 'Completed';
              if (mappedStatus.toLowerCase() === 'inprogress') {
                mappedStatus = 'Pending';
              } else if (mappedStatus.toLowerCase() === 'completed') {
                mappedStatus = 'Completed';
              }
              
              return {
                id: item.element_name || `ELEM-${item.element_id}`,
                title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
                status: mappedStatus,
                priority: 'Medium',
                assignedDate: item.stage_name || 'N/A', // Show stage name in assigned column
                drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                test: item.stage_name || 'N/A',
                // Mark as from complete-production API
                fromCompleteProduction: true,
                // Store original data for navigation if needed
                originalData: item,
              };
            }) : [];
            
            setJobs(transformedJobs);
            setJobsLoading(false);
          } else {
            const errorText = await response.text();
            console.log('Complete-production API Error:', errorText);
            // Fallback to filtering from tasks API if complete-production doesn't work
            console.log('Falling back to tasks API with frontend filtering...');
            const allTasks = await loadTasksFromAPI(accessToken, null);
            const completedTasks = (allTasks || []).filter(task => {
              const taskStatus = task.originalData?.status || task.status || '';
              return taskStatus.toLowerCase() === 'completed';
            });
            // Fallback items from tasks API should not have green styling
            setJobs(completedTasks);
            setJobsLoading(false);
          }
        } catch (error) {
          console.log('Complete-production API Error:', error);
          // Fallback to filtering from tasks API
          console.log('Falling back to tasks API with frontend filtering...');
          const allTasks = await loadTasksFromAPI(accessToken, null);
          const completedTasks = (allTasks || []).filter(task => {
            const taskStatus = task.originalData?.status || task.status || '';
            return taskStatus.toLowerCase() === 'completed';
          });
          setJobs(completedTasks);
          setJobsLoading(false);
        }
      } else {
        // Default to pending if unknown filter
        console.log('Unknown filter, defaulting to pending...');
        const tasks = await loadTasksFromAPI(accessToken, 'pending');
        setJobs(tasks || []);
        setJobsLoading(false);
      }
    } catch (error) {
      console.log('Tasks Network/Request Error:', error);
      Alert.alert('Network Error', 'Failed to load tasks. Please check your internet connection and try again.');
      setJobs([]);
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadProductionHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Reload when project selection changes
    if (selectedProject) {
      loadProductionHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, selectedProjectId]);

  

  const handleJobPress = (jobId) => {
    // Find the original job data from the jobs list
    const jobData = jobs.find(job => job.id === jobId)?.originalData || null;
    navigation.navigate('JobDetails', { 
      jobId,
      jobData: jobData
    });
  };





  const handleQRScanned = (data, elementData = null) => {
    if (elementData) {
      // Navigate to element details screen with the fetched data
      navigation.navigate('ElementDetails', { 
        elementId: elementData.id,
        elementData: elementData 
      });
    } else {
      // Old behavior for backward compatibility
      Alert.alert(
        'QR Code Scanned',
        `Scanned data: ${data}`,
        [
          { text: 'OK' },
          { 
            text: 'View Job', 
            onPress: () => {
              // Try to extract job ID from QR data
              const jobIdMatch = data.match(/JOB-\d+/);
              if (jobIdMatch) {
                navigation.navigate('JobDetails', { jobId: jobIdMatch[0] });
              } else {
                Alert.alert('Info', 'No job ID found in QR code');
              }
            }
          }
        ]
      );
    }
  };

  const handleProjectSelect = (projectName, projectId = null) => {
    // Ensure projectName is always a string, not an object
    const name = typeof projectName === 'string' ? projectName : (projectName?.name || 'All Projects');
    const id = projectId === 'all' || projectId === null ? null : projectId;
    setSelectedProject(name);
    setSelectedProjectId(id);
  };

  const scrollUp = () => {
    if (scrollViewRef) {
      scrollViewRef.scrollTo({ y: 0, animated: true });
    }
  };

  const scrollDown = () => {
    if (scrollViewRef) {
      scrollViewRef.scrollToEnd({ animated: true });
    }
  };

  const onDragStart = () => {
    setIsDragging(true);
  };

  const onDragEnd = () => {
    setIsDragging(false);
  };


  const handleTabPress = useCallback((tabId, screenName) => {
    setActiveTab(tabId);
    const state = navigation.getState?.();
    const currentRoute = state?.routes?.[state?.index || 0]?.name;
    // If already on the target, do nothing (prevents re-navigate/remount)
    if (currentRoute === screenName || (screenName === 'Dashboard' && currentRoute === 'Dashboard')) {
      return;
    }
    if (screenName && screenName !== 'Dashboard') {
      navigation.navigate(screenName);
    }
  }, [navigation]);

  const handleScanPress = () => {
    setQrScannerVisible(true);
  };

  const filterOptions = ['All',  'Completed','Pending' ];
  
  const toggleFilter = (filter) => {
    // Single selection behavior - only one filter can be active at a time
    setSelectedFilters([filter]);
    // Reload data with new filter - pass "All" explicitly for All filter
    loadProductionHistory(filter === 'All' ? 'All' : filter);
  };

  // Use API jobs directly
  const availableJobs = jobs || [];

  // Since API already filters by status, we just use the jobs directly
  // Frontend filtering is only needed for "All" filter case or when API doesn't filter
  const filteredJobs = availableJobs || [];
  

  const getFilterColor = (filter) => {
    switch (filter) {
      case 'All': return Colors.primary;
      case 'Pending': return '#FF9500';
      case 'Completed': return '#34C759';
     
      default: return Colors.primary;
    }
  };

  const getFilterIcon = (filter) => {
    switch (filter) {
      case 'All': return '📋';
      case 'Pending': return '⏳';
      case 'Completed': return '✅';
     
      default: return '📋';
    }
  };

  const getTestIcon = (testType) => {
    switch (testType) {
      case 'play': return '▶️';
      case 'fast-forward': return '⏩';
      case 'checklist': return '✅';
      case 'edit': return '✏️';
      default: return '▶️';
    }
  };

  const pieChartData = [
    { label: 'Pending', value: 12, color: '#FF9500' },
    { label: 'Completed', value: 5, color: '#34C759' },
    { label: 'In Progress', value: 3, color: '#FF3B30' },
    
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return '#FF9500';
      case 'In Progress': return '#007AFF';
      case 'Completed': return '#34C759';
      default: return '#8E8E93';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return '#FF3B30';
      case 'Medium': return '#FF9500';
      case 'Low': return '#34C759';
      default: return '#8E8E93';
    }
  };

  return (
    <View style={styles.mainContainer}>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical
        bounces
        overScrollMode="always"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              const currentFilter = selectedFilters.includes('All') ? null : selectedFilters[0];
              await loadProductionHistory(currentFilter);
              setRefreshing(false);
            }}
            tintColor="#007AFF"
            colors={["#007AFF"]}
          />
        }
      >

      {/* Project Dropdown Component */}
      <View style={styles.projectDropdownWrapper}>
      <ProjectDropdown
        selectedProject={typeof selectedProject === 'string' ? selectedProject : (selectedProject?.name || 'All Projects')}
        onProjectSelect={(project) => {
          // Ensure we extract the name and ID from the project object
          const projectName = project?.name || 'All Projects';
          const projectId = project?.project_id || null;
          handleProjectSelect(projectName, projectId);
        }}
        navigation={navigation}
      />
      </View>

      <View style={styles.pieChartContainer}>
        <PieChart 
          data={pieChartData}
          title="QC Jobs Status Distribution"
          size={180}
        />
      </View>

      <View style={styles.jobsSection}>
        <Text style={styles.sectionTitle}>Recent Jobs</Text>
        
        {/* Filter Buttons */}
        <View style={styles.filterWrapper}>
          <View style={styles.filterContainer}>
            {(filterOptions || []).map((filter) => {
              const isSelected = selectedFilters.includes(filter);
              return (
                <TouchableOpacity
                  key={filter}
                  style={[
                    styles.filterButton,
                    isSelected && styles.filterButtonSelected,
                    { 
                      backgroundColor: isSelected ? getFilterColor(filter) : '#FFFFFF',
                      borderColor: getFilterColor(filter),
                      borderWidth: isSelected ? 2 : 1,
                    }
                  ]}
                  onPress={() => toggleFilter(filter)}
                >
                  <Text style={[
                    styles.filterText,
                    { 
                      color: isSelected ? '#FFFFFF' : getFilterColor(filter),
                      fontWeight: isSelected ? '700' : '600'
                    }
                  ]}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={styles.elementHeaderText}>Element</Text>
          <Text style={styles.assignedHeaderText}>Stage</Text>
          <Text style={styles.tableHeaderText}>Drawing</Text>
          <Text style={styles.menuHeaderText}></Text>
        </View>

        {/* Table Rows */}
        <View style={styles.tableWrapper}>
          {jobsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading jobs...</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.tableContainer} 
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              scrollEnabled={true}
            >
              {(filteredJobs || []).length > 0 ? (
                (filteredJobs || []).map((job, index) => (
                  <View
                    key={`${job.id}-${index}`}
                    style={[
                      styles.tableRow,
                      job.fromCompleteProduction && styles.tableRowCompleted,
                      !job.fromCompleteProduction && selectedFilters.includes('All') && styles.tableRowPending,
                      index === 0 && styles.firstTableRow,
                      index === (filteredJobs || []).length - 1 && styles.lastTableRow
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.elementTextContainer}
                      onPress={async () => {
                        const elementId = job.originalData?.element_id || job.originalData?.id || job.id?.replace('ELEM-', '') || job.id;
                        
                        // Call the scan_element API (same as QR Scanner)
                        try {
                          const { accessToken } = await getTokens();
                          if (!accessToken) {
                            Alert.alert('Authentication Required', 'Please login to fetch element details.');
                            return;
                          }

                          if (!validateToken(accessToken)) {
                            // Try to refresh token instead of logging out immediately
                            const shouldContinue = await handle401Error(null, null, navigation);
                            if (!shouldContinue) {
                              return;
                            }
                          }

                          const apiUrl = `${API_BASE_URL}/api/scan_element/${elementId}`;
                          console.log('Fetching element details from:', apiUrl);

                          const response = await fetch(apiUrl, {
                            method: 'GET',
                            headers: {
                              'Authorization': `Bearer ${accessToken}`,
                              'Content-Type': 'application/json',
                              'Accept': 'application/json',
                              'X-Requested-With': 'XMLHttpRequest',
                              'User-Agent': 'PrecastApp/1.0',
                            },
                          });

                          if (response.ok) {
                            const elementData = await response.json();
                            console.log('Element details fetched successfully:', elementData);
                            // Navigate to ElementDetails screen with fetched data
                            navigation.navigate('ElementDetails', {
                              elementId: elementId,
                              elementData: elementData
                            });
                          } else {
                            const errorInfo = await handleApiError(response, 'Element Details API');
                            if (response.status === 401) {
                              const shouldRetry = await handle401Error(response, null, navigation);
                              if (!shouldRetry) {
                                Alert.alert('Error', 'Failed to fetch element details. Please try again.');
                              }
                            } else {
                              Alert.alert('Error', errorInfo.message);
                            }
                          }
                        } catch (error) {
                          console.log('Error fetching element details:', error);
                          Alert.alert('Network Error', `Failed to fetch element details: ${error.message}`);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.elementText}>{job.id}</Text>
                    </TouchableOpacity>
                    <Text style={styles.assignedText}>{job.assignedDate}</Text>
                    <View style={styles.iconContainer}>
                      <TouchableOpacity
                        onPress={() => {
                          const elementId = job.originalData?.element_id || job.originalData?.id || job.id?.replace('ELEM-', '') || job.id;
                          setSelectedElementId(elementId);
                          setSelectedElementData(job.originalData || job);
                          setDrawingFilesModalVisible(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <Image source={require('../icons/downloads.png')} style={styles.downloadImg} resizeMode="contain" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.menuIconContainer}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedJobForMenu(job);
                          setMenuVisible(true);
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.menuIconButton}
                      >
                        <Text style={[
                          styles.menuIcon,
                          job.fromCompleteProduction && styles.menuIconCompleted,
                          !job.fromCompleteProduction && selectedFilters.includes('All') && styles.menuIconPending
                        ]}>⋯</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No jobs found for selected filters</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>

        <CameraQRScanner
          visible={qrScannerVisible}
          onClose={() => setQrScannerVisible(false)}
          onScan={handleQRScanned}
          navigation={navigation}
        />

        <DrawingFilesModal
          visible={drawingFilesModalVisible}
          onClose={() => {
            setDrawingFilesModalVisible(false);
            setSelectedElementId(null);
            setSelectedElementData(null);
          }}
          elementId={selectedElementId}
          elementData={selectedElementData}
        />

        {/* Menu Popup */}
        <Modal
          visible={menuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          >
            <View style={styles.menuContainer}>
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={async () => {
                  if (selectedJobForMenu) {
                    setMenuVisible(false);
                    const elementId = selectedJobForMenu.originalData?.element_id || selectedJobForMenu.originalData?.id || selectedJobForMenu.id?.replace('ELEM-', '') || selectedJobForMenu.id;
                    
                    // Call the scan_element API (same as QR Scanner)
                    try {
                      const { accessToken } = await getTokens();
                      if (!accessToken) {
                        Alert.alert('Authentication Required', 'Please login to fetch element details.');
                        return;
                      }

                      if (!validateToken(accessToken)) {
                        // Try to refresh token instead of logging out immediately
                        const shouldContinue = await handle401Error(null, null, navigation);
                        if (!shouldContinue) {
                          return;
                        }
                      }

                          const apiUrl = `${API_BASE_URL}/api/scan_element/${elementId}`;
                      console.log('Fetching element details from:', apiUrl);

                      const response = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                          'Authorization': `Bearer ${accessToken}`,
                          'Content-Type': 'application/json',
                          'Accept': 'application/json',
                          'X-Requested-With': 'XMLHttpRequest',
                          'User-Agent': 'PrecastApp/1.0',
                        },
                      });

                      if (response.ok) {
                        const elementData = await response.json();
                        console.log('Element details fetched successfully:', elementData);
                        // Navigate to ElementDetails screen with fetched data
                        navigation.navigate('ElementDetails', {
                          elementId: elementId,
                          elementData: elementData
                        });
                      } else {
                        const errorText = await response.text();
                        const errorInfo = await handleApiError(response, 'Element Details API');
                        if (response.status === 401) {
                          const shouldRetry = await handle401Error(response, null, navigation);
                          if (!shouldRetry) {
                            Alert.alert('Error', 'Failed to fetch element details. Please try again.');
                          }
                        } else {
                          Alert.alert('Error', errorInfo.message);
                        }
                      }
                    } catch (error) {
                      console.log('Error fetching element details:', error);
                      Alert.alert('Network Error', `Failed to fetch element details: ${error.message}`);
                    }
                  }
                }}
              >
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemIcon}>📋</Text>
                  <Text style={styles.menuItemText}>Element Detail</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={[
                  styles.menuItem,
                  selectedJobForMenu?.fromCompleteProduction && styles.menuItemDisabled
                ]}
                activeOpacity={selectedJobForMenu?.fromCompleteProduction ? 1 : 0.7}
                disabled={selectedJobForMenu?.fromCompleteProduction}
                onPress={async () => {
                  if (selectedJobForMenu && !selectedJobForMenu.fromCompleteProduction) {
                    try {
                      const { accessToken } = await getTokens();
                      if (!accessToken) {
                        Alert.alert('Authentication Required', 'Please login to proceed with QC questions.');
                        setMenuVisible(false);
                        return;
                      }

                      if (!validateToken(accessToken)) {
                        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
                        await logout();
                        navigation.reset({
                          index: 0,
                          routes: [{ name: 'Login' }],
                        });
                        setMenuVisible(false);
                        return;
                      }

                      // Get paper_id from item data
                      const paperId = selectedJobForMenu.originalData?.paper_id || selectedJobForMenu.originalData?.paper?.id || selectedJobForMenu.paper_id;
                      
                      if (!paperId) {
                        Alert.alert('Error', 'Paper ID not found. Cannot proceed with questions.');
                        setMenuVisible(false);
                        return;
                      }

                      // Get additional IDs needed for submission
                      const taskId = selectedJobForMenu.originalData?.id || selectedJobForMenu.originalData?.task_id || selectedJobForMenu.id;
                      const projectId = selectedJobForMenu.originalData?.project_id || selectedProjectId;
                      const stageId = selectedJobForMenu.originalData?.stage_id || selectedJobForMenu.originalData?.stage?.id;
                      const activityId = selectedJobForMenu.originalData?.activity_id || taskId;

                      // Navigate to QuestionsScreen with all necessary data
                      navigation.navigate('Questions', { 
                        paperId: paperId,
                        taskId: taskId,
                        projectId: projectId,
                        stageId: stageId,
                        activityId: activityId,
                      });
                      setMenuVisible(false);
                    } catch (error) {
                      console.log('Error navigating to questions:', error);
                      Alert.alert('Network Error', `Failed to load questions: ${error.message}`);
                      setMenuVisible(false);
                    }
                  } else {
                    setMenuVisible(false);
                  }
                }}
              >
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemIcon}>✅</Text>
                  <Text style={[
                    styles.menuItemText,
                    selectedJobForMenu?.fromCompleteProduction && styles.menuItemTextDisabled
                  ]}>QC Proceed</Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
      
      {!hideBottomNav && (
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  projectDropdownWrapper: {
    marginTop: 16,
  },
  title: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusSummary: {
    padding: 16,
    backgroundColor: Colors.background,
    marginBottom: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  pieChartContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  summaryCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryCard: {
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  pendingCard: {
    backgroundColor: Colors.background,
    borderColor: '#FFE4B5',
  },
  progressCard: {
    backgroundColor: Colors.background,
    borderColor: '#B3D9FF',
  },
  completedCard: {
    backgroundColor: Colors.background,
    borderColor: '#B3FFB3',
  },
  rejectedCard: {
    backgroundColor: Colors.background,
    borderColor: '#FFB3B3',
  },
  overdueCard: {
    backgroundColor: Colors.background,
    borderColor: '#FFE4B5',
  },
  summaryNumber: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
    lineHeight: FontSizes.large + 4,
  },
  summaryLabel: {
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: FontWeights.semiBold,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  jobsSection: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
    borderRadius: 16,
    marginHorizontal: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  filterWrapper: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'nowrap',
    width: '100%',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
    marginHorizontal: 6,
    minWidth: 100,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterButtonSelected: {
    transform: [{ scale: 1.05 }],
  },
  filterText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.semiBold,
  },
  scrollHint: {
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: 'transparent',
    marginTop: 4,
    marginBottom: 16,
  },
  scrollHintText: {
    fontSize: FontSizes.extraSmall,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
    fontStyle: 'italic',
  },
  tableWrapper: {
    backgroundColor: Colors.background,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderTopWidth: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 0,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
  },
  tableHeaderText: {
    flex: 1,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  elementHeaderText: {
    flex: 2,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginRight: 8,
  },
  assignedHeaderText: {
    flex: 1.5,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginLeft: 8,
  },
  menuHeaderText: {
    flex: 0.9,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  tableContainer: {
    maxHeight: 400,
    flexGrow: 1,
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: Colors.background,
    borderRadius: 0,
    marginBottom: 0,
  },
  tableRowCompleted: {
  
    borderLeftWidth: 4,
    borderLeftColor: '#34C759',
  },
  tableRowPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  firstTableRow: {
    borderTopWidth: 0,
  },
  lastTableRow: {
    borderBottomWidth: 0,
  },
  elementTextContainer: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  elementText: {
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  assignedText: {
    flex: 1.5,
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginLeft: 8,
  },
  iconContainer: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadIcon: {
    fontSize: FontSizes.icon,
    color: Colors.textPrimary,
  },
  downloadImg: {
    width: 20,
    height: 20,
  },
  menuIcon: {
    fontSize: 24,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
  },
  menuIconCompleted: {
    color: '#34C759',
  },
  menuIconPending: {
    color: '#FF9500',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    minWidth: 220,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    backgroundColor: Colors.background,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  menuItemText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    fontWeight: FontWeights.semiBold,
    flex: 1,
  },
  menuItemDisabled: {
    opacity: 0.5,
  },
  menuItemTextDisabled: {
    color: Colors.textSecondary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.background,
    marginHorizontal: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  jobCard: {
    backgroundColor: Colors.background,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobId: {
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: Colors.textWhite,
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.semiBold,
  },
  jobTitle: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    color: Colors.textWhite,
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.semiBold,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
});

export default DashboardScreen;
