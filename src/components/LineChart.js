import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { G, Line, Circle, Text as SvgText, Polyline, Defs, LinearGradient, Stop } from 'react-native-svg';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const LineChart = ({ 
  data = [], 
  height = 200,
  showLegend = true,
  lines = [
    { key: 'adjustments', label: 'Adjustments', color: '#8B5CF6' },
    { key: 'checkins', label: 'Checkins', color: '#10B981' },
    { key: 'checkouts', label: 'Checkouts', color: '#F59E42' },
  ],
  hideCheckouts = false,
}) => {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.noDataText}>No data available</Text>
      </View>
    );
  }

  const chartWidth = SCREEN_WIDTH - 32; // use more horizontal space
  const chartHeight = height - 60;
  const padding = { top: 20, right: 16, bottom: 40, left: 40 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Calculate max value for scaling
  const allValues = [];
  lines.forEach(line => {
    data.forEach(item => {
      if (item[line.key] !== undefined) {
        allValues.push(item[line.key]);
      }
    });
  });
  const maxValue = Math.max(...allValues, 1);
  const yAxisMax = Math.ceil(maxValue * 1.1); // Add 10% padding

  // Format x-axis labels
  const formatXLabel = (value) => {
    // If value is a month name, return first 3 letters
    if (/^[A-Za-z]+$/.test(value)) return value.slice(0, 3);
    // If value is a date range, show as "1-5", "6-10", etc.
    if (value.includes(' to ')) {
      const [start, end] = value.split(' to ');
      const startDay = parseInt(start.slice(-2), 10);
      const endDay = parseInt(end.slice(-2), 10);
      return `${startDay}-${endDay}`;
    }
    // If value is a date (weekly), format as 'dd MMM'
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const dateObj = new Date(value);
      const day = dateObj.getDate();
      const month = dateObj.toLocaleString('default', { month: 'short' });
      return `${day} ${month}`;
    }
    return value;
  };

  // Generate points for each line
  const generateLinePoints = (lineKey) => {
    return data.map((item, index) => {
      const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
      const y = padding.top + graphHeight - (item[lineKey] || 0) / yAxisMax * graphHeight;
      return { x, y, value: item[lineKey] || 0 };
    });
  };

  // Generate path string for polyline
  const generatePath = (points) => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={chartHeight}>
        <Defs>
          {lines.map((line, index) => (
            <LinearGradient key={line.key} id={`gradient-${line.key}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={line.color} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={line.color} stopOpacity="0" />
            </LinearGradient>
          ))}
        </Defs>

        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = Math.round(yAxisMax * ratio);
          const y = padding.top + graphHeight - ratio * graphHeight;
          return (
            <SvgText
              key={ratio}
              x={padding.left - 10}
              y={y + 4}
              fontSize="10"
              fill={Colors.textSecondary}
              textAnchor="end"
            >
              {value}
            </SvgText>
          );
        })}

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + graphHeight - ratio * graphHeight;
          return (
            <Line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={padding.left + graphWidth}
              y2={y}
              stroke="#E0E0E0"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          );
        })}

        {/* X-axis labels */}
        {data.map((item, index) => {
          const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
          return (
            <SvgText
              key={index}
              x={x}
              y={chartHeight - 10}
              fontSize="10"
              fill={Colors.textSecondary}
              textAnchor="middle"
              transform={`rotate(-20 ${x} ${chartHeight - 10})`}
            >
              {formatXLabel(item.name)}
            </SvgText>
          );
        })}

        {/* Draw lines and points */}
        {lines
          .filter(line => !(hideCheckouts && line.key === 'checkouts'))
          .map((line) => {
            const points = generateLinePoints(line.key);
            const path = generatePath(points);
            
            return (
              <G key={line.key}>
                {/* Area under line (gradient) */}
                <Polyline
                  points={`${points[0].x},${padding.top + graphHeight} ${path.replace(/[ML]/g, ' ').trim()} ${points[points.length - 1].x},${padding.top + graphHeight}`}
                  fill={`url(#gradient-${line.key})`}
                  stroke="none"
                />
                {/* Line */}
                <Polyline
                  points={path.replace(/[ML]/g, ' ').trim()}
                  fill="none"
                  stroke={line.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Points */}
                {points.map((point, index) => (
                  <Circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill={line.color}
                  />
                ))}
              </G>
            );
          })}
      </Svg>

      {/* Legend */}
      {showLegend && (
        <View style={styles.legend}>
          {lines
            .filter(line => !(hideCheckouts && line.key === 'checkouts'))
            .map((line) => (
              <View key={line.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: line.color }]} />
                <Text style={styles.legendText}>{line.label}</Text>
              </View>
            ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
  },
});

export default LineChart;

