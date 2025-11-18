import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const TowerFloorFilter = ({ jobs = [], onFilterChange }) => {
  const [selectedTower, setSelectedTower] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [towerDropdownVisible, setTowerDropdownVisible] = useState(false);
  const [floorDropdownVisible, setFloorDropdownVisible] = useState(false);

  // Extract unique towers and floors from jobs
  const extractTowerFloor = (item) => {
    const tower = item.originalData?.tower || item.originalData?.tower_name || item.originalData?.element_type?.tower || item.originalData?.element_type?.tower_name || item.tower || item.tower_name;
    const floor = item.originalData?.floor || item.originalData?.floor_name || item.originalData?.element_type?.floor || item.originalData?.element_type?.floor_name || item.floor || item.floor_name;
    return { tower, floor };
  };

  // Get unique towers
  const uniqueTowers = Array.from(new Set(
    jobs
      .map(item => extractTowerFloor(item).tower)
      .filter(tower => tower && tower !== 'N/A')
  )).sort();

  // Clear selected tower if it's not in available towers
  useEffect(() => {
    if (selectedTower && !uniqueTowers.includes(selectedTower)) {
      setSelectedTower(null);
      setSelectedFloor(null);
    }
  }, [uniqueTowers, selectedTower]);

  // Get floors for selected tower
  const getFloorsForTower = (towerName) => {
    if (!towerName) return [];
    return Array.from(new Set(
      jobs
        .filter(item => {
          const { tower } = extractTowerFloor(item);
          return tower === towerName;
        })
        .map(item => extractTowerFloor(item).floor)
        .filter(floor => floor && floor !== 'N/A')
    )).sort();
  };

  const availableFloors = selectedTower ? getFloorsForTower(selectedTower) : [];

  // Clear selected floor if it's not in available floors
  useEffect(() => {
    if (selectedFloor && selectedTower && !availableFloors.includes(selectedFloor)) {
      setSelectedFloor(null);
    }
  }, [availableFloors, selectedFloor, selectedTower]);

  // Notify parent component when filters change
  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({ tower: selectedTower, floor: selectedFloor });
    }
  }, [selectedTower, selectedFloor, onFilterChange]);

  return (
    <View style={styles.towerFloorFilterWrapper}>
      <View style={styles.towerFloorFilterContainer}>
        {/* Tower Filter */}
        <View style={styles.filterSelectContainer}>
          <View style={styles.filterSelectLabelContainer}>
            <Image 
              source={require('../icons/tawer.png')} 
              style={styles.filterSelectLabelIcon} 
              resizeMode="contain" 
            />
            <Text style={styles.filterSelectLabel}>Tower</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.filterSelectButton,
              selectedTower && styles.filterSelectButtonActive,
              towerDropdownVisible && styles.filterSelectButtonOpen
            ]}
            activeOpacity={0.7}
            onPress={() => {
              setTowerDropdownVisible(!towerDropdownVisible);
              setFloorDropdownVisible(false);
            }}
          >
            <View style={styles.filterSelectButtonContent}>
              <Text style={[
                styles.filterSelectButtonText,
                selectedTower && styles.filterSelectButtonTextActive
              ]} numberOfLines={1}>
                {selectedTower || 'Select Tower'}
              </Text>
              <View style={[
                styles.filterSelectArrowContainer,
                selectedTower && styles.filterSelectArrowContainerActive
              ]}>
                <Text style={[
                  styles.filterSelectArrow,
                  selectedTower && styles.filterSelectArrowActive
                ]}>{towerDropdownVisible ? '▲' : '▼'}</Text>
              </View>
            </View>
          </TouchableOpacity>
          
          {/* Tower Dropdown */}
          {towerDropdownVisible && (
            <View style={styles.dropdownContainer}>
              <ScrollView style={styles.dropdownScrollView} nestedScrollEnabled={true}>
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    !selectedTower && styles.dropdownItemSelected
                  ]}
                  onPress={() => {
                    setSelectedTower(null);
                    setSelectedFloor(null);
                    setTowerDropdownVisible(false);
                  }}
                >
                  <Text style={[
                    styles.dropdownItemText,
                    !selectedTower && styles.dropdownItemTextSelected
                  ]}>All Towers</Text>
                </TouchableOpacity>
                {uniqueTowers.map((tower, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dropdownItem,
                      selectedTower === tower && styles.dropdownItemSelected
                    ]}
                    onPress={() => {
                      setSelectedTower(tower);
                      setSelectedFloor(null);
                      setTowerDropdownVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      selectedTower === tower && styles.dropdownItemTextSelected
                    ]}>{tower}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Floor Filter */}
        <View style={styles.filterSelectContainer}>
          <View style={styles.filterSelectLabelContainer}>
            <Image 
              source={require('../icons/floor.png')} 
              style={styles.filterSelectLabelIcon} 
              resizeMode="contain" 
            />
            <Text style={styles.filterSelectLabel}>Floor</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.filterSelectButton,
              selectedFloor && styles.filterSelectButtonActive,
              !selectedTower && styles.filterSelectButtonDisabled,
              floorDropdownVisible && styles.filterSelectButtonOpen
            ]}
            disabled={!selectedTower}
            activeOpacity={!selectedTower ? 1 : 0.7}
            onPress={() => {
              if (!selectedTower) return;
              setFloorDropdownVisible(!floorDropdownVisible);
              setTowerDropdownVisible(false);
            }}
          >
            <View style={styles.filterSelectButtonContent}>
              <Text style={[
                styles.filterSelectButtonText,
                selectedFloor && styles.filterSelectButtonTextActive,
                !selectedTower && styles.filterSelectButtonTextDisabled
              ]} numberOfLines={1}>
                {selectedFloor || (selectedTower ? 'Select Floor' : 'Select Tower First')}
              </Text>
              <View style={[
                styles.filterSelectArrowContainer,
                selectedFloor && styles.filterSelectArrowContainerActive,
                !selectedTower && styles.filterSelectArrowContainerDisabled
              ]}>
                <Text style={[
                  styles.filterSelectArrow,
                  selectedFloor && styles.filterSelectArrowActive,
                  !selectedTower && styles.filterSelectArrowDisabled
                ]}>{floorDropdownVisible ? '▲' : '▼'}</Text>
              </View>
            </View>
          </TouchableOpacity>
          
          {/* Floor Dropdown */}
          {floorDropdownVisible && selectedTower && (
            <View style={styles.dropdownContainer}>
              <ScrollView style={styles.dropdownScrollView} nestedScrollEnabled={true}>
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    !selectedFloor && styles.dropdownItemSelected
                  ]}
                  onPress={() => {
                    setSelectedFloor(null);
                    setFloorDropdownVisible(false);
                  }}
                >
                  <Text style={[
                    styles.dropdownItemText,
                    !selectedFloor && styles.dropdownItemTextSelected
                  ]}>All Floors</Text>
                </TouchableOpacity>
                {availableFloors.map((floor, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dropdownItem,
                      selectedFloor === floor && styles.dropdownItemSelected
                    ]}
                    onPress={() => {
                      setSelectedFloor(floor);
                      setFloorDropdownVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      selectedFloor === floor && styles.dropdownItemTextSelected
                    ]}>{floor}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
      {(selectedTower || selectedFloor) && (
        <TouchableOpacity
          style={styles.clearFilterButton}
          onPress={() => {
            setSelectedTower(null);
            setSelectedFloor(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.clearFilterButtonText}>Clear Filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  towerFloorFilterWrapper: {
    marginBottom: 20,
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 0.5,
    borderColor: '#E8E8ED',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'visible',
    zIndex: 999,
  },
  towerFloorFilterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  filterSelectContainer: {
    flex: 1,
    position: 'relative',
    zIndex: 1000,
    minWidth: 0,
    elevation: 10,
  },
  filterSelectLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  filterSelectLabelIcon: {
    width: 17,
    height: 17,
    marginRight: 9,
    tintColor: '#636366',
    opacity: 0.8,
  },
  filterSelectLabel: {
    fontSize: 13,
    fontWeight: FontWeights.semiBold,
    color: '#636366',
    letterSpacing: 0.2,
    flex: 1,
  },
  filterSelectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  filterSelectButtonActive: {
    borderColor: '#e0e0e0',
    borderWidth: 1,
    backgroundColor: Colors.background,
  },
  filterSelectButtonOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  filterSelectButtonDisabled: {
    backgroundColor: '#F8F8F8',
    borderColor: '#E0E0E0',
    opacity: 0.7,
  },
  filterSelectButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  filterSelectButtonText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: FontWeights.semiBold,
    flex: 1,
  },
  filterSelectButtonTextActive: {
    color: Colors.textPrimary,
    fontWeight: FontWeights.semiBold,
  },
  filterSelectButtonTextDisabled: {
    color: '#C7C7CC',
  },
  filterSelectArrowContainer: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  filterSelectArrowContainerActive: {
    backgroundColor: 'transparent',
  },
  filterSelectArrowContainerDisabled: {
    backgroundColor: 'transparent',
  },
  filterSelectArrow: {
    fontSize: FontSizes.extraSmall,
    color: Colors.textSecondary,
    marginLeft: 0,
  },
  filterSelectArrowActive: {
    color: Colors.textSecondary,
  },
  filterSelectArrowDisabled: {
    color: '#C7C7CC',
  },
  clearFilterButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    shadowColor: '#FF3B30',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  clearFilterButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.3,
  },
  dropdownContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#e0e0e0',
    maxHeight: 150,
    zIndex: 9999,
    marginTop: -1,
  },
  dropdownScrollView: {
    maxHeight: 150,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#FFFFFF',
  },
  dropdownItemSelected: {
    backgroundColor: '#F5F5F5',
  },
  dropdownItemText: {
    fontSize: 11,
    color: '#000000',
    fontWeight: FontWeights.regular,
  },
  dropdownItemTextSelected: {
    color: '#000000',
    fontWeight: FontWeights.medium,
  },
});

export default TowerFloorFilter;

