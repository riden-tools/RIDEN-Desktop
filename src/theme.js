import {
  argbFromHex,
  hexFromArgb,
  Blend,
  TonalPalette,
  Hct,
  SchemeTonalSpot,
  MaterialDynamicColors as M,
} from '@material/material-color-utilities';

// 种子色取自应用图标：绿色波形为主色，青色波形用于电流通道。
export const SEEDS = [
  { name: '图标绿', hex: '#10c800' },
  { name: '图标青', hex: '#20bfef' },
  { name: '靛蓝', hex: '#4f6bed' },
  { name: '紫罗兰', hex: '#7c4dff' },
  { name: '琥珀', hex: '#f59e0b' },
  { name: '玫红', hex: '#e8436f' },
];

// 测量通道与状态色作为 Material 自定义色，向种子色调和后取色调。
const CUSTOM = {
  volt: '#10c800',
  curr: '#20bfef',
  power: '#a46cff',
  ok: '#2fb84a',
  warn: '#f0a500',
};

const SERIES = ['#4f8cff', '#2fbf5b', '#f0a500', '#e8436f', '#9c6bff', '#1fb5c9', '#f26b2a', '#8fbf1f'];

const ROLES = {
  bg: M.surface,
  sidebar: M.surfaceContainerLow,
  panel: M.surfaceContainer,
  'panel-2': M.surfaceContainerHigh,
  'panel-hover': M.surfaceContainerHighest,
  'input-bg': M.surfaceContainerLowest,
  text: M.onSurface,
  'text-2': M.onSurfaceVariant,
  'text-3': M.outline,
  outline: M.outline,
  'outline-variant': M.outlineVariant,
  primary: M.primary,
  'on-primary': M.onPrimary,
  'primary-container': M.primaryContainer,
  'on-primary-container': M.onPrimaryContainer,
  secondary: M.secondary,
  'secondary-container': M.secondaryContainer,
  'on-secondary-container': M.onSecondaryContainer,
  tertiary: M.tertiary,
  'tertiary-container': M.tertiaryContainer,
  'on-tertiary-container': M.onTertiaryContainer,
  danger: M.error,
  'on-danger': M.onError,
  'danger-container': M.errorContainer,
  'on-danger-container': M.onErrorContainer,
  'inverse-surface': M.inverseSurface,
  'inverse-on-surface': M.inverseOnSurface,
  scrim: M.scrim,
};

// 自定义色：色相向种子色调和；文字/曲线用较高彩度，容器色限制彩度，
// 与 TonalSpot 的主色容器（彩度约 16）接近，避免大面积高饱和底色。
function custom(seed, hex) {
  const hct = Hct.fromInt(Blend.harmonize(argbFromHex(hex), seed));
  return {
    strong: TonalPalette.fromHueAndChroma(hct.hue, Math.max(hct.chroma, 48)),
    soft: TonalPalette.fromHueAndChroma(hct.hue, Math.min(hct.chroma, 24)),
  };
}

export function buildTheme(seedHex, dark) {
  const seed = argbFromHex(seedHex);
  const scheme = new SchemeTonalSpot(Hct.fromInt(seed), dark, 0);
  const vars = {};
  for (const [name, role] of Object.entries(ROLES)) vars[name] = hexFromArgb(role.getArgb(scheme));
  for (const [name, hex] of Object.entries(CUSTOM)) {
    const c = custom(seed, hex);
    vars[name] = hexFromArgb(c.strong.tone(dark ? 80 : 40));
    vars[`on-${name}`] = hexFromArgb(c.strong.tone(dark ? 20 : 100));
    vars[`${name}-container`] = hexFromArgb(c.soft.tone(dark ? 30 : 90));
    vars[`on-${name}-container`] = hexFromArgb(c.soft.tone(dark ? 90 : 10));
  }
  // 多设备对比用的系列色：固定色相向种子色调和，随主题切换。
  vars.series = SERIES.map((hex) => hexFromArgb(custom(seed, hex).strong.tone(dark ? 80 : 40)));
  // CV/CC 徽标沿用电压/电流通道色，与曲线保持一致。
  vars.cv = vars.volt;
  vars.cc = vars.curr;
  vars['primary-2'] = vars.primary;
  vars.border = `color-mix(in srgb, ${vars['outline-variant']} 70%, transparent)`;
  vars['border-strong'] = vars['outline-variant'];
  vars['grid-line'] = `color-mix(in srgb, ${vars['outline-variant']} 45%, transparent)`;
  vars.shadow = dark ? '0 1px 3px rgba(0,0,0,.35)' : '0 1px 2px rgba(0,0,0,.08), 0 1px 3px 1px rgba(0,0,0,.04)';
  return vars;
}

export function applyTheme(seedHex, dark) {
  const vars = buildTheme(seedHex, dark);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) if (typeof v === 'string') root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = dark ? 'dark' : 'light';
  return vars;
}
