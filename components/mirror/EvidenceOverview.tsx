"use client";

import { useReducedMotion } from 'motion/react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { MirrorQuestion } from '@/lib/domain/types';
import CountUp from '@/components/ui/CountUp';
import ScrollReveal from '@/components/ui/ScrollReveal';

export default function EvidenceOverview({ mirror }: { mirror: MirrorQuestion }) {
  const reduced = useReducedMotion();
  const gaps = mirror.gaps.filter(g => !g.filledBy);
  const severity = Math.round(Math.max(0, ...gaps.map(g => g.severity)) * 100);
  const sources = Array.from(new Map(mirror.skills.flatMap(s => s.sources).map(s => [s.url, s])).values())
    .sort((a, b) => a.editTime - b.editTime);
  const radar = mirror.skills.map(s => ({ name: s.name, coverage: Math.round(s.confidence * 100) }));
  return <ScrollReveal className="section">
    <div className="section-head"><h2>证据与缺口</h2><span className="mono">来自本次回答的实际记录</span></div>
    <div className="grid grid-3">
      <article className="card"><h3>最高未填缺口严重度</h3><div className="chart-frame" aria-label={`最高未填缺口严重度 ${severity}%`}>
        <ResponsiveContainer width="100%" height="100%"><RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ value: severity }]} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} /><RadialBar dataKey="value" fill="var(--orange)" background isAnimationActive={!reduced} />
        </RadialBarChart></ResponsiveContainer></div><p className="stat-n"><CountUp value={severity} />%</p><p className="dim">{gaps.length} 个待补充缺口；该值不是事实准确率。</p></article>
      <article className="card"><h3>分身证据覆盖对比</h3>{radar.length >= 3 ? <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%"><RadarChart data={radar}><PolarGrid /><PolarAngleAxis dataKey="name" tick={{ fill: 'var(--text-300)', fontSize: 11 }} /><Radar dataKey="coverage" name="证据覆盖 %" stroke="var(--blue)" fill="var(--blue)" fillOpacity={.2} isAnimationActive={!reduced} /><Tooltip /></RadarChart></ResponsiveContainer>
      </div> : <p className="dim">至少三个分身时展示雷达对比。</p>}<ul className="chart-values">{radar.map((r, i) => <li key={mirror.skills[i].id}>{r.name}：{r.coverage}%</li>)}</ul></article>
      <article className="card"><h3>本次回答总览</h3><p className="stat-n"><CountUp value={mirror.answers.length} /></p><p>篇分身回答</p><p className="stat-n"><CountUp value={sources.length} /></p><p>条去重来源</p><p className="stat-n"><CountUp value={mirror.answers.filter(a => Boolean(a.humanAuthor)).length} /></p><p>篇真人补充</p></article>
    </div>
    <details className="card evidence-details"><summary>查看证据时间轴 · {sources.length} 条来源</summary>
      <p className="dim">按来源最近编辑时间排序；接口未提供发布时间，不能把编辑时间视为发布时间。</p>
      {sources.length ? <ol className="evidence-timeline">{sources.map(source => <li key={source.url}><time>{source.editTime > 0 ? new Date(source.editTime < 1e12 ? source.editTime * 1000 : source.editTime).toLocaleDateString('zh-CN') : '时间未提供'}</time><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{source.author}</span></li>)}</ol> : <p>当前没有可核对的来源。</p>}
    </details>
  </ScrollReveal>;
}
