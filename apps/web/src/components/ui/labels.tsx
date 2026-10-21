"use client"

import * as React from "react"

/**
 * Translated strings used inside the generic UI primitives (close buttons),
 * provided once by the app so the primitives stay locale-agnostic.
 */
interface UiLabels {
  close: string
}

const UiLabelsContext = React.createContext<UiLabels>({ close: "Close" })

function UiLabelsProvider({ children, ...labels }: UiLabels & { children: React.ReactNode }) {
  const value = React.useMemo(() => labels, [labels.close]) // eslint-disable-line react-hooks/exhaustive-deps
  return <UiLabelsContext.Provider value={value}>{children}</UiLabelsContext.Provider>
}

function useUiLabels() {
  return React.useContext(UiLabelsContext)
}

export { UiLabelsProvider, useUiLabels }
