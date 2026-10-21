import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChoiceCards } from "../ChoiceCards";

function Harness() {
  const [v, setV] = useState<"a" | "b" | "c">("a");
  return (
    <ChoiceCards<"a" | "b" | "c">
      name="kind"
      legend="What is halal?"
      value={v}
      onValueChange={setV}
      choices={[
        { value: "a", label: "Everything" },
        { value: "b", label: "Some dishes" },
        { value: "c", label: "Not sure" },
      ]}
    />
  );
}

describe("ChoiceCards", () => {
  it("names the group by its legend and every radio by its own card", async () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "What is halal?" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-hidden") !== "true");
    expect(radios.map((r) => r.textContent || r.getAttribute("aria-label") || "")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Some dishes" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Not sure" })).toBeInTheDocument();
  });

  it("selects with pointer and arrow keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Some dishes"));
    expect(screen.getByRole("radio", { name: "Some dishes" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Not sure" })).toHaveAttribute("aria-checked", "true");
  });
});
