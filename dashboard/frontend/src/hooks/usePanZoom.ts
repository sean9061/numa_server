import { useRef, useEffect, useCallback } from 'react';
import { CANVAS_W, SERVER_H } from '../constants';
import { useSettings } from '../store/useSettings';

interface PanZoomState {
  x: number; y: number; scale: number;
}

export function usePanZoom(enabled: boolean = true) {
  const vpRef     = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const state     = useRef<PanZoomState>({ x: 0, y: 0, scale: 1 });
  const drag      = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const tidRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { wheelLevel, pinchLevel } = useSettings();
  const wheelRef = useRef(wheelLevel);
  const pinchRef = useRef(pinchLevel);
  useEffect(() => { wheelRef.current = wheelLevel; }, [wheelLevel]);
  useEffect(() => { pinchRef.current = pinchLevel; }, [pinchLevel]);

  const MIN = 0.18, MAX = 3.0;
  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, s));

  const commit = useCallback((animated = false) => {
    const el = canvasRef.current;
    if (!el) return;
    if (animated) {
      el.style.transition = 'transform 0.38s cubic-bezier(0.4,0,0.2,1)';
      clearTimeout(tidRef.current);
      tidRef.current = setTimeout(() => { el.style.transition = 'none'; }, 400);
    } else {
      el.style.transition = 'none';
    }
    const { x, y, scale } = state.current;
    el.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  }, []);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    const vp = vpRef.current;
    if (!vp) return;
    const ns = clamp(state.current.scale * factor);
    const r  = vp.getBoundingClientRect();
    const lx = cx - r.left, ly = cy - r.top;
    state.current.x = lx - (lx - state.current.x) * (ns / state.current.scale);
    state.current.y = ly - (ly - state.current.y) * (ns / state.current.scale);
    state.current.scale = ns;
    commit();
  }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps

  const goto = useCallback((cx: number, cy: number, targetScale: number, animated = true) => {
    const vp = vpRef.current;
    if (!vp) return;
    state.current.scale = clamp(targetScale);
    state.current.x = vp.clientWidth  / 2 - cx * state.current.scale;
    state.current.y = vp.clientHeight / 2 - cy * state.current.scale;
    commit(animated);
  }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps

  const fitServer = useCallback((animated = false) => {
    const vp = vpRef.current;
    if (!vp || vp.clientWidth === 0) return;
    const vw = vp.clientWidth;
    const s = vw >= 900 ? clamp(Math.min(1.15, (vw - 40) / CANVAS_W)) : 0.72;
    goto(CANVAS_W / 2, SERVER_H / 2, s, animated);
  }, [goto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return;
    const vp = vpRef.current;
    if (!vp) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as Element).closest('button,a,input,select,.log-view')) return;
      drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: state.current.x, oy: state.current.y };
      vp.classList.add('is-dragging');
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drag.current.active) return;
      state.current.x = drag.current.ox + e.clientX - drag.current.sx;
      state.current.y = drag.current.oy + e.clientY - drag.current.sy;
      commit();
    };
    const onMouseUp = () => {
      drag.current.active = false;
      vp.classList.remove('is-dragging');
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = 1 + wheelRef.current * 0.01;
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? f : 1 / f);
    };

    let t1x = 0, t1y = 0, t1ox = 0, t1oy = 0;
    let pinchDist = 0, pinchMx = 0, pinchMy = 0, touchPan = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        if ((t.target as Element).closest('button,a,input,select,.log-view')) return;
        touchPan = true;
        t1x = t.clientX; t1y = t.clientY;
        t1ox = state.current.x; t1oy = state.current.y;
      } else if (e.touches.length === 2) {
        touchPan = false;
        const [a, b] = e.touches;
        pinchDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        pinchMx   = (a.clientX + b.clientX) / 2;
        pinchMy   = (a.clientY + b.clientY) / 2;
        t1ox = state.current.x; t1oy = state.current.y;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if ((e.target as Element).closest('.log-view')) return;
      e.preventDefault();
      if (e.touches.length === 1 && touchPan) {
        const t = e.touches[0];
        state.current.x = t1ox + t.clientX - t1x;
        state.current.y = t1oy + t.clientY - t1y;
        commit();
      } else if (e.touches.length === 2) {
        const [a, b] = e.touches;
        const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const mx   = (a.clientX + b.clientX) / 2;
        const my   = (a.clientY + b.clientY) / 2;
        const r    = vp.getBoundingClientRect();
        const cx = mx - r.left, cy = my - r.top;
        const exp = 0.3 + pinchRef.current * 0.07;
        const factor = pinchDist > 0 ? Math.pow(dist / pinchDist, exp) : 1;
        const ns = clamp(state.current.scale * factor);
        state.current.x = cx - (cx - state.current.x) * (ns / state.current.scale) + (mx - pinchMx);
        state.current.y = cy - (cy - state.current.y) * (ns / state.current.scale) + (my - pinchMy);
        state.current.scale = ns;
        pinchDist = dist; pinchMx = mx; pinchMy = my;
        commit();
      }
    };
    const onTouchEnd = () => { touchPan = false; pinchDist = 0; };

    vp.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('touchstart', onTouchStart, { passive: true });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('touchend', onTouchEnd);

    requestAnimationFrame(() => fitServer(false));

    return () => {
      vp.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, commit, fitServer, zoomAt]);

  return { vpRef, canvasRef, fitServer, goto };
}
