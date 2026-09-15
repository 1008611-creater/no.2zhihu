import Breadcrumb from '@/components/ui/Breadcrumb';

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <div className="explore-layout"><Breadcrumb />{children}</div>;
}
