"use client";

import { useEffect, useRef, useState } from "react";

const JOYSTICK_MESSAGE_TYPE = "scummweb-touch-joystick-state";
const JOYSTICK_OUTER_RADIUS_PX = 36;
const JOYSTICK_KNOB_RADIUS_PX = 16;
const JOYSTICK_TRAVEL_RADIUS_PX = JOYSTICK_OUTER_RADIUS_PX - JOYSTICK_KNOB_RADIUS_PX;
const JOYSTICK_DEADZONE = 0.18;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getClampedOffset({ clientX, clientY, target }) {
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = clientX - centerX;
  const deltaY = clientY - centerY;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= JOYSTICK_TRAVEL_RADIUS_PX || distance === 0) {
    return { x: deltaX, y: deltaY };
  }

  const scale = JOYSTICK_TRAVEL_RADIUS_PX / distance;
  return {
    x: deltaX * scale,
    y: deltaY * scale,
  };
}

function normalizeOffset({ x, y }) {
  const distance = Math.hypot(x, y);

  if (distance === 0) {
    return { x: 0, y: 0 };
  }

  const magnitude = clamp(distance / JOYSTICK_TRAVEL_RADIUS_PX, 0, 1);

  if (magnitude <= JOYSTICK_DEADZONE) {
    return { x: 0, y: 0 };
  }

  const scaledMagnitude = (magnitude - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);
  const unitX = x / distance;
  const unitY = y / distance;

  return {
    x: unitX * scaledMagnitude,
    y: unitY * scaledMagnitude,
  };
}

export function useTouchJoystick({ enabled, frameRef, frameSrc }) {
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const activePointerIdRef = useRef(null);
  const joystickStateRef = useRef({ active: false, x: 0, y: 0 });
  const animationFrameRef = useRef(0);

  function syncTouchJoystickToFrame(nextState) {
    const frameWindow = frameRef.current?.contentWindow;

    if (!frameWindow) {
      return;
    }

    try {
      frameWindow.postMessage(
        {
          type: JOYSTICK_MESSAGE_TYPE,
          active: Boolean(nextState?.active),
          x: Number(nextState?.x) || 0,
          y: Number(nextState?.y) || 0,
        },
        window.location.origin,
      );
    } catch {}
  }

  function runSyncLoop() {
    animationFrameRef.current = 0;
    syncTouchJoystickToFrame(joystickStateRef.current);

    if (!joystickStateRef.current.active) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(runSyncLoop);
  }

  function ensureSyncLoop() {
    if (animationFrameRef.current) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(runSyncLoop);
  }

  function updateJoystickState(nextState) {
    joystickStateRef.current = nextState;
    ensureSyncLoop();
  }

  function resetJoystick(target = null) {
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
    setKnobOffset({ x: 0, y: 0 });
    updateJoystickState({ active: false, x: 0, y: 0 });
  }

  function updateFromPointerEvent(event) {
    const nextOffset = getClampedOffset({
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.currentTarget,
    });

    setKnobOffset(nextOffset);
    updateJoystickState({
      active: true,
      ...normalizeOffset(nextOffset),
    });
  }

  useEffect(() => {
    if (enabled) {
      return;
    }

    resetJoystick();
  }, [enabled]);

  useEffect(() => {
    const iframe = frameRef.current;

    if (!iframe) {
      return;
    }

    const syncCurrentState = () => {
      syncTouchJoystickToFrame(joystickStateRef.current);
    };

    syncCurrentState();
    iframe.addEventListener("load", syncCurrentState);

    return () => {
      iframe.removeEventListener("load", syncCurrentState);
    };
  }, [frameRef, frameSrc]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    knobOffset,
    handlePointerDown(event) {
      if (activePointerIdRef.current !== null) {
        return;
      }

      event.preventDefault();
      activePointerIdRef.current = event.pointerId;

      if (typeof event.currentTarget.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {}
      }

      updateFromPointerEvent(event);
    },
    handlePointerMove(event) {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      updateFromPointerEvent(event);
    },
    handlePointerUp(event) {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      resetJoystick(event.currentTarget);
    },
    handlePointerCancel(event) {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      resetJoystick(event.currentTarget);
    },
  };
}
