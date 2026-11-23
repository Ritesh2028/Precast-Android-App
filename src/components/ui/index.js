import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { Colors, Theme } from '../../styles/colors';
import { FontSizes, FontWeights } from '../../styles/fonts';

export { Icon };

/** Status families used across lists, pills and tiles. */
export const Tone = {
  success: { fg: '#1E7B3A', bg: '#E6F4EA', solid: '#34A853' },
  warning: { fg: '#B35C00', bg: '#FFF1E0', solid: '#F59E0B' },
  info: { fg: Colors.accentForeground, bg: Colors.primarySoft, solid: Colors.primary },
  danger: { fg: '#B42318', bg: '#FEECEB', solid: Colors.error },
  neutral: { fg: Colors.textSecondary, bg: Colors.surface, solid: '#9AA3B2' },
};

export const elevation = {
  shadowColor: Colors.shadow,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 6,
  elevation: 2,
};

/** Rounded surface with hairline border + soft shadow. */
export const Card = ({ style, children, onPress, ...rest }) => {
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp activeOpacity={0.85} onPress={onPress} style={[s.card, style]} {...rest}>
      {children}
    </Comp>
  );
};

export const SectionHeader = ({ title, subtitle, right }) => (
  <View style={s.sectionHeader}>
    <View style={{ flex: 1 }}>
      <Text style={s.sectionTitle}>{title}</Text>
      {!!subtitle && <Text style={s.sectionSubtitle}>{subtitle}</Text>}
    </View>
    {right}
  </View>
);

export const StatusPill = ({ label, tone = 'neutral', style }) => {
  const t = Tone[tone] || Tone.neutral;
  return (
    <View style={[s.pill, { backgroundColor: t.bg }, style]}>
      <View style={[s.pillDot, { backgroundColor: t.solid }]} />
      <Text style={[s.pillText, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
};

/** iOS-style segmented control; options: [{ key, label, count? }] */
export const SegmentedControl = ({ options, value, onChange, style }) => (
  <View style={[s.segment, style]}>
    {options.map((o) => {
      const active = o.key === value;
      return (
        <TouchableOpacity
          key={o.key}
          style={[s.segmentItem, active && s.segmentItemActive]}
          onPress={() => onChange(o.key)}
          activeOpacity={0.8}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
        >
          <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1}>
            {o.label}
            {o.count != null ? <Text style={s.segmentCount}>{`  ${o.count}`}</Text> : null}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

export const IconButton = ({ name, onPress, color = Colors.textPrimary, size = 20, style, label, busy, disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled || busy}
    style={[s.iconBtn, disabled && { opacity: 0.4 }, style]}
    activeOpacity={0.7}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    {busy ? <ActivityIndicator size="small" color={color} /> : <Icon name={name} size={size} color={color} />}
  </TouchableOpacity>
);

export const EmptyState = ({ icon = 'clipboard', title, message, actionLabel, onAction, tone = 'neutral', style }) => {
  const t = Tone[tone] || Tone.neutral;
  return (
    <View style={[s.empty, style]}>
      <View style={[s.emptyIcon, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={28} color={t.solid} />
      </View>
      {!!title && <Text style={s.emptyTitle}>{title}</Text>}
      {!!message && <Text style={s.emptyMessage}>{message}</Text>}
      {!!actionLabel && (
        <TouchableOpacity style={s.emptyAction} onPress={onAction} activeOpacity={0.85}>
          <Icon name="refresh" size={16} color={Colors.primaryForeground} />
          <Text style={s.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/** Pulsing placeholder block for loading lists. */
export const Skeleton = ({ width = '100%', height = 14, radius = 6, style }) => {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: Colors.input, opacity: pulse }, style]} />;
};

export const SkeletonList = ({ rows = 4 }) => (
  <View style={{ gap: 10 }}>
    {Array.from({ length: rows }).map((_, i) => (
      <View key={i} style={[s.card, { padding: 14, gap: 10 }]}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={10} />
      </View>
    ))}
  </View>
);

/**
 * Bottom action sheet. actions: [{ key, label, icon, onPress, disabled, hint, destructive }]
 */
export const ActionSheet = ({ visible, onClose, title, subtitle, actions = [] }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: 12 + insets.bottom }]}>
          <View style={s.sheetHandle} />
          {(!!title || !!subtitle) && (
            <View style={s.sheetHead}>
              {!!title && <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text>}
              {!!subtitle && <Text style={s.sheetSubtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>
          )}
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              style={[s.sheetAction, a.disabled && { opacity: 0.45 }]}
              disabled={a.disabled}
              onPress={a.onPress}
              activeOpacity={0.7}
            >
              <View style={[s.sheetActionIcon, a.destructive && { backgroundColor: Tone.danger.bg }]}>
                <Icon name={a.icon} size={20} color={a.destructive ? Tone.danger.solid : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.sheetActionText, a.destructive && { color: Tone.danger.fg }]}>{a.label}</Text>
                {!!a.hint && <Text style={s.sheetActionHint}>{a.hint}</Text>}
              </View>
              <Icon name="chevron-right" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.sheetCancel} onPress={onClose} activeOpacity={0.8}>
            <Text style={s.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

/** Full-screen blocking spinner used while a tap fetches before navigating. */
export const BusyOverlay = ({ visible, label = 'Loading…' }) => (
  <Modal visible={!!visible} transparent animationType="fade">
    <View style={s.busyBackdrop}>
      <View style={s.busyCard}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={s.busyText}>{label}</Text>
      </View>
    </View>
  </Modal>
);

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Theme.radiusLg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...elevation,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  sectionTitle: { fontSize: FontSizes.medium - 1, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  sectionSubtitle: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 2 },

  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: FontSizes.extraSmall + 1, fontWeight: FontWeights.semiBold },

  segment: { flexDirection: 'row', backgroundColor: Colors.input, borderRadius: Theme.radius, padding: 3 },
  segmentItem: { flex: 1, height: 34, borderRadius: Theme.radiusSm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentItemActive: { backgroundColor: Colors.background, ...elevation, shadowRadius: 3 },
  segmentText: { fontSize: FontSizes.small + 1, color: Colors.textSecondary, fontWeight: FontWeights.medium },
  segmentTextActive: { color: Colors.textPrimary, fontWeight: FontWeights.bold },
  segmentCount: { fontSize: FontSizes.small, color: Colors.textSecondary, fontWeight: FontWeights.medium },

  iconBtn: {
    width: 38, height: 38, borderRadius: Theme.radiusSm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
  },

  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: FontSizes.medium - 2, fontWeight: FontWeights.bold, color: Colors.textPrimary, textAlign: 'center' },
  emptyMessage: { fontSize: FontSizes.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, backgroundColor: Colors.primary,
    paddingHorizontal: 20, height: Theme.buttonHeightLg, borderRadius: Theme.radius,
  },
  emptyActionText: { color: Colors.primaryForeground, fontWeight: FontWeights.semiBold, fontSize: FontSizes.button },

  sheetBackdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 12, paddingTop: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 6 },
  sheetHead: { paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, marginBottom: 4 },
  sheetTitle: { fontSize: FontSizes.medium - 1, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  sheetSubtitle: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 2 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: Theme.radius },
  sheetActionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sheetActionText: { fontSize: FontSizes.regular + 1, fontWeight: FontWeights.semiBold, color: Colors.textPrimary },
  sheetActionHint: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 1 },
  sheetCancel: {
    marginTop: 8, height: Theme.buttonHeightLg, borderRadius: Theme.radius, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetCancelText: { fontSize: FontSizes.button, fontWeight: FontWeights.semiBold, color: Colors.textPrimary },

  busyBackdrop: { flex: 1, backgroundColor: 'rgba(22,31,50,0.25)', alignItems: 'center', justifyContent: 'center' },
  busyCard: { backgroundColor: Colors.background, borderRadius: Theme.radiusLg, paddingVertical: 20, paddingHorizontal: 28, alignItems: 'center', ...elevation },
  busyText: { marginTop: 10, fontSize: FontSizes.regular, color: Colors.textSecondary },
});
