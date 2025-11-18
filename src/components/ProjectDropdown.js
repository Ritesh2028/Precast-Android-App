import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const ProjectDropdown = ({ selectedProject, onProjectSelect, navigation }) => {
  const [projects, setProjects] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [dropdownAnimation] = useState(new Animated.Value(0));

  useEffect(() => {
    loadProjects();
  }, []);

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

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      const token = await AsyncStorage.getItem('auth_token');
      console.log('Loading projects with token:', token ? 'Yes' : 'No');
      
      if (token) {
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

        const apiUrl = 'https://precast.blueinvent.com/api/projects/basic';
        console.log('Making API call to:', apiUrl);
        
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
        
        console.log('Projects API response status:', response.status);
        
        if (response.ok) {
          const projectsData = await response.json();
          console.log('Projects loaded successfully:', projectsData);
          
          // Transform API data to include "All Projects" option and filter out suspended projects
          const transformedProjects = [
            { project_id: 'all', name: 'All Projects', suspend: false },
            ...projectsData.filter(project => !project.suspend) // Only show non-suspended projects
          ];
          
          setProjects(transformedProjects);
          setProjectsLoading(false);
        } else {
          const errorText = await response.text();
          console.log('Projects API Error Response:', errorText);
          
          if (response.status === 401) {
            console.log('401 Authentication Error - redirecting to login');
            Alert.alert('Authentication Error', 'Your session has expired. Please login again.');
            await AsyncStorage.removeItem('auth_token');
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } else {
            console.log(`Projects API Error Status: ${response.status}`);
            Alert.alert('Error', `Failed to load projects. Status: ${response.status}`);
            setProjectsLoading(false);
          }
        }
      } else {
        console.log('No auth token found - user needs to login');
        setProjects([]);
        setProjectsLoading(false);
      }
    } catch (error) {
      console.log('Projects API Network/Request Error:', error);
      Alert.alert('Network Error', 'Failed to load projects. Please check your internet connection and try again.');
      setProjectsLoading(false);
    }
  };

  const toggleDropdown = () => {
    const toValue = isDropdownOpen ? 0 : 1;
    setIsDropdownOpen(!isDropdownOpen);
    
    Animated.timing(dropdownAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const selectProject = (project) => {
    // Pass both the project object and the name separately
    if (typeof onProjectSelect === 'function') {
      onProjectSelect(project);
    }
    toggleDropdown();
  };

  return (
    <View style={styles.projectDropdownContainer}>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={toggleDropdown}
        disabled={projectsLoading}
      >
        <Text style={styles.dropdownButtonText}>
          {projectsLoading ? 'Loading Projects...' : selectedProject}
        </Text>
        <Text style={styles.dropdownArrow}>{isDropdownOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      
      {/* Modal-based Dropdown with Smooth Transitions */}
      <Modal
        visible={isDropdownOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={toggleDropdown}
      >
        <Animated.View
          style={[
            styles.modalBackdrop,
            {
              opacity: dropdownAnimation,
            }
          ]}
        >
          <TouchableOpacity
            style={styles.modalBackdropTouchable}
            onPress={toggleDropdown}
            activeOpacity={1}
          />
          
          <Animated.View
            style={[
              styles.modalDropdownContainer,
              {
                transform: [{
                  translateY: dropdownAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  })
                }, {
                  scale: dropdownAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  })
                }],
                opacity: dropdownAnimation,
              }
            ]}
          >
            <View style={styles.modalDropdownHeader}>
              <Text style={styles.modalDropdownTitle}>Select Project</Text>
              <TouchableOpacity 
                onPress={toggleDropdown}
                style={styles.modalCloseButtonContainer}
              >
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {projectsLoading ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.modalLoadingText}>Loading Projects...</Text>
              </View>
            ) : (
                <FlatList
                  data={projects}
                  renderItem={({ item, index }) => (
                    <Animated.View
                      style={{
                        opacity: dropdownAnimation,
                        transform: [{
                          translateX: dropdownAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20, 0],
                          })
                        }]
                      }}
                    >
                      <TouchableOpacity
                        style={[
                          styles.modalDropdownItem,
                          selectedProject === item.name && styles.modalDropdownItemSelected,
                          index === projects.length - 1 && styles.modalDropdownItemLast
                        ]}
                        onPress={() => selectProject(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.modalDropdownItemText,
                          selectedProject === item.name && styles.modalDropdownItemTextSelected
                        ]}>
                          {item.name}
                        </Text>
                        {selectedProject === item.name && (
                          <Animated.Text 
                            style={[
                              styles.modalDropdownCheckmark,
                              {
                                opacity: dropdownAnimation,
                                transform: [{
                                  scale: dropdownAnimation.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.5, 1],
                                  })
                                }]
                              }
                            ]}
                          >
                            ✓
                          </Animated.Text>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                  keyExtractor={(item, index) => item.project_id.toString()}
                  style={styles.modalDropdownList}
                  contentContainerStyle={styles.modalDropdownListContent}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={false}
                  bounces={true}
                  alwaysBounceVertical={false}
                />
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  projectDropdownContainer: {
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 20,
    position: 'relative',
    zIndex: 1000,
  },
  dropdownLabel: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownButtonText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: FontWeights.semiBold,
    flex: 1,
  },
  dropdownArrow: {
    fontSize: FontSizes.extraSmall,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  // Modal-based Dropdown Styles with Smooth Transitions
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalDropdownContainer: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    margin: 20,
    maxHeight: '90%',
    minHeight: 400,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden', // Prevent content from going outside container
  },
  modalDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalDropdownTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  modalCloseButtonContainer: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: Colors.background,
  },
  modalCloseButton: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    fontWeight: FontWeights.bold,
  },
  modalDropdownList: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalDropdownListContent: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  modalDropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: Colors.background,
  },
  modalDropdownItemSelected: {
    backgroundColor: Colors.background,
  },
  modalDropdownItemLast: {
    borderBottomWidth: 0, // Remove border from last item
  },
  modalDropdownItemText: {
    fontSize: FontSizes.medium,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: FontWeights.semiBold,
    flex: 1,
  },
  modalDropdownItemTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.semiBold,
  },
  modalDropdownCheckmark: {
    fontSize: FontSizes.regular,
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  modalLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  modalLoadingText: {
    marginTop: 16,
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
});

export default ProjectDropdown;
