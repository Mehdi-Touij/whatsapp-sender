import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<{ onValueChange?: (v: number) => void }, React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorColor?: string }>(({ className, value, indicatorColor, ...props }, ref) => (
  <ProgressPrimitive.Root ref={ref as any} className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)} {...props}>
    <ProgressPrimitive.Indicator className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorColor)} style={{ transform: `translateX(-${100 - (value || 0)}%)` }} />
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

export { Progress };