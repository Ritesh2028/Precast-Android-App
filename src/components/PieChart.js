import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import Svg, { G, Circle } from 'react-native-svg';
import { themedStyles } from '../theme';

const { width } = Dimensions.get('window');

const DEFAULT_COLORS = [
  Colors.warning,
  Colors.success,
  Colors.primary,
  Colors.error,
  '#8E8E93',
  '#AF52DE',
  '#FF2D55',
  '#5856D6',
];

const normalizeSlices = (data = []) =>
  (Array.isArray(data) ? data : []).map((item, index) => {
    const raw = item?.value ?? item?.count ?? 0;
    const value = Number(raw);
    return {
      label: item?.label || item?.element_type || `Item ${index + 1}`,
      value: Number.isFinite(value) && value > 0 ? value : 0,
      color: item?.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    };
  });

const PieChart = ({
  data,
  title,
  size = 200,
  highlightedIndex,
  centerValueMode = 'value', // 'value' | 'percentage'
  legendStyle = 'detailed', // 'detailed' | 'compact'
}) => {
  const slices = useMemo(() => normalizeSlices(data), [data]);
  const total = useMemo(
    () => slices.reduce((sum, item) => sum + item.value, 0),
    [slices]
  );

  const activeIndex = useMemo(() => {
    if (
      Number.isInteger(highlightedIndex) &&
      highlightedIndex >= 0 &&
      highlightedIndex < slices.length &&
      slices[highlightedIndex]?.value > 0
    ) {
      return highlightedIndex;
    }
    // Prefer the largest non-zero slice so empty categories aren't emphasized.
    let best = 0;
    slices.forEach((slice, index) => {
      if (slice.value > (slices[best]?.value || 0)) best = index;
    });
    return best;
  }, [highlightedIndex, slices]);

  const maxChartWidth = Math.floor(width * 0.9);
  const chartSize = Math.min(Math.max(140, size), maxChartWidth);
  const strokeWidth = Math.max(16, Math.floor(chartSize * 0.12));
  const effectiveSize = chartSize * 0.75;
  const radius = (effectiveSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = chartSize / 2;
  const isNarrow = width < 380;
  const centerLabelSize = Math.max(64, effectiveSize * 0.45);

  // Build arc offsets with the standard SVG donut formula:
  // dasharray = "arcLength circumference", dashoffset = -offsetSoFar
  let offsetSoFar = 0;
  const arcs = slices.map((slice) => {
    const arcLength = total === 0 ? 0 : (slice.value / total) * circumference;
    const arc = {
      ...slice,
      arcLength,
      dashArray: `${arcLength} ${circumference}`,
      dashOffset: -offsetSoFar,
    };
    offsetSoFar += arcLength;
    return arc;
  });

  const centerPrimary =
    centerValueMode === 'percentage' && total > 0
      ? `${Math.round(((slices[activeIndex]?.value || 0) / total) * 100)}%`
      : String(total);

  const centerSecondary =
    centerValueMode === 'percentage'
      ? slices[activeIndex]?.label || ''
      : 'Total Jobs';

  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.chartContainer}>
        <View style={styles.donutWrapper}>
          <Svg width={chartSize} height={chartSize}>
            <G rotation="-90" origin={`${center}, ${center}`}>
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={Colors.chartTrack}
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              {total > 0 &&
                arcs.map((arc, index) => {
                  if (arc.arcLength <= 0) return null;
                  return (
                    <Circle
                      key={`${arc.label}-${index}`}
                      cx={center}
                      cy={center}
                      r={radius}
                      stroke={arc.color}
                      strokeWidth={strokeWidth}
                      strokeDasharray={arc.dashArray}
                      strokeDashoffset={arc.dashOffset}
                      strokeLinecap="butt"
                      fill="transparent"
                      opacity={index === activeIndex ? 1 : 0.88}
                    />
                  );
                })}
            </G>
          </Svg>
          <View
            style={[
              styles.centerLabelContainer,
              {
                width: centerLabelSize,
                height: centerLabelSize,
                borderRadius: centerLabelSize / 2,
              },
            ]}
          >
            <Text style={styles.centerLabel} numberOfLines={1}>
              {centerPrimary}
            </Text>
            <Text style={styles.centerSubLabel} numberOfLines={1}>
              {centerSecondary}
            </Text>
          </View>
        </View>

        <View style={styles.legend}>
          {slices.map((item, index) => {
            const percentage =
              total === 0 ? '0' : ((item.value / total) * 100).toFixed(0);
            const isHighlighted = index === activeIndex && item.value > 0;
            return (
              <View
                key={`${item.label}-${index}`}
                style={[
                  styles.legendItem,
                  isNarrow && styles.legendItemStack,
                  isHighlighted && styles.legendItemHighlighted,
                ]}
              >
                <View style={[styles.legendColor, { backgroundColor: item.color }]} />
                {legendStyle === 'compact' ? (
                  <Text style={styles.legendLabel}>{`${item.label}: ${percentage}%`}</Text>
                ) : (
                  <View style={styles.legendContent}>
                    <Text style={styles.legendLabel} numberOfLines={1}>
                      {item.label}
                    </Text>
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

const styles = themedStyles(() => ({
  container: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.divider,
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  centerLabel: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: '#1A1A1A',
    marginBottom: 2,
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
    borderColor: Colors.border,
    minHeight: 40,
  },
  legendItemStack: {
    width: '100%',
  },
  legendItemHighlighted: {
    borderColor: '#BFDBFE',
    backgroundColor: Colors.primarySoft,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  legendContent: {
    flex: 1,
  },
  legendLabel: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
    marginBottom: 2,
  },
  legendValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  legendValue: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: FontWeights.bold,
    marginRight: 6,
  },
  legendPercentage: {
    fontSize: FontSizes.extraSmall,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
}));

export default PieChart;
