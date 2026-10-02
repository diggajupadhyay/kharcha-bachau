import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

/** Past this the sheet is dismissed even on a slow drag. */
const DISMISS_DISTANCE = 110;
/** Or this fast, which is how people actually flick a sheet away. */
const DISMISS_VELOCITY = 0.6;
/**
 * How far down from the panel's own top edge the drag handle occupies.
 *
 * Sized to the handle strip and nothing more. Measured from the panel's top edge
 * because `pageY` is in dp and a bottom sheet's top edge sits part-way down the
 * display, so any screen-relative threshold rejects real touches. Kept narrow so
 * the close button in the header row stays tappable.
 */
const GRAB_ZONE = 30;

/** Downward movement, in dp, before a body drag is treated as a drag and not a tap. */
const DRAG_START = 8;

const OFFSCREEN = 600;

/**
 * Pull-down-to-dismiss for a bottom sheet.
 *
 * The sheets were only dismissible via the X or a tap on the scrim. On a tall
 * device both sit far from the thumb — the X is at the top of a panel that can
 * cover 92% of the screen — so the gesture people reach for first did nothing.
 *
 * Two ways to start the gesture, because both are needed:
 *
 *  - Touch-down inside the grab strip under the handle. Claiming on touch-down
 *    rather than waiting for a move is what makes that path reliable: negotiation
 *    stops the moment any view becomes the responder, so a handler that declines
 *    at touch-down never sees the move events that would have claimed it.
 *  - A downward drag anywhere on the panel body, but only once the touch has
 *    clearly moved (`DRAG_START`) and only while `canDragRef` says the sheet's
 *    scrollable content is parked at the top. That is the standard bottom-sheet
 *    contract: the list scrolls until it hits the top, then the sheet takes over.
 *
 * The move claim is taken in the *capture* phase so it beats the inner ScrollView.
 * That is also what makes it dangerous, and the reason `DRAG_START` and `owns`
 * both matter:
 *
 *  - A parent returning true from `onMoveShouldSetPanResponderCapture` *takes* the
 *    responder away from whichever child already holds it. Claiming on every move
 *    therefore pulled every tile, row and button out from under the press on a real
 *    finger's one-pixel jitter, handing each tap to the sheet instead — taps inside
 *    a sheet did nothing, and a slightly longer press dismissed it.
 *  - `owns` makes every handler a no-op unless this hook actually holds the
 *    gesture, so a release belonging to a child control can never animate the
 *    sheet no matter how the negotiation went.
 *
 * The grab zone is measured from the panel's own top, not the screen. `pageY` is in
 * dp while a sheet's top edge is somewhere in the middle of the display, so a
 * screen-relative threshold rejects every real touch on a high-density device.
 *
 * @param canDragRef Set false while the sheet's scrollable content is scrolled
 *   away from the top, so body drags scroll the content instead of the sheet.
 */
export const useSheetDrag = (
  isOpen: boolean,
  onClose: () => void,
  canDragRef?: React.MutableRefObject<boolean>
) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const panelTop = useRef(0);
  // True only while this hook actually holds the gesture. Every handler checks it so
  // a release that belongs to a child control can never animate the sheet.
  const owns = useRef(false);

  // Held in a ref so a new onClose identity does not rebuild the responder and
  // drop an in-flight gesture.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // A closed sheet is left translated off-screen by the dismiss animation; reset
  // on open so it never slides in from wherever it last stopped.
  useEffect(() => {
    if (isOpen) {
      translateY.setValue(0);
      owns.current = false;
    }
  }, [isOpen, translateY]);

  const close = useCallback(() => {
    Animated.timing(translateY, {
      toValue: OFFSCREEN,
      duration: 170,
      useNativeDriver: true,
    }).start(() => onCloseRef.current());
  }, [translateY]);

  const settle = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [translateY]);

  const panResponder = useMemo(() => PanResponder.create({
    // Claim the touch immediately if it lands on the drag handle.
    //
    // Claiming on touch-down rather than waiting for `onMoveShouldSet...` is what
    // makes the gesture survive: negotiation stops the moment any view becomes the
    // responder, so a handler that declines at touch-down never sees the move
    // events that would have claimed it. The handle strip holds no controls, so
    // taking it outright costs nothing.
    onStartShouldSetPanResponderCapture: (e) => {
      const local = e.nativeEvent.pageY - panelTop.current;
      const grabbed = local >= 0 && local <= GRAB_ZONE;
      owns.current = grabbed;
      return grabbed;
    },

    // Claim on move only for an unambiguous downward drag on the sheet body, and
    // only while the sheet's own scrollable content is at the top. A tap cannot
    // reach this: it would have to move `DRAG_START` before it is a tap any more.
    onMoveShouldSetPanResponderCapture: (_e, g) => {
      if (canDragRef?.current === false) return false;
      const downward = g.dy > DRAG_START && g.dy > Math.abs(g.dx);
      owns.current = downward;
      return downward;
    },

    onPanResponderMove: (_e, g) => {
      if (!owns.current) return;
      // Rubber-band upward: the sheet cannot be dragged above its resting place.
      translateY.setValue(g.dy > 0 ? g.dy : g.dy * 0.15);
    },

    onPanResponderRelease: (_e, g) => {
      if (!owns.current) return;
      owns.current = false;
      const fling = g.vy > DISMISS_VELOCITY;
      // A fast upward flick is a cancel, not a dismiss, even from low down.
      const flingUp = g.vy < -DISMISS_VELOCITY;
      if (!flingUp && (fling || g.dy > DISMISS_DISTANCE)) close();
      else settle();
    },

    onPanResponderTerminate: () => {
      if (!owns.current) return;
      owns.current = false;
      settle();
    },
  }), [close, settle, translateY]);

  /** Records the panel's top edge so the grab zone can be measured against it. */
  const onPanelLayout = useCallback((e: LayoutChangeEvent) => {
    // Measured once per layout pass; only the top edge matters.
    panelTop.current = e.nativeEvent.layout.y;
  }, []);

  return {
    translateY,
    panHandlers: panResponder.panHandlers,
    onPanelLayout,
  };
};