"use client";

import { Field } from "@base-ui/react/field";
import { Fieldset } from "@base-ui/react/fieldset";
import { cn } from "cn";

/**
 * Thin styling layer over Base UI Field/Fieldset: labels, descriptions and
 * errors are wired to their control (aria-labelledby/-describedby,
 * aria-invalid) by Base UI itself.
 */
export function FormField({ className, ...props }: Field.Root.Props) {
  return <Field.Root className={cn("flex w-full flex-col gap-1.5", className)} {...props} />;
}

export function FormLabel({ className, ...props }: Field.Label.Props) {
  return <Field.Label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function FormDescription({ className, ...props }: Field.Description.Props) {
  return <Field.Description className={cn("text-[13px] leading-snug text-muted-foreground", className)} {...props} />;
}

export function FormError({ className, ...props }: Field.Error.Props) {
  return <Field.Error className={cn("text-[13px] leading-snug font-medium text-destructive", className)} {...props} />;
}

export const controlClass =
  "w-full min-w-0 rounded-xl border border-input bg-background/60 px-3 text-base text-foreground transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/15 dark:bg-input/30 md:text-sm";

export function FormInput({ className, ...props }: Field.Control.Props) {
  return <Field.Control className={cn(controlClass, "h-10", className)} {...props} />;
}

export function FormTextarea({
  className,
  rows = 3,
  ...props
}: Omit<Field.Control.Props, "render"> & { rows?: number }) {
  return (
    <Field.Control
      render={<textarea rows={rows} />}
      className={cn(controlClass, "field-sizing-content min-h-20 py-2.5 leading-normal", className)}
      {...props}
    />
  );
}

export function FormFieldset({ className, ...props }: Fieldset.Root.Props) {
  return <Fieldset.Root className={cn("flex w-full min-w-0 flex-col gap-2", className)} {...props} />;
}

export function FormLegend({ className, ...props }: Fieldset.Legend.Props) {
  return <Fieldset.Legend className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}
