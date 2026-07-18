import { forwardRef } from "react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/cn";

export const Command = forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    />
  );
});

export const CommandInput = forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(function CommandInput({ className, ...props }, ref) {
  return <CommandPrimitive.Input ref={ref} className={cn("cc-input", className)} {...props} />;
});

export const CommandList = forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(function CommandList({ className, ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn("max-h-60 overflow-x-hidden overflow-y-auto p-1", className)}
      {...props}
    />
  );
});

export const CommandEmpty = forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(function CommandEmpty({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className={cn("px-3 py-2 text-sm text-text-secondary", className)}
      {...props}
    />
  );
});

export const CommandItem = forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "cursor-default select-none rounded-sm px-3 py-2 text-sm text-text-primary outline-none",
        "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent",
        className,
      )}
      {...props}
    />
  );
});
