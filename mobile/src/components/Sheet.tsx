import React from 'react';
import {
  View, Animated, ViewStyle, GestureResponderHandlers, LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '../lib/theme-context';
import { radius } from '../lib/tokens';

/**
 * The grab strip at the top of a bottom sheet. Decorative — the drag gesture is
 * handled by `SheetPanel` in the capture phase, scoped to this region.
 */
export const SheetHandle: React.FC<{ style?: ViewStyle }> = ({ style }) => {
  const { theme } = useTheme();
  return (
    <View style={[{ height: 28, justifyContent: 'flex-end', paddingBottom: 6 }, style]}>
      <View
        style={{
          width: 40,
          height: 4,
          borderRadius: radius.pill,
          backgroundColor: theme.border,
          alignSelf: 'center',
        }}
      />
    </View>
  );
};

/**
 * Wraps a sheet panel so it can be dragged. Applied to the panel itself, not the
 * scrim, so a tap outside still dismisses without any movement.
 */
export const SheetPanel: React.FC<{
  translateY: Animated.Value;
  panHandlers: GestureResponderHandlers;
  onLayout?: (e: LayoutChangeEvent) => void;
  style: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}> = ({ translateY, panHandlers, onLayout, style, children }) => (
  <Animated.View
    style={[style, { transform: [{ translateY }] }]}
    onLayout={onLayout}
    {...panHandlers}
  >
    {children}
  </Animated.View>
);