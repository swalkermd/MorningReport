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
      {/* Image with decorative framing */}
      <div className="w-full flex-shrink-0 flex items-center justify-center bg-gradient-to-b from-primary/5 via-accent/10 to-background p-6 md:p-10 border-b-4 border-primary/20">
        <div className="relative">
          {/* Decorative corner accents */}
          <div className="absolute -top-3 -left-3 w-6 h-6 border-l-4 border-t-4 border-primary/40 rounded-tl-lg"></div>
          <div className="absolute -top-3 -right-3 w-6 h-6 border-r-4 border-t-4 border-primary/40 rounded-tr-lg"></div>
          <div className="absolute -bottom-3 -left-3 w-6 h-6 border-l-4 border-b-4 border-primary/40 rounded-bl-lg"></div>
          <div className="absolute -bottom-3 -right-3 w-6 h-6 border-r-4 border-b-4 border-primary/40 rounded-br-lg"></div>
          
          {/* Image container with shadow */}
          <div className="bg-card/50 backdrop-blur-sm p-3 md:p-4 rounded-lg shadow-lg border border-primary/10">
            <img
              src={sunriseImage}
              alt="Morning Report"
              className="max-w-full max-h-[36vh] md:max-h-[40vh] object-contain rounded"
              data-testid="img-morning-report"
            />
          </div>
        </div>
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
