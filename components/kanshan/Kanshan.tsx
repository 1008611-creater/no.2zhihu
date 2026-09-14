"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { clamp } from "@/lib/motion/spring";
import { EYE_PLAYLISTS, HOLD_MS, POSE_BY_STATE, type EyeTarget, type KanshanState } from "./states";

/**
 * 看山（刘看山）主持人形象 —— 原创几何演绎。
 *
 * 设计说明：
 *   - 用几何图形重构看山（白色北极狐）的识别特征：圆头、双耳、吻部、尾。
 *   - 眼睛由状态表驱动，在 EYE_PLAYLISTS 里按停留时长区间随机切换，
 *     切换由 Motion 的弹簧过渡，所以不会跳变。
 *   - 所有动效走 Motion（useSpring / useTransform / useAnimationFrame）。
 *     状态与停留时长的参数来自对 grok-icon-study 的动效架构审计，
 *     但几何、配色、状态命名全部为本项目原创，未使用其任何素材。
 *
 * 性能约定：
 *   - 指针跟随写入 MotionValue，不经过 React state，因此不触发重渲染。
 *   - 只有「眼神目标切换」和「状态切换」会触发重渲染，频率由 HOLD_MS 控制（秒级）。
 */

export interface KanshanProps {
  state?: KanshanState;
  size?: number;
  /** 是否自动在状态表内切换眼神（默认开）。 */
  autoBlink?: boolean;
  /** 是否让看山看向鼠标指针（首页首屏用，提升「在主持」的临场感）。 */
  followPointer?: boolean;
  className?: string;
}

export function Kanshan({
  state = "idle",
  size = 220,
  autoBlink = true,
  followPointer = false,
  className,
}: KanshanProps) {
  const reducedMotion = useReducedMotion();
  const uid = useId();

  // 同页面可能出现多个看山，渐变 id 必须各自独立，否则会互相串色。
  const gFur = `ks-fur-${uid}`;
  const gEar = `ks-ear-${uid}`;
  const gTail = `ks-tail-${uid}`;
  const gCheek = `ks-cheek-${uid}`;
  const gRing = `ks-ring-${uid}`;

  const [eye, setEye] = useState<EyeTarget>(EYE_PLAYLISTS[state][0]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 状态表驱动：在停留时长区间内随机切到下一个眼神目标。
  useEffect(() => {
    const playlist = EYE_PLAYLISTS[state];
    setEye(playlist[0]);

    if (!autoBlink || reducedMotion) return;

    let cancelled = false;
    const schedule = () => {
      const [lo, hi] = HOLD_MS[state];
      const delay = lo + Math.random() * (hi - lo);
      timer.current = setTimeout(() => {
        if (cancelled) return;
        setEye(playlist[Math.floor(Math.random() * playlist.length)]);
        schedule();
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, autoBlink, reducedMotion]);

  const pose = POSE_BY_STATE[state];

  /* --------------------------- 姿态弹簧 --------------------------- */
  const tilt = useSpring(pose.tilt, { stiffness: 120, damping: 16 });
  const bob = useSpring(pose.bob, { stiffness: 140, damping: 18 });
  const ear = useSpring(pose.ear, { stiffness: 160, damping: 14 });
  const breathe = useSpring(pose.breathe, { stiffness: 90, damping: 20 });

  useEffect(() => { tilt.set(pose.tilt); }, [pose.tilt, tilt]);
  useEffect(() => { bob.set(pose.bob); }, [pose.bob, bob]);
  useEffect(() => { ear.set(pose.ear); }, [pose.ear, ear]);
  useEffect(() => { breathe.set(pose.breathe); }, [pose.breathe, breathe]);

  /* --------------------------- 眼神弹簧 --------------------------- */
  const pupilX = useSpring(eye.x, { stiffness: 200, damping: 20 });
  const pupilY = useSpring(eye.y, { stiffness: 200, damping: 20 });
  const lid = useSpring(eye.lid, { stiffness: 260, damping: 24 });
  const eyeScale = useSpring(eye.scale, { stiffness: 220, damping: 18 });

  useEffect(() => { pupilX.set(eye.x); }, [eye.x, pupilX]);
  useEffect(() => { pupilY.set(eye.y); }, [eye.y, pupilY]);
  useEffect(() => { lid.set(eye.lid); }, [eye.lid, lid]);
  useEffect(() => { eyeScale.set(eye.scale); }, [eye.scale, eyeScale]);

  /* --------------------------- 指针跟随 --------------------------- */
  // 目标值放在 MotionValue 上，pointermove 只写值不触发重渲染。
  const gazeX = useMotionValue(0);
  const gazeY = useMotionValue(0);
  const gx = useSpring(gazeX, { stiffness: 110, damping: 18 });
  const gy = useSpring(gazeY, { stiffness: 110, damping: 18 });

  useEffect(() => {
    if (!followPointer || reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      gazeX.set(clamp((e.clientX - cx) / (r.width * 1.5), -1, 1));
      gazeY.set(clamp((e.clientY - cy) / (r.height * 1.5), -1, 1));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [followPointer, reducedMotion, gazeX, gazeY]);

  /* --------------------------- 合成变换 --------------------------- */
  const s = size / 220;

  const pupilDX = useTransform([pupilX, gx], ([v, g]: number[]) => (v * 5.2 + g * 4.5) * s);
  const pupilDY = useTransform([pupilY, gy], ([v, g]: number[]) => (v * 4.2 + g * 3.2) * s);
  const lidScale = useTransform(lid, (v) => 1 - clamp(v, 0, 1) * 0.92);
  const pupilScale = useTransform(eyeScale, (v) => v);
  const earOpposite = useTransform(ear, (v) => -v);
  // 头部随视线轻微转动：幅度刻意小于眼睛，否则会显得头部在抖。
  const headRotate = useTransform([tilt, gx], ([t, g]: number[]) => t + g * 4);
  const headShiftX = useTransform(gx, (v) => v * 3.5 * s);

  /* --------------------------- 待机呼吸 --------------------------- */
  const clock = useMotionValue(0);
  useAnimationFrame((t) => clock.set(t));
  const tailAmp = pose.tail ? 16 : 5;
  const tailRotate = useTransform(clock, (t) => Math.sin(t / 420) * tailAmp);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ width: size, height: size, position: "relative", flex: "none" }}
    >
      {/* 舞台光晕 */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "12%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 42% 34%, rgba(77,124,255,0.30), rgba(139,92,246,0.16) 46%, transparent 70%)",
          filter: "blur(14px)",
        }}
      />
      <motion.svg
        viewBox="0 0 220 220"
        width={size}
        height={size}
        role="img"
        aria-label={`看山主持人（${state}）`}
        style={{ position: "relative", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gFur} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="58%" stopColor="#e8ecfa" />
            <stop offset="100%" stopColor="#c3cbe6" />
          </linearGradient>
          <linearGradient id={gEar} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6f8ff" />
            <stop offset="100%" stopColor="#cfd7ee" />
          </linearGradient>
          <linearGradient id={gTail} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#b9c3e0" />
          </linearGradient>
          <radialGradient id={gCheek} cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(77,124,255,0.30)" />
            <stop offset="100%" stopColor="rgba(77,124,255,0)" />
          </radialGradient>
          <linearGradient id={gRing} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4d7cff" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#2fbf8f" />
          </linearGradient>
        </defs>

        <motion.g
          style={{
            x: headShiftX,
            y: bob,
            scale: breathe,
            rotate: headRotate,
            originX: "110px",
            originY: "150px",
          }}
        >
          {/* 尾巴 */}
          <motion.path
            d="M158 150 C186 142 196 116 186 96 C180 112 168 122 154 128 Z"
            fill={`url(#${gTail})`}
            stroke="rgba(120,134,178,0.42)"
            strokeWidth="1.4"
            style={{ rotate: tailRotate, originX: "158px", originY: "150px" }}
          />

          {/* 身体 */}
          <path
            d="M110 96 C144 96 166 122 168 156 C170 186 146 200 110 200 C74 200 50 186 52 156 C54 122 76 96 110 96 Z"
            fill={`url(#${gFur})`}
            stroke="rgba(120,134,178,0.45)"
            strokeWidth="1.6"
          />

          {/* 耳朵 */}
          <motion.g style={{ rotate: ear, originX: "84px", originY: "72px" }}>
            <path d="M70 78 C60 50 66 30 84 26 C94 42 96 60 92 80 Z" fill={`url(#${gEar})`} stroke="rgba(120,134,178,0.4)" strokeWidth="1.5" />
            <path d="M75 72 C69 54 73 41 83 38 C88 50 89 61 87 74 Z" fill="rgba(139,92,246,0.24)" />
          </motion.g>
          <motion.g style={{ rotate: earOpposite, originX: "136px", originY: "72px" }}>
            <path d="M150 78 C160 50 154 30 136 26 C126 42 124 60 128 80 Z" fill={`url(#${gEar})`} stroke="rgba(120,134,178,0.4)" strokeWidth="1.5" />
            <path d="M145 72 C151 54 147 41 137 38 C132 50 131 61 133 74 Z" fill="rgba(139,92,246,0.24)" />
          </motion.g>

          {/* 头 */}
          <path
            d="M110 34 C150 34 176 60 176 96 C176 130 148 150 110 150 C72 150 44 130 44 96 C44 60 70 34 110 34 Z"
            fill={`url(#${gFur})`}
            stroke="rgba(120,134,178,0.5)"
            strokeWidth="1.7"
          />

          {/* 脸颊腮红 */}
          <ellipse cx="76" cy="112" rx="15" ry="11" fill={`url(#${gCheek})`} />
          <ellipse cx="144" cy="112" rx="15" ry="11" fill={`url(#${gCheek})`} />

          {/* 眼睛 */}
          <g>
            <ellipse cx="88" cy="94" rx="11" ry="11.6" fill="#0b0d17" opacity="0.92" />
            <motion.g style={{ x: pupilDX, y: pupilDY, scale: pupilScale, originX: "88px", originY: "94px" }}>
              <circle cx="88" cy="94" r="4.6" fill="#eaf0ff" />
              <circle cx="90.4" cy="91.6" r="2.1" fill="#ffffff" />
            </motion.g>
            <motion.rect
              x="76" y="82" width="24" height="24" fill={`url(#${gFur})`}
              style={{ scaleY: lidScale, originX: "88px", originY: "82px" }}
            />
          </g>
          <g>
            <ellipse cx="132" cy="94" rx="11" ry="11.6" fill="#0b0d17" opacity="0.92" />
            <motion.g style={{ x: pupilDX, y: pupilDY, scale: pupilScale, originX: "132px", originY: "94px" }}>
              <circle cx="132" cy="94" r="4.6" fill="#eaf0ff" />
              <circle cx="134.4" cy="91.6" r="2.1" fill="#ffffff" />
            </motion.g>
            <motion.rect
              x="120" y="82" width="24" height="24" fill={`url(#${gFur})`}
              style={{ scaleY: lidScale, originX: "132px", originY: "82px" }}
            />
          </g>

          {/* 吻部与鼻子 */}
          <path d="M110 108 C118 108 123 113 123 118 C123 125 116 130 110 130 C104 130 97 125 97 118 C97 113 102 108 110 108 Z" fill="#f7f9ff" />
          <path d="M110 110 L115 116 L110 121 L105 116 Z" fill="#0b0d17" opacity="0.9" />
          <path d="M110 121 L110 126" stroke="rgba(11,13,23,0.55)" strokeWidth="1.4" strokeLinecap="round" />
        </motion.g>

        {/* 状态色装饰环：把状态色统一到设计系统 */}
        <circle
          cx="110" cy="110" r="104"
          fill="none"
          stroke={`url(#${gRing})`}
          strokeWidth="1"
          strokeDasharray="4 8"
          opacity="0.5"
        />
      </motion.svg>
    </div>
  );
}

export default Kanshan;
