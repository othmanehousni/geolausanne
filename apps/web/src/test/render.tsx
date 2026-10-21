import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { UiLabelsProvider } from "@/components/ui/labels";
import { Toaster } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth/auth-context";

/** Render with the app's client providers (English messages, fresh query cache). */
export function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Zurich">
      <QueryClientProvider client={client}>
        <AuthProvider>
          <UiLabelsProvider close="Close">
            <Toaster>{ui}</Toaster>
          </UiLabelsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
