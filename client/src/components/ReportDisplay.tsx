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
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2 border-b border-card-border">
        <h3 className="font-semibold text-base">Report Text</h3>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCopy}
          data-testid="button-copy-report"
          title={copied ? "Copied!" : "Copy to clipboard"}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
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
