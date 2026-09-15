export default function Loading() {
  return <section className="route-feedback" role="status" aria-label="正在加载页面">
    <p className="eyebrow">正在准备内容</p>
    <div className="skeleton route-skeleton" />
    <div className="grid grid-3">{[0, 1, 2].map(i => <div key={i} className="skeleton route-skeleton" />)}</div>
  </section>;
}
