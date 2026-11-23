import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Colors } from '../styles/colors';
import { themedStyles } from '../theme';
import { ActionSheet, Icon } from './ui';
import { getAccessSnapshot } from '../services/authService';
import { APP_SCREEN, hasMultipleWorkspaces, openWorkspace, rememberWorkspace } from '../services/appAccess';

/** Label / icon / description for each area a user can work in. */
export const WORKSPACE_META = {
  [APP_SCREEN.DASHBOARD]: {
    label: 'Quality control',
    icon: 'clipboard-check',
    description: 'QC checklists, inspections, rectification',
  },
  [APP_SCREEN.ERECTION]: {
    label: 'Erection',
    icon: 'layers',
    description: 'Erection requests, receiving and erected elements',
  },
  [APP_SCREEN.STOCK]: {
    label: 'Stockyard',
    icon: 'box',
    description: 'Stockyard receiving, assignment and reports',
  },
  [APP_SCREEN.DISPATCH]: {
    label: 'Dispatch',
    icon: 'truck',
    description: 'Dispatch approvals, logs and vehicles',
  },
  [APP_SCREEN.WEB]: {
    label: 'Web app',
    icon: 'globe',
    description: 'Every PrecastEzy feature, same as on the computer',
  },
};

/** The area the user is in right now (root route of the stack). */
export const currentWorkspace = (navigation) => {
  try {
    let nav = navigation;
    while (nav?.getParent?.()) nav = nav.getParent();
    return nav?.getState?.()?.routes?.[0]?.name || null;
  } catch {
    return null;
  }
};

/** Bottom sheet listing the user's areas; picking one remembers it and opens it. */
export const WorkspaceSheet = ({ visible, onClose, navigation }) => {
  const ctx = getAccessSnapshot();
  if (!hasMultipleWorkspaces(ctx)) return null;
  const current = currentWorkspace(navigation);

  const actions = ctx.workspaces.map((screen) => {
    const meta = WORKSPACE_META[screen] || { label: screen, icon: 'layers', description: '' };
    const active = screen === current;
    return {
      key: screen,
      label: meta.label,
      icon: meta.icon,
      hint: active ? 'You are here' : meta.description,
      disabled: active,
      onPress: async () => {
        onClose();
        await rememberWorkspace(ctx, screen);
        openWorkspace(navigation, screen);
      },
    };
  });

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Switch workspace"
      subtitle="You have access to more than one area"
      actions={actions}
    />
  );
};

/** Header button that opens the switcher; renders nothing for single-area users. */
export const WorkspaceButton = ({ navigation, style }) => {
  const [open, setOpen] = useState(false);
  if (!hasMultipleWorkspaces(getAccessSnapshot())) return null;
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.button, style]}
        activeOpacity={0.7}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Switch workspace"
      >
        <Icon name="arrow-left-right" size={19} color={Colors.textPrimary} />
      </TouchableOpacity>
      <WorkspaceSheet visible={open} onClose={() => setOpen(false)} navigation={navigation} />
    </>
  );
};

const styles = themedStyles(() => ({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
}));
