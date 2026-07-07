const icpText =
  (import.meta.env.VITE_ICP_BEIAN_TEXT as string | undefined)?.trim() ||
  'ICP备案号待配置'

const policeText =
  (import.meta.env.VITE_POLICE_BEIAN_TEXT as string | undefined)?.trim() || ''

const copyrightText =
  (import.meta.env.VITE_COPYRIGHT_TEXT as string | undefined)?.trim() ||
  '© 2026 751152.xyz'

export default function BeianFooter() {
  return (
    <footer className="beian-footer" aria-label="网站备案信息">
      <span>{copyrightText}</span>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {icpText}
      </a>
      {policeText && (
        <a
          href="https://www.beian.gov.cn/portal/registerSystemInfo"
          target="_blank"
          rel="noopener noreferrer"
        >
          {policeText}
        </a>
      )}
    </footer>
  )
}
