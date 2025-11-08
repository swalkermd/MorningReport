import { useQuery } from "@tanstack/react-query";
import { Report } from "@shared/schema";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ReportDisplay } from "@/components/ReportDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import sunriseImage from "@assets/5AF2695B-E8B8-4B82-8643-ABA26156A923_1762616797567.png";

export default function Home() {
  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/reports/latest"],
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchInterval: (data) => (data ? false : 60000),
  });

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-background">
      {/* Image with sophisticated art deco border */}
      <div className="w-full flex-shrink-0 flex items-center justify-center relative" 
           style={{
             background: 'linear-gradient(180deg, #1a0e0a 0%, #2d1810 40%, #3d2318 70%, hsl(var(--background)) 100%)'
           }}>
        {/* Ornate top border pattern */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
        <div className="absolute top-1 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
        
        {/* Main content wrapper with intricate borders */}
        <div className="relative py-8 md:py-12 px-6 md:px-10 w-full max-w-7xl">
          {/* Decorative corner ornaments - Art Deco style */}
          <svg className="absolute top-4 left-4 w-16 h-16 md:w-20 md:h-20 text-primary opacity-60" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <path d="M5 5 L5 30 M5 5 L30 5" strokeWidth="2" strokeLinecap="round"/>
            <path d="M5 15 L15 5" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="5" cy="5" r="3" fill="currentColor"/>
            <path d="M10 5 L25 5 M5 10 L5 25" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
            <line x1="15" y1="10" x2="10" y2="15" strokeWidth="1" opacity="0.5"/>
            <circle cx="20" cy="20" r="1.5" fill="currentColor" opacity="0.7"/>
            <path d="M8 8 Q15 8 15 15" strokeWidth="0.8" fill="none" opacity="0.5"/>
          </svg>
          
          <svg className="absolute top-4 right-4 w-16 h-16 md:w-20 md:h-20 text-primary opacity-60" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <path d="M95 5 L95 30 M95 5 L70 5" strokeWidth="2" strokeLinecap="round"/>
            <path d="M95 15 L85 5" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="95" cy="5" r="3" fill="currentColor"/>
            <path d="M90 5 L75 5 M95 10 L95 25" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
            <line x1="85" y1="10" x2="90" y2="15" strokeWidth="1" opacity="0.5"/>
            <circle cx="80" cy="20" r="1.5" fill="currentColor" opacity="0.7"/>
            <path d="M92 8 Q85 8 85 15" strokeWidth="0.8" fill="none" opacity="0.5"/>
          </svg>
          
          <svg className="absolute bottom-4 left-4 w-16 h-16 md:w-20 md:h-20 text-primary opacity-60" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <path d="M5 95 L5 70 M5 95 L30 95" strokeWidth="2" strokeLinecap="round"/>
            <path d="M5 85 L15 95" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="5" cy="95" r="3" fill="currentColor"/>
            <path d="M10 95 L25 95 M5 90 L5 75" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
            <line x1="15" y1="90" x2="10" y2="85" strokeWidth="1" opacity="0.5"/>
            <circle cx="20" cy="80" r="1.5" fill="currentColor" opacity="0.7"/>
            <path d="M8 92 Q15 92 15 85" strokeWidth="0.8" fill="none" opacity="0.5"/>
          </svg>
          
          <svg className="absolute bottom-4 right-4 w-16 h-16 md:w-20 md:h-20 text-primary opacity-60" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <path d="M95 95 L95 70 M95 95 L70 95" strokeWidth="2" strokeLinecap="round"/>
            <path d="M95 85 L85 95" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="95" cy="95" r="3" fill="currentColor"/>
            <path d="M90 95 L75 95 M95 90 L95 75" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
            <line x1="85" y1="90" x2="90" y2="85" strokeWidth="1" opacity="0.5"/>
            <circle cx="80" cy="80" r="1.5" fill="currentColor" opacity="0.7"/>
            <path d="M92 92 Q85 92 85 85" strokeWidth="0.8" fill="none" opacity="0.5"/>
          </svg>

          {/* Side ornamental patterns */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-12 md:w-16 h-32 md:h-48">
            <svg viewBox="0 0 60 200" fill="none" className="w-full h-full text-primary opacity-40">
              <path d="M40 20 Q50 40 40 60 Q30 80 40 100 Q50 120 40 140 Q30 160 40 180" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M35 40 Q45 55 35 70 Q25 85 35 100 Q45 115 35 130 Q25 145 35 160" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6"/>
              <circle cx="40" cy="30" r="2" fill="currentColor"/>
              <circle cx="40" cy="100" r="2" fill="currentColor"/>
              <circle cx="40" cy="170" r="2" fill="currentColor"/>
            </svg>
          </div>
          
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 md:w-16 h-32 md:h-48">
            <svg viewBox="0 0 60 200" fill="none" className="w-full h-full text-primary opacity-40">
              <path d="M20 20 Q10 40 20 60 Q30 80 20 100 Q10 120 20 140 Q30 160 20 180" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M25 40 Q15 55 25 70 Q35 85 25 100 Q15 115 25 130 Q35 145 25 160" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6"/>
              <circle cx="20" cy="30" r="2" fill="currentColor"/>
              <circle cx="20" cy="100" r="2" fill="currentColor"/>
              <circle cx="20" cy="170" r="2" fill="currentColor"/>
            </svg>
          </div>

          {/* Image with elegant multi-layer border */}
          <div className="relative mx-auto max-w-4xl">
            {/* Outer glow */}
            <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 via-transparent to-primary/10 blur-2xl"></div>
            
            {/* Multiple border layers */}
            <div className="relative bg-gradient-to-br from-amber-950/40 via-orange-950/30 to-amber-900/40 p-1 rounded-sm">
              <div className="bg-gradient-to-br from-primary/30 to-primary/10 p-[2px] rounded-sm">
                <div className="bg-gradient-to-br from-amber-900/20 to-orange-950/30 p-2 md:p-3 rounded-sm">
                  <img
                    src={sunriseImage}
                    alt="Morning Report"
                    className="max-w-full max-h-[36vh] md:max-h-[40vh] object-contain w-full"
                    data-testid="img-morning-report"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Ornate bottom border pattern */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
        <div className="absolute bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-4 py-6 md:px-8 md:py-8">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState />
        ) : report ? (
          <>
            <AudioPlayer
              audioPath={report.audioPath}
              reportDate={report.date}
              data-testid="audio-player"
            />
            <ReportDisplay
              content={report.content}
              className="mt-4 flex-1 min-h-0"
              data-testid="report-display"
            />
          </>
        ) : (
          <NoReportState />
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="w-full flex-1 flex flex-col space-y-4">
      <Skeleton className="h-12 w-full" data-testid="skeleton-button" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <Alert variant="destructive" className="max-w-md" data-testid="alert-error">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        Unable to load today's report. Please try again later.
      </AlertDescription>
    </Alert>
  );
}

function NoReportState() {
  return (
    <div className="text-center max-w-md" data-testid="text-no-report">
      <p className="text-muted-foreground">
        No report available yet. Check back at 6:00 AM PST for today's briefing.
      </p>
    </div>
  );
}
