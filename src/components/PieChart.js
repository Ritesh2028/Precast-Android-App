import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import Svg, { G, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const { width } = Dimensions.get('window');

const PieChart = ({ 
  data, 
  title, 
  size = 200,
  highlightedIndex = 0, // which slice to emphasize in center text
  centerValueMode = 'value', // 'value' | 'percentage'
  legendStyle = 'detailed', // 'detailed' | 'compact'
}) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const animatedValue = useRef(new Animated.Value(0)).current;

  // Donut chart configuration (responsive to screen width)
  const maxChartWidth = Math.floor(width * 0.9); // allow chart to use almost full width on mobile
  const chartSize = Math.min(Math.max(140, size), maxChartWidth);
  const strokeWidth = Math.max(16, Math.floor(chartSize * 0.12));
  // Reduce effective radius so the donut ring is smaller inside the card
  const effectiveSize = chartSize * 0.75;
  const radius = (effectiveSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Layout responsiveness to avoid overlap
  const isNarrow = width < 380;

  // Enhanced colors with gradients - extended palette for more element types
  const enhancedColors = [
    { color: '#34C759', gradient: ['#34C759', '#5DD679'] }, // Green
    { color: '#FF3B30', gradient: ['#FF3B30', '#FF6B6B'] }, // Red
    { color: '#FF9500', gradient: ['#FF9500', '#FFB84D'] }, // Orange
    { color: '#8E8E93', gradient: ['#8E8E93', '#B0B0B5'] }, // Grey
    { color: '#007AFF', gradient: ['#007AFF', '#5AC8FA'] }, // Blue
    { color: '#AF52DE', gradient: ['#AF52DE', '#D0A5F5'] }, // Purple
    { color: '#FF2D55', gradient: ['#FF2D55', '#FF6B9D'] }, // Pink
    { color: '#5856D6', gradient: ['#5856D6', '#8E8EF0'] }, // Indigo
    { color: '#FF9500', gradient: ['#FF9500', '#FFB84D'] }, // Orange (duplicate for more types)
    { color: '#34C759', gradient: ['#34C759', '#5DD679'] }, // Green (duplicate)
    { color: '#FF3B30', gradient: ['#FF3B30', '#FF6B6B'] }, // Red (duplicate)
    { color: '#8E8E93', gradient: ['#8E8E93', '#B0B0B5'] }, // Grey (duplicate)
  ];

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, []);

  let cumulativePortion = 0;

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.chartContainer}>
        <View style={styles.donutWrapper}>
          <Svg width={chartSize} height={chartSize}>
            <Defs>
              {enhancedColors.map((colorData, index) => (
                <LinearGradient key={index} id={`gradient-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colorData.gradient[0]} stopOpacity="1" />
                  <Stop offset="100%" stopColor={colorData.gradient[1]} stopOpacity="1" />
                </LinearGradient>
              ))}
            </Defs>
            <G rotation="-90" origin={`${chartSize / 2}, ${chartSize / 2}`}>
              {/* Background circle */}
              <Circle
                cx={chartSize / 2}
                cy={chartSize / 2}
                r={radius}
                stroke="#f8f9fa"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeOpacity={0.3}
              />
              {data.map((item, index) => {
                const portion = total === 0 ? 0 : item.value / total;
                const segment = portion * circumference;
                const dashArray = `${segment} ${circumference - segment}`;
                const dashOffset = circumference * (1 - cumulativePortion);
                cumulativePortion += portion;
                const colorData = enhancedColors[index % enhancedColors.length];
                // Use item.color if provided, otherwise use enhancedColors
                const itemColor = item.color || colorData.color;
                const colorIndex = index % enhancedColors.length;
                return (
                  <Circle
                    key={index}
                    cx={chartSize / 2}
                    cy={chartSize / 2}
                    r={radius}
                    stroke={item.color ? itemColor : `url(#gradient-${colorIndex})`}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                    fill="transparent"
                    opacity={index === highlightedIndex ? 1 : 0.9}
                  />
                );
              })}
            </G>
          </Svg>
          <View style={[ 
            styles.centerLabelContainer,
            { width: effectiveSize * 0.45, height: effectiveSize * 0.45, borderRadius: (effectiveSize * 0.45) / 2 }
          ]}>
            <Text style={styles.centerLabel}>
              {centerValueMode === 'percentage' && total > 0
                ? `${Math.round((data?.[highlightedIndex]?.value || 0) / total * 100)}%`
                : total}
            </Text>
            <Text style={styles.centerSubLabel}>
              {centerValueMode === 'percentage' 
                ? (data?.[highlightedIndex]?.label || data?.[highlightedIndex]?.element_type || '')
                : 'Total Jobs'}
            </Text>
          </View>
        </View>
        <View style={styles.legend}>
          {data.map((item, index) => {
            const percentage = total === 0 ? '0.0' : ((item.value / total) * 100).toFixed(0);
            const colorData = enhancedColors[index % enhancedColors.length];
            const isHighlighted = index === highlightedIndex;
            return (
              <View key={index} style={[styles.legendItem, isNarrow && styles.legendItemStack, isHighlighted && { borderColor: '#d6dee6', backgroundColor: '#F0F7FF' }]}>
                <View style={[styles.legendColor, { backgroundColor: item.color || colorData.color }]}>
                  <View style={[styles.legendColorInner, { backgroundColor: item.color || colorData.gradient[1] }]} />
                </View>
                {legendStyle === 'compact' ? (
                  <Text style={styles.legendLabel}>{`${item.label}: ${percentage}%`}</Text>
                ) : (
                  <View style={styles.legendContent}>
                    <Text style={styles.legendLabel} numberOfLines={1}>{item.label || item.element_type || `Type ${index + 1}`}</Text>
                    <View style={styles.legendValueContainer}>
                      <Text style={styles.legendValue}>{item.value || item.count || 0}</Text>
                      <Text style={styles.legendPercentage}>({percentage}%)</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  title: {
    fontSize: FontSizes.large + 2,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  chartContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutWrapper: {
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  centerLabelContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 60,
    width: 120,
    height: 120,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  centerLabel: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: '#1A1A1A',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  centerSubLabel: {
    fontSize: FontSizes.small,
    color: '#4A4A4A',
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.2,
  },
  legend: {
    marginTop: 2,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 40,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  legendColorInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendContent: {
    flex: 1,
  },
  legendLabel: {
    // Match line chart legend text size
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
    marginBottom: 2,
  },
  legendValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  legendValue: {
    // Same base size as line chart legend for numeric value
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: FontWeights.bold,
  },
  legendPercentage: {
    fontSize: FontSizes.extraSmall,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
});

export default PieChart;
