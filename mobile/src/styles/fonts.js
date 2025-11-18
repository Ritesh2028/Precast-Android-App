// Centralized font configuration for the entire app
// All font sizes are reduced and standardized

export const FontSizes = {
  // Headers
  extraLarge: 24,    // Main titles (reduced from 32)
  large: 20,         // Section headers (reduced from 24)
  medium: 18,        // Sub headers (reduced from 20)
  
  // Body text
  regular: 14,       // Primary body text (reduced from 16)
  small: 12,         // Secondary text (reduced from 14)
  extraSmall: 10,    // Captions and labels (reduced from 12)
  
  // Special cases
  icon: 16,          // Icon font size (reduced from 20)
  button: 14,        // Button text (reduced from 16)
  tab: 10,           // Tab labels (reduced from 12)
  chart: 12,         // Chart text (reduced from 14)
  
  // Navigation
  tabIcon: 16,       // Tab icons (reduced from 20)
  tabLabel: 10,      // Tab labels (reduced from 12)
  
  // Status indicators
  status: 12,        // Status text (reduced from 14)
  badge: 10,         // Badge text (reduced from 12)
};

export const FontWeights = {
  light: '300',
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  extraBold: '800',
};

export const FontFamilies = {
  regular: 'System',
  bold: 'System',
  light: 'System',
};

// Helper function to get consistent font styles
export const getFontStyle = (size, weight = 'regular', color = '#75767a') => ({
  fontSize: FontSizes[size] || size,
  fontWeight: FontWeights[weight] || weight,
  color: color,
});

// Predefined common font styles
export const FontStyles = {
  // Headers
  h1: getFontStyle('extraLarge', 'bold'),
  h2: getFontStyle('large', 'semiBold'),
  h3: getFontStyle('medium', 'medium'),
  
  // Body text
  body: getFontStyle('regular', 'regular'),
  bodySmall: getFontStyle('small', 'regular'),
  caption: getFontStyle('extraSmall', 'regular'),
  
  // Interactive elements
  button: getFontStyle('button', 'medium'),
  link: getFontStyle('regular', 'medium'),
  
  // Navigation
  tabLabel: getFontStyle('tab', 'medium'),
  
  // Status
  status: getFontStyle('status', 'medium'),
  badge: getFontStyle('badge', 'medium'),
};
