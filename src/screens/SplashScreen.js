import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import Logo from '../components/Logo';
import { Colors } from '../styles/colors';

const { width, height } = Dimensions.get('window');

const SplashScreen = ({ navigation }) => {
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const logoBounceAnim = useRef(new Animated.Value(0)).current;
  const gradientAnim = useRef(new Animated.Value(0)).current;
  const particleAnim1 = useRef(new Animated.Value(0)).current;
  const particleAnim2 = useRef(new Animated.Value(0)).current;
  const particleAnim3 = useRef(new Animated.Value(0)).current;
  const textGlowAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Advanced animation sequence
    const animationSequence = Animated.sequence([
      // Phase 1: Initial entrance
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      
      // Phase 2: Logo and content animations
      Animated.parallel([
        Animated.spring(logoBounceAnim, {
          toValue: 1,
          tension: 80,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
      
      // Phase 3: Particle effects and glow
      Animated.parallel([
        Animated.timing(particleAnim1, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(particleAnim2, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(particleAnim3, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(textGlowAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ]);

    // Start main animation sequence
    animationSequence.start();

    // Continuous animations
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Gradient animation
    Animated.loop(
      Animated.timing(gradientAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();

    // Progress bar animation
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2800,
      useNativeDriver: false,
    }).start();

    // Navigate to login after splash duration
    const timer = setTimeout(() => {
      navigation.replace('Login');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigation]);

  const gradientInterpolate = gradientAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#e8eff4', '#d1e7ff'],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#e8eff4" />
      
      {/* Animated Background Gradient */}
      <Animated.View style={[
        styles.backgroundGradient,
        { backgroundColor: gradientInterpolate }
      ]} />
      
      {/* Floating Particles */}
      <Animated.View style={[
        styles.particle,
        styles.particle1,
        {
          opacity: particleAnim1,
          transform: [
            { translateX: particleAnim1.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 100],
            })},
            { translateY: particleAnim1.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -50],
            })},
          ],
        }
      ]} />
      <Animated.View style={[
        styles.particle,
        styles.particle2,
        {
          opacity: particleAnim2,
          transform: [
            { translateX: particleAnim2.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -80],
            })},
            { translateY: particleAnim2.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 60],
            })},
          ],
        }
      ]} />
      <Animated.View style={[
        styles.particle,
        styles.particle3,
        {
          opacity: particleAnim3,
          transform: [
            { translateX: particleAnim3.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 120],
            })},
            { translateY: particleAnim3.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -30],
            })},
          ],
        }
      ]} />
      
      {/* Main Content */}
      <View style={styles.content}>
        {/* Logo Container with Advanced Animations */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: fadeAnim,
              transform: [
                { scale: scaleAnim },
                { translateY: slideAnim },
                { scale: logoBounceAnim }
              ],
            },
          ]}
        >
          <Logo size="large" />
        </Animated.View>

        {/* App Name with Glow Effect */}
        <Animated.View
          style={[
            styles.titleContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.tagline}>Quality Control Management</Text>
        </Animated.View>

        {/* Advanced Loading Indicator */}
        <Animated.View
          style={[
            styles.loadingContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <View style={styles.loadingDots}>
            <Animated.View style={[styles.dot, styles.dot1, { opacity: fadeAnim }]} />
            <Animated.View style={[styles.dot, styles.dot2, { opacity: fadeAnim }]} />
            <Animated.View style={[styles.dot, styles.dot3, { opacity: fadeAnim }]} />
          </View>
          
          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <Animated.View style={[
              styles.progressBar,
              { width: progressWidth }
            ]} />
          </View>
        </Animated.View>
      </View>

      {/* Footer */}
      <Animated.View
        style={[
          styles.footer,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Text style={styles.version}>Version 1.0.0</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  particle1: {
    backgroundColor: '#007AFF',
    top: '20%',
    left: '10%',
  },
  particle2: {
    backgroundColor: '#34C759',
    top: '60%',
    right: '15%',
  },
  particle3: {
    backgroundColor: '#FF9500',
    top: '40%',
    left: '80%',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 6,
  },
  dot1: {
    backgroundColor: '#007AFF',
  },
  dot2: {
    backgroundColor: '#34C759',
  },
  dot3: {
    backgroundColor: '#FF9500',
  },
  progressBarContainer: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  version: {
    fontSize: 12,
    color: '#999',
    fontWeight: '300',
  },
});

export default SplashScreen;
