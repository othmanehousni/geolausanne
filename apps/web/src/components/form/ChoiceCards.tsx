"use client";

import { Field } from "@base-ui/react/field";
import { Fieldset } from "@base-ui/react/fieldset";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cn } from "cn";

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

/**
 * A labelled radio group drawn as selectable cards (Base UI RadioGroup inside
 * Field + Fieldset, so the legend names the group and arrow keys move between
 * options). Selection is shown by a filled dot and a stronger border, never
 * by colour alone.
 */
export function ChoiceCards<T extends string>({
  name,
  legend,
  value,
  onValueChange,
  choices,
  columns = 1,
  className,
}: {
  name: string;
  legend: string;
  value: T | null;
  onValueChange(v: T): void;
  choices: Choice<T>[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  return (
    <Field.Root name={name} className={cn("flex min-w-0 flex-col", className)}>
      <Fieldset.Root
        render={<RadioGroup value={value} onValueChange={(v) => onValueChange(v as T)} />}
        className="flex min-w-0 flex-col gap-2"
      >
        <Fieldset.Legend className="mb-0.5 text-sm font-medium text-foreground">{legend}</Fieldset.Legend>
        <div
          className={cn(
            "grid gap-2",
            columns === 2 && "grid-cols-2",
            columns === 3 && "grid-cols-2 sm:grid-cols-3",
            columns === 4 && "grid-cols-2 sm:grid-cols-4",
          )}
        >
          {choices.map((c) => (
            <label
              key={c.value}
              className={cn(
                "group relative flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-input bg-background/60 px-3 py-2 text-left select-none dark:bg-input/20",
                "transition-[border-color,background-color,box-shadow,scale] duration-150 ease-out hover:border-foreground/30 active:scale-[0.98] motion-reduce:active:scale-100",
                "has-data-checked:border-foreground has-data-checked:bg-foreground/[0.045] has-focus-visible:ring-3 has-focus-visible:ring-ring/45",
              )}
            >
              <Radio.Root
                value={c.value}
                className="grid size-4 shrink-0 place-items-center rounded-full border border-foreground/40 outline-none data-checked:border-foreground"
              >
                <Radio.Indicator className="size-2 rounded-full bg-foreground" />
              </Radio.Root>
              {c.icon ? <span className="shrink-0 text-muted-foreground [&_svg]:size-[18px]">{c.icon}</span> : null}
              <span className="flex min-w-0 flex-col">
                <span className="text-sm leading-tight font-medium">{c.label}</span>
                {c.description ? <span className="text-xs leading-snug text-muted-foreground">{c.description}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </Fieldset.Root>
    </Field.Root>
  );
}
