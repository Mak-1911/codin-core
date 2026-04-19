import {
  Box,
  Input,
  InputRenderable,
  InputRenderableEvents,
  Select,
  SelectRenderable,
  SelectRenderableEvents,
  Text,
  type VNode,
} from "@opentui/core"

import { appState, renderer, triggerRebuild } from "./state"
import { focusChatInput } from "./chat-screen"
import { focusPromptInput } from "./prompt-screen"

let paletteInput: InputRenderable | null = null
let paletteSelect: SelectRenderable | null = null
let paletteOptions: CommandPaletteSelectOption[] = []

type CommandPaletteSelectOption = {
  name: string
  description: string
  _commandId: string
}

function getFilteredCommandOptions(query: string): CommandPaletteSelectOption[] {
  const normalizedQuery = query.trim().toLowerCase()
  const commands = !normalizedQuery
    ? appState.commands
    : appState.commands.filter((command) =>
        command.label.toLowerCase().includes(normalizedQuery) ||
        command.description.toLowerCase().includes(normalizedQuery) ||
        command.category?.toLowerCase().includes(normalizedQuery) ||
        command.shortcut?.toLowerCase().includes(normalizedQuery)
      )

  return commands.map((command) => ({
    name: command.label,
    description: [command.category, command.description, command.shortcut].filter(Boolean).join(" | ") || " ",
    _commandId: command.id,
  }))
}

function runCommand(commandId: string) {
  const command = appState.commands.find((entry) => entry.id === commandId)
  closeCommandPalette(false)
  command?.action()
}

export function getCommandPaletteElements() {
  return { input: paletteInput, select: paletteSelect }
}

export function openCommandPalette() {
  appState.commandPaletteOpen = true
  appState.commandPaletteQuery = ""
  appState.commandPaletteSelectedIndex = 0
  appState.sidebarOpen = false
  appState.overlayOpen = false
  triggerRebuild()
}

export function closeCommandPalette(restoreFocus = true) {
  appState.commandPaletteOpen = false
  appState.commandPaletteQuery = ""
  appState.commandPaletteSelectedIndex = 0
  paletteInput = null
  paletteSelect = null
  paletteOptions = []
  triggerRebuild()

  if (restoreFocus) {
    setTimeout(() => {
      if (appState.screen === "prompt") {
        focusPromptInput()
      } else {
        focusChatInput()
      }
    }, 50)
  }
}

export function createCommandPalette(): VNode {
  const theme = appState.currentTheme
  const query = appState.commandPaletteQuery
  const selectedIndex = appState.commandPaletteSelectedIndex
  const selectOptions = getFilteredCommandOptions(query)
  paletteOptions = selectOptions

  setTimeout(() => {
    const root = renderer?.root
    if (!root) return

    const input = root.findDescendantById("command-palette-input") as InputRenderable | null
    const select = root.findDescendantById("command-palette-select") as SelectRenderable | null

    if (input) {
      paletteInput = input
      input.value = query
      input.focus()

      input.on(InputRenderableEvents.CHANGE, (value: string) => {
        appState.commandPaletteQuery = value
        const nextOptions = getFilteredCommandOptions(value)
        paletteOptions = nextOptions

        if (select) {
          select.options = nextOptions
          select.selectedIndex = 0
          appState.commandPaletteSelectedIndex = 0
        }
      })

      input.on(InputRenderableEvents.ENTER, () => {
        const currentOptions = getFilteredCommandOptions(input.value || "")
        const selected = currentOptions[appState.commandPaletteSelectedIndex]
        if (selected) {
          runCommand(selected._commandId)
        }
      })
    }

    if (select) {
      paletteSelect = select
      select.selectedIndex = Math.min(selectedIndex, Math.max(0, selectOptions.length - 1))

      select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
        appState.commandPaletteSelectedIndex = index
      })

      select.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: CommandPaletteSelectOption) => {
        if (option?._commandId) {
          runCommand(option._commandId)
        }
      })
    }
  }, 50)

  return Box(
    {
      id: "command-palette-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 2,
      backgroundColor: "#0000008A",
    },
    Box(
      {
        width: 76,
        padding: 1,
        gap: 1,
        backgroundColor: '#000000',
        flexDirection: "column",
        border: true,
        borderStyle: 'rounded',
        borderColor: theme.border
      },
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        Text({ content: "Command Palette", fg: theme.primary }),
        Text({ content: "esc to close", fg: theme.textDim })
      ),
      Box({
        id:'command-palette-input-box',
        border: true,
        borderColor: theme.border,
        borderStyle: 'rounded',
        paddingLeft:1,
      },
        Input({
          id: "command-palette-input",
          width: "100%",
          placeholder: "Filter commands...",
          backgroundColor: theme.backgroundDark,
          textColor: theme.text,
        })
      ),
      Select({
        id: "command-palette-select",
        options: selectOptions,
        width: "100%",
        height: 12,
        selectedIndex: Math.min(selectedIndex, Math.max(0, selectOptions.length - 1)),
        backgroundColor: '#000000',
        focusedBackgroundColor: '#000000',
        selectedBackgroundColor: theme.primary,
        selectedTextColor: theme.text,
        showScrollIndicator: true,
        showDescription: false,
      }),
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
        },
        Text({ content: "up/down navigate, enter confirm", fg: theme.textDim }),
        Text({ content: `${paletteOptions.length} commands`, fg: theme.textDim })
      )
    )
  )
}
