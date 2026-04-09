"use client";

import { useEffect, useRef, useState } from "react";

const TOUCH_CURSOR_PAD_MESSAGE_TYPE = "scummweb-touch-cursor-pad";
const CURSOR_PAD_TRAVEL_RADIUS_PX = 22;
const CURSOR_PAD_MOVEMENT_SCALE = 0.55;
const CURSOR_PAD_MAX_DELTA_PX = 12;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPointFromPointerEvent(event) {
  return {
    clientX: Number(event.clientX) || 0,
    clientY: Number(event.clientY) || 0,
  };
}

function getClampedOffset(originPoint, currentPoint) {
  const deltaX = currentPoint.clientX - originPoint.clientX;
  const deltaY = currentPoint.clientY - originPoint.clientY;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= CURSOR_PAD_TRAVEL_RADIUS_PX || distance === 0) {
    return { x: deltaX, y: deltaY };
  }

  const scale = CURSOR_PAD_TRAVEL_RADIUS_PX / distance;

  return {
    x: deltaX * scale,
    y: deltaY * scale,
  };
}

export function useTouchCursorPad({ enabled, frameRef }) {
  const [indicatorOffset, setIndicatorOffset] = useState({ x: 0, y: 0 });
  const activePointerIdRef = useRef(null);
  const gestureOriginPointRef = useRef(null);
  const lastPointerPointRef = useRef(null);

  function sendCursorPadDelta(deltaX, deltaY) {
    const frameWindow = frameRef.current?.contentWindow;

    if (!frameWindow) {
      return;
    }

    try {
      frameWindow.postMessage(
        {
          type: TOUCH_CURSOR_PAD_MESSAGE_TYPE,
          deltaX,
          deltaY,
        },
        window.location.origin,
      );
    } catch {}
  }

  function resetCursorPad(target = null) {
    if (
      target &&
      activePointerIdRef.current !== null &&
      typeof target.releasePointerCapture === "function" &&
      target.hasPointerCapture?.(activePointerIdRef.current)
    ) {
      try {
        target.releasePointerCapture(activePointerIdRef.current);
      } catch {}
    }

    activePointerIdRef.current = null;
    gestureOriginPointRef.current = null;
    lastPointerPointRef.current = null;
    setIndicatorOffset({ x: 0, y: 0 });
  }

  useEffect(() => {
    if (enabled) {
      return;
    }

    resetCursorPad();
  }, [enabled]);

  return {
    indicatorOffset,
    handlePointerDown(event) {
      if (!enabled || activePointerIdRef.current !== null) {
        return;
      }

      event.preventDefault();
      activePointerIdRef.current = event.pointerId;

      if (typeof event.currentTarget.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}
      }

      const pointerPoint = getPointFromPointerEvent(event);
      gestureOriginPointRef.current = pointerPoint;
      lastPointerPointRef.current = pointerPoint;
      setIndicatorOffset({ x: 0, y: 0 });
    },
    handlePointerMove(event) {
      if (!enabled || activePointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();

      const pointerPoint = getPointFromPointerEvent(event);
      const previousPoint = lastPointerPointRef.current || pointerPoint;
      const originPoint = gestureOriginPointRef.current || pointerPoint;
      const rawDeltaX = (pointerPoint.clientX - previousPoint.clientX) * CURSOR_PAD_MOVEMENT_SCALE;
      const rawDeltaY = (pointerPoint.clientY - previousPoint.clientY) * CURSOR_PAD_MOVEMENT_SCALE;
      const deltaX = clamp(rawDeltaX, -CURSOR_PAD_MAX_DELTA_PX, CURSOR_PAD_MAX_DELTA_PX);
      const deltaY = clamp(rawDeltaY, -CURSOR_PAD_MAX_DELTA_PX, CURSOR_PAD_MAX_DELTA_PX);

      if (deltaX !== 0 || deltaY !== 0) {
        sendCursorPadDelta(deltaX, deltaY);
      }

      lastPointerPointRef.current = pointerPoint;
      setIndicatorOffset(getClampedOffset(originPoint, pointerPoint));
    },
    handlePointerUp(event) {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      resetCursorPad(event.currentTarget);
    },
    handlePointerCancel(event) {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      resetCursorPad(event.currentTarget);
    },
  };
}
