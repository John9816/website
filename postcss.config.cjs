const propertyFallbacks = {
  background: 'var(--panel-alt)',
  color: 'var(--text)',
  'border-color': 'var(--border)',
  border: '1px solid var(--border)',
  'border-top': '1px solid var(--border)',
  'border-right': '1px solid var(--border)',
  'border-bottom': '1px solid var(--border)',
  'border-left': '1px solid var(--border)',
  'border-block': '1px solid var(--border)',
  outline: '2px solid var(--accent)',
  'box-shadow': 'var(--shadow-sm)',
}

const variableFallbacks = {
  '--image-soft-2': 'var(--panel-alt)',
  '--editor-panel-strong': 'var(--panel-alt)',
  '--kb-xc-sidebar': 'var(--panel)',
  '--kb-xc-sidebar-hover': 'var(--hover)',
  '--kb-xc-muted': 'var(--text-dim)',
  '--kb-xc-divider': 'var(--border)',
}

const colorMixFallbacks = {
  postcssPlugin: 'website-color-mix-fallbacks',
  Declaration(declaration) {
    if (!declaration.value.includes('color-mix(')) return
    const fallback = variableFallbacks[declaration.prop] || propertyFallbacks[declaration.prop]
    if (fallback) declaration.cloneBefore({ value: fallback })
  },
}

const modernRgbPattern = /\brgba?\(\s*([+-]?(?:\d*\.)?\d+%?)\s+([+-]?(?:\d*\.)?\d+%?)\s+([+-]?(?:\d*\.)?\d+%?)\s*\/\s*([+-]?(?:\d*\.)?\d+%?)\s*\)/gi

function toLegacyAlpha(alpha) {
  if (!alpha.endsWith('%')) return alpha
  return String(Number.parseFloat(alpha) / 100)
}

const modernRgbFallbacks = {
  postcssPlugin: 'website-modern-rgb-fallbacks',
  Declaration(declaration) {
    if (!declaration.value.match(modernRgbPattern)) return

    const fallback = declaration.value.replace(
      modernRgbPattern,
      (_match, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${toLegacyAlpha(alpha)})`,
    )

    declaration.cloneBefore({ value: fallback })
  },
}

module.exports = {
  plugins: [colorMixFallbacks, modernRgbFallbacks],
}
