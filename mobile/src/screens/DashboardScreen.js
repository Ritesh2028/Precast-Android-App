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
import AsyncStorage from '@react-native-async-storage/async-storage';
import CameraQRScanner from '../components/CameraQRScanner';
import BottomNavigation from '../components/BottomNavigation';
import PieChart from '../components/PieChart';
import ProjectDropdown from '../components/ProjectDropdown';
import DrawingFilesModal from '../components/DrawingFilesModal';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

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
      let apiUrl = 'https://precast.blueinvent.com/api/app/tasks';
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

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'PrecastApp/1.0',
        },
      });

      console.log('Tasks API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Tasks loaded successfully:', data);
        
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
        console.log('Tasks API Error:', errorText);
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
      const token = await AsyncStorage.getItem('auth_token');
      
      if (!token) {
        console.log('No auth token found');
        setJobsLoading(false);
        return;
      }

      if (!validateToken(token)) {
        console.log('Token is invalid or expired');
        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
        await AsyncStorage.removeItem('auth_token');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
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
            loadTasksFromAPI(token, null),
            // Call complete-production API for completed tasks
            (async () => {
              try {
                const apiUrl = 'https://precast.blueinvent.com/api/app/complete-production';
                const response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'PrecastApp/1.0',
                  },
                });

                if (response.ok) {
                  const data = await response.json();
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
          const allTasks = await loadTasksFromAPI(token, null);
          setJobs(allTasks || []);
          setJobsLoading(false);
        }
      } else if (filterLower === 'pending') {
        // Call tasks API without status parameter, then filter on frontend
        console.log('Loading all tasks, then filtering for pending...');
        const allTasks = await loadTasksFromAPI(token, null); // Get all tasks without status filter
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
          const apiUrl = 'https://precast.blueinvent.com/api/app/complete-production';
          
          // Try GET request first to fetch completed tasks
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': token,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'User-Agent': 'PrecastApp/1.0',
            },
          });

          console.log('Complete-production API response status:', response.status);

          if (response.ok) {
            const data = await response.json();
            console.log('Completed tasks loaded successfully:', data);
            
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
            const allTasks = await loadTasksFromAPI(token, null);
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
          const allTasks = await loadTasksFromAPI(token, null);
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
        const tasks = await loadTasksFromAPI(token, 'pending');
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
      case 'All': return '#8E8E93';
      case 'Pending': return '#FF9500';
      case 'Completed': return '#34C759';
     
      default: return '#8E8E93';
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

      <View style={styles.statusSummary}>
        <Text style={styles.sectionTitle}>Status Summary</Text>
        <View style={styles.summaryCards}>
          <View style={[styles.summaryCard, styles.pendingCard]}>
            <Text style={styles.summaryNumber}>12</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={[styles.summaryCard, styles.completedCard]}>
            <Text style={styles.summaryNumber}>5</Text>
            <Text style={styles.summaryLabel}>Completed</Text>
          </View>
          <View style={[styles.summaryCard, styles.rejectedCard]}>
            <Text style={styles.summaryNumber}>3</Text>
            <Text style={styles.summaryLabel}>Rejected</Text>
          </View>
          <View style={[styles.summaryCard, styles.overdueCard]}>
            <Text style={styles.summaryNumber}>2</Text>
            <Text style={styles.summaryLabel}>Overdue</Text>
          </View>
        </View>
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
                      backgroundColor: isSelected ? getFilterColor(filter) : '#f8f9fa',
                      borderColor: getFilterColor(filter),
                      borderWidth: isSelected ? 2 : 1,
                    }
                  ]}
                  onPress={() => toggleFilter(filter)}
                >
                  <Text style={[
                    styles.filterText,
                    { 
                      color: isSelected ? '#fff' : '#333',
                      fontWeight: isSelected ? '700' : '500'
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
                          const token = await AsyncStorage.getItem('auth_token');
                          if (!token) {
                            Alert.alert('Authentication Required', 'Please login to fetch element details.');
                            return;
                          }

                          if (!validateToken(token)) {
                            Alert.alert('Session Expired', 'Your session has expired. Please login again.');
                            await AsyncStorage.removeItem('auth_token');
                            navigation.reset({
                              index: 0,
                              routes: [{ name: 'Login' }],
                            });
                            return;
                          }

                          const apiUrl = `https://precast.blueinvent.com/api/scan_element/${elementId}`;
                          console.log('Fetching element details from:', apiUrl);

                          const response = await fetch(apiUrl, {
                            method: 'GET',
                            headers: {
                              'Authorization': token,
                              'session_id': token,
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
                            console.log('Error fetching element details:', errorText);
                            if (response.status === 401) {
                              Alert.alert('Authentication Error', 'Your session has expired. Please login again.');
                              await AsyncStorage.removeItem('auth_token');
                              navigation.reset({
                                index: 0,
                                routes: [{ name: 'Login' }],
                              });
                            } else {
                              Alert.alert('Error', `Failed to fetch element details. Status: ${response.status}`);
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
                      const token = await AsyncStorage.getItem('auth_token');
                      if (!token) {
                        Alert.alert('Authentication Required', 'Please login to fetch element details.');
                        return;
                      }

                      if (!validateToken(token)) {
                        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
                        await AsyncStorage.removeItem('auth_token');
                        navigation.reset({
                          index: 0,
                          routes: [{ name: 'Login' }],
                        });
                        return;
                      }

                      const apiUrl = `https://precast.blueinvent.com/api/scan_element/${elementId}`;
                      console.log('Fetching element details from:', apiUrl);

                      const response = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                          'Authorization': token,
                          'session_id': token,
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
                        console.log('Error fetching element details:', errorText);
                        if (response.status === 401) {
                          Alert.alert('Authentication Error', 'Your session has expired. Please login again.');
                          await AsyncStorage.removeItem('auth_token');
                          navigation.reset({
                            index: 0,
                            routes: [{ name: 'Login' }],
                          });
                        } else {
                          Alert.alert('Error', `Failed to fetch element details. Status: ${response.status}`);
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
                onPress={() => {
                  if (selectedJobForMenu && !selectedJobForMenu.fromCompleteProduction) {
                    // Navigate to JobDetails screen
                    navigation.navigate('JobDetails', {
                      jobId: selectedJobForMenu.id,
                      jobData: selectedJobForMenu.originalData || selectedJobForMenu
                    });
                  }
                  setMenuVisible(false);
                }}
              >
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemIcon}>✅</Text>
                  <Text style={[
                    styles.menuItemText,
                    selectedJobForMenu?.fromCompleteProduction && styles.menuItemTextDisabled
                  ]}>Task</Text>
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
    padding: 24,
    backgroundColor: Colors.background,
    borderRadius: 16,
    marginHorizontal: 16,
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
    paddingHorizontal: 12,
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
    flex: 0.8,
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
    paddingHorizontal: 12,
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
    flex: 0.8,
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
