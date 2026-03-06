"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const ROYAL_PURPLE = "#4B0082";
const SILVER = "#C0C0C0";
const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;

export default function RadarSweep() {
  const [pings, setPings] = useState<{ id: number; angle: number }[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPings((prev) => {
        const next = [...prev.slice(-6), { id: Date.now(), angle: Math.random() * 360 }];
        return next;
      });
    }, 700);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="relative flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="relative rounded-3xl p-8 overflow-hidden"
        style={{
          background: "rgba(10, 5, 20, 0.9)",
          border: "1px solid rgba(75, 0, 130, 0.5)",
          boxShadow: "0 0 40px rgba(75, 0, 130, 0.25), 0 0 0 1px rgba(192,192,192,0.08) inset",
        }}
      >
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          {/* Grid circles */}
          {[0.33, 0.66, 1].map((scale, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border"
              style={{
                left: CX - (SIZE / 2) * scale,
                top: CY - (SIZE / 2) * scale,
                width: SIZE * scale,
                height: SIZE * scale,
                borderColor: "rgba(75, 0, 130, 0.35)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
            />
          ))}
          {/* Sweep line */}
          <motion.div
            className="absolute origin-center pointer-events-none"
            style={{
              left: CX,
              top: CY,
              width: 2,
              height: SIZE / 2,
              background: `linear-gradient(to top, transparent, ${ROYAL_PURPLE})`,
              opacity: 0.9,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
          />
          {/* Pulse rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border-2"
              style={{
                left: 0,
                top: 0,
                width: SIZE,
                height: SIZE,
                borderColor: ROYAL_PURPLE,
              }}
              initial={{ scale: 0.3, opacity: 0.6 }}
              animate={{ scale: 1.1, opacity: 0 }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeOut",
              }}
            />
          ))}
          {/* Ping dots when breaches "found" */}
          {pings.map((p) => (
            <motion.div
              key={p.id}
              className="absolute w-3 h-3 rounded-full bg-red-500/90"
              style={{
                left: CX + (SIZE / 2) * 0.7 * Math.cos((p.angle * Math.PI) / 180) - 6,
                top: CY - (SIZE / 2) * 0.7 * Math.sin((p.angle * Math.PI) / 180) - 6,
                boxShadow: "0 0 12px rgba(239, 68, 68, 0.8)",
              }}
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 1.2, opacity: 0.7 }}
              transition={{ duration: 0.8 }}
            />
          ))}
        </div>
        <p className="text-center text-xs font-medium mt-3" style={{ color: SILVER }}>
          Deep scanning identities...
        </p>
      </div>
    </motion.div>
  );
}
