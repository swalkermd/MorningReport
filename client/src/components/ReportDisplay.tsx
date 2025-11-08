import { Card, CardContent } from "@/components/ui/card";

interface ReportDisplayProps {
  content: string;
  className?: string;
  "data-testid"?: string;
}

export function ReportDisplay({ content, className = "", "data-testid": testId }: ReportDisplayProps) {
  return (
    <Card className={`flex-1 min-h-0 flex flex-col border-card-border ${className}`} data-testid={testId}>
      <CardContent className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div 
          className="prose prose-sm max-w-none text-foreground leading-7"
          data-testid="text-report-content"
        >
          {content.split('\n\n').map((paragraph, index) => (
            <p key={index} className="mb-4 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
