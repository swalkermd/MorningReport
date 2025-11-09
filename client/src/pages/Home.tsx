import { useQuery } from "@tanstack/react-query";
import { Report } from "@shared/schema";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ReportDisplay } from "@/components/ReportDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import sunriseImage from "@assets/903734B3-4188-4987-A861-01FF54E70BFA_1762655103033.jpeg";

export default function Home() {
  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/reports/latest"],
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchInterval: (data) => (data ? false : 60000),
  });

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-background">
      {/* Framed image with morning gradient background (burnt orange to sky blue) */}
      <div 
        className="w-full flex-shrink-0 flex items-center justify-center p-4 md:p-6"
        style={{ 
          background: 'linear-gradient(to top, #BE7348 0%, #87CEEB 100%)'
        }}
      >
        <img
          src={sunriseImage}
          alt="Morning Report"
          className="max-w-full max-h-[45vh] md:max-h-[50vh] object-contain rounded-lg"
          data-testid="img-morning-report"
        />
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
              audioPaths={report.audioPaths}
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
