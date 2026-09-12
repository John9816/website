export async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through for older WebViews that expose the API but deny access.
    }
  }

  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.inset = '0 auto auto -9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  const copied = document.execCommand('copy')
  textarea.remove()
  if (activeElement) {
    try {
      activeElement.focus({ preventScroll: true })
    } catch {
      activeElement.focus()
    }
  }
  if (!copied) throw new Error('Clipboard is unavailable')
}
