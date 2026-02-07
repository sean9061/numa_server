"use client";

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Stage, Center } from "@react-three/drei";

interface GLTFModelProps {
    url: string;
}

function GLTFModel({ url }: GLTFModelProps) {
    const { scene } = useGLTF(url);
    return (
        <Center>
            <primitive object={scene} />
        </Center>
    );
}

interface GLTFViewerProps {
    url: string;
}

export function GLTFViewer({ url }: GLTFViewerProps) {
    return (
        <div className="h-full w-full bg-neutral-100 dark:bg-neutral-800/50">
            <Canvas shadows camera={{ position: [0, 0, 4], fov: 45 }}>
                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.5} contactShadow={{ opacity: 0.7, blur: 2 }}>
                        <GLTFModel url={url} />
                    </Stage>
                </Suspense>
                <OrbitControls autoRotate autoRotateSpeed={0.5} enableZoom={true} makeDefault />
            </Canvas>
        </div>
    );
}
