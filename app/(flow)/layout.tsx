import JourneyNav from '@/components/ui/JourneyNav';

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <div className="flow-layout"><JourneyNav />{children}</div>;
}
