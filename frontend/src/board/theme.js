import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'

import { alpha, createTheme } from '@mui/material/styles'

export const appearance = {
  mode: 'dark',
}

export const colors = {
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
  text: '#cdd6f4',
  subtext1: '#bac2de',
  subtext0: '#a6adc8',
  overlay2: '#9399b2',
  overlay1: '#7f849c',
  overlay0: '#6c7086',
  surface2: '#585b70',
  surface1: '#45475a',
  surface0: '#313244',
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
}

export const boardColors = {
  transparent: 'transparent',
  shellBg: colors.crust,
  emptyPageBg: alpha(colors.surface0, 0.10),
  topBarBg: colors.crust,
  topBarOverlay: alpha(colors.text, 0.015),
  railTrack: alpha(colors.surface1, 0.5),
  railFill: colors.blue,
  railGlow: alpha(colors.blue, 0.15),
  timetablePageBg: colors.crust,
  timetablePageBorder: alpha(colors.surface1, 0.7),
  timetableHeaderBg: alpha(colors.surface0, 0.5),
  timetableRowBg: alpha(colors.blue, 0.06),
  timetableRowBorder: alpha(colors.blue, 0.12),
  timetableEmptyRowBg: alpha(colors.surface0, 0.4),
  timetableEmptyRowBorder: alpha(colors.surface1, 0.6),
  lessonDefaultBg: alpha(colors.mantle, 0.98),
  lessonDefaultBorder: alpha(colors.surface1, 0.7),
  lessonEventBg: alpha(colors.green, 0.05),
  lessonEventBorder: alpha(colors.green, 0.12),
  lessonChangedBg: alpha(colors.peach, 0.05),
  lessonChangedBorder: alpha(colors.peach, 0.14),
  lessonEmptyBg: alpha(colors.surface0, 0.15),
  lessonEmptyBorder: alpha(colors.surface1, 0.25),
  lessonSplitDivider: alpha(colors.surface1, 0.7),
  lessonKicker: alpha(colors.blue, 0.7),
  eventPageBg: colors.crust,
  eventPageBorder: alpha(colors.surface1, 0.7),
  eventCardBg: colors.mantle,
  eventCardBorder: alpha(colors.surface1, 0.7),
  eventChipBg: alpha(colors.lavender, 0.08),
  eventLabel: alpha(colors.blue, 0.7),
}

const theme = createTheme({
  cssVariables: true,
  shape: {
    borderRadius: 2,
  },
  palette: {
    mode: appearance.mode,
    primary: {
      main: colors.blue,
      dark: colors.surface0,
      contrastText: colors.crust,
    },
    success: {
      main: colors.green,
      dark: colors.surface0,
      contrastText: colors.crust,
    },
    secondary: {
      main: colors.lavender,
      dark: colors.surface0,
    },
    warning: {
      main: colors.peach,
      dark: colors.surface0,
      contrastText: colors.crust,
    },
    background: {
      default: colors.crust,
      paper: colors.mantle,
    },
    text: {
      primary: colors.text,
      secondary: colors.subtext1,
    },
    divider: alpha(colors.surface1, 0.5),
  },
  typography: {
    fontFamily: '"Roboto", "Aptos", "Segoe UI", sans-serif',
    h3: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h4: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h5: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h6: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    overline: {
      fontWeight: 700,
      letterSpacing: '0.1em',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        },
        body: {
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: boardColors.shellBg,
        },
        '#root': {
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: ({ theme: currentTheme }) => ({
          backgroundImage: 'none',
          border: `1px solid ${currentTheme.palette.divider}`,
        }),
      },
    },
  },
})

theme.board = boardColors

export default theme