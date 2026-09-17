"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { SquareLayout } from "@/lib/domain/square-layout";
import { bubblesAt, type SpeechSet } from "@/lib/domain/speech";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * 对话气泡层。
 *
 * ## 这个组件现在只做三件事
 *
 *   ① 起一个 0.5 秒的时钟
 *   ② 量一下容器尺寸
 *   ③ 把 `bubblesAt()` 算出来的数组渲染成 DOM
 *
 * **定位与筛选的数学全在 `speech.ts` 的 `bubblesAt()` 里**（纯函数）。
 * 为什么这样分：那段数学最容易错（屏幕坐标换算错一次，气泡就全跑出画面），
 * 放在组件里就只有跑起浏览器才验得了；抽出去之后自检能扫几百个时刻直接断言。
 *
 * ## 为什么气泡必须固定在**屏幕坐标**
 *
 * 放进 world 会跟着画布缩放 —— 视野拉到 0.92 时文字已经偏小，用户再缩一点
 * 就完全读不了。而气泡**唯一的作用就是让人读**，读不了等于不存在。
 *
 * ## 为什么独立成层
 *
 * 时钟每 0.5 秒走一次。如果时钟驱动的 state 挂在画布上，22 个簇会跟着
 * 每 0.5 秒重渲染一遍 —— 而它们其实一动都不用动（呼吸、动作全是 CSS 关键帧）。
 * 独立成层之后，每次只有 2–3 个气泡真正重渲染。
 *
 * ⚠️ **气泡里的每一个字都是答主原话**（`speech.ts` 从真实回答里摘出来的子串）。
 * 广场上一个字都不是我们写的 —— 这是本项目的诚实性铁律。
 */

export interface SpeechLayerProps {
  layout: SquareLayout;
  /** 每个话题的对话安排（从真实回答里摘出来的原话） */
  speeches: Map<string, SpeechSet>;
  view: { x: number; y: number; scale: number };
  /** 当前聚焦的簇（聚焦时只让那一簇说，读起来像「你把耳朵贴过去了」） */
  focusedId: string | null;
}

function SpeechLayerImpl({ layout, speeches, view, focusedId }: SpeechLayerProps) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  /**
   * 时钟：0.5 秒一跳。
   *
   * 为什么是 0.5 而不是 1：气泡最短展示 3.2 秒，0.5 秒的取样间隔最多让
   * 「出现/消失」晚半秒 —— 肉眼看不出来。而 1 秒会让短句看起来像卡住。
   *
   * ⚠️ 初值 0 而不是 `Date.now()` —— **首帧必须确定**，否则服务端渲染的
   * 时间与客户端不同 → 水合失败（本站踩过这个坑，见 `useReducedMotion` 的文件头）。
   */
  useEffect(() => {
    const id = window.setInterval(() => setT((v) => v + 0.5), 500);
    return () => window.clearInterval(id);
  }, []);

  /** 自测容器尺寸 —— 不依赖父组件传，少一处可能不同步的接口。 */
  useEffect(() => {
    const el = hostRef.current?.parentElement;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bubbles = bubblesAt({
    nodes: layout.nodes,
    speeches,
    view,
    stageW: size.w,
    stageH: size.h,
    t,
    focusedId,
  });

  return (
    <div
      className="sq-speech-layer"
      ref={hostRef}
      data-reduced={reduced ? "1" : "0"}
      // 无障碍：气泡是「现场的声音」，不是需要播报的提醒。
      // 用 off 而不是 polite —— 每几秒念一句会把屏幕阅读器淹掉。
      aria-live="off"
    >
      {bubbles.map((b) => (
        <div key={b.clusterId} className="sq-bubble" style={{ left: b.x, top: b.y }}>
          <span className="sq-bubble-text">{b.text}</span>
          <span className="sq-bubble-who">{b.speaker}</span>
          <span className="sq-bubble-tail" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

export default memo(SpeechLayerImpl);
