"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "./theme-provider";

const INSET   = 26;
const THIN_R  = 1;
const THICK_R = 4;
const TRANS   = 20;
const COLOR      = "rgba(0,0,0,0.22)";
const COLOR_DARK = "rgba(255,255,255,0.22)";
const COLOR_DRAG = "rgba(0,0,0,0.38)";
const COLOR_DRAG_DARK = "rgba(255,255,255,0.38)";
const WIDTH   = THICK_R * 2;
const CX      = THICK_R;

function buildPath(totalH: number, thumbY: number, thumbH: number): string {
    const t1 = thumbY;
    const t2 = thumbY + thumbH;
    const u0 = Math.max(0, t1 - TRANS);
    const d0 = Math.min(totalH, t2 + TRANS);

    return [
        `M ${CX - THIN_R} 0`,
        `L ${CX - THIN_R} ${u0}`,
        `C ${CX - THIN_R} ${u0 + TRANS * 0.6}, ${CX - THICK_R} ${t1 - TRANS * 0.2}, ${CX - THICK_R} ${t1}`,
        `L ${CX - THICK_R} ${t2}`,
        `C ${CX - THICK_R} ${t2 + TRANS * 0.2}, ${CX - THIN_R} ${d0 - TRANS * 0.6}, ${CX - THIN_R} ${d0}`,
        `L ${CX - THIN_R} ${totalH}`,
        `L ${CX + THIN_R} ${totalH}`,
        `L ${CX + THIN_R} ${d0}`,
        `C ${CX + THIN_R} ${d0 - TRANS * 0.6}, ${CX + THICK_R} ${t2 + TRANS * 0.2}, ${CX + THICK_R} ${t2}`,
        `L ${CX + THICK_R} ${t1}`,
        `C ${CX + THICK_R} ${t1 - TRANS * 0.2}, ${CX + THIN_R} ${u0 + TRANS * 0.6}, ${CX + THIN_R} ${u0}`,
        `L ${CX + THIN_R} 0`,
        `Z`,
    ].join(" ");
}

export function CustomScrollbar() {
    const { theme } = useTheme();
    const dark = theme === "dark";
    const [isTouch, setIsTouch] = useState(false);
    const [thumbH, setThumbH] = useState(0);
    const [thumbY, setThumbY] = useState(0);
    const [winH, setWinH]     = useState(0);
    const [dragging, setDragging] = useState(false);

    // ドラッグ中の基準点
    const dragStartY    = useRef(0);
    const dragStartScroll = useRef(0);
    const thumbHRef     = useRef(0);
    const winHRef       = useRef(0);

    // スクロール位置 → thumbY を計算して state 更新
    const updateThumb = () => {
        const doc     = document.documentElement;
        const trackH  = window.innerHeight;
        const ratio   = doc.clientHeight / doc.scrollHeight;
        const h       = Math.max(ratio * trackH * 0.4, 24);
        const maxScroll = doc.scrollHeight - doc.clientHeight;
        const y = maxScroll > 0 ? (doc.scrollTop / maxScroll) * (trackH - h) : 0;
        setThumbH(h);
        setThumbY(y);
        setWinH(trackH);
        thumbHRef.current = h;
        winHRef.current   = trackH;
    };

    useEffect(() => {
        const updateIsTouch = () => setIsTouch(window.innerWidth < 640);
        updateIsTouch();
        window.addEventListener("scroll", updateThumb, { passive: true });
        window.addEventListener("resize", updateThumb);
        window.addEventListener("resize", updateIsTouch);
        updateThumb();
        return () => {
            window.removeEventListener("scroll", updateThumb);
            window.removeEventListener("resize", updateThumb);
            window.removeEventListener("resize", updateIsTouch);
        };
    }, []);

    // ドラッグ開始
    const onThumbPointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        setDragging(true);
        dragStartY.current     = e.clientY;
        dragStartScroll.current = document.documentElement.scrollTop;
        (e.target as Element).setPointerCapture(e.pointerId);
    };

    // ドラッグ中
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragging) return;
        const doc       = document.documentElement;
        const trackH    = winHRef.current;
        const h         = thumbHRef.current;
        const maxScroll = doc.scrollHeight - doc.clientHeight;
        const dy        = e.clientY - dragStartY.current;
        const scrollDelta = (dy / (trackH - h)) * maxScroll;
        document.documentElement.scrollTop = dragStartScroll.current + scrollDelta;
    };

    // ドラッグ終了
    const onPointerUp = () => setDragging(false);

    // トラック上のクリック（サム以外）→ その位置にジャンプ
    const onTrackClick = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect      = e.currentTarget.getBoundingClientRect();
        const clickY    = e.clientY - rect.top;
        const doc       = document.documentElement;
        const trackH    = winHRef.current;
        const h         = thumbHRef.current;
        const maxScroll = doc.scrollHeight - doc.clientHeight;
        // クリック位置がサムの中なら無視
        if (clickY >= thumbY && clickY <= thumbY + h) return;
        const ratio     = (clickY - h / 2) / (trackH - h);
        document.documentElement.scrollTop = ratio * maxScroll;
    };

    if (isTouch || winH === 0) return null;

    const fill = dragging
        ? (dark ? COLOR_DRAG_DARK : COLOR_DRAG)
        : (dark ? COLOR_DARK : COLOR);

    return (
        <svg
            width={WIDTH}
            height={winH}
            style={{
                position: "fixed",
                right: INSET,
                top: 0,
                pointerEvents: "all",
                zIndex: 9998,
                overflow: "visible",
                cursor: dragging ? "grabbing" : "grab",
            }}
            onClick={onTrackClick}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
        >
            {/* クリック判定を広げる透明な帯 */}
            <rect x={-8} y={0} width={WIDTH + 16} height={winH} fill="transparent" />
            <path
                d={buildPath(winH, thumbY, thumbH)}
                fill={fill}
                style={{ transition: dragging ? "none" : "fill 0.2s ease" }}
                onPointerDown={onThumbPointerDown}
            />
        </svg>
    );
}
