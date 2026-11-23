import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Theme } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import { themedStyles } from '../theme';
import { Icon } from '../components/ui';
import Logo from '../components/Logo';
import { WORKSPACE_META } from '../components/WorkspaceSwitcher';
import { getAccessSnapshot } from '../services/authService';
import { loadAccessContext, openWorkspace, rememberWorkspace } from '../services/appAccess';

/**
 * Shown once to users who can work in more than one area (e.g. QC + Erection,
 * or Admin + QC). The choice is remembered per user and can be changed any time
 * from the switch button in the header.
 */
const WorkspacePickerScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [ctx, setCtx] = useState(getAccessSnapshot());
  const [opening, setOpening] = useState(null);

  // Snapshot is normally set already (login / splash); reload it if the app was restored.
  useEffect(() => {
    let alive = true;
    if (!ctx?.workspaces) {
      loadAccessContext()
        .then((c) => {
          if (!alive) return;
          if (!c?.workspaces?.length) navigation.replace('Login');
          else setCtx(c);
        })
        .catch(() => alive && navigation.replace('Login'));
    }
    return () => {
      alive = false;
    };
  }, [ctx, navigation]);

  // Android back on this root screen leaves the app instead of going to Splash/Login.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  const choose = async (screen) => {
    if (opening) return;
    setOpening(screen);
    await rememberWorkspace(ctx, screen);
    openWorkspace(navigation, screen);
  };

  if (!ctx?.workspaces) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <Logo size="medium" variant="light" />
        <Text style={styles.title}>{ctx.firstName ? `Welcome, ${ctx.firstName}` : 'Welcome'}</Text>
        <Text style={styles.subtitle}>
          You have access to more than one area. Choose where to start — you can switch any time with the
          {' '}
          <Text style={styles.subtitleStrong}>⇄</Text>
          {' '}
          button at the top.
        </Text>

        <View style={styles.list}>
          {ctx.workspaces.map((screen) => {
            const meta = WORKSPACE_META[screen] || { label: screen, icon: 'layers', description: '' };
            const busy = opening === screen;
            return (
              <TouchableOpacity
                key={screen}
                style={[styles.option, busy && styles.optionActive]}
                onPress={() => choose(screen)}
                activeOpacity={0.85}
                disabled={!!opening}
                accessibilityRole="button"
                accessibilityLabel={`Open ${meta.label}`}
              >
                <View style={styles.optionIcon}>
                  <Icon name={meta.icon} size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{meta.label}</Text>
                  {!!meta.description && <Text style={styles.optionText}>{meta.description}</Text>}
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Icon name="chevron-right" size={18} color={Colors.textMuted} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.footnote}>We'll remember your choice on this phone.</Text>
      </ScrollView>
    </View>
  );
};

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: Colors.surface },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, alignItems: 'center' },
  title: {
    marginTop: 24,
    fontSize: FontSizes.extraLarge,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: FontSizes.regular + 1,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 360,
  },
  subtitleStrong: { color: Colors.textPrimary, fontWeight: FontWeights.bold },
  list: { alignSelf: 'stretch', marginTop: 28, gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: Theme.radiusLg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionActive: { borderColor: Colors.primary },
  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontSize: FontSizes.regular + 2, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  optionText: { fontSize: FontSizes.small + 1, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },
  footnote: { marginTop: 20, fontSize: FontSizes.small, color: Colors.textMuted, textAlign: 'center' },
}));

export default WorkspacePickerScreen;
