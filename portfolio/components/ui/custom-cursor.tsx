"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useTheme } from "./theme-provider";

// Circle: 4 cubic beziers, M at (10,0)
// fmt: M x y  C x1 y1 x2 y2 x y  (×4)
const CIRCLE = [
    10, 0,
    10, 5.52,  5.52, 10,   0, 10,
    -5.52, 10,  -10, 5.52,  -10, 0,
    -10, -5.52, -5.52, -10,  0, -10,
    5.52, -10,  10, -5.52,  10, 0,
];

// Teardrop: round part on right (forward), pointed tail on left (behind)
const TEARDROP = [
    10, 0,
    10, 5,    3, 9,    -1, 8,
    -5, 7,   -13, 3,  -13, 0,
    -13, -3,  -5, -7,  -1, -8,
    3, -9,   10, -5,   10, 0,
];

function buildPath(pts: number[]): string {
    return (
        `M ${pts[0]} ${pts[1]} ` +
        `C ${pts[2]} ${pts[3]}, ${pts[4]} ${pts[5]}, ${pts[6]} ${pts[7]} ` +
        `C ${pts[8]} ${pts[9]}, ${pts[10]} ${pts[11]}, ${pts[12]} ${pts[13]} ` +
        `C ${pts[14]} ${pts[15]}, ${pts[16]} ${pts[17]}, ${pts[18]} ${pts[19]} ` +
        `C ${pts[20]} ${pts[21]}, ${pts[22]} ${pts[23]}, ${pts[24]} ${pts[25]} Z`
    );
}

function blendPath(t: number): string {
    const pts = CIRCLE.map((v, i) => v + (TEARDROP[i] - v) * t);
    return buildPath(pts);
}

export function CustomCursor() {
    const { theme } = useTheme();
    const [isTouch, setIsTouch] = useState(false);

    useEffect(() => {
        setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    }, []);

    const [isHovering, setIsHovering] = useState(false);

    useEffect(() => {
        const onEnter = (e: MouseEvent) => {
            if ((e.target as Element).closest("a, button, [role='button']")) setIsHovering(true);
        };
        const onLeave = (e: MouseEvent) => {
            if ((e.target as Element).closest("a, button, [role='button']")) setIsHovering(false);
        };
        window.addEventListener("mouseover", onEnter);
        window.addEventListener("mouseout", onLeave);
        return () => {
            window.removeEventListener("mouseover", onEnter);
            window.removeEventListener("mouseout", onLeave);
        };
    }, []);

    const mouseX = useMotionValue(-100);
    const mouseY = useMotionValue(-100);

    const x = mouseX;
    const y = mouseY;

    const scaleValue = useMotionValue(1);
    const scale = useSpring(scaleValue, { stiffness: 300, damping: 25 });

    useEffect(() => {
        scaleValue.set(isHovering ? 0.5 : 1);
    }, [isHovering, scaleValue]);

    // Shape blend (0 = circle, 1 = teardrop)
    const blend = useMotionValue(0);
    const blendSpring = useSpring(blend, { stiffness: 220, damping: 22 });
    const pathD = useTransform(blendSpring, blendPath);

    // Rotation (springs toward movement angle)
    const rotate = useMotionValue(0);
    const rotateSpring = useSpring(rotate, { stiffness: 180, damping: 20 });

    useEffect(() => {
        let prevX = -100;
        let prevY = -100;
        let accAngle = 0;

        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - prevX;
            const dy = e.clientY - prevY;
            const speed = Math.sqrt(dx * dx + dy * dy);

            mouseX.set(e.clientX);
            mouseY.set(e.clientY);

            if (speed > 2) {
                // Unwrap angle to avoid spinning the long way
                const raw = Math.atan2(dy, dx) * (180 / Math.PI);
                let delta = raw - (accAngle % 360);
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;
                accAngle += delta;

                rotate.set(accAngle);
                blend.set(Math.min(speed / 18, 1));
            } else {
                blend.set(0);
            }

            prevX = e.clientX;
            prevY = e.clientY;
        };

        window.addEventListener("mousemove", onMove);
        return () => window.removeEventListener("mousemove", onMove);
    }, [mouseX, mouseY, blend, rotate]);

    if (isTouch) return null;

    return (
        <motion.svg
            width="50"
            height="50"
            viewBox="-15 -15 30 30"
            style={{
                position: "fixed",
                left: x,
                top: y,
                x: "-50%",
                y: "-50%",
                pointerEvents: "none",
                zIndex: 99999,
                rotate: rotateSpring,
                scale,
                overflow: "visible",
            }}
        >
            <motion.path
                d={pathD}
                fill={theme === "dark" ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.15)"}
                filter={theme === "dark"
                    ? "drop-shadow(0px 0px 10px rgba(0, 0, 0, 0.8))"
                    : "drop-shadow(0px 0px 8px rgba(0, 0, 0, 0.25))"}
            />
        </motion.svg>
    );
}
