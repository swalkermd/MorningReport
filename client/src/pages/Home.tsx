import { useQuery } from "@tanstack/react-query";
import { Report } from "@shared/schema";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ReportDisplay } from "@/components/ReportDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";
import sunriseImage from "@assets/5AF2695B-E8B8-4B82-8643-ABA26156A923_1762616797567.png";

export default function Home() {
  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: ["/api/reports/latest"],
  });

  return (
    <div className="h-screen w-full overflow-hidden">
      {/* Desktop Landscape Layout */}
      <div className="hidden md:flex h-full">
        {/* Left Panel - Sunrise Image */}
        <div className="w-[45%] h-full relative overflow-hidden">
          <img
            src={sunriseImage}
            alt="Morning sunrise cityscape"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Right Panel - Controls & Report */}
        <div className="flex-1 flex flex-col bg-background px-12 py-8">
          <Header report={report} />
          
          <div className="flex-1 flex flex-col justify-center items-center min-h-0">
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
                  className="mt-8 flex-1 min-h-0"
                  data-testid="report-display"
                />
              </>
            ) : (
              <NoReportState />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Portrait Layout */}
      <div className="flex md:hidden flex-col h-full">
        {/* Top - Sunrise Image (35% height) */}
        <div className="h-[35%] relative overflow-hidden">
          <img
            src={sunriseImage}
            alt="Morning sunrise cityscape"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col bg-background px-6 py-6 min-h-0">
          <Header report={report} isMobile />
          
          {isLoading ? (
            <LoadingStateMobile />
          ) : error ? (
            <ErrorState />
          ) : report ? (
            <>
              <div className="flex-shrink-0 mb-6">
                <AudioPlayer
                  audioPath={report.audioPath}
                  reportDate={report.date}
                  data-testid="audio-player-mobile"
                />
              </div>
              <ReportDisplay
                content={report.content}
                className="flex-1 min-h-0"
                data-testid="report-display-mobile"
              />
            </>
          ) : (
            <NoReportState />
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ report, isMobile = false }: { report?: Report; isMobile?: boolean }) {
  return (
    <div className={`flex-shrink-0 ${isMobile ? 'mb-4' : 'mb-8'}`}>
      <h1 
        className={`font-serif font-semibold text-foreground ${isMobile ? 'text-3xl' : 'text-4xl'}`}
        data-testid="text-title"
      >
        Morning Report
      </h1>
      {report && (
        <div className="flex items-center gap-2 mt-2 text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <p className="text-sm font-medium" data-testid="text-date">
            {format(new Date(report.date), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-24 w-24 rounded-full mx-auto" data-testid="skeleton-player" />
        <Skeleton className="h-8 w-48 mx-auto" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function LoadingStateMobile() {
  return (
    <div className="space-y-6 flex-1">
      <div className="space-y-4">
        <Skeleton className="h-20 w-20 rounded-full mx-auto" data-testid="skeleton-player-mobile" />
        <Skeleton className="h-6 w-32 mx-auto" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
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
