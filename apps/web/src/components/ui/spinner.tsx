import { cn } from "cn"
import { SpinnerIcon } from "@phosphor-icons/react"

/**
 * Decorative by default: pair it with visible text. Pass `label` when the
 * spinner is the only indication of progress.
 */
function Spinner({ className, label, ...props }: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <SpinnerIcon
      data-slot="spinner"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("size-4 animate-[spin_0.75s_linear_infinite]", className)}
      {...props}
    />
  )
}

export { Spinner }
