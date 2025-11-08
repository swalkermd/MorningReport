import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReportDisplayProps {
  content: string;
  className?: string;
  "data-testid"?: string;
}

export function ReportDisplay({ content, className = "", "data-testid": testId }: ReportDisplayProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "The report has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`flex flex-col w-full ${className}`} data-testid={testId}>
      <Card className="flex-1 min-h-0 flex flex-col border-card-border">
        <CardContent className="p-6 flex-1 overflow-y-auto">
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
      
      <div className="flex justify-center mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="gap-2"
          data-testid="button-copy"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy Report
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
