"use client";

import FeedStream from "@/components/square/FeedStream";

/**
 * 虚拟广场。
 *
 * 这里不做任何介绍 —— 进来就是流。
 * 上方的标题、说明与统计数字全部去掉：广场的价值是「此刻正在讨论什么」，
 * 而不是解释「广场是什么」。
 */
export default function SquarePage() {
  return (
    <section style={{ paddingTop: 36 }}>
      <FeedStream hotLimit={30} />
    </section>
  );
}
