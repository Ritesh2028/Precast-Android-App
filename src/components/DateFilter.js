import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DateFilter = ({ onChange, startDate }) => {
  const today = new Date();
  const minDate = startDate || new Date(2023, 0, 1);
  const minYear = minDate.getFullYear();
  const maxYear = today.getFullYear();

  const [filterType, setFilterType] = useState('yearly'); // 'yearly' | 'weekly' | 'monthly'
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);

  // Generate year options
  const getYearOptions = () => {
    const years = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);
    return years;
  };

  // Generate month options for selected year
  const getMonthOptions = () => {
    const months = [];
    const startM = selectedYear === minYear ? minDate.getMonth() : 0;
    const endM = selectedYear === maxYear ? today.getMonth() : 11;
    for (let m = endM; m >= startM; m--) months.push(m);
    return months;
  };

  // Helper to get days in selected month
  const getDayOptions = () => {
    const days = [];
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const minDay =
      selectedYear === minYear && selectedMonth === minDate.getMonth()
        ? minDate.getDate()
        : 1;
    const maxDay =
      selectedYear === maxYear && selectedMonth === today.getMonth()
        ? today.getDate()
        : lastDay;
    for (let d = minDay; d <= maxDay; d++) days.push(d);
    return days;
  };

  // Handle yearly filter
  const handleYearlyFilter = (year) => {
    setSelectedYear(year);
    onChange({ type: 'yearly', year });
  };

  // Handle weekly filter (date selection)
  const handleWeeklyFilter = (day) => {
    setSelectedDay(day);
    const date = new Date(selectedYear, selectedMonth, day);
    onChange({
      type: 'weekly',
      year: selectedYear,
      month: selectedMonth + 1,
      date,
    });
  };

  // Handle monthly filter
  const handleMonthlyFilter = (year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    onChange({ type: 'monthly', year, month: month + 1 });
  };

  useEffect(() => {
    if (filterType === 'yearly') {
      handleYearlyFilter(selectedYear);
    } else if (filterType === 'weekly' && selectedDay) {
      handleWeeklyFilter(selectedDay);
    } else if (filterType === 'monthly') {
      handleMonthlyFilter(selectedYear, selectedMonth);
    }
  }, [filterType, selectedYear, selectedMonth, selectedDay]);

  const renderPicker = (visible, onClose, options, selectedValue, onSelect, label) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select {label}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerList}>
            {options.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.pickerItem,
                  selectedValue === option && styles.pickerItemSelected,
                ]}
                onPress={() => {
                  onSelect(option);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    selectedValue === option && styles.pickerItemTextSelected,
                  ]}
                >
                  {label === 'Month' ? MONTHS[option] : option}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Filter Type Radio Buttons */}
      <View style={styles.radioGroup}>
        <TouchableOpacity
          style={[styles.radioOption, filterType === 'yearly' && styles.radioOptionSelected]}
          onPress={() => {
            setFilterType('yearly');
            setSelectedDay(null);
          }}
        >
          <View style={[styles.radioCircle, filterType === 'yearly' && styles.radioCircleSelected]}>
            {filterType === 'yearly' && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.radioLabel, filterType === 'yearly' && styles.radioLabelSelected]}>
            Yearly
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.radioOption, filterType === 'weekly' && styles.radioOptionSelected]}
          onPress={() => {
            setFilterType('weekly');
            setSelectedDay(null);
          }}
        >
          <View style={[styles.radioCircle, filterType === 'weekly' && styles.radioCircleSelected]}>
            {filterType === 'weekly' && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.radioLabel, filterType === 'weekly' && styles.radioLabelSelected]}>
            Date
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.radioOption, filterType === 'monthly' && styles.radioOptionSelected]}
          onPress={() => setFilterType('monthly')}
        >
          <View style={[styles.radioCircle, filterType === 'monthly' && styles.radioCircleSelected]}>
            {filterType === 'monthly' && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.radioLabel, filterType === 'monthly' && styles.radioLabelSelected]}>
            Monthly
          </Text>
        </TouchableOpacity>
      </View>

      {/* Year Selector */}
      {filterType === 'yearly' && (
        <TouchableOpacity
          style={styles.selectButton}
          onPress={() => setShowYearPicker(true)}
        >
          <Text style={styles.selectButtonText}>{selectedYear}</Text>
          <Text style={styles.selectArrow}>▼</Text>
        </TouchableOpacity>
      )}

      {/* Weekly/Date Selectors */}
      {filterType === 'weekly' && (
        <View style={styles.selectRow}>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowYearPicker(true)}
          >
            <Text style={styles.selectButtonText}>{selectedYear}</Text>
            <Text style={styles.selectArrow}>▼</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowMonthPicker(true)}
          >
            <Text style={styles.selectButtonText}>{MONTHS[selectedMonth]}</Text>
            <Text style={styles.selectArrow}>▼</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowDayPicker(true)}
          >
            <Text style={styles.selectButtonText}>{selectedDay || 'Day'}</Text>
            <Text style={styles.selectArrow}>▼</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Monthly Selectors */}
      {filterType === 'monthly' && (
        <View style={styles.selectRow}>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowYearPicker(true)}
          >
            <Text style={styles.selectButtonText}>{selectedYear}</Text>
            <Text style={styles.selectArrow}>▼</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowMonthPicker(true)}
          >
            <Text style={styles.selectButtonText}>{MONTHS[selectedMonth]}</Text>
            <Text style={styles.selectArrow}>▼</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pickers */}
      {renderPicker(
        showYearPicker,
        () => setShowYearPicker(false),
        getYearOptions(),
        selectedYear,
        (year) => {
          setSelectedYear(year);
          if (filterType === 'yearly') {
            handleYearlyFilter(year);
          } else if (filterType === 'weekly') {
            setSelectedMonth(today.getMonth());
            setSelectedDay(null);
          } else {
            setSelectedMonth(today.getMonth());
            handleMonthlyFilter(year, today.getMonth());
          }
        },
        'Year'
      )}

      {renderPicker(
        showMonthPicker,
        () => setShowMonthPicker(false),
        getMonthOptions(),
        selectedMonth,
        (month) => {
          setSelectedMonth(month);
          if (filterType === 'weekly') {
            setSelectedDay(null);
          } else {
            handleMonthlyFilter(selectedYear, month);
          }
        },
        'Month'
      )}

      {renderPicker(
        showDayPicker,
        () => setShowDayPicker(false),
        getDayOptions(),
        selectedDay,
        (day) => handleWeeklyFilter(day),
        'Day'
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  radioOptionSelected: {
    // Add selected styling if needed
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  radioLabel: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
  },
  radioLabelSelected: {
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
  selectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    minWidth: 70,
    justifyContent: 'space-between',
  },
  selectButtonText: {
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
  selectArrow: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: Colors.textSecondary,
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  pickerItemSelected: {
    backgroundColor: '#F0F7FF',
  },
  pickerItemText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
  },
  pickerItemTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
});

