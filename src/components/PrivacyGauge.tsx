"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

const ROYAL_PURPLE = "#4B0082";
const SILVER = "#C0C0C0";
const SIZE = 280;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SWEEP_DURATION = 2.5; // spring tuned to ~2.5s settle

function getScoreColor(s: number) {
  if (s >= 70) return "#22c55e";
  if (s >= 40) return "#eab308";
  return "#ef4444";
}

export default function PrivacyGauge({
  score,
  isScanning,
}: {
  score: number | null;
  isScanning: boolean;
}) {
  const [displayNum, setDisplayNum] = useState(0);
  const progress = useMotionValue(0);
  const strokeDashoffset = useTransform(
    progress,
    (v) => CIRCUMFERENCE - (v / 100) * CIRCUMFERENCE
  );

  useEffect(() => {
    if (score === null) {
      progress.set(0);
      setDisplayNum(0);
      return;
    }
    const controls = animate(0, score, {
      type: "spring",
      stiffness: 45,
      damping: 22,
      mass: 0.8,
      onUpdate: (v) => {
        progress.set(v);
        setDisplayNum(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [score, progress]);

  const strokeColor = score !== null ? getScoreColor(score) : SILVER;

  return (
    <motion.div className="relative flex flex-col items-center justify-center">
      {/* Central card — subtle purple shimmer when scanning */}
      <motion.div
        className="relative rounded-3xl p-8 overflow-hidden"
        style={{
          background: "rgba(75, 0, 130, 0.06)",
          border: "1px solid rgba(192, 192, 192, 0.18)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
        animate={
          isScanning
            ? {
                boxShadow: [
                  `0 8px 32px rgba(0,0,0,0.24), 0 0 24px 2px ${ROYAL_PURPLE}20`,
                  `0 8px 32px rgba(0,0,0,0.24), 0 0 48px 8px ${ROYAL_PURPLE}35`,
                  `0 8px 32px rgba(0,0,0,0.24), 0 0 24px 2px ${ROYAL_PURPLE}20`,
                ],
                transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
              }
            : { boxShadow: "0 8px 32px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.04) inset" }
        }
      >
        {/* Subtle purple shimmer across entire card during scanning */}
        {isScanning && (
          <motion.div
            className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl"
            initial={false}
          >
            <motion.div
              className="absolute inset-0 w-[240%] h-full -left-[70%]"
              style={{
                background:
                  "linear-gradient(105deg, transparent 0%, transparent 32%, rgba(75,0,130,0.14) 42%, rgba(120,80,160,0.2) 50%, rgba(75,0,130,0.14) 58%, transparent 68%, transparent 100%)",
              }}
              animate={{ x: ["0%", "42%"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        )}

        <motion.div
          className="relative rounded-full"
          style={{ width: SIZE, height: SIZE }}
        >
          {/* Soft purple glow behind gauge when scanning */}
          {isScanning && (
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                top: -24,
                left: -24,
                right: -24,
                bottom: -24,
                background: `radial-gradient(circle, ${ROYAL_PURPLE}20 0%, transparent 65%)`,
              }}
              animate={{
                opacity: [0.35, 0.7, 0.35],
                scale: [0.98, 1.02, 0.98],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          <svg
            width={SIZE}
            height={SIZE}
            className="transform -rotate-90 relative z-10"
            aria-hidden
          >
            <circle
              cx={CX}
              cy={CY}
              r={RADIUS}
              fill="none"
              stroke={SILVER}
              strokeWidth={STROKE}
              strokeOpacity={0.25}
            />
            <motion.circle
              cx={CX}
              cy={CY}
              r={RADIUS}
              fill="none"
              stroke={strokeColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              style={{
                strokeDashoffset,
                filter: score !== null ? `drop-shadow(0 0 6px ${strokeColor}66)` : undefined,
              }}
            />
          </svg>

          {/* Center content */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center z-10"
            style={{ width: SIZE, height: SIZE }}
          >
            {isScanning ? (
              <span
                className="text-sm font-medium tracking-wider"
                style={{ color: SILVER }}
              >
                Scanning...
              </span>
            ) : score !== null ? (
              <>
                <motion.span
                  className="text-5xl font-bold tabular-nums"
                  style={{ color: strokeColor }}
                >
                  {displayNum}
                </motion.span>
                <span
                  className="text-sm font-medium mt-0.5"
                  style={{ color: SILVER }}
                >
                  Privacy Health
                </span>
              </>
            ) : (
              <span
                className="text-sm font-medium"
                style={{ color: SILVER }}
              >
                Enter email to audit
              </span>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
