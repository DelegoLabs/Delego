import useSWR from 'swr';

export interface TrackingCheckpoint {
  title: string;
  location: string;
  timestamp: Date;
  status: "completed" | "current" | "upcoming";
  notes?: string;
}

export interface InteractiveTrackingTimelineProps {
  checkpoints?: TrackingCheckpoint[];
  trackingId?: string;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function InteractiveTrackingTimeline({ 
  checkpoints: initialCheckpoints,
  trackingId 
}: InteractiveTrackingTimelineProps) {
  const { data: polledCheckpoints } = useSWR<TrackingCheckpoint[]>(
    trackingId ? `/api/tracking/${trackingId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const checkpoints = polledCheckpoints || initialCheckpoints || [];

  const completedCount = checkpoints.filter(c => c.status === "completed").length;
  const totalCount = checkpoints.length;
  const progressPercentage = totalCount === 0 ? 0 : Math.round((completedCount / (totalCount - 1)) * 100);

  return (
    <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
          <span>Transit Progress</span>
          <span>{Math.min(progressPercentage, 100)}%</span>
        </div>
        <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
          <div 
            style={{ 
              height: '100%', 
              background: '#2563eb', 
              width: `${Math.min(progressPercentage, 100)}%`,
              transition: 'width 0.5s ease-in-out'
            }} 
          />
        </div>
      </div>
      
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {checkpoints.map((checkpoint, idx) => {
          const isCompleted = checkpoint.status === "completed";
          const isCurrent = checkpoint.status === "current";
          const color = isCompleted ? "#059669" : isCurrent ? "#2563eb" : "#9ca3af";
          const bg = isCompleted ? "#059669" : isCurrent ? "#2563eb" : "transparent";
          const border = isCompleted || isCurrent ? "none" : "2px solid #9ca3af";
          
          return (
            <li key={idx} style={{ display: 'grid', gridTemplateColumns: '2rem 1fr', gap: '1rem', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ 
                  width: '1.25rem', height: '1.25rem', borderRadius: '50%', background: bg, border, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1, marginTop: '0.25rem' 
                }}>
                  {(isCompleted || isCurrent) && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  )}
                </div>
                {idx < checkpoints.length - 1 && (
                  <div style={{ width: '2px', background: isCompleted ? '#059669' : '#e5e7eb', position: 'absolute', top: '1.5rem', bottom: '-1.5rem', left: '0.625rem', zIndex: 0 }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', opacity: checkpoint.status === 'upcoming' ? 0.6 : 1 }}>
                <div style={{ fontWeight: 600, color: color, fontSize: '0.9rem' }}>{checkpoint.title}</div>
                <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>{checkpoint.location}</div>
                <time style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {new Date(checkpoint.timestamp).toLocaleString()}
                </time>
                {checkpoint.notes && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', background: '#f3f4f6', padding: '0.5rem', borderRadius: '0.375rem' }}>
                    {checkpoint.notes}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
