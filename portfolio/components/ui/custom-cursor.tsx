"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

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
    const mouseX = useMotionValue(-100);
    const mouseY = useMotionValue(-100);

    const x = mouseX;
    const y = mouseY;

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
                overflow: "visible",
            }}
        >
            <motion.path
                d={pathD}
                fill="rgba(255, 255, 255, 0.3)"
                filter="drop-shadow(0px 0px 10px rgba(0, 0, 0, 0.8))"
            />
        </motion.svg>
    );
}
