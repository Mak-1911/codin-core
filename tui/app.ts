/**
 * Main Application
 * Built with @opentui/core constructs (no React)
 */

import {
  Box,
  Text,
  type CliRenderer,
  type VNode,
  type BoxRenderable,
  type RootRenderable,
} from "@opentui/core"
import { cwd } from "node:process"

import { appState, triggerRebuild, setRenderer, setStateChangeCallback, setTheme, renderer as rendererRef } from "./state"
import { mascot, heading } from "./assets/content"
import { initializeAgentOrchestrator } from "./agent-binding"
import { setupKeyboard } from "./keyboard"
import { createPromptScreen, blurPromptInput } from "./prompt-screen"
import { createChatScreen } from "./chat-screen"
import { createModeSelectionOverlay, createModelSelectionOverlay } from "./overlays"
import { createCommandPalette } from "./command-palette"
import { themes } from "./themes"

// Store reference to content root
let contentRoot: RootRenderable | null = null

/**
 * Create the main application
 */
export function createApp(renderer: CliRenderer): VNode {
  setRenderer(renderer)
  setupKeyboard(renderer)
  setupCommands()

  const theme = appState.currentTheme

  const appRoot = Box(
    {
      id: "app-root",
      width: "100%",
      height: "100%",
      position: "relative",
      backgroundColor:"transparent",
    },
    // Background (prompt screen only)
    createPromptBackground(),
    // Main content area
    Box(
      {
        id: "main-content",
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
        gap: 1,
      },
      // Dynamic screen content
      Box({ id: "screen-container", width: "100%", flexGrow: 1 }),
      // Footer
      Box({ id: "footer-container", width: "100%", height: 1 })
    ),
    // Overlay layer
    Box({ id: "overlay-container", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }),
    // Toast layer
    Box({ id: "toast-container", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })
  )

  contentRoot = renderer.root
  setStateChangeCallback(rebuildUI)

  return appRoot
}

/**
 * Rebuild UI based on current state
 */
export function rebuildUI() {
  if (!contentRoot) return

  const theme = appState.currentTheme

  // Update renderer's background color (this controls the actual terminal background)
  if (rendererRef?.setBackgroundColor) {
    rendererRef.setBackgroundColor(theme.background)
  }

  // Update contentRoot background color directly (contentRoot IS the app-root)
  const root = contentRoot as any
  root.backgroundColor = theme.background
  if (root.props) {
    root.props.backgroundColor = theme.background
  }

  // Update prompt-background backgroundColor directly on existing renderable
  const bg = contentRoot.findDescendantById("prompt-background") as BoxRenderable | null
  if (bg) {
    // Update background color on the renderable element
    ;(bg as any).backgroundColor = theme.background
    // Request a re-render of this element
    ;(bg as any).requestRender()
    // Update visibility
    bg.visible = appState.screen === "prompt"

    // Update heading and mascot text colors
    const headingText = bg.findDescendantById("heading-text")
    if (headingText) {
      ;(headingText as any).fg = theme.textMuted
      ;(headingText as any).requestRender()
    }

    const mascotText = bg.findDescendantById("mascot-text")
    if (mascotText) {
      ;(mascotText as any).fg = theme.textDim
      ;(mascotText as any).requestRender()
    }
  }

  // Also update the contentRoot (app-root) background
  ;(contentRoot as any).backgroundColor = theme.background
  if ((contentRoot as any).requestRender) {
    ;(contentRoot as any).requestRender()
  }

  // Screen container
  const screenContainer = contentRoot.findDescendantById("screen-container") as BoxRenderable | null
  if (screenContainer) {
    clearContainer(screenContainer)

    if (appState.screen === "prompt") {
      screenContainer.add(createPromptScreen(contentRoot))
    } else {
      screenContainer.add(createChatScreen(contentRoot))
    }
  }

  // Overlay container
  const overlayContainer = contentRoot.findDescendantById("overlay-container") as BoxRenderable | null
  if (overlayContainer) {
    clearContainer(overlayContainer)

    // Blur prompt input when any overlay opens
    if (appState.overlayOpen || appState.sidebarOpen || appState.commandPaletteOpen) {
      blurPromptInput()
    }

    if (appState.overlayOpen && appState.screen === "prompt") {
      if (appState.activeTabIndex === 0) {
        overlayContainer.add(createModeSelectionOverlay(contentRoot))
      } else {
        overlayContainer.add(createModelSelectionOverlay(contentRoot))
      }
    }

    if (appState.sidebarOpen && appState.screen === "chat") {
      overlayContainer.add(createSidebar())
    }

    if (appState.commandPaletteOpen) {
      overlayContainer.add(createCommandPalette())
    }
  }

  // Toast container
  const toastContainer = contentRoot.findDescendantById("toast-container") as BoxRenderable | null
  if (toastContainer) {
    clearContainer(toastContainer)

    if (appState.initError) {
      toastContainer.add(createToast(appState.initError, "error"))
    }

    if (appState.toastMessage) {
      toastContainer.add(createToast(appState.toastMessage, appState.toastType))
    }
  }

  // Footer
  const footerContainer = contentRoot.findDescendantById("footer-container") as BoxRenderable | null
  if (footerContainer) {
    clearContainer(footerContainer)
    footerContainer.add(createFooter())
  }
}

function clearContainer(container: BoxRenderable) {
  const children = container.getChildren()
  for (const child of children) {
    container.remove(child.id)
  }
}

/**
 * Create prompt background
 */
function createPromptBackground(): VNode {
  const theme = appState.currentTheme

  return Box(
    {
      id: "prompt-background",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: theme.background,
    },
    Box(
      {
        position: "absolute",
        top: 1,
        left: 0,
        width: "100%",
        height: 6,
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ id: "heading-text", content: heading, fg: theme.textMuted })
    ),
    Box(
      {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        padding: 1,
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ id: "mascot-text", content: mascot, fg: theme.textDim })
    )
  )
}

/**
 * Create footer
 */
function createFooter(): VNode {
  const theme = appState.currentTheme
  if (appState.screen === "prompt") {
    return Box(
      {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: theme.background,
      },
      Text({ content: `cwd: ${cwd()}`, fg: theme.textMuted }),
      appState.isInitializing
        ? Text({ content: appState.initStatus, fg: theme.warning })
        : appState.orchestrator
          ? Text({ content: "Ready", fg: theme.success })
          : Text({ content: "Init failed", fg: theme.error }),
      Text({ content: "Tab: switch", fg: theme.textDim })
    )
  }

  return Box(
    {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      backgroundColor: theme.background,
    },
    Text({ content: "ctrl+p palette", fg: theme.textDim }),
    Text({content:"•", fg: theme.textMuted}),
    Text({ content: "ctrl+b sidebar", fg: theme.textDim }),
    Text({content:"•", fg: theme.textMuted}),
    Text({ content: "ctrl+m models", fg: theme.textDim }),
    Text({content:"•", fg: theme.textMuted}),
    Text({ content: theme.name, fg: theme.textDim })
  )
}

/**
 * Create sidebar
 */
function createSidebar(): VNode {
  const theme = appState.currentTheme
  return Box(
    {
      position: "absolute",
      top: 1,
      right: 1,
      width: 30,
      height: "70%",
      border: true,
      borderStyle: "rounded",
      backgroundColor: theme.sidebarBg,
      padding: 1,
      flexDirection: "column",
      gap: 1,
    },
    Text({ content: "Sidebar", fg: theme.textMuted }),
    Text({ content: `cwd: ${cwd()}`, fg: theme.textDim })
  )
}

/**
 * Create toast
 */
function createToast(message: string, type: "error" | "warning" | "info" | "success"): VNode {
  const theme = appState.currentTheme
  const colors: Record<string, string> = {
    error: theme.error,
    warning: theme.warning,
    success: theme.success,
    info: theme.info,
  }

  return Box(
    {
      position: "absolute",
      bottom: 2,
      right: 2,
      backgroundColor: theme.backgroundDark,
    },
    Text({ content: message, fg: colors[type] })
  )
}

/**
 * Setup commands
 */
function setupCommands() {
  const themeCommands = Object.entries(themes).map(([id, theme]) => ({
    id: `theme-${id}`,
    label: theme.name,
    description: theme.description,
    category: "Themes",
    action: () => {
      setTheme(id)
      appState.toastMessage = `Theme changed to ${theme.name}`
      appState.toastType = "success"
      triggerRebuild()
    },
  }))

  appState.commands = [
    // Chat commands
    {
      id: "clear-chat",
      label: "Clear Chat",
      description: "Clear all messages",
      category: "Chat",
      action: () => {
        appState.screen = "prompt"
        appState.agentState.messages = []
        appState.toastMessage = "Chat cleared"
        appState.toastType = "info"
        triggerRebuild()
      },
    },
    // View commands
    {
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      description: "Show or hide the sidebar",
      shortcut: "Ctrl+B",
      category: "View",
      action: () => {
        appState.sidebarOpen = !appState.sidebarOpen
        triggerRebuild()
      },
    },
    // Theme commands
    ...themeCommands,
    {
      id: "new-conversation",
      label: "New Conversation",
      description: "Start a new conversation",
      category: "Chat",
      action: () => {
        appState.screen = "prompt"
        appState.agentState.messages = []
        appState.toastMessage = "New conversation started"
        appState.toastType = "info"
        triggerRebuild()
      },
    },
    {
      id: "switch-to-prompt",
      label: "Switch to Prompt Mode",
      description: "Go to prompt screen",
      category: "Navigation",
      action: () => {
        appState.screen = "prompt"
        triggerRebuild()
      },
    },
  ]
}

/**
 * Initialize agent
 */
export async function initializeAgent(): Promise<void> {
  try {
    await initializeAgentOrchestrator()
    appState.isInitializing = false
    appState.initStatus = "Ready"
    appState.initError = null
    triggerRebuild()
  } catch (err: unknown) {
    appState.isInitializing = false
    appState.initStatus = "Failed"
    appState.initError = `Init failed: ${(err as Error).message}`
    triggerRebuild()
  }
}

export { appState }
