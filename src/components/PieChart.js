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
  const maxChartWidth = Math.floor(width * 0.42);
  const chartSize = Math.min(Math.max(140, size), maxChartWidth);
  const strokeWidth = Math.max(16, Math.floor(chartSize * 0.12));
  const radius = (chartSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Layout responsiveness to avoid overlap
  const isNarrow = width < 380;

  // Enhanced colors with gradients
  const enhancedColors = [
    { color: '#FF9500', gradient: ['#FF9500', '#FFB84D'] },
    { color: '#34C759', gradient: ['#34C759', '#5DD679'] },
    { color: '#FF3B30', gradient: ['#FF3B30', '#FF6B6B'] },
    { color: '#8E8E93', gradient: ['#8E8E93', '#B0B0B5'] },
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
      <Text style={styles.title}>{title}</Text>
      <View style={[styles.chartContainer, isNarrow && styles.chartContainerStack]}>
        <View style={[styles.donutWrapper, isNarrow && { marginRight: 0 }]}>
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
                return (
                  <Circle
                    key={index}
                    cx={chartSize / 2}
                    cy={chartSize / 2}
                    r={radius}
                    stroke={`url(#gradient-${index % enhancedColors.length})`}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                    fill="transparent"
                    opacity={index === highlightedIndex ? 1 : 0.85}
                  />
                );
              })}
            </G>
          </Svg>
          <View style={[ 
            styles.centerLabelContainer,
            { width: chartSize * 0.5, height: chartSize * 0.5, borderRadius: (chartSize * 0.5) / 2 }
          ]}>
            <Text style={styles.centerLabel}>
              {centerValueMode === 'percentage' && total > 0
                ? `${Math.round((data?.[highlightedIndex]?.value || 0) / total * 100)}%`
                : total}
            </Text>
            <Text style={styles.centerSubLabel}>
              {centerValueMode === 'percentage' 
                ? (data?.[highlightedIndex]?.label || '')
                : 'Total Jobs'}
            </Text>
          </View>
        </View>
        <View style={[styles.legend, isNarrow && styles.legendStack]}>
          {data.map((item, index) => {
            const percentage = total === 0 ? '0.0' : ((item.value / total) * 100).toFixed(0);
            const colorData = enhancedColors[index % enhancedColors.length];
            const isHighlighted = index === highlightedIndex;
            return (
              <View key={index} style={[styles.legendItem, isNarrow && styles.legendItemStack, isHighlighted && { borderColor: '#d6dee6' }]}>
                <View style={[styles.legendColor, { backgroundColor: item.color }]}>
                  <View style={[styles.legendColorInner, { backgroundColor: colorData.gradient[1] }]} />
                </View>
                {legendStyle === 'compact' ? (
                  <Text style={styles.legendLabel}>{`${item.label}: ${percentage}%`}</Text>
                ) : (
                  <View style={styles.legendContent}>
                    <Text style={styles.legendLabel}>{item.label}</Text>
                    <View style={styles.legendValueContainer}>
                      <Text style={styles.legendValue}>{item.value}</Text>
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
    padding: 28,
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
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  chartContainerStack: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutWrapper: {
    marginRight: 16,
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
    fontSize: FontSizes.extraLarge,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  centerSubLabel: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  legend: {
    marginLeft: 8,
    flex: 1,
    minWidth: 120,
    flexGrow: 1,
    flexShrink: 1,
  },
  legendStack: {
    marginLeft: 0,
    marginTop: 12,
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    fontWeight: FontWeights.semiBold,
    marginBottom: 2,
  },
  legendValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendValue: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: FontWeights.bold,
    marginRight: 4,
  },
  legendPercentage: {
    fontSize: FontSizes.extraSmall,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
});

export default PieChart;
