import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface ReportDisplayProps {
  content: string;
  className?: string;
  "data-testid"?: string;
}

export function ReportDisplay({ content, className = "", "data-testid": testId }: ReportDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  return (
    <Card className={`flex-1 min-h-0 flex flex-col border-card-border relative ${className}`} data-testid={testId}>
      <div className="absolute top-3 right-3 z-10">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className="gap-2"
          data-testid="button-copy-report"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </Button>
      </div>
      <CardContent className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div 
          className="prose prose-sm max-w-none text-foreground leading-7 pr-20"
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
